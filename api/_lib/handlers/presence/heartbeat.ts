/**
 * POST /api/presence/heartbeat — Redis presence lease only (never Postgres).
 */
import {
  sendJson,
  readJsonBody,
  requireAuthFromBearer,
  type VercelReq,
  type VercelRes,
} from '../../vercelAuth';
import {
  isRedisConfigured,
  setPresence,
  deletePresence,
  mgetPresence,
  RedisUnavailableError,
  type PresenceStatus,
} from '../../../../lib/redis';

export default async function handler(req: VercelReq, res: VercelRes) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== 'POST' && req.method !== 'PUT') {
    return sendJson(res, 405, { success: false, error: 'Method not allowed' });
  }

  const auth = await requireAuthFromBearer(req);
  if (auth.ok === false) {
    return sendJson(res, auth.status, { success: false, error: auth.error });
  }

  if (!isRedisConfigured()) {
    return sendJson(res, 503, {
      success: false,
      error: {
        message: 'Presence service unavailable — Redis is not configured',
        code: 'REDIS_UNAVAILABLE',
      },
    });
  }

  const body = await readJsonBody(req);
  const statusRaw = String(body?.status || 'online').toLowerCase();
  const writeStatus: PresenceStatus =
    statusRaw === 'offline' ? 'offline' : statusRaw === 'busy' || statusRaw === 'in_call' ? 'busy' : 'online';

  try {
    if (writeStatus === 'offline') {
      await deletePresence(auth.profileId);
    } else {
      await setPresence(auth.profileId, writeStatus);
    }
  } catch (err: any) {
    return sendJson(res, 503, {
      success: false,
      error: {
        message: err?.message || 'Redis presence write failed',
        code: 'REDIS_UNAVAILABLE',
      },
    });
  }

  const peerIds = Array.isArray(body?.peerIds)
    ? body.peerIds.map((id: unknown) => String(id || '').trim()).filter(Boolean).slice(0, 200)
    : [];
  let presence: Record<string, PresenceStatus> = {};
  try {
    if (peerIds.length) {
      presence = await mgetPresence(peerIds);
    }
  } catch {
    /* best-effort */
  }
  presence[auth.profileId] = writeStatus;

  return sendJson(res, 200, {
    success: true,
    userId: auth.profileId,
    status: writeStatus,
    presence,
    redis: true,
  });
}
