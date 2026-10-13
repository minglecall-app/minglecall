import { Router } from 'express';
import { randomUUID } from 'crypto';
import type { ServerRuntime } from '../runtimeTypes';
import { requireAuth } from '../middleware/auth';
import { sensitiveActionLimiter } from '../middleware/rateLimit';
import { getSupabaseAdmin, isSupabaseAdminConfigured, upsertProfileAdmin } from '../supabaseAdmin';
import { loadGiftSharePercents } from '../finance/walletLedgerWrite';
import {
  computeGiftCoinSplit,
  isGiftEligibleHostRole,
} from '../../shared/finance/economyGift';

const MAX_GOAL_COINS = 5000;
const ALLOWED_GOAL_AMOUNTS = [10, 20, 50, 100, 200, 500, 1000] as const;

function authUserId(req: any): string {
  return String(req.profileId || req.user?.id || '');
}

function sendError(res: any, status: number, message: string, code: string) {
  return res.status(status).json({ success: false, error: { message, code } });
}

/**
 * POST /api/v1/goals/contribute
 * Body: { creatorId, coins, idempotencyKey? }
 * Debits sender and credits eligible host via gift_spend_atomic, then bumps creator_goals.
 */
export function createGoalsRouter(runtime: ServerRuntime) {
  const router = Router();
  const { serverUsers, broadcastUsers, recordCreatorEarnCoins } = runtime;

  router.post('/contribute', requireAuth, sensitiveActionLimiter, async (req, res) => {
    try {
      if (!isSupabaseAdminConfigured()) {
        return sendError(res, 503, 'Goals backend unavailable', 'NO_ADMIN');
      }

      const senderId = authUserId(req);
      if (!senderId) return sendError(res, 401, 'Unauthorized', 'UNAUTHORIZED');

      if (
        req.body?.hostCoinsEarned != null ||
        req.body?.tlCoinsEarned != null ||
        req.body?.amount != null
      ) {
        return sendError(
          res,
          400,
          'Client must not supply hostCoinsEarned, tlCoinsEarned, or amount aliases',
          'CLIENT_AMOUNTS_FORBIDDEN'
        );
      }

      const creatorId = String(req.body?.creatorId || '').trim();
      let coins = Number(req.body?.coins);
      if (!creatorId) return sendError(res, 400, 'creatorId required', 'INVALID_INPUT');
      if (!Number.isFinite(coins) || coins <= 0) {
        return sendError(res, 400, 'coins must be a positive number', 'INVALID_AMOUNT');
      }
      coins = Math.round(coins);
      if (coins > MAX_GOAL_COINS) {
        return sendError(res, 400, `Max contribution is ${MAX_GOAL_COINS} coins`, 'AMOUNT_TOO_HIGH');
      }
      if (!(ALLOWED_GOAL_AMOUNTS as readonly number[]).includes(coins)) {
        return sendError(
          res,
          400,
          `coins must be one of: ${ALLOWED_GOAL_AMOUNTS.join(', ')}`,
          'INVALID_AMOUNT'
        );
      }
      if (creatorId === senderId) {
        return sendError(res, 400, 'Cannot contribute to your own goal', 'SELF_CONTRIBUTE');
      }

      const clientIdem =
        typeof req.body?.idempotencyKey === 'string'
          ? String(req.body.idempotencyKey).trim().slice(0, 200)
          : '';
      const idempotencyKey = clientIdem || `goal:${creatorId}:${senderId}:${coins}:${randomUUID()}`;

      const client = getSupabaseAdmin()!;
      const { data: creator, error: creatorErr } = await client
        .from('profiles')
        .select('id, role, team_leader_id, created_by_id, name')
        .eq('id', creatorId)
        .maybeSingle();
      if (creatorErr) throw creatorErr;
      if (!creator) return sendError(res, 404, 'Creator not found', 'CREATOR_NOT_FOUND');

      const eligible = isGiftEligibleHostRole(creator.role);
      if (!eligible) {
        return sendError(
          res,
          400,
          'Goal contributions only apply to verified host creators',
          'HOST_NOT_ELIGIBLE'
        );
      }

      const shares = await loadGiftSharePercents(client);
      const tlId = creator.team_leader_id || creator.created_by_id || null;
      const split = computeGiftCoinSplit({
        giftCost: coins,
        hostSharePercent: shares.host,
        tlSharePercent: shares.tl,
        hasTeamLeader: Boolean(tlId),
        hostEligible: true,
      });

      const { data: rpcRaw, error: rpcErr } = await client.rpc('gift_spend_atomic', {
        p_sender_id: senderId,
        p_receiver_id: creatorId,
        p_tl_id: tlId ? String(tlId) : null,
        p_coins: coins,
        p_host_coins: split.hostCoins,
        p_tl_coins: split.tlCoins,
        p_idempotency_key: idempotencyKey,
        p_metadata: {
          kind: 'goal_contribute',
          creatorId,
          coins,
        },
      });

      if (rpcErr) {
        console.error('[goals/contribute] RPC:', rpcErr.message);
        return sendError(res, 500, 'Goal contribution billing failed', 'GOAL_RPC_FAILED');
      }

      const rpcResult = typeof rpcRaw === 'string' ? JSON.parse(rpcRaw) : rpcRaw;
      if (!rpcResult?.success) {
        const code = rpcResult?.error_code || 'GOAL_FAILED';
        const status = code === 'INSUFFICIENT_BALANCE' ? 400 : 500;
        return res.status(status).json({
          success: false,
          error: { message: rpcResult?.error_message || 'Contribution failed', code },
        });
      }

      // Bump fundraising progress (service role). Idempotent contribute: skip bump on duplicate spend.
      let goalRow: { title: string; current_coins: number; target_coins: number } | null = null;
      if (!rpcResult.duplicate) {
        const { data: existing } = await client
          .from('creator_goals')
          .select('title, current_coins, target_coins')
          .eq('creator_id', creatorId)
          .maybeSingle();
        const nextCurrent = Number(existing?.current_coins || 0) + coins;
        const title = existing?.title || 'Creator Target Goal';
        const target = Number(existing?.target_coins || 10000);
        const { data: upserted, error: goalErr } = await client
          .from('creator_goals')
          .upsert(
            {
              creator_id: creatorId,
              title,
              current_coins: nextCurrent,
              target_coins: target,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'creator_id' }
          )
          .select('title, current_coins, target_coins')
          .maybeSingle();
        if (goalErr) {
          console.error('[goals/contribute] goal upsert:', goalErr.message);
          // Money already moved; return success with warning flag
        }
        goalRow = upserted || {
          title,
          current_coins: nextCurrent,
          target_coins: target,
        };
      } else {
        const { data: existing } = await client
          .from('creator_goals')
          .select('title, current_coins, target_coins')
          .eq('creator_id', creatorId)
          .maybeSingle();
        goalRow = existing || null;
      }

      const newSenderBalance = Number(rpcResult.new_sender_balance || 0);
      const newHostEarnings = Number(rpcResult.new_host_earnings || 0);
      const hostCoinsEarned = Number(rpcResult.host_coins_earned ?? split.hostCoins) || 0;

      const memSender = serverUsers.get(senderId);
      if (memSender) {
        memSender.coinBalance = newSenderBalance;
        serverUsers.set(senderId, memSender);
        upsertProfileAdmin(memSender).catch(() => {});
      }
      const memHost = serverUsers.get(creatorId);
      if (memHost) {
        memHost.earningsCoins = newHostEarnings;
        serverUsers.set(creatorId, memHost);
        upsertProfileAdmin(memHost).catch(() => {});
      }

      if (hostCoinsEarned > 0 && !rpcResult.duplicate) {
        recordCreatorEarnCoins?.(creatorId, { giftCoins: hostCoinsEarned });
      }

      try {
        broadcastUsers?.();
      } catch {
        /* optional */
      }

      return res.json({
        success: true,
        data: {
          creatorId,
          coins,
          senderBalance: newSenderBalance,
          hostEarnings: newHostEarnings,
          hostCoinsEarned,
          duplicate: Boolean(rpcResult.duplicate),
          goal: goalRow
            ? {
                title: goalRow.title,
                currentCoins: Number(goalRow.current_coins || 0),
                targetCoins: Number(goalRow.target_coins || 10000),
              }
            : undefined,
        },
      });
    } catch (err: any) {
      console.error('[goals/contribute] exception:', err);
      return sendError(res, 500, err?.message || 'Contribution failed', 'GOAL_FAILED');
    }
  });

  return router;
}
