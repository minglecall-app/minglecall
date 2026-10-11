/**
 * /api/livekit/token — plain CommonJS (Hobby-safe).
 * Isolated from api/router so a router boot failure cannot break LiveKit token minting.
 */
const { createClient } = require('@supabase/supabase-js');
const { AccessToken } = require('livekit-server-sdk');

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function clean(v) {
  return String(v || '')
    .trim()
    .replace(/^["']|["']$/g, '');
}

function bearer(req) {
  const h = req.headers.authorization || req.headers.Authorization;
  if (!h || typeof h !== 'string') return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

function livekitEnv() {
  return {
    wsUrl: clean(process.env.LIVEKIT_URL),
    apiKey: clean(process.env.LIVEKIT_API_KEY),
    apiSecret: clean(process.env.LIVEKIT_API_SECRET),
  };
}

function isUsableLivekitUrl(url) {
  const u = clean(url);
  if (!u) return false;
  if (u.includes('your-livekit')) return false;
  return u.startsWith('wss://') || u.startsWith('ws://');
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return {};
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function requireAuth(req) {
  const supabaseUrl = clean(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL);
  const serviceKey = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl || !serviceKey) {
    return {
      ok: false,
      status: 503,
      error: {
        message:
          'Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in server environment (Vercel Project Settings).',
        code: 'ENV_MISSING',
      },
    };
  }

  const token = bearer(req);
  if (!token) {
    return {
      ok: false,
      status: 401,
      error: { message: 'Missing Authorization Bearer token.', code: 'UNAUTHORIZED' },
    };
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData || !userData.user) {
    return {
      ok: false,
      status: 401,
      error: { message: 'Invalid or expired authentication token.', code: 'UNAUTHORIZED' },
    };
  }

  const authUser = userData.user;
  let profile = null;
  {
    const { data: byAuth } = await admin
      .from('profiles')
      .select('id, role, email, auth_id')
      .eq('auth_id', authUser.id)
      .maybeSingle();
    profile = byAuth || null;
  }
  if (!profile) {
    const { data: byId } = await admin
      .from('profiles')
      .select('id, role, email, auth_id')
      .eq('id', authUser.id)
      .maybeSingle();
    profile = byId || null;
  }
  if (!profile && authUser.email) {
    const { data: byEmail } = await admin
      .from('profiles')
      .select('id, role, email, auth_id')
      .ilike('email', String(authUser.email).trim().toLowerCase())
      .maybeSingle();
    profile = byEmail || null;
  }

  const profileId = String((profile && profile.id) || authUser.id);
  const role = String((profile && profile.role) || '').toLowerCase();
  const email = String((profile && profile.email) || authUser.email || '').toLowerCase();

  return {
    ok: true,
    userId: authUser.id,
    profileId,
    role,
    email,
    user: authUser,
    client: admin,
    profile,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function collectMyIds(auth) {
  return new Set(
    [auth.profileId, auth.userId, auth.profile && auth.profile.auth_id]
      .map((v) => String(v || '').trim())
      .filter(Boolean)
  );
}

/**
 * True if the authenticated user is a participant on this call_logs row.
 * Handles profile.id vs auth.users.id mismatches (common after Vercel/Auth linking).
 */
async function isCallParticipant(client, callRow, auth) {
  if (!callRow || !auth) return false;
  const participantIds = [callRow.caller_id, callRow.receiver_id, callRow.host_id]
    .map((v) => String(v || '').trim())
    .filter(Boolean);
  if (!participantIds.length) return false;

  const myIds = collectMyIds(auth);
  if (participantIds.some((id) => myIds.has(id))) return true;

  // Map stored participant ids → their auth_id / email and compare to session
  try {
    const { data: byId } = await client
      .from('profiles')
      .select('id, auth_id, email')
      .in('id', participantIds);
    const { data: byAuth } = await client
      .from('profiles')
      .select('id, auth_id, email')
      .in('auth_id', participantIds);
    const rows = [...(byId || []), ...(byAuth || [])];
    for (const row of rows) {
      const rid = String((row && row.id) || '').trim();
      const raid = String((row && row.auth_id) || '').trim();
      const remail = String((row && row.email) || '')
        .trim()
        .toLowerCase();
      if (rid && myIds.has(rid)) return true;
      if (raid && myIds.has(raid)) return true;
      if (remail && auth.email && remail === auth.email) return true;
    }
  } catch (e) {
    console.warn('[api/livekit/token] participant profile lookup', e && e.message);
  }
  return false;
}

async function loadCallRow(client, roomName) {
  const { data, error } = await client
    .from('call_logs')
    .select('id, caller_id, receiver_id, host_id, status')
    .eq('id', roomName)
    .maybeSingle();
  if (error) {
    console.warn('[api/livekit/token] call_logs lookup', error.message);
    return null;
  }
  return data || null;
}

/** Last-resort: open call involving this user (handles sync race / id alias). */
async function findOpenCallForUser(client, auth, roomName) {
  const myIds = Array.from(collectMyIds(auth));
  if (!myIds.length) return null;
  const open = ['ringing', 'active', 'accepted', 'in_call', 'connecting'];
  try {
    // Prefer exact room id among user's open calls
    if (roomName) {
      const exact = await loadCallRow(client, roomName);
      if (exact && open.includes(String(exact.status || '').toLowerCase())) {
        if (await isCallParticipant(client, exact, auth)) return exact;
      }
    }
    const orFilter = myIds
      .flatMap((id) => [`caller_id.eq.${id}`, `receiver_id.eq.${id}`, `host_id.eq.${id}`])
      .join(',');
    const { data, error } = await client
      .from('call_logs')
      .select('id, caller_id, receiver_id, host_id, status, updated_at')
      .or(orFilter)
      .in('status', open)
      .order('updated_at', { ascending: false })
      .limit(5);
    if (error) {
      console.warn('[api/livekit/token] open-call lookup', error.message);
      return null;
    }
    const rows = data || [];
    if (roomName) {
      const match = rows.find((r) => String(r.id) === roomName);
      if (match) return match;
    }
    // Only auto-pick when exactly one open call (sync race before row id is queryable)
    if (rows.length === 1) return rows[0];
    return null;
  } catch (e) {
    console.warn('[api/livekit/token] findOpenCallForUser', e && e.message);
    return null;
  }
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }
    if (req.method !== 'POST') {
      return send(res, 405, { error: 'Method not allowed' });
    }

    const auth = await requireAuth(req);
    if (auth.ok === false) {
      return send(res, auth.status, {
        error: (auth.error && auth.error.message) || 'Unauthorized',
        ...auth.error,
      });
    }

    const body = await readJsonBody(req);
    let roomName = String(body.roomName || '').trim();
    const identity = auth.profileId;
    const isAdmin =
      auth.role === 'admin' ||
      auth.email === 'admin@livecall.app' ||
      auth.email === 'superadmin@minglecall.com';

    if (!roomName || !identity) {
      return send(res, 400, { error: 'roomName is required' });
    }

    const isAdminTestRoom = roomName.startsWith('admin_test_room_');
    if (isAdminTestRoom && !isAdmin) {
      return send(res, 403, { error: 'Admin test rooms require admin privileges.' });
    }

    // Non-admin 1:1 rooms: must be a call participant (Redis call state or open call_logs).
    if (!isAdminTestRoom && !isAdmin) {
      let authorized = false;
      let callRow = null;

      // Redis call lease (authoritative under Vercel concurrency)
      try {
        const {
          getCallState,
          isRedisConfigured,
        } = require('../_lib/cjs/redisPresence');
        if (isRedisConfigured()) {
          const state = await getCallState(roomName);
          if (state) {
            const myIds = collectMyIds(auth);
            const ids = [state.callerId, state.receiverId].map((v) => String(v || '').trim());
            if (ids.some((id) => myIds.has(id))) {
              authorized = true;
            } else {
              return send(res, 403, {
                error: 'Not a call participant',
                code: 'NOT_CALL_MEMBER',
              });
            }
          }
        }
      } catch (e) {
        console.warn('[api/livekit/token] redis call state', e && e.message);
      }

      if (!authorized && auth.client) {
        callRow = await loadCallRow(auth.client, roomName);
        // Accept / sync race: row may land a few hundred ms after UI flips to active
        if (!callRow) {
          await sleep(400);
          callRow = await loadCallRow(auth.client, roomName);
        }
        if (!callRow) {
          await sleep(800);
          callRow = await findOpenCallForUser(auth.client, auth, roomName);
        }

        if (callRow) {
          authorized = await isCallParticipant(auth.client, callRow, auth);
          // Prefer canonical call id from DB for the LiveKit room name
          if (authorized && callRow.id) {
            roomName = String(callRow.id);
          }
          const st = String(callRow.status || '').toLowerCase();
          const openStatuses = new Set([
            'ringing',
            'active',
            'accepted',
            'in_call',
            'connecting',
          ]);
          if (authorized && st && !openStatuses.has(st)) {
            return send(res, 409, {
              error: 'This call has already ended.',
              code: 'CALL_ENDED',
            });
          }
        }
      }

      if (!authorized) {
        return send(res, 403, {
          error:
            'Not authorized for this LiveKit room. Join only works for calls you participate in.',
          code: 'NOT_CALL_MEMBER',
          detail: callRow
            ? {
                roomName,
                profileId: identity,
                authUserId: auth.userId,
                callerId: callRow.caller_id,
                receiverId: callRow.receiver_id,
                hostId: callRow.host_id,
                status: callRow.status,
              }
            : {
                roomName,
                profileId: identity,
                authUserId: auth.userId,
                reason: 'call_row_missing',
                hint: 'POST /api/calls/sync must succeed before LiveKit token',
              },
        });
      }
    }

    const livekit = livekitEnv();
    if (
      !livekit.apiKey ||
      !livekit.apiSecret ||
      livekit.apiKey === 'devkey' ||
      livekit.apiSecret === 'secret' ||
      !isUsableLivekitUrl(livekit.wsUrl)
    ) {
      return send(res, 200, {
        configured: false,
        token: null,
        wsUrl: isUsableLivekitUrl(livekit.wsUrl) ? livekit.wsUrl : null,
        message:
          'LiveKit is not fully configured. Set LIVEKIT_URL (wss://…), LIVEKIT_API_KEY, and LIVEKIT_API_SECRET in Vercel env.',
      });
    }

    const displayName =
      (typeof body.name === 'string' && body.name.trim()) ||
      (auth.user && auth.user.user_metadata && auth.user.user_metadata.full_name) ||
      auth.email ||
      identity;

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
    return send(res, 200, {
      configured: true,
      token,
      wsUrl: livekit.wsUrl,
      source: 'environment',
    });
  } catch (err) {
    console.error('[api/livekit/token]', err);
    return send(res, 500, {
      configured: false,
      token: null,
      error: 'Failed to generate token',
      message: (err && err.message) || 'Token signing failed',
    });
  }
};
