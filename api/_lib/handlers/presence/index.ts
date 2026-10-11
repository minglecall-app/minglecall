/**
 * POST /api/presence — Redis presence lease only (never Postgres last_seen).
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
  const status = String(body?.status || 'online').toLowerCase();
  const allowed = status === 'online' || status === 'busy' || status === 'offline';
  const onlineStatus: PresenceStatus = allowed ? (status as PresenceStatus) : 'online';

  try {
    if (onlineStatus === 'offline') {
      await deletePresence(auth.profileId);
    } else {
      await setPresence(auth.profileId, onlineStatus);
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

  return sendJson(res, 200, { success: true, userId: auth.profileId, status: onlineStatus, redis: true });
}
