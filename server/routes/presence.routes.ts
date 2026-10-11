import { Router } from 'express';
import type { ServerRuntime } from '../runtimeTypes';
import { requireAuth } from '../middleware/auth';
import {
  upsertProfileAdmin,
  isSupabaseAdminConfigured,
  upsertCreatorMetricsAdmin,
  assertActiveSessionAdmin,
} from '../supabaseAdmin';
import {
  isRedisConfigured,
  setPresence,
  deletePresence,
  mgetPresence,
  RedisUnavailableError,
} from '../../lib/redis';

function redisUnavailable(res: any, err?: any) {
  return res.status(503).json({
    success: false,
    error: {
      message: err?.message || 'Presence service unavailable — Redis is not configured',
      code: 'REDIS_UNAVAILABLE',
    },
  });
}

function readClientSessionId(req: { headers: Record<string, unknown>; body?: any }): string | null {
  const header = req.headers['x-session-id'] || req.headers['X-Session-Id'];
  if (typeof header === 'string' && header.trim()) return header.trim();
  if (Array.isArray(header) && typeof header[0] === 'string' && header[0].trim()) {
    return header[0].trim();
  }
  const fromBody = req.body?.sessionId || req.body?.activeSessionId;
  return typeof fromBody === 'string' && fromBody.trim() ? fromBody.trim() : null;
}

async function rejectIfSessionReplaced(req: any, res: any, profileId: string): Promise<boolean> {
  const clientSessionId = readClientSessionId(req);
  if (!clientSessionId) return false;
  const check = await assertActiveSessionAdmin({
    profileId,
    clientSessionId,
    enforceMissing: false,
  });
  if (check.ok === false) {
    res.status(409).json({
      success: false,
      code: 'SESSION_REPLACED',
      error: {
        message: 'Your account was signed in on another device. Please sign in again.',
        code: 'SESSION_REPLACED',
      },
    });
    return true;
  }
  return false;
}

