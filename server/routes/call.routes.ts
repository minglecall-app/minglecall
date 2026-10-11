import { Router } from 'express';
import type { ServerRuntime } from '../runtimeTypes';
import { requireAuth } from '../middleware/auth';
import { sensitiveActionLimiter } from '../middleware/rateLimit';
import {
  getSupabaseAdmin,
  isSupabaseAdminConfigured,
  upsertCallLogAdmin,
} from '../supabaseAdmin';
import { loadFinanceSystemConfig } from '../finance/config';
import {
  computeCallMinuteSplit,
  hasMetCreatorPeriodTarget,
  resolveCallHostSharePercent,
  resolveEconomyBurnRates,
} from '../../shared/finance/economyBurn';

/** In-memory idempotency when Supabase RPC is unavailable. */
const memoryBurnKeys = new Set<string>();

function isFemaleCreatorRole(role?: string | null): boolean {
  return role === 'female_creator' || role === 'female_host';
}

async function resolveProfileIdFromAuth(authUser: {
  id: string;
  email?: string | null;
}): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data: byAuthId } = await supabase
    .from('profiles')
    .select('id')
    .eq('auth_id', authUser.id)
    .maybeSingle();
  if (byAuthId?.id) return byAuthId.id;

  const { data: byId } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', authUser.id)
    .maybeSingle();
  if (byId?.id) return byId.id;

  if (authUser.email) {
    const { data: byEmail } = await supabase
      .from('profiles')
      .select('id')
      .ilike('email', authUser.email.trim().toLowerCase())
      .maybeSingle();
    if (byEmail?.id) return byEmail.id;
  }

  return null;
}

function clampSplit(coinsBurned: number, hostEarned: number, tlEarned: number) {
  let host = Math.max(0, Math.round(hostEarned));
  let tl = Math.max(0, Math.round(tlEarned));
  if (host + tl > coinsBurned) {
    if (tl > coinsBurned) {
      tl = coinsBurned;
      host = 0;
    } else {
      host = coinsBurned - tl;
    }
  }
  return { host, tl };
}

