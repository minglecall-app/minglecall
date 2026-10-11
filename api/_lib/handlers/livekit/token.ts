/**
 * LiveKit token minting — requires valid Supabase JWT and call participant auth
 * via Redis call state or open call_logs (never room-name string guessing alone).
 */
import {
  sendJson,
  readJsonBody,
  requireAuthFromBearer,
  getLiveKitEnv,
  createServiceClient,
  type VercelReq,
  type VercelRes,
} from '../../vercelAuth';

const OPEN_STATUSES = new Set(['ringing', 'active', 'accepted', 'in_call', 'connecting']);

async function authorizeCallParticipant(
  profileId: string,
  userId: string,
  callId: string,
  role: string
): Promise<{ ok: true; roomName: string } | { ok: false; status: number; error: string; code: string }> {
  if (role === 'admin' && String(callId).startsWith('admin_test_room_')) {
    return { ok: true, roomName: callId };
  }

  // Redis lease first (authoritative for in-flight calls on Vercel)
  try {
    const { getCallState, isRedisConfigured } = await import('../../../../lib/redis');
    if (isRedisConfigured()) {
      const state = await getCallState(callId);
      if (state) {
        const ids = [state.callerId, state.receiverId].map((x) => String(x || ''));
        if (ids.includes(profileId) || ids.includes(userId)) {
          return { ok: true, roomName: callId };
        }
        return {
          ok: false,
          status: 403,
          error: 'Not a call participant',
          code: 'NOT_CALL_MEMBER',
        };
      }
    }
  } catch {
    /* Redis optional */
  }

  const client = createServiceClient();
  if (!client) {
    return {
      ok: false,
      status: 503,
      error: 'Supabase not configured',
      code: 'NO_SUPABASE',
    };
  }

  const { data: row } = await client
    .from('call_logs')
    .select('id, caller_id, receiver_id, host_id, status')
    .eq('id', callId)
    .maybeSingle();

  if (!row) {
    return {
      ok: false,
      status: 403,
      error: 'Not authorized for this LiveKit room',
      code: 'NOT_CALL_MEMBER',
    };
  }

  const st = String(row.status || '').toLowerCase();
  if (st && !OPEN_STATUSES.has(st)) {
    return {
      ok: false,
      status: 409,
      error: 'This call has already ended.',
      code: 'CALL_ENDED',
    };
  }

  const ids = [row.caller_id, row.receiver_id, row.host_id].map((x) => String(x || ''));
  if (!ids.includes(profileId) && !ids.includes(userId)) {
    return {
      ok: false,
      status: 403,
      error: 'Not a call participant',
      code: 'NOT_CALL_MEMBER',
    };
  }

  return { ok: true, roomName: String(row.id || callId) };
}

export default async function handler(req: VercelReq, res: VercelRes) {
  try {
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }
    if (req.method !== 'POST') {
      return sendJson(res, 405, { error: 'Method not allowed' });
    }

    const auth = await requireAuthFromBearer(req);
    if (auth.ok === false) {
      return sendJson(res, auth.status, { error: auth.error?.message || 'Unauthorized', ...auth.error });
    }

    const body = await readJsonBody(req);
    const roomName = String(body.roomName || body.callId || '').trim();
    const identity = auth.profileId;
    const isAdmin = auth.role === 'admin';

    if (!roomName || !identity) {
      return sendJson(res, 400, { error: 'roomName or callId is required' });
    }

    const isAdminTestRoom = roomName.startsWith('admin_test_room_');
    if (isAdminTestRoom && !isAdmin) {
      return sendJson(res, 403, { error: 'Admin test rooms require admin privileges.' });
    }

    if (!isAdminTestRoom) {
      const authz = await authorizeCallParticipant(
        auth.profileId,
        auth.userId,
        roomName,
        auth.role
      );
      if (authz.ok === false) {
        return sendJson(res, authz.status, { error: authz.error, code: authz.code });
      }
    }

    const livekit = getLiveKitEnv();
    if (
      !livekit.apiKey ||
      !livekit.apiSecret ||
      livekit.apiKey === 'devkey' ||
      livekit.apiSecret === 'secret'
    ) {
      return sendJson(res, 200, {
        configured: false,
        token: null,
        wsUrl: livekit.wsUrl || null,
        message:
          'LiveKit credentials missing. Set LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET in Vercel env.',
      });
    }

    const displayName =
      (typeof body.name === 'string' && body.name.trim()) ||
      auth.user?.user_metadata?.full_name ||
      auth.email ||
      identity;

    const { AccessToken } = await import('livekit-server-sdk');
    const at = new AccessToken(livekit.apiKey, livekit.apiSecret, {
      identity,
      name: displayName,
      ttl: '1h',
    });
    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      hidden: false,
    });

    const token = await at.toJwt();
    return sendJson(res, 200, {
      configured: true,
      token,
      wsUrl: livekit.wsUrl,
      source: 'environment',
    });
  } catch (err: any) {
    console.error('[api/livekit/token]', err);
    return sendJson(res, 500, {
      configured: false,
      token: null,
      error: 'Failed to generate token',
      message: err?.message || 'Token signing failed',
    });
  }
}