export function createPresenceRouter(ctx: ServerRuntime): Router {
  const router = Router();
  const {
    getFormattedPresence,
    broadcastPresence,
    broadcastUsers,
    applyPresenceHeartbeat,
  } = ctx;

  // Presence status — Redis lease only (last_seen_at only on login/logout elsewhere)
  router.post('/', requireAuth, async (req, res) => {
    try {
      const userId = String((req as any).profileId || (req as any).user?.id || '');
      const { status } = req.body;
      if (!userId) {
        return res.status(400).json({ success: false, error: 'userId required' });
      }
      if (await rejectIfSessionReplaced(req, res, userId)) return;

      if (!isRedisConfigured()) return redisUnavailable(res);

      const requested =
        status === 'offline'
          ? 'offline'
          : status === 'busy' || status === 'in_call'
            ? 'busy'
            : status === 'online' || !status
              ? 'online'
              : null;
      if (!requested) {
        return res.status(400).json({
          success: false,
          error: 'status must be online, busy, or offline',
        });
      }

      try {
        if (requested === 'offline') await deletePresence(userId);
        else await setPresence(userId, requested);
      } catch (err: any) {
        return redisUnavailable(res, err);
      }

      // In-memory map for local WS peers — never persistStatus to Postgres
      const result = applyPresenceHeartbeat(userId, requested, {
        persistStatus: false,
        fromUnload: requested === 'offline',
      });

      if (result.changed) {
        broadcastPresence();
        broadcastUsers();
      }

      return res.json({
        success: true,
        status: result.status,
        presence: getFormattedPresence(),
        redis: true,
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Heartbeat — Redis only; 503 if Redis missing/unreachable
  router.post('/heartbeat', requireAuth, async (req, res) => {
    try {
      const userId = String((req as any).profileId || (req as any).user?.id || '');
      const { status, peerIds } = req.body || {};
      if (!userId) {
        return res.status(400).json({ success: false, error: 'userId required' });
      }
      if (await rejectIfSessionReplaced(req, res, userId)) return;

      if (!isRedisConfigured()) return redisUnavailable(res);

      const requested =
        status === 'offline'
          ? 'offline'
          : status === 'busy' || status === 'in_call'
            ? 'busy'
            : status === 'online' || !status
              ? 'online'
              : null;
      if (status && !requested) {
        return res.status(400).json({
          success: false,
          error: 'status must be online, busy, or offline',
        });
      }

      const writeStatus = requested || 'online';

      try {
        if (writeStatus === 'offline') await deletePresence(userId);
        else await setPresence(userId, writeStatus);
      } catch (err: any) {
        return redisUnavailable(res, err);
      }

      const result = applyPresenceHeartbeat(userId, writeStatus, {
        persistStatus: false,
      });

      if (result.changed) {
        broadcastPresence();
        broadcastUsers();
      }

      let presence = getFormattedPresence();
      try {
        if (Array.isArray(peerIds) && peerIds.length) {
          const redisMap = await mgetPresence(peerIds.map(String));
          presence = { ...presence, ...redisMap, [userId]: writeStatus };
        }
      } catch {
        presence = { ...presence, [userId]: writeStatus };
      }

      return res.json({
        success: true,
        status: result.status,
        presence,
        redis: true,
      });
    } catch (err: any) {
      if (err instanceof RedisUnavailableError || err?.code === 'REDIS_UNAVAILABLE') {
        return redisUnavailable(res, err);
      }
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/', requireAuth, async (req, res) => {
    if (!isRedisConfigured()) return redisUnavailable(res);
    const idsParam = String(req.query.ids || '');
    const ids = idsParam.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 200);
    try {
      if (ids.length) {
        const presence = await mgetPresence(ids);
        return res.json({ success: true, presence, source: 'redis' });
      }
      return res.json({ success: true, presence: getFormattedPresence(), source: 'memory' });
    } catch (err: any) {
      return redisUnavailable(res, err);
    }
  });

  return router;
}

export function createCreatorRouter(ctx: ServerRuntime): Router {
  const router = Router();
  const {
    creatorMetricsMap,
    serverUsers,
    getFormattedCreatorMetrics,
    broadcastCreatorMetrics,
    broadcastUsers,
    accrueCreatorOnlineTime,
    toggleReadyNowForCreator,
    getFirstCallBonusAmounts,
  } = ctx;

  router.get('/metrics', requireAuth, async (req, res) => {
    try {
      const creatorId = req.query.creatorId as string | undefined;
      const selfId = String((req as any).profileId || (req as any).user?.id || '');
      if (creatorId) {
        const role = (req as any).profile?.role;
        const allowed =
          creatorId === selfId || role === 'admin' || role === 'team_leader' || role === 'agency_manager';
        if (!allowed) {
          return res.status(403).json({ success: false, error: 'Forbidden' });
        }
        const metric = creatorMetricsMap.get(creatorId);
        return res.json({ success: true, metric: metric || null });
      }
      return res.json({ success: true, metrics: getFormattedCreatorMetrics() });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Creator online nudge — Redis presence lease; no profiles.last_seen_at writes
  router.post('/heartbeat', requireAuth, async (req, res) => {
    try {
      const creatorId = String((req as any).profileId || (req as any).user?.id || '');
      if (!creatorId) {
        return res.status(400).json({ success: false, error: 'creatorId is required' });
      }

      if (!isRedisConfigured()) return redisUnavailable(res);
      try {
        await setPresence(creatorId, 'online');
      } catch (err: any) {
        return redisUnavailable(res, err);
      }

      const metrics = accrueCreatorOnlineTime(creatorId, { forcePersist: false });
      const result = metrics || creatorMetricsMap.get(creatorId) || null;

      return res.json({ success: true, metrics: result, redis: true });
    } catch (err: any) {
      console.error('Error in POST /api/creator/heartbeat:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Ready Now — authenticated; creatorId always from session
  router.post('/ready-now-toggle', requireAuth, async (req, res) => {
    try {
      const creatorId = String((req as any).profileId || (req as any).user?.id || '');
      if (!creatorId) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      const { isReadyNow } = req.body;
      const updated = toggleReadyNowForCreator(creatorId, Boolean(isReadyNow));
      broadcastCreatorMetrics();

      return res.json({ success: true, metrics: updated });
    } catch (err: any) {
      console.error('Error in POST /api/creator/ready-now-toggle:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Record Call Offer / Answer / Decline / Miss Event
  router.post('/call-offer', requireAuth, async (req, res) => {
    try {
      const creatorId = String((req as any).profileId || (req as any).user?.id || '');
      const { outcome } = req.body;
      if (!creatorId || !outcome) {
        return res.status(400).json({ success: false, error: 'creatorId and outcome are required' });
      }

      const existing = creatorMetricsMap.get(creatorId) || {
        creatorId,
        activeOnlineSeconds: 0,
        activeOnlineHours: 0,
        coinsEarnedFromCalls: 0,
        coinsEarnedFromGifts: 0,
        totalCallsOffered: 0,
        totalCallsAnswered: 0,
        totalCallsDeclined: 0,
        totalCallsMissed: 0,
        responseHealthScore: 100,
        performanceTier: 'bronze',
      };

      if (outcome === 'offered') {
        existing.totalCallsOffered = (existing.totalCallsOffered || 0) + 1;
      } else if (outcome === 'answered') {
        existing.totalCallsAnswered = (existing.totalCallsAnswered || 0) + 1;
      } else if (outcome === 'declined') {
        existing.totalCallsDeclined = (existing.totalCallsDeclined || 0) + 1;
      } else if (outcome === 'missed') {
        existing.totalCallsMissed = (existing.totalCallsMissed || 0) + 1;
      }

      const totalOff = Math.max(
        1,
        existing.totalCallsOffered ||
          existing.totalCallsAnswered + existing.totalCallsDeclined + existing.totalCallsMissed
      );
      existing.responseHealthScore = Number(
        (((existing.totalCallsAnswered || 0) / totalOff) * 100).toFixed(1)
      );
      existing.updatedAt = new Date().toISOString();

      creatorMetricsMap.set(creatorId, existing);

      if (isSupabaseAdminConfigured()) {
        await upsertCreatorMetricsAdmin(existing);
      }

      broadcastCreatorMetrics();

      return res.json({ success: true, metrics: existing });
    } catch (err: any) {
      console.error('Error in POST /api/creator/call-offer:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Claim Daily First Call Bonus — amounts from system_configs when available
  router.post('/first-call-bonus', requireAuth, async (req, res) => {
    try {
      const creatorId = String((req as any).profileId || (req as any).user?.id || '');
      if (!creatorId) {
        return res.status(400).json({ success: false, error: 'creatorId is required' });
      }

      const { coins: bonusCoins, usd: bonusUSD } = await getFirstCallBonusAmounts();

      const todayStr = new Date().toISOString().split('T')[0];
      const existing = creatorMetricsMap.get(creatorId) || {
        creatorId,
        activeOnlineSeconds: 0,
        bonusEarnedCoins: 0,
        bonusEarnedUSD: 0,
      };

      if (existing.firstCallBonusClaimedDate === todayStr) {
        return res.json({
          success: false,
          message: 'Daily first call bonus already claimed today.',
          alreadyClaimed: true,
        });
      }

      const coinsToAdd = Number(bonusCoins || 100);
      const usdToAdd = Number(bonusUSD || 1.0);

      existing.firstCallBonusClaimedDate = todayStr;
      existing.bonusEarnedCoins = (existing.bonusEarnedCoins || 0) + coinsToAdd;
      existing.bonusEarnedUSD = Number(((existing.bonusEarnedUSD || 0) + usdToAdd).toFixed(2));
      existing.updatedAt = new Date().toISOString();

      creatorMetricsMap.set(creatorId, existing);

      const user = serverUsers.get(creatorId);
      if (user) {
        user.earningsCoins = (user.earningsCoins || 0) + coinsToAdd;
        user.totalCashEarnedUSD = Number(
          ((user.totalCashEarnedUSD || 0) + usdToAdd).toFixed(2)
        );
        if (isSupabaseAdminConfigured()) {
          await upsertProfileAdmin(user);
        }
      }

      if (isSupabaseAdminConfigured()) {
        await upsertCreatorMetricsAdmin(existing);
      }

      broadcastCreatorMetrics();
      broadcastUsers();

      return res.json({
        success: true,
        bonusCoins: coinsToAdd,
        bonusUSD: usdToAdd,
        metrics: existing,
      });
    } catch (err: any) {
      console.error('Error in POST /api/creator/first-call-bonus:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