export function createCallRouter(ctx: ServerRuntime): Router {
  const router = Router();
  const {
    activeCalls,
    serverUsers,
    presenceMap,
    connectedSockets,
    broadcastUsers,
    broadcastActiveCalls,
    broadcastAll,
    sendToUser,
    recordCreatorEarnCoins,
  } = ctx;

  /**
   * GET /api/calls/incoming
   * Open ringing calls for the authenticated callee (in-memory + call_logs).
   */
  router.get('/incoming', requireAuth, async (req, res) => {
    try {
      const authUser = (req as any).user as { id: string; email?: string | null };
      const profileId =
        (await resolveProfileIdFromAuth(authUser)) ||
        String((req as any).profileId || '') ||
        Array.from(serverUsers.values()).find(
          (u) => u.authId === authUser.id || u.id === authUser.id
        )?.id;
      if (!profileId) {
        return res.status(401).json({
          success: false,
          error: { message: 'Unable to resolve profile', code: 'UNAUTHORIZED' },
        });
      }
      const authUserId = String(authUser.id || '');
      const selfIds = new Set(
        [profileId, authUserId].map((id) => String(id || '').trim()).filter(Boolean)
      );

      const fromMemory = Array.from(activeCalls.values())
        .filter((c) => c.status === 'ringing' && selfIds.has(String(c.receiverId)))
        .map((c) => ({
          callId: c.id,
          callerId: c.callerId,
          receiverId: c.receiverId,
          status: 'ringing' as const,
          startedAt: c.ringingAt ? new Date(c.ringingAt).toISOString() : null,
          callerName: serverUsers.get(c.callerId)?.name || null,
        }));

      let fromDb: typeof fromMemory = [];
      const supabase = getSupabaseAdmin();
      if (supabase) {
        const ids = Array.from(selfIds);
        const orFilter = ids
          .flatMap((id) => [`receiver_id.eq.${id}`, `host_id.eq.${id}`])
          .join(',');
        const { data, error } = await supabase
          .from('call_logs')
          .select(
            'id, caller_id, receiver_id, host_id, status, started_at, start_time, caller_name'
          )
          .eq('status', 'ringing')
          .or(orFilter)
          .order('started_at', { ascending: false })
          .limit(10);
        if (error) {
          console.warn('[calls/incoming] db', error.message);
        } else {
          const now = Date.now();
          fromDb = (data || [])
            .filter((row: any) => {
              const startedMs =
                Date.parse(row.started_at || row.start_time || '') || 0;
              return !startedMs || now - startedMs < 75_000;
            })
            .map((row: any) => ({
              callId: String(row.id),
              callerId: String(row.caller_id || ''),
              receiverId: String(row.receiver_id || row.host_id || profileId),
              status: 'ringing' as const,
              startedAt: row.started_at || row.start_time || null,
              callerName: row.caller_name || null,
            }))
            .filter((c) => c.callId && c.callerId);
        }
      }

      const byId = new Map<string, (typeof fromMemory)[0]>();
      for (const c of [...fromMemory, ...fromDb]) {
        if (!byId.has(c.callId)) byId.set(c.callId, c);
      }
      return res.json({ success: true, data: Array.from(byId.values()) });
    } catch (e: any) {
      console.error('Error in GET /api/calls/incoming:', e);
      return res.status(500).json({
        success: false,
        error: { message: e.message || 'Incoming lookup failed', code: 'INTERNAL_ERROR' },
      });
    }
  });

  const terminateCallInsufficientBalance = (callId: string) => {
    const call = activeCalls.get(callId);
    if (!call) {
      broadcastAll({
        type: 'call:ended',
        callId,
        reason: 'INSUFFICIENT_BALANCE',
        code: 'INSUFFICIENT_BALANCE',
        outcome: 'failed',
        status: 'failed',
      });
      return;
    }

    const endedAt = Date.now();
    const billedDuration =
      call.durationSeconds ||
      (call.billedMinutes ? Math.max(0, (call.billedMinutes - 1) * 60) : 0) ||
      (call.startTime ? Math.max(0, Math.floor((endedAt - call.startTime) / 1000)) : 0);

    const callerProfile = serverUsers.get(call.callerId);
    const receiverProfile = serverUsers.get(call.receiverId);

    if (isSupabaseAdminConfigured()) {
      upsertCallLogAdmin({
        id: call.id,
        callerId: call.callerId,
        receiverId: call.receiverId,
        hostId: call.receiverId,
        callerName: callerProfile?.name,
        hostName: receiverProfile?.name,
        receiverName: receiverProfile?.name,
        startTime: call.startTime || call.ringingAt || endedAt,
        endTime: endedAt,
        durationSeconds: billedDuration,
        coinsSpent: call.coinsSpent || 0,
        coinsEarned: call.coinsEarned || 0,
        teamLeaderId: call.teamLeaderId || receiverProfile?.teamLeaderId || receiverProfile?.createdById || null,
        teamLeaderEarnedCoins: call.teamLeaderEarnedCoins || 0,
        status: 'failed',
        endReason: 'INSUFFICIENT_BALANCE',
      }).catch(() => {});
    }

    call.status = 'ended';
    activeCalls.delete(callId);

    const callerOnline = connectedSockets.some(
      (c) => c.userId === call.callerId && c.ws.readyState === 1
    );
    const receiverOnline = connectedSockets.some(
      (c) => c.userId === call.receiverId && c.ws.readyState === 1
    );

    presenceMap.set(call.callerId, callerOnline ? 'online' : 'offline');
    presenceMap.set(call.receiverId, receiverOnline ? 'online' : 'offline');

    const payload = {
      type: 'call:ended',
      callId,
      reason: 'INSUFFICIENT_BALANCE',
      code: 'INSUFFICIENT_BALANCE',
      endedBy: 'billing_engine',
      outcome: 'failed',
      status: 'failed',
      callerId: call.callerId,
      receiverId: call.receiverId,
    };

    sendToUser?.(call.callerId, payload);
    sendToUser?.(call.receiverId, payload);
    broadcastAll(payload);
    broadcastActiveCalls();
    broadcastAll({ type: 'call_logs:updated', callId });
  };

  /**
   * POST /api/calls/burn
   * Body: { callId, billingMinute } only.
   * Rates, friendship, and host/TL/platform split are server-derived from Economy config.
   */
  router.post('/burn', requireAuth, sensitiveActionLimiter, async (req, res) => {
    try {
      const authUser = (req as any).user as { id: string; email?: string | null };
      const callId = typeof req.body?.callId === 'string' ? req.body.callId.trim() : '';
      const billingMinute = Number(req.body?.billingMinute);

      if (!callId || !Number.isFinite(billingMinute) || billingMinute < 1) {
        return res.status(400).json({
          success: false,
          error: { message: 'callId and billingMinute (>=1) are required', code: 'INVALID_INPUT' },
        });
      }

      // Reject client-supplied money fields even if present
      if (
        req.body?.coinsBurned != null ||
        req.body?.hostCoinsEarned != null ||
        req.body?.tlCoinsEarned != null
      ) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Client must not supply coinsBurned, hostCoinsEarned, or tlCoinsEarned',
            code: 'CLIENT_AMOUNTS_FORBIDDEN',
          },
        });
      }

      const profileId = await resolveProfileIdFromAuth(authUser);
      const callerId =
        profileId ||
        Array.from(serverUsers.values()).find(
          (u) => u.authId === authUser.id || u.id === authUser.id
        )?.id;

      if (!callerId) {
        return res.status(401).json({
          success: false,
          error: { message: 'Unable to resolve caller profile', code: 'UNAUTHORIZED' },
        });
      }

      const call = activeCalls.get(callId);
      if (!call || call.status === 'ended') {
        return res.status(404).json({
          success: false,
          error: { message: 'Active call not found', code: 'CALL_NOT_FOUND' },
        });
      }

      if (call.status !== 'active') {
        return res.status(409).json({
          success: false,
          error: {
            message: 'Call is not active — billing starts after accept and media connect',
            code: 'CALL_NOT_ACTIVE',
          },
        });
      }

      if (call.callerId !== callerId) {
        return res.status(403).json({
          success: false,
          error: { message: 'Only the call caller may trigger billing', code: 'FORBIDDEN' },
        });
      }

      const receiverId = call.receiverId;
      let receiver =
        serverUsers.get(receiverId) ||
        null;

      const supabase = getSupabaseAdmin();

      // Live rates + split percents from system_configs (finance config cache / DB)
      const financeCfg = await loadFinanceSystemConfig();
      const burnRates = financeCfg.burn?.coinBurnRatePerMin
        ? financeCfg.burn
        : resolveEconomyBurnRates(financeCfg.raw);
      let standardRate = burnRates.coinBurnRatePerMin;
      let friendRate = burnRates.coinBurnRateFriendPerMin;
      let hostBaseSharePercent = burnRates.femaleHostSharePercent;
      let hostTargetSharePercent = burnRates.femaleHostTargetSharePercent;
      let tlSharePercent = burnRates.teamLeaderSharePercent;

      // Prefer fresh DB read so Economy edits apply on the next burn minute
      if (supabase) {
        const { data: cfg, error: cfgErr } = await supabase
          .from('system_configs')
          .select(
            [
              'coin_burn_rate_per_min',
              'coin_burn_rate_friend_per_min',
              'female_host_share_percent',
              'female_host_target_share_percent',
              'team_leader_share_percent',
              'creator_target_bronze_hours',
              'creator_target_bronze_coins',
            ].join(', ')
          )
          .eq('id', 'default')
          .maybeSingle();

        if (cfgErr) {
          console.warn('[calls/burn] live system_configs read failed:', cfgErr.message);
        }

        if (cfg) {
          const live = resolveEconomyBurnRates(cfg);
          standardRate = live.coinBurnRatePerMin;
          friendRate = live.coinBurnRateFriendPerMin;
          hostBaseSharePercent = live.femaleHostSharePercent;
          hostTargetSharePercent = live.femaleHostTargetSharePercent;
          tlSharePercent = live.teamLeaderSharePercent;
          // Keep thresholds in sync for target-met check when select includes them
          if ((cfg as any).creator_target_bronze_hours != null) {
            financeCfg.thresholds.bronzeHours = Number((cfg as any).creator_target_bronze_hours);
          }
          if ((cfg as any).creator_target_bronze_coins != null) {
            financeCfg.thresholds.bronzeCoins = Number((cfg as any).creator_target_bronze_coins);
          }
        }

        if (!receiver) {
          const { data: recvRow } = await supabase
            .from('profiles')
            .select('id, role, team_leader_id, created_by_id, coin_earn_override_rate, earnings_coins, name')
            .eq('id', receiverId)
            .maybeSingle();
          if (recvRow) {
            receiver = {
              id: recvRow.id,
              role: recvRow.role,
              teamLeaderId: recvRow.team_leader_id,
              createdById: recvRow.created_by_id,
              coinEarnOverrideRate: recvRow.coin_earn_override_rate,
              earningsCoins: recvRow.earnings_coins,
              name: recvRow.name,
            } as any;
          }
        }
      }

      if (!receiver) {
        return res.status(404).json({
          success: false,
          error: { message: 'Receiver profile not found', code: 'RECEIVER_NOT_FOUND' },
        });
      }

      // Friendship → friend burn rate
      let isFriendPair = false;
      if (supabase) {
        const { data: frForward } = await supabase
          .from('friend_requests')
          .select('id')
          .eq('status', 'accepted')
          .eq('sender_id', callerId)
          .eq('receiver_id', receiverId)
          .limit(1)
          .maybeSingle();
        const { data: frReverse } = frForward
          ? { data: null }
          : await supabase
              .from('friend_requests')
              .select('id')
              .eq('status', 'accepted')
              .eq('sender_id', receiverId)
              .eq('receiver_id', callerId)
              .limit(1)
              .maybeSingle();
        isFriendPair = Boolean(frForward || frReverse);
      }

      const coinsBurned = isFriendPair ? friendRate : standardRate;

      // Revenue split: female_creator (incl. legacy female_host) only
      const isCreator = isFemaleCreatorRole(receiver.role);
      const tlId = isCreator
        ? (receiver.teamLeaderId || receiver.createdById || null)
        : null;

      // Analytics only: bronze+ already met mid-period (does NOT change live host %).
      // Live HOST_EARN always uses base share; target share is period-end true-up (Phase 3).
      let targetMet = false;
      if (isCreator && supabase) {
        const { data: metrics } = await supabase
          .from('creator_metrics')
          .select('active_online_hours, total_target_coins')
          .eq('creator_id', receiverId)
          .maybeSingle();
        if (metrics) {
          targetMet = hasMetCreatorPeriodTarget(
            Number(metrics.active_online_hours) || 0,
            Number(metrics.total_target_coins) || 0,
            financeCfg.thresholds
          );
        }
      }

      // Phase 1: live burns always credit host at BASE share % (never mid-period target %).
      const hostSharePercent = isCreator
        ? resolveCallHostSharePercent({
            baseSharePercent: hostBaseSharePercent,
            targetSharePercent: hostTargetSharePercent,
            targetMet,
          })
        : 0;

      let hostCoinsEarned = 0;
      let tlCoinsEarned = 0;
      let usedOverride = false;

      if (isCreator) {
        const split = computeCallMinuteSplit({
          coinsBurned,
          hostSharePercent,
          tlSharePercent,
          hasTeamLeader: Boolean(tlId),
          targetMet, // metadata / analytics only — does not change host %
          coinEarnOverrideRate: receiver.coinEarnOverrideRate,
        });
        hostCoinsEarned = split.hostCoins;
        tlCoinsEarned = split.tlCoins;
        usedOverride = split.usedOverride;
      }
      // ELSE: regular female / male / unmanaged → 0% host, 0% TL, 100% platform

      const clamped = clampSplit(coinsBurned, hostCoinsEarned, tlCoinsEarned);
      hostCoinsEarned = clamped.host;
      tlCoinsEarned = clamped.tl;

      const metadata = {
        billingMinute,
        isFriendPair,
        ratePerMin: coinsBurned,
        hostSharePercent,
        hostBaseSharePercent,
        hostTargetSharePercent,
        tlSharePercent,
        targetMet,
        usedOverride,
        receiverId,
        receiverRole: receiver.role,
        isFemaleCreator: isCreator,
      };

      let rpcResult: any = null;

      if (isSupabaseAdminConfigured() && supabase) {
        const { data, error } = await supabase.rpc('burn_call_coins_atomic', {
          p_caller_id: callerId,
          p_receiver_id: receiverId,
          p_tl_id: tlId,
          p_call_id: callId,
          p_billing_minute: billingMinute,
          p_coins_burned: coinsBurned,
          p_host_coins_earned: hostCoinsEarned,
          p_tl_coins_earned: tlCoinsEarned,
          p_metadata: metadata,
        });

        if (error) {
          console.error('[calls/burn] RPC error:', error.message);
          return res.status(500).json({
            success: false,
            error: { message: 'Billing RPC failed', code: 'BILLING_RPC_FAILED' },
          });
        }
        rpcResult = data;
      } else {
        // Memory fallback (dev without Supabase)
        const key = `${callId}:${billingMinute}:CALL_DEBIT:${callerId}`;
        const caller = serverUsers.get(callerId);
        if (!caller) {
          return res.status(404).json({
            success: false,
            error: { message: 'Caller not found', code: 'CALLER_NOT_FOUND' },
          });
        }
        if (memoryBurnKeys.has(key)) {
          rpcResult = {
            success: true,
            duplicate: true,
            new_caller_balance: caller.coinBalance,
            new_host_earnings: serverUsers.get(receiverId)?.earningsCoins || 0,
            new_tl_earnings: tlId ? serverUsers.get(tlId)?.earningsCoins || 0 : 0,
            coins_burned: coinsBurned,
            host_coins_earned: hostCoinsEarned,
            tl_coins_earned: tlCoinsEarned,
          };
        } else if ((caller.coinBalance || 0) < coinsBurned) {
          rpcResult = {
            success: false,
            new_caller_balance: caller.coinBalance || 0,
            error_message: 'INSUFFICIENT_BALANCE',
            code: 'INSUFFICIENT_BALANCE',
          };
        } else {
          memoryBurnKeys.add(key);
          caller.coinBalance = Math.max(0, (caller.coinBalance || 0) - coinsBurned);
          serverUsers.set(callerId, caller);
          let hostEarnings = 0;
          let tlEarnings = 0;
          if (hostCoinsEarned > 0 && isCreator) {
            const host = serverUsers.get(receiverId);
            if (host) {
              host.earningsCoins = (host.earningsCoins || 0) + hostCoinsEarned;
              host.totalCallMinutes = (host.totalCallMinutes || 0) + 1;
              serverUsers.set(receiverId, host);
              hostEarnings = host.earningsCoins;
            }
          }
          if (tlCoinsEarned > 0 && tlId) {
            const tl = serverUsers.get(tlId);
            if (tl) {
              tl.earningsCoins = (tl.earningsCoins || 0) + tlCoinsEarned;
              serverUsers.set(tlId, tl);
              tlEarnings = tl.earningsCoins;
            }
          }
          rpcResult = {
            success: true,
            duplicate: false,
            new_caller_balance: caller.coinBalance,
            new_host_earnings: hostEarnings,
            new_tl_earnings: tlEarnings,
            coins_burned: coinsBurned,
            host_coins_earned: hostCoinsEarned,
            tl_coins_earned: tlCoinsEarned,
          };
        }
      }

      const insufficient =
        !rpcResult?.success &&
        (rpcResult?.error_message === 'INSUFFICIENT_BALANCE' ||
          rpcResult?.code === 'INSUFFICIENT_BALANCE');

      if (insufficient) {
        terminateCallInsufficientBalance(callId);
        return res.status(402).json({
          success: false,
          status: 'INSUFFICIENT_BALANCE',
          error: {
            message: 'Insufficient coin balance for next billing minute',
            code: 'INSUFFICIENT_BALANCE',
          },
          data: {
            newCallerBalance: Number(rpcResult?.new_caller_balance) || 0,
            callId,
            billingMinute,
          },
        });
      }

      if (!rpcResult?.success) {
        return res.status(400).json({
          success: false,
          error: {
            message: rpcResult?.error_message || 'Burn failed',
            code: 'BURN_FAILED',
          },
        });
      }

      const burned = Number(rpcResult.coins_burned ?? coinsBurned) || coinsBurned;
      const hostEarned = Number(rpcResult.host_coins_earned ?? hostCoinsEarned) || 0;
      const tlEarned = Number(rpcResult.tl_coins_earned ?? tlCoinsEarned) || 0;
      const newCallerBalance = Number(rpcResult.new_caller_balance) || 0;
      const newHostEarnings = Number(rpcResult.new_host_earnings) || 0;
      const newTlEarnings = Number(rpcResult.new_tl_earnings) || 0;
      const isDuplicate = Boolean(rpcResult.duplicate);

      // Sync in-memory call + user state from authoritative result
      if (!isDuplicate) {
        call.coinsSpent = (call.coinsSpent || 0) + burned;
        call.coinsEarned = (call.coinsEarned || 0) + hostEarned;
        call.teamLeaderEarnedCoins = (call.teamLeaderEarnedCoins || 0) + tlEarned;
        if (tlId) call.teamLeaderId = tlId;
        call.durationSeconds = Math.max(call.durationSeconds || 0, (billingMinute - 1) * 60);
        (call as any).billedMinutes = billingMinute;

        // Persist the running session total so the host badge (call_logs poll) grows each minute.
        if (supabase) {
          const { data: row } = await supabase
            .from('call_logs')
            .select('coins_spent, coins_earned, duration_seconds')
            .eq('id', callId)
            .maybeSingle();
          const nextSpent = Math.max(
            call.coinsSpent || 0,
            (Number(row?.coins_spent) || 0) + burned
          );
          const nextEarned = Math.max(
            call.coinsEarned || 0,
            (Number(row?.coins_earned) || 0) + hostEarned
          );
          const nextDuration = Math.max(
            call.durationSeconds || 0,
            Number(row?.duration_seconds) || 0,
            (billingMinute - 1) * 60
          );
          const totalsPatch: Record<string, unknown> = {
            status: 'active',
            coins_spent: nextSpent,
            coins_earned: nextEarned,
            duration_seconds: nextDuration,
            burn_rate_per_min: coinsBurned,
            was_friend_call: isFriendPair,
            ended_at: null,
            end_time: null,
          };
          if (tlId) totalsPatch.team_leader_id = tlId;
          const { error: totalsErr } = await supabase
            .from('call_logs')
            .update(totalsPatch)
            .eq('id', callId);
          if (totalsErr) {
            console.warn('[calls/burn] call_logs totals', totalsErr.message);
          } else {
            call.coinsSpent = nextSpent;
            call.coinsEarned = nextEarned;
            call.durationSeconds = nextDuration;
          }
        }
      }

      const memCaller = serverUsers.get(callerId);
      if (memCaller) {
        memCaller.coinBalance = newCallerBalance;
        serverUsers.set(callerId, memCaller);
      }
      const memHost = serverUsers.get(receiverId);
      if (memHost && hostEarned > 0) {
        memHost.earningsCoins = newHostEarnings;
        serverUsers.set(receiverId, memHost);
      }
      if (tlId && tlEarned > 0) {
        const memTl = serverUsers.get(tlId);
        if (memTl) {
          memTl.earningsCoins = newTlEarnings;
          serverUsers.set(tlId, memTl);
        }
      }

      // Period target metrics — coins from calls (feeds finance targetBonus at close)
      if (!isDuplicate && hostEarned > 0 && isCreator) {
        recordCreatorEarnCoins?.(receiverId, { callCoins: hostEarned });
      }

      broadcastUsers();
      broadcastActiveCalls();
      broadcastAll({
        type: 'wallet:burn_result',
        callId,
        billingMinute,
        callerId,
        receiverId,
        tlId,
        coinsBurned: burned,
        hostCoinsEarned: hostEarned,
        tlCoinsEarned: tlEarned,
        newCallerBalance,
        newHostEarnings,
        newTlEarnings,
        callCoinsSpent: call.coinsSpent || 0,
        callCoinsEarned: call.coinsEarned || 0,
        duplicate: isDuplicate,
        platformRetained: Math.max(0, burned - hostEarned - tlEarned),
      });

      return res.json({
        success: true,
        data: {
          callId,
          billingMinute,
          coinsBurned: burned,
          hostCoinsEarned: hostEarned,
          tlCoinsEarned: tlEarned,
          platformRetained: Math.max(0, burned - hostEarned - tlEarned),
          newCallerBalance,
          newHostEarnings,
          newTlEarnings,
          callCoinsSpent: call.coinsSpent || 0,
          callCoinsEarned: call.coinsEarned || 0,
          billedMinutes: billingMinute,
          duplicate: isDuplicate,
          isFriendRate: isFriendPair,
          isFemaleCreator: isCreator,
        },
      });
    } catch (e: any) {
      console.error('Error in POST /api/calls/burn:', e);
      return res.status(500).json({
        success: false,
        error: { message: e.message || 'Burn failed', code: 'INTERNAL_ERROR' },
      });
    }
  });

  /**
   * GET /api/calls/wallet-ledger?userId=
   * Authoritative ledger rows for wallet UI (falls back to empty when unavailable).
   */
  router.get('/wallet-ledger', requireAuth, async (req, res) => {
    try {
      const authUser = (req as any).user as { id: string; email?: string | null };
      const requestedUserId = typeof req.query.userId === 'string' ? req.query.userId : '';
      const profileId = await resolveProfileIdFromAuth(authUser);
      const selfId =
        profileId ||
        Array.from(serverUsers.values()).find(
          (u) => u.authId === authUser.id || u.id === authUser.id
        )?.id;

      if (!selfId) {
        return res.status(401).json({
          success: false,
          error: { message: 'Unable to resolve profile', code: 'UNAUTHORIZED' },
        });
      }

      const targetUserId = requestedUserId || selfId;
      const selfUser = serverUsers.get(selfId);
      const isAdmin = selfUser?.role === 'admin' || selfId === 'admin_user';

      if (targetUserId !== selfId && !isAdmin) {
        return res.status(403).json({
          success: false,
          error: { message: 'Forbidden', code: 'FORBIDDEN' },
        });
      }

      const supabase = getSupabaseAdmin();
      if (!supabase) {
        return res.json({ success: true, data: [] });
      }

      const { data, error } = await supabase
        .from('wallet_ledger')
        .select('*')
        .eq('user_id', targetUserId)
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) {
        console.error('[wallet-ledger] fetch error:', error.message);
        return res.status(500).json({
          success: false,
          error: { message: 'Failed to load ledger', code: 'LEDGER_FETCH_FAILED' },
        });
      }

      return res.json({
        success: true,
        data: (data || []).map((row: any) => ({
          id: row.id,
          userId: row.user_id,
          callId: row.call_id,
          transactionType: row.transaction_type,
          amount: Number(row.amount) || 0,
          balanceAfter: Number(row.balance_after) || 0,
          billingMinute: row.billing_minute,
          metadata: row.metadata || {},
          createdAt: row.created_at,
        })),
      });
    } catch (e: any) {
      console.error('Error in GET /api/calls/wallet-ledger:', e);
      return res.status(500).json({
        success: false,
        error: { message: e.message || 'Ledger fetch failed', code: 'INTERNAL_ERROR' },
      });
    }
  });

  return router;
}
