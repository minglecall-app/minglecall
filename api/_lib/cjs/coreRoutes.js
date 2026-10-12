/**
 * Core app routes for Vercel CJS router:
 * presence, messages, calls, gifts, users extras, supabase profile/status.
 */
const { randomUUID } = require('crypto');
const {
  send,
  readJsonBody,
  createServiceClient,
  requireAuth,
  isAdminRole,
  mapProfileRow,
  splitGalleryPhotosAndVideos,
  mergeGalleryWithVideoSentinel,
} = require('./helpers');
const {
  isRedisConfigured,
  isRedisUnavailableError,
  setPresence,
  deletePresence,
  mgetPresence,
  setCallState,
  deleteCallState,
} = require('./redisPresence');

function isMissingGalleryVideosColumnError(err) {
  const msg = String((err && err.message) || err || '');
  return /gallery_videos/i.test(msg) && (/column/i.test(msg) || /schema cache/i.test(msg));
}

/** Offline if no heartbeat / last_seen within this window (client heartbeat ~15s). */
const PRESENCE_STALE_MS = 90_000;

function toIsoTimestamp(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  const s = String(value).trim();
  if (!s) return null;
  const ms = Date.parse(s);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function normalizePresenceStatus(raw) {
  const s = String(raw || 'offline').toLowerCase();
  if (s === 'in_call') return 'busy';
  if (s === 'online' || s === 'busy') return s;
  return 'offline';
}

const ACTIVE_CALL_STATUSES = ['ringing', 'active', 'accepted', 'in_call', 'connecting'];

async function closeOpenCallLogsForUsers(client, userIds, reason) {
  const ids = Array.from(
    new Set((userIds || []).map((id) => String(id || '').trim()).filter(Boolean))
  );
  if (!ids.length) return;
  const endedAt = new Date().toISOString();
  // Close any open row where this user is caller, receiver, or host
  for (const col of ['caller_id', 'receiver_id', 'host_id']) {
    try {
      const error = await updateCallLogs(
        client,
        {
          status: 'completed',
          ended_at: endedAt,
          end_time: endedAt,
          updated_at: endedAt,
          end_reason: reason || 'presence_online_clear',
        },
        (q) => q.in(col, ids).in('status', ACTIVE_CALL_STATUSES)
      );
      if (error) console.warn('[presence] closeOpenCallLogs', col, error.message);
    } catch (e) {
      console.warn('[presence] closeOpenCallLogs', col, e && e.message);
    }
  }
}

/**
 * Participants in open calls → busy.
 * Stale ringing / abandoned active rows are closed so busy cannot stick.
 */
async function fetchActiveCallParticipantIds(client) {
  const ids = new Set();
  try {
    const { data, error } = await client
      .from('call_logs')
      .select('id, caller_id, receiver_id, host_id, status, started_at, start_time')
      .in('status', ACTIVE_CALL_STATUSES)
      .limit(500);
    if (error) {
      console.warn('[presence] active call_logs', error.message);
      return ids;
    }
    const now = Date.now();
    const zombieIds = [];
    for (const row of data || []) {
      const st = String(row.status || '').toLowerCase();
      const startedMs = Date.parse(row.started_at || row.start_time || '') || 0;
      const ageMs = startedMs ? now - startedMs : 0;
      // Drop abandoned ringing / zombie active rows so busy cannot stick forever
      const isZombieRinging = st === 'ringing' && ageMs > 60_000;
      const isZombieActive =
        (st === 'active' || st === 'accepted' || st === 'in_call' || st === 'connecting') &&
        ageMs > 10 * 60_000;
      if (isZombieRinging || isZombieActive) {
        if (row.id) zombieIds.push(String(row.id));
        continue;
      }
      for (const id of [row.caller_id, row.receiver_id, row.host_id]) {
        if (id) ids.add(String(id));
      }
    }
    // Best-effort close zombies so the next heartbeat does not re-scan them as busy
    if (zombieIds.length) {
      const endedAt = new Date().toISOString();
      updateCallLogs(
        client,
        {
          status: 'missed',
          ended_at: endedAt,
          end_time: endedAt,
          updated_at: endedAt,
          end_reason: 'stale_presence_cleanup',
        },
        (q) => q.in('id', zombieIds)
      )
        .then((closeErr) => {
          if (closeErr) console.warn('[presence] zombie call cleanup', closeErr.message);
        })
        .catch((e) => console.warn('[presence] zombie call cleanup', e && e.message));
    }
  } catch (e) {
    console.warn('[presence] fetchActiveCallParticipantIds', e && e.message);
  }
  return ids;
}

async function buildPresenceMap(client) {
  const presence = {};
  const [profilesRes, busyIds] = await Promise.all([
    client.from('profiles').select('id, auth_id, online_status, last_seen_at').limit(2000),
    fetchActiveCallParticipantIds(client),
  ]);
  const now = Date.now();
  for (const row of profilesRes.data || []) {
    const id = String(row.id);
    const authId = row.auth_id ? String(row.auth_id) : '';
    let status = normalizePresenceStatus(row.online_status);
    const last = row.last_seen_at ? Date.parse(row.last_seen_at) : NaN;
    const fresh = Number.isFinite(last) && now - last <= PRESENCE_STALE_MS;
    // Match call_logs against profile id OR auth_id (IDs can differ)
    const inOpenCall = busyIds.has(id) || (authId && busyIds.has(authId));
    if (inOpenCall) {
      status = 'busy';
    } else if (status === 'busy' || status === 'in_call') {
      // Manual Busy (DND) while heartbeat is fresh. Leftover call-busy is cleared when
      // the user heartbeats/toggles online (which also closes open call_logs).
      status = fresh ? 'busy' : 'offline';
    } else if (status !== 'offline') {
      if (!fresh) status = 'offline';
    }
    presence[id] = status;
    // Also expose auth_id key so clients keyed by either id stay in sync
    if (authId && authId !== id) {
      presence[authId] = status;
    }
  }
  return presence;
}

async function setProfilesOnlineStatus(client, userIds, status) {
  const ids = Array.from(
    new Set((userIds || []).map((id) => String(id || '').trim()).filter(Boolean))
  );
  if (!ids.length) return;
  const now = new Date().toISOString();
  await client
    .from('profiles')
    .update({
      online_status: status,
      last_seen_at: now,
      updated_at: now,
    })
    .in('id', ids);
}

/** Map auth.users.id or profile id → canonical profiles.id (required for call_logs FK). */
async function resolveProfileId(client, raw) {
  const id = String(raw || '').trim();
  if (!id || !client) return '';
  {
    const { data } = await client.from('profiles').select('id').eq('id', id).maybeSingle();
    if (data && data.id) return String(data.id);
  }
  {
    const { data } = await client.from('profiles').select('id').eq('auth_id', id).maybeSingle();
    if (data && data.id) return String(data.id);
  }
  return '';
}

/**
 * call_logs.updated_at may be missing on older DBs. Retry without it so
 * /api/calls/sync does not hard-fail video call placement.
 */
function stripCallLogUpdatedAt(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  const next = { ...payload };
  delete next.updated_at;
  return next;
}

function isMissingUpdatedAtError(error) {
  const msg = String((error && error.message) || '');
  return /updated_at/i.test(msg) && (/column/i.test(msg) || /schema cache/i.test(msg));
}

async function upsertCallLog(client, payload) {
  let { error } = await client.from('call_logs').upsert(payload, { onConflict: 'id' });
  if (error && isMissingUpdatedAtError(error)) {
    ({ error } = await client
      .from('call_logs')
      .upsert(stripCallLogUpdatedAt(payload), { onConflict: 'id' }));
  }
  return error;
}

async function updateCallLogs(client, patch, applyFilter) {
  let q = client.from('call_logs').update(patch);
  q = applyFilter(q);
  let { error } = await q;
  if (error && isMissingUpdatedAtError(error)) {
    q = client.from('call_logs').update(stripCallLogUpdatedAt(patch));
    q = applyFilter(q);
    ({ error } = await q);
  }
  return error;
}

/** Keep the higher billed total when hangup sync races a burn write. */
function maxCallEconomy(existing, incoming) {
  return Math.max(Number(existing) || 0, Number(incoming) || 0);
}

/**
 * Add this minute onto call_logs.coins_spent / coins_earned.
 * Retries if another writer changed the row between read and update.
 */
async function addCallMinuteTotals(client, callId, addSpent, addEarned, durationFloor, extraPatch) {
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: row, error: readErr } = await client
      .from('call_logs')
      .select('coins_spent, coins_earned, duration_seconds')
      .eq('id', callId)
      .maybeSingle();
    if (readErr) {
      lastErr = readErr;
      break;
    }
    const baseSpent = Number(row && row.coins_spent) || 0;
    const baseEarned = Number(row && row.coins_earned) || 0;
    const baseDuration = Number(row && row.duration_seconds) || 0;
    const nextSpent = baseSpent + Math.max(0, Number(addSpent) || 0);
    const nextEarned = baseEarned + Math.max(0, Number(addEarned) || 0);
    const nextDuration = Math.max(baseDuration, Math.max(0, Number(durationFloor) || 0));
    const patch = {
      ...(extraPatch || {}),
      coins_spent: nextSpent,
      coins_earned: nextEarned,
      duration_seconds: nextDuration,
    };
    const writeOnce = async (body) => {
      const { data, error } = await client
        .from('call_logs')
        .update(body)
        .eq('id', callId)
        .eq('coins_earned', baseEarned)
        .eq('coins_spent', baseSpent)
        .select('coins_spent, coins_earned')
        .maybeSingle();
      return { data, error };
    };
    let { data, error } = await writeOnce(patch);
    if (error && isMissingUpdatedAtError(error)) {
      ({ data, error } = await writeOnce(stripCallLogUpdatedAt(patch)));
    }
    if (error) {
      lastErr = error;
      break;
    }
    if (data) {
      return {
        error: null,
        coinsSpent: Number(data.coins_spent) || nextSpent,
        coinsEarned: Number(data.coins_earned) || nextEarned,
      };
    }
  }
  return { error: lastErr, coinsSpent: null, coinsEarned: null };
}

async function handlePresence(path, req, res) {
  if (path !== 'presence' && path !== 'presence/index' && path !== 'presence/heartbeat') {
    return null;
  }
  if (req.method === 'GET') {
    const auth = await requireAuth(req);
    if (auth.ok === false) return send(res, auth.status, { success: false, error: auth.error });
    if (!isRedisConfigured()) {
      return send(res, 503, {
        success: false,
        error: {
          message: 'Presence service unavailable — Redis is not configured',
          code: 'REDIS_UNAVAILABLE',
        },
      });
    }
    const bodyIds = Array.isArray(req.query && req.query.ids)
      ? req.query.ids
      : String((req.query && req.query.ids) || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
    try {
      const presence = bodyIds.length ? await mgetPresence(bodyIds) : {};
      return send(res, 200, { success: true, presence, source: 'redis' });
    } catch (err) {
      return send(res, 503, {
        success: false,
        error: {
          message: (err && err.message) || 'Redis presence read failed',
          code: 'REDIS_UNAVAILABLE',
        },
      });
    }
  }
  if (req.method !== 'POST' && req.method !== 'PUT') {
    return send(res, 405, { success: false, error: 'Method not allowed' });
  }
  const auth = await requireAuth(req);
  if (auth.ok === false) return send(res, auth.status, { success: false, error: auth.error });

  if (!isRedisConfigured()) {
    return send(res, 503, {
      success: false,
      error: {
        message: 'Presence service unavailable — Redis is not configured',
        code: 'REDIS_UNAVAILABLE',
      },
    });
  }

  const body = await readJsonBody(req);
  const status = String((body && body.status) || 'online').toLowerCase();
  if (!['online', 'offline', 'busy', 'in_call'].includes(status)) {
    return send(res, 400, {
      success: false,
      error: 'status must be online, busy, or offline',
    });
  }
  // Call-log cleanup on explicit offline / clearCalls only — never writes last_seen_at
  const clearCalls = Boolean(body && body.clearCalls) || status === 'offline';
  if (clearCalls) {
    await closeOpenCallLogsForUsers(
      auth.client,
      [auth.profileId, auth.userId],
      status === 'offline' ? 'presence_offline_clear' : 'presence_online_clear'
    );
  }

  let writeStatus = 'online';
  if (status === 'offline') {
    writeStatus = 'offline';
  } else if (status === 'busy' || status === 'in_call') {
    writeStatus = 'busy';
  } else {
    writeStatus = 'online';
  }

  try {
    if (writeStatus === 'offline') {
      await deletePresence(auth.profileId);
      if (auth.userId) await deletePresence(String(auth.userId));
    } else {
      await setPresence(auth.profileId, writeStatus);
      if (auth.userId && String(auth.userId) !== String(auth.profileId)) {
        await setPresence(String(auth.userId), writeStatus);
      }
    }
  } catch (err) {
    return send(res, 503, {
      success: false,
      error: {
        message: (err && err.message) || 'Redis presence write failed',
        code: 'REDIS_UNAVAILABLE',
      },
    });
  }

  const peerIds = Array.isArray(body && body.peerIds)
    ? body.peerIds.map((id) => String(id || '').trim()).filter(Boolean).slice(0, 200)
    : [];
  let presence = {};
  try {
    if (peerIds.length) {
      presence = await mgetPresence(peerIds);
    }
  } catch (_) {
    /* best-effort peer map */
  }
  presence[auth.profileId] = writeStatus === 'offline' ? 'offline' : writeStatus;
  if (auth.userId) presence[String(auth.userId)] = presence[auth.profileId];

  return send(res, 200, {
    success: true,
    userId: auth.profileId,
    status: writeStatus,
    presence,
    redis: true,
  });
}

async function handleMessages(path, req, res) {
  if (!String(path || '').startsWith('messages')) return null;
  const auth = await requireAuth(req);
  if (auth.ok === false) return send(res, auth.status, { success: false, error: auth.error });
  const client = auth.client;

  if ((path === 'messages' || path === 'messages/index') && req.method === 'POST') {
    const body = await readJsonBody(req);
    const receiverId = String((body && body.receiverId) || '').trim();
    const text = String((body && body.text) || '').slice(0, 4000);
    const mediaUrl = body && body.mediaUrl ? String(body.mediaUrl).slice(0, 2048) : null;
    const rawType = String((body && body.type) || (mediaUrl ? 'image' : 'text'));
    const ALLOWED = new Set([
      'text',
      'image',
      'video',
      'voice',
      'gift',
      'friend_request',
      'call_rating',
      'system',
    ]);
    const type = ALLOWED.has(rawType) ? rawType : mediaUrl ? 'image' : 'text';
    const clientTempId = (body && body.clientTempId) || null;
    if (!receiverId) {
      return send(res, 400, {
        success: false,
        error: { message: 'receiverId required', code: 'BAD_REQUEST' },
      });
    }
    if (!auth.profile || !auth.profileId) {
      return send(res, 403, {
        success: false,
        error: { message: 'Sender profile not found', code: 'SENDER_NOT_FOUND' },
      });
    }
    if (!text && !mediaUrl) {
      return send(res, 400, {
        success: false,
        error: { message: 'Message text or media required', code: 'EMPTY_MESSAGE' },
      });
    }
    const { data: receiver, error: recvErr } = await client
      .from('profiles')
      .select('id, is_banned')
      .eq('id', receiverId)
      .maybeSingle();
    if (recvErr) {
      return send(res, 500, { success: false, error: { message: recvErr.message, code: 'SEND_FAILED' } });
    }
    if (!receiver) {
      return send(res, 404, {
        success: false,
        error: { message: 'Receiver not found', code: 'RECEIVER_NOT_FOUND' },
      });
    }
    if (receiver.is_banned) {
      return send(res, 403, {
        success: false,
        error: { message: 'Receiver unavailable', code: 'RECEIVER_UNAVAILABLE' },
      });
    }
    const { data: blocked } = await client
      .from('blocked_users')
      .select('user_id')
      .or(
        `and(user_id.eq.${auth.profileId},blocked_user_id.eq.${receiverId}),and(user_id.eq.${receiverId},blocked_user_id.eq.${auth.profileId})`
      )
      .limit(1);
    if (blocked && blocked.length) {
      return send(res, 403, { success: false, error: { message: 'Blocked', code: 'BLOCKED' } });
    }
    const row = {
      sender_id: auth.profileId,
      receiver_id: receiverId,
      text: text || (mediaUrl ? '📷 Photo' : ''),
      type,
      media_url: mediaUrl,
      media_type: (body && body.mediaType) || undefined,
      original_language: (body && body.originalLanguage) || undefined,
      is_read: false,
      created_at: new Date().toISOString(),
    };
    const { data, error } = await client.from('messages').insert(row).select('*').maybeSingle();
    if (error) {
      console.warn('[api/messages] insert', error.message);
      return send(res, 500, {
        success: false,
        error: { message: 'Failed to send message', code: 'SEND_FAILED' },
      });
    }
    const mapped = {
      id: data.id,
      senderId: data.sender_id,
      receiverId: data.receiver_id,
      text: data.text || '',
      mediaUrl: data.media_url || undefined,
      type: data.type,
      isRead: Boolean(data.is_read),
      createdAt: data.created_at,
      timestamp: data.created_at,
      clientTempId: clientTempId || undefined,
    };
    // Persist-first then targeted Realtime Broadcast (user + conversation topics)
    try {
      const { broadcastChatMessage } = require('./realtimeBroadcast');
      await broadcastChatMessage(client, mapped, [auth.profileId, receiverId]);
    } catch (broadcastErr) {
      console.warn(
        '[api/messages] realtime broadcast failed (message still durable)',
        broadcastErr && broadcastErr.message
      );
    }
    // Match Express contract: { success, data: { message } }
    return send(res, 201, {
      success: true,
      data: { message: mapped },
    });
  }

  if (path === 'messages/read' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const otherUserId = String((body && (body.otherUserId || body.senderId)) || '');
    let q = client
      .from('messages')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('receiver_id', auth.profileId)
      .eq('is_read', false);
    if (otherUserId) q = q.eq('sender_id', otherUserId);
    await q;
    return send(res, 200, { success: true });
  }

  if (path.startsWith('messages/conversation/') && req.method === 'GET') {
    const otherUserId = decodeURIComponent(
      path.replace('messages/conversation/', '').split('?')[0]
    );
    if (!otherUserId || otherUserId === 'conversation') {
      return send(res, 400, { success: false, error: { message: 'otherUserId required' } });
    }
    let clearedAt = null;
    try {
      const { data: clearRow } = await client
        .from('message_conversation_clears')
        .select('cleared_at')
        .eq('user_id', auth.profileId)
        .eq('other_user_id', otherUserId)
        .maybeSingle();
      clearedAt = clearRow && clearRow.cleared_at ? clearRow.cleared_at : null;
    } catch (_) {
      /* table may be missing in older DBs */
    }
    const cursor = String((req.query && req.query.cursor) || '').trim();
    let limit = Number((req.query && req.query.limit) || 40);
    if (!Number.isFinite(limit) || limit <= 0) limit = 40;
    limit = Math.min(Math.floor(limit), 50);

    let q = client
      .from('messages')
      .select('*')
      .or(
        `and(sender_id.eq.${auth.profileId},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${auth.profileId})`
      )
      .order('created_at', { ascending: false })
      .limit(limit);
    if (clearedAt) q = q.gt('created_at', clearedAt);
    if (cursor) q = q.lt('created_at', cursor);
    const { data, error } = await q;
    if (error) return send(res, 500, { success: false, error: { message: error.message } });
    const newestFirst = data || [];
    const nextCursor =
      newestFirst.length === limit
        ? newestFirst[newestFirst.length - 1] && newestFirst[newestFirst.length - 1].created_at
        : null;
    const messages = newestFirst
      .slice()
      .reverse()
      .map((row) => ({
        id: row.id,
        senderId: row.sender_id,
        receiverId: row.receiver_id,
        text: row.text || '',
        mediaUrl: row.media_url || undefined,
        type: row.type,
        isRead: Boolean(row.is_read),
        createdAt: row.created_at,
        timestamp: row.created_at,
      }));
    return send(res, 200, { success: true, messages, nextCursor, pageSize: limit });
  }

  if (path.startsWith('messages/conversation/') && req.method === 'DELETE') {
    const otherUserId = decodeURIComponent(path.replace('messages/conversation/', '').split('?')[0]);
    if (!otherUserId || otherUserId === 'conversation') {
      return send(res, 400, { success: false, error: { message: 'otherUserId required' } });
    }
    // Soft-hide for acting user only (parity with Express) — do not hard-delete peer history
    const { error } = await client.from('message_conversation_clears').upsert(
      {
        user_id: auth.profileId,
        other_user_id: otherUserId,
        cleared_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,other_user_id' }
    );
    if (error) {
      console.warn('[api/messages] clear', error.message);
      return send(res, 500, {
        success: false,
        error: { message: 'Could not clear conversation', code: 'CLEAR_FAILED' },
      });
    }
    return send(res, 200, { success: true });
  }

  return send(res, 405, { success: false, error: { message: 'Method not allowed' } });
}

async function handleCalls(path, req, res) {
  if (
    path !== 'calls/sync' &&
    path !== 'calls/burn' &&
    path !== 'calls/wallet-ledger' &&
    path !== 'calls/incoming'
  ) {
    return null;
  }
  const auth = await requireAuth(req);
  if (auth.ok === false) return send(res, auth.status, { success: false, error: auth.error });

  // GET /api/calls/incoming — open ringing rows for the authenticated callee (service role).
  // Reliable fallback when Realtime broadcast / postgres_changes miss the peer.
  if (path === 'calls/incoming' && req.method === 'GET') {
    const profileId = String(auth.profileId || '').trim();
    const authUserId = String(auth.userId || '').trim();
    const ids = Array.from(new Set([profileId, authUserId].filter(Boolean)));
    if (!ids.length) {
      return send(res, 401, {
        success: false,
        error: { message: 'Unable to resolve profile', code: 'UNAUTHORIZED' },
      });
    }
    try {
      const orFilter = ids
        .flatMap((id) => [`receiver_id.eq.${id}`, `host_id.eq.${id}`])
        .join(',');
      const { data, error } = await auth.client
        .from('call_logs')
        .select(
          'id, caller_id, receiver_id, host_id, status, started_at, start_time, caller_name, host_name'
        )
        .eq('status', 'ringing')
        .or(orFilter)
        .order('started_at', { ascending: false })
        .limit(10);
      if (error) {
        console.warn('[api/calls/incoming]', error.message);
        return send(res, 500, {
          success: false,
          error: { message: 'Incoming lookup failed', code: 'INCOMING_LOOKUP_FAILED' },
        });
      }
      const now = Date.now();
      const ringing = (data || [])
        .map((row) => {
          const startedMs = Date.parse(row.started_at || row.start_time || '') || 0;
          const ageMs = startedMs ? now - startedMs : 0;
          return { row, ageMs };
        })
        // Ignore stale rings (>75s) — ring timeout is typically 15–30s
        .filter(({ ageMs }) => ageMs >= 0 && ageMs < 75_000)
        .map(({ row }) => ({
          callId: String(row.id),
          callerId: String(row.caller_id || ''),
          receiverId: String(row.receiver_id || row.host_id || profileId),
          status: 'ringing',
          startedAt: row.started_at || row.start_time || null,
          callerName: row.caller_name || null,
        }))
        .filter((c) => c.callId && c.callerId);
      return send(res, 200, { success: true, data: ringing });
    } catch (e) {
      console.warn('[api/calls/incoming]', e && e.message);
      return send(res, 500, {
        success: false,
        error: { message: 'Incoming lookup failed', code: 'INCOMING_LOOKUP_FAILED' },
      });
    }
  }

  if (path === 'calls/wallet-ledger' && req.method === 'GET') {
    const { data, error } = await auth.client
      .from('wallet_ledger')
      .select('*')
      .eq('user_id', auth.profileId)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) return send(res, 500, { success: false, error: error.message });
    // Express contract: { success, data: row[] }
    return send(res, 200, { success: true, data: data || [] });
  }

  if (path === 'calls/sync' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const callId = String((body && (body.callId || body.id)) || randomUUID());
    const myProfileId = String(auth.profileId || '').trim();
    const myAuthId = String(auth.userId || '').trim();
    const rawCaller = String((body && body.callerId) || '').trim();
    const rawReceiver = String((body && body.receiverId) || '').trim();
    // Always store profiles.id (FK). Client may send auth.users.id aliases.
    let callerId = await resolveProfileId(
      auth.client,
      rawCaller || myProfileId || myAuthId
    );
    let receiverId = await resolveProfileId(auth.client, rawReceiver);
    // Pin the authenticated party to their canonical profiles.id so LiveKit
    // membership (profileId vs auth.users.id) always matches call_logs.
    const rawIsMe = (v) => v && (v === myProfileId || v === myAuthId);
    if (rawIsMe(rawCaller) || (!rawCaller && myProfileId)) {
      callerId = myProfileId || callerId;
    }
    if (rawIsMe(rawReceiver)) {
      receiverId = myProfileId || receiverId;
    }
    if (!callerId && myProfileId) callerId = myProfileId;
    if (!callerId) {
      return send(res, 400, {
        success: false,
        error: {
          message: 'Invalid callerId — no matching profile',
          code: 'INVALID_CALLER',
        },
      });
    }
    if (rawReceiver && !receiverId) {
      return send(res, 400, {
        success: false,
        error: {
          message: 'Invalid receiverId — no matching profile',
          code: 'INVALID_RECEIVER',
          detail: rawReceiver,
        },
      });
    }
    const callStatus = String((body && body.status) || 'completed').toLowerCase();
    const busyStatuses = new Set(['ringing', 'active', 'accepted', 'in_call', 'connecting']);
    const endStatuses = new Set([
      'completed',
      'missed',
      'declined',
      'cancelled',
      'canceled',
      'failed',
      'ended',
      'rejected',
    ]);
    const startedAt =
      toIsoTimestamp(body && (body.startedAt || body.startTime)) ||
      (busyStatuses.has(callStatus) ? new Date().toISOString() : undefined);
    const endedAt = endStatuses.has(callStatus)
      ? toIsoTimestamp(body && (body.endedAt || body.endTime)) || new Date().toISOString()
      : null;
    const callerName =
      body && body.callerName ? String(body.callerName).trim().slice(0, 120) : undefined;
    const receiverName =
      body && (body.receiverName || body.hostName)
        ? String(body.receiverName || body.hostName).trim().slice(0, 120)
        : undefined;
    const payload = {
      id: callId,
      caller_id: callerId || auth.profileId,
      receiver_id: receiverId || undefined,
      host_id: receiverId || undefined,
      caller_name: callerName,
      host_name: receiverName,
      status: callStatus,
      started_at: startedAt,
      start_time: startedAt,
      updated_at: new Date().toISOString(),
      end_reason: body && body.reason ? String(body.reason).slice(0, 120) : undefined,
    };
    if (endStatuses.has(callStatus)) {
      // Hangup may send a stale client total. Never lower what burn already stored.
      const { data: existing } = await auth.client
        .from('call_logs')
        .select('coins_spent, coins_earned, duration_seconds')
        .eq('id', callId)
        .maybeSingle();
      payload.duration_seconds = maxCallEconomy(
        existing && existing.duration_seconds,
        body && (body.durationSeconds || body.duration)
      );
      payload.coins_spent = maxCallEconomy(existing && existing.coins_spent, body && body.coinsSpent);
      payload.coins_earned = maxCallEconomy(existing && existing.coins_earned, body && body.coinsEarned);
      payload.ended_at = endedAt;
      payload.end_time = endedAt;
      if (!payload.end_reason) payload.end_reason = callStatus;
    } else if (busyStatuses.has(callStatus)) {
      // Ringing/active heartbeats must not reset per-minute coins or duration.
      // Those columns are owned by /api/calls/burn while the call is open.
      payload.ended_at = null;
      payload.end_time = null;
    }
    Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);
    const error = await upsertCallLog(auth.client, payload);
    if (error) {
      console.warn('[api/calls/sync]', error.message);
      return send(res, 500, {
        success: false,
        error: { message: 'Call sync failed', code: 'CALL_SYNC_FAILED', detail: error.message },
      });
    }

    // Call presence leases live in Redis only (no profiles.last_seen_at on sync)
    try {
      if (!isRedisConfigured()) {
        console.warn('[api/calls/sync] Redis not configured — skipping presence lease update');
      } else if (callStatus === 'ringing') {
        await setPresence(callerId, 'busy');
        await setCallState(callId, {
          callerId,
          receiverId,
          status: callStatus,
          startedAt: startedAt || null,
        });
      } else if (busyStatuses.has(callStatus)) {
        await setPresence(callerId, 'busy');
        if (receiverId) await setPresence(receiverId, 'busy');
        await setCallState(callId, {
          callerId,
          receiverId,
          status: callStatus,
          startedAt: startedAt || null,
        });
      } else if (endStatuses.has(callStatus)) {
        await setPresence(callerId, 'online');
        if (receiverId) await setPresence(receiverId, 'online');
        await deleteCallState(callId);
      }
    } catch (e) {
      console.warn('[api/calls/sync] Redis presence update failed', e && e.message);
    }

    return send(res, 200, { success: true, callId, presenceUpdated: true, status: callStatus });
  }

  if (path === 'calls/burn' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      // Reject client-supplied money fields (parity with Express call.routes)
      if (
        body &&
        (body.coinsBurned != null ||
          body.hostCoinsEarned != null ||
          body.tlCoinsEarned != null ||
          body.coins != null ||
          body.amount != null)
      ) {
        return send(res, 400, {
          success: false,
          error: {
            message: 'Client must not supply coin amounts; rates are server-derived.',
            code: 'CLIENT_AMOUNTS_FORBIDDEN',
          },
        });
      }

      const callId = typeof body?.callId === 'string' ? body.callId.trim() : '';
      const billingMinute = Number(body?.billingMinute);
      if (!callId || !Number.isFinite(billingMinute) || billingMinute < 1) {
        return send(res, 400, {
          success: false,
          error: {
            message: 'callId and billingMinute (>=1) are required',
            code: 'INVALID_INPUT',
          },
        });
      }

      const callerId = auth.profileId;
      // Resolve call participants from call_logs (no in-memory activeCalls on Vercel)
      const { data: callRow, error: callErr } = await auth.client
        .from('call_logs')
        .select(
          'id, caller_id, receiver_id, host_id, status, team_leader_id, coins_spent, coins_earned, duration_seconds'
        )
        .eq('id', callId)
        .maybeSingle();
      if (callErr) {
        console.error('[api/calls/burn] call_logs lookup failed', callErr.message);
        return send(res, 500, {
          success: false,
          error: { message: 'Call lookup failed', code: 'CALL_LOOKUP_FAILED' },
        });
      }
      if (!callRow) {
        return send(res, 404, {
          success: false,
          error: { message: 'Call not found', code: 'CALL_NOT_FOUND' },
        });
      }
      if (String(callRow.caller_id) !== String(callerId)) {
        return send(res, 403, {
          success: false,
          error: { message: 'Only the call caller may trigger billing', code: 'FORBIDDEN' },
        });
      }
      let callStatus = String(callRow.status || '').toLowerCase();
      // Do not promote ringing/connecting → active on burn (client must accept + sync first)
      if (!['active', 'accepted', 'in_call'].includes(callStatus)) {
        return send(res, 409, {
          success: false,
          error: {
            message: 'Call is not active — billing starts after accept and media connect',
            code: 'CALL_NOT_ACTIVE',
          },
        });
      }
      const receiverId = String(callRow.receiver_id || callRow.host_id || '');
      if (!receiverId) {
        return send(res, 404, {
          success: false,
          error: { message: 'Receiver profile not found', code: 'RECEIVER_NOT_FOUND' },
        });
      }

      const { data: cfg } = await auth.client
        .from('system_configs')
        .select(
          'coin_burn_rate_per_min, coin_burn_rate_friend_per_min, female_host_share_percent, team_leader_share_percent'
        )
        .eq('id', 'default')
        .maybeSingle();

      const standardRate = Math.max(1, Math.round(Number(cfg?.coin_burn_rate_per_min) || 120));
      const friendRate = Math.max(1, Math.round(Number(cfg?.coin_burn_rate_friend_per_min) || 80));
      const hostSharePercent = Math.min(
        100,
        Math.max(0, Math.round(Number(cfg?.female_host_share_percent) || 30))
      );
      const tlSharePercent = Math.min(
        100,
        Math.max(0, Math.round(Number(cfg?.team_leader_share_percent) || 10))
      );

      const { data: recvRow } = await auth.client
        .from('profiles')
        .select('id, role, team_leader_id, created_by_id, coin_earn_override_rate')
        .eq('id', receiverId)
        .maybeSingle();
      if (!recvRow) {
        return send(res, 404, {
          success: false,
          error: { message: 'Receiver profile not found', code: 'RECEIVER_NOT_FOUND' },
        });
      }

      let isFriendPair = false;
      const { data: frForward } = await auth.client
        .from('friend_requests')
        .select('id')
        .eq('status', 'accepted')
        .eq('sender_id', callerId)
        .eq('receiver_id', receiverId)
        .limit(1)
        .maybeSingle();
      if (frForward) {
        isFriendPair = true;
      } else {
        const { data: frReverse } = await auth.client
          .from('friend_requests')
          .select('id')
          .eq('status', 'accepted')
          .eq('sender_id', receiverId)
          .eq('receiver_id', callerId)
          .limit(1)
          .maybeSingle();
        isFriendPair = Boolean(frReverse);
      }

      const coinsBurned = isFriendPair ? friendRate : standardRate;
      const isCreator =
        recvRow.role === 'female_creator' || recvRow.role === 'female_host';
      const tlId = isCreator
        ? String(recvRow.team_leader_id || recvRow.created_by_id || callRow.team_leader_id || '') ||
          null
        : null;

      let hostCoinsEarned = 0;
      let tlCoinsEarned = 0;
      const override = Number(recvRow.coin_earn_override_rate);
      const usedOverride = Number.isFinite(override) && override > 0;
      if (isCreator && coinsBurned > 0) {
        if (usedOverride) {
          hostCoinsEarned = Math.min(coinsBurned, Math.round(override));
        } else {
          hostCoinsEarned = Math.round(coinsBurned * (hostSharePercent / 100));
        }
        if (tlId && tlSharePercent > 0) {
          tlCoinsEarned = Math.round(coinsBurned * (tlSharePercent / 100));
        }
        if (hostCoinsEarned + tlCoinsEarned > coinsBurned) {
          if (tlCoinsEarned > coinsBurned) {
            tlCoinsEarned = coinsBurned;
            hostCoinsEarned = 0;
          } else {
            hostCoinsEarned = coinsBurned - tlCoinsEarned;
          }
        }
      }

      const metadata = {
        billingMinute,
        isFriendPair,
        ratePerMin: coinsBurned,
        hostSharePercent,
        tlSharePercent,
        usedOverride,
        receiverId,
        receiverRole: recvRow.role,
        isFemaleCreator: isCreator,
        source: 'vercel-cjs',
      };

      const { data: rpcResult, error: rpcErr } = await auth.client.rpc('burn_call_coins_atomic', {
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

      if (rpcErr) {
        console.error('[api/calls/burn] RPC error:', rpcErr.message);
        return send(res, 500, {
          success: false,
          error: { message: 'Billing RPC failed', code: 'BILLING_RPC_FAILED' },
        });
      }

      const result = rpcResult && typeof rpcResult === 'object' ? rpcResult : {};
      if (!result.success) {
        const code =
          result.code ||
          (String(result.error_message || '').includes('INSUFFICIENT')
            ? 'INSUFFICIENT_BALANCE'
            : 'BURN_FAILED');
        if (code === 'INSUFFICIENT_BALANCE') {
          const endIso = new Date().toISOString();
          await updateCallLogs(
            auth.client,
            {
              status: 'failed',
              end_reason: 'INSUFFICIENT_BALANCE',
              ended_at: endIso,
              end_time: endIso,
              updated_at: endIso,
            },
            (q) => q.eq('id', callId)
          );
          await setProfilesOnlineStatus(auth.client, [callerId, receiverId], 'online').catch(
            () => {}
          );
          return send(res, 402, {
            success: false,
            status: 'INSUFFICIENT_BALANCE',
            error: {
              message: 'Insufficient coin balance for next billing minute',
              code: 'INSUFFICIENT_BALANCE',
            },
            data: {
              newCallerBalance: Number(result.new_caller_balance) || 0,
              callId,
              billingMinute,
            },
            coinBalance: result.new_caller_balance,
          });
        }
        return send(res, 500, {
          success: false,
          error: {
            message: result.error_message || 'Burn failed',
            code,
          },
          coinBalance: result.new_caller_balance,
        });
      }

      const burned = Number(result.coins_burned ?? coinsBurned) || coinsBurned;
      const hostEarned = Number(result.host_coins_earned ?? hostCoinsEarned) || 0;
      const tlEarned = Number(result.tl_coins_earned ?? tlCoinsEarned) || 0;
      const newCallerBalance = Number(result.new_caller_balance) || 0;
      const newHostEarnings = Number(result.new_host_earnings) || 0;
      const newTlEarnings = Number(result.new_tl_earnings) || 0;
      const isDuplicate = Boolean(result.duplicate);

      let callCoinsSpent = Number(callRow.coins_spent) || 0;
      let callCoinsEarned = Number(callRow.coins_earned) || 0;
      if (!isDuplicate) {
        const burnPatch = {
          status: 'active',
          burn_rate_per_min: coinsBurned,
          was_friend_call: isFriendPair,
          team_leader_id: tlId || undefined,
          ended_at: null,
          end_time: null,
          updated_at: new Date().toISOString(),
        };
        Object.keys(burnPatch).forEach((k) => burnPatch[k] === undefined && delete burnPatch[k]);
        const added = await addCallMinuteTotals(
          auth.client,
          callId,
          burned,
          hostEarned,
          (billingMinute - 1) * 60,
          burnPatch
        );
        if (!added.error && added.coinsSpent != null && added.coinsEarned != null) {
          callCoinsSpent = added.coinsSpent;
          callCoinsEarned = added.coinsEarned;
        } else {
          console.warn(
            '[api/calls/burn] call_logs update',
            (added.error && added.error.message) || 'totals unchanged'
          );
          // Still report a cumulative total if the row write lost the race.
          callCoinsSpent += burned;
          callCoinsEarned += hostEarned;
        }
      } else {
        const { data: fresh } = await auth.client
          .from('call_logs')
          .select('coins_spent, coins_earned')
          .eq('id', callId)
          .maybeSingle();
        if (fresh) {
          callCoinsSpent = Number(fresh.coins_spent) || callCoinsSpent;
          callCoinsEarned = Number(fresh.coins_earned) || callCoinsEarned;
        }
      }

      // Match Express: { success, data: { newCallerBalance, callCoinsSpent cumulative, ... } }
      return send(res, 200, {
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
          callCoinsSpent,
          callCoinsEarned,
          billedMinutes: billingMinute,
          duplicate: isDuplicate,
          isFriendRate: isFriendPair,
          isFemaleCreator: isCreator,
          tlId,
          ratePerMin: coinsBurned,
        },
      });
    } catch (err) {
      console.error('[api/calls/burn]', err);
      return send(res, 500, {
        success: false,
        error: {
          message: (err && err.message) || 'Burn failed',
          code: 'BURN_EXCEPTION',
        },
      });
    }
  }

  return send(res, 405, { success: false, error: 'Method not allowed' });
}

/** Server-only gift catalog costs — never trust body.coinCost / body.cost */
const SERVER_GIFT_CATALOG = {
  g_rose: 10,
  g_heart: 50,
  g_ring: 200,
  g_crown: 500,
  g_car: 1000,
  g_yacht: 2500,
  g_rocket: 5000,
};

async function resolveServerGiftCost(client, giftId) {
  const id = String(giftId || '').trim();
  if (!id) return 0;

  try {
    const { data: giftRow } = await client
      .from('virtual_gifts')
      .select('id, coin_cost, cost, is_active')
      .or(`id.eq.${id},slug.eq.${id}`)
      .maybeSingle();
    if (giftRow && giftRow.is_active !== false) {
      const c = Math.round(Number(giftRow.coin_cost || giftRow.cost) || 0);
      if (c > 0) return c;
    }
  } catch (_) {
    /* table may be missing */
  }

  try {
    const { data: cfg } = await client
      .from('system_configs')
      .select('virtual_gifts_json')
      .eq('id', 'default')
      .maybeSingle();
    const raw = cfg && cfg.virtual_gifts_json;
    if (raw) {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (Array.isArray(parsed)) {
        const g = parsed.find((x) => x && String(x.id) === id && x.isActive !== false);
        const c = Math.round(Number(g && g.coinCost) || 0);
        if (c > 0) return c;
      }
    }
  } catch (_) {
    /* ignore */
  }

  return Math.round(Number(SERVER_GIFT_CATALOG[id]) || 0);
}

async function handleGifts(path, req, res) {
  if (path !== 'gifts/send') return null;
  if (req.method !== 'POST') return send(res, 405, { success: false, error: 'Method not allowed' });
  try {
    const auth = await requireAuth(req);
    if (auth.ok === false) return send(res, auth.status, { success: false, error: auth.error });
    const body = await readJsonBody(req);
    const receiverId = String((body && body.receiverId) || '');
    const giftId = String((body && body.giftId) || '');
    if (!receiverId || !giftId) {
      return send(res, 400, { success: false, error: 'Invalid gift.' });
    }

    // Reject client-supplied money fields
    if (
      body &&
      (body.coinCost != null ||
        body.cost != null ||
        body.coins != null ||
        body.amount != null ||
        body.hostCoinsEarned != null ||
        body.tlCoinsEarned != null)
    ) {
      return send(res, 400, {
        success: false,
        error: {
          message: 'Client must not supply coin amounts; gift prices are server-derived.',
          code: 'CLIENT_AMOUNTS_FORBIDDEN',
        },
      });
    }

    const cost = await resolveServerGiftCost(auth.client, giftId);
    if (!cost || cost <= 0) {
      return send(res, 400, {
        success: false,
        error: { message: 'Unknown or inactive gift', code: 'INVALID_GIFT' },
      });
    }

    const { data: cfg } = await auth.client
      .from('system_configs')
      .select('gift_female_host_share_percent, female_host_share_percent, gift_team_leader_share_percent')
      .eq('id', 'default')
      .maybeSingle();
    const hostSharePercent = Math.min(
      100,
      Math.max(
        0,
        Math.round(
          Number(cfg?.gift_female_host_share_percent ?? cfg?.female_host_share_percent) || 30
        )
      )
    );
    const tlSharePercent = Math.min(
      100,
      Math.max(0, Math.round(Number(cfg?.gift_team_leader_share_percent) || 10))
    );

    const { data: receiver } = await auth.client
      .from('profiles')
      .select('id, earnings_coins, role, team_leader_id, created_by_id')
      .eq('id', receiverId)
      .maybeSingle();
    const isCreator =
      receiver &&
      (receiver.role === 'female_creator' || receiver.role === 'female_host');
    const tlId = isCreator
      ? String(receiver.team_leader_id || receiver.created_by_id || '')
      : '';
    let hostShare = isCreator ? Math.floor(cost * (hostSharePercent / 100)) : 0;
    let tlShare =
      isCreator && tlId ? Math.floor(cost * (tlSharePercent / 100)) : 0;
    if (hostShare + tlShare > cost) {
      if (tlShare > cost) {
        tlShare = cost;
        hostShare = 0;
      } else {
        hostShare = cost - tlShare;
      }
    }

    // Idempotency key required so retries do not double-spend and repeats stay unique
    const idempotencyKey = String((body && (body.idempotencyKey || body.clientTempId)) || '')
      .trim()
      .slice(0, 200);
    if (!idempotencyKey) {
      return send(res, 400, {
        success: false,
        error: {
          message: 'idempotencyKey or clientTempId is required',
          code: 'IDEMPOTENCY_REQUIRED',
        },
      });
    }

    const { data: rpcRaw, error: rpcErr } = await auth.client.rpc('gift_spend_atomic', {
      p_sender_id: auth.profileId,
      p_receiver_id: receiverId,
      p_tl_id: tlId || null,
      p_coins: cost,
      p_host_coins: hostShare,
      p_tl_coins: tlShare,
      p_idempotency_key: idempotencyKey,
      p_metadata: {
        giftId,
        receiverId,
        kind: 'gift',
        cost,
        ...(String((body && body.callId) || '').trim()
          ? { session_call_id: String(body.callId).trim().slice(0, 200) }
          : {}),
      },
    });
    if (rpcErr) {
      console.error('[api/gifts/send] RPC error:', rpcErr.message);
      return send(res, 500, {
        success: false,
        error: 'Gift billing failed',
        code: 'GIFT_RPC_FAILED',
      });
    }
    const rpcResult = typeof rpcRaw === 'string' ? JSON.parse(rpcRaw) : rpcRaw;
    if (!rpcResult || !rpcResult.success) {
      const code = (rpcResult && rpcResult.error_code) || 'GIFT_FAILED';
      const status = code === 'INSUFFICIENT_BALANCE' ? 400 : 500;
      return send(res, status, {
        success: false,
        error: (rpcResult && rpcResult.error_message) || 'Gift failed',
        code: code === 'INSUFFICIENT_BALANCE' ? 'INSUFFICIENT' : code,
      });
    }

    const senderBalance = Number(rpcResult.new_sender_balance || 0);
    return send(res, 200, {
      success: true,
      // Client Quick Match reads top-level senderBalance
      senderBalance,
      senderCoinBalance: senderBalance,
      receiverEarningsDelta: Number(rpcResult.host_coins_earned || hostShare),
      duplicate: Boolean(rpcResult.duplicate),
      giftId,
      cost,
    });
  } catch (err) {
    console.error('[api/gifts/send]', err);
    return send(res, 500, {
      success: false,
      error: (err && err.message) || 'Gift send failed',
    });
  }
}

async function handleUsersExtra(path, req, res) {
  if (path !== 'users/sync-all' && path !== 'users/me/delete') return null;

  if (path === 'users/sync-all' && req.method === 'POST') {
    const auth = await requireAuth(req);
    if (auth.ok === false) return send(res, auth.status, { success: false, error: auth.error });
    if (!isAdminRole(auth.role, auth.email)) {
      return send(res, 403, { success: false, error: { message: 'Admin role required.' } });
    }
    const body = await readJsonBody(req);
    const incoming = Array.isArray(body && body.users) ? body.users : [];
    let count = 0;
    for (const u of incoming) {
      if (!u || !u.id) continue;
      const payload = {
        id: u.id,
        auth_id: u.authId || u.auth_id || null,
        name: u.name,
        email: u.email,
        role: u.role,
        gender: u.gender,
        avatar_url: u.avatarUrl || u.avatar_url,
        online_status: u.onlineStatus || u.online_status || 'offline',
        updated_at: new Date().toISOString(),
      };
      Object.keys(payload).forEach((k) => payload[k] == null && delete payload[k]);
      const { error } = await auth.client.from('profiles').upsert(payload, { onConflict: 'id' });
      if (!error) count += 1;
    }
    const { data } = await auth.client.from('profiles').select('*').limit(500);
    return send(res, 200, {
      success: true,
      count: (data && data.length) || count,
      users: (data || []).map(mapProfileRow),
    });
  }

  if (path === 'users/me/delete' && req.method === 'POST') {
    const auth = await requireAuth(req);
    if (auth.ok === false) return send(res, auth.status, { success: false, error: auth.error });
    await readJsonBody(req);
    const warnings = [];
    await auth.client
      .from('profiles')
      .update({
        online_status: 'offline',
        is_banned: true,
        ban_reason: 'Account deleted by user',
        updated_at: new Date().toISOString(),
      })
      .eq('id', auth.profileId);
    const { error: delProf } = await auth.client.from('profiles').delete().eq('id', auth.profileId);
    if (delProf) {
      return send(res, 500, {
        success: false,
        error: { message: delProf.message, code: 'DELETE_FAILED' },
        warnings,
      });
    }
    if (auth.userId) {
      const { error: delAuth } = await auth.client.auth.admin.deleteUser(auth.userId);
      if (delAuth) warnings.push(delAuth.message);
    }
    return send(res, 200, {
      success: true,
      message: 'Account deleted',
      data: { profileDeleted: true, warnings },
    });
  }

  return send(res, 405, { success: false, error: 'Method not allowed' });
}

function profilePayloadFromBody(body, auth) {
  const envelope = body && typeof body === 'object' ? body : {};
  const nested =
    envelope.updates && typeof envelope.updates === 'object' && !Array.isArray(envelope.updates)
      ? envelope.updates
      : null;
  const raw = nested
    ? { ...nested, id: nested.id || envelope.userId || envelope.id }
    : envelope;
  const isAdmin = isAdminRole(auth.role, auth.email);
  const id = isAdmin ? String(raw.id || auth.profileId) : String(auth.profileId);
  const pick = (camel, snake) => {
    if (raw[camel] !== undefined) return raw[camel];
    if (snake && raw[snake] !== undefined) return raw[snake];
    return undefined;
  };
  const country = pick('countryCode', 'country_code');
  const payload = {
    id,
    // Only write auth_id when the client explicitly sends it — auto-setting on
    // partial gallery/media patches can break upserts / unique lookups.
    auth_id: raw.authId !== undefined || raw.auth_id !== undefined ? raw.authId || raw.auth_id : undefined,
    name: raw.name,
    email: raw.email ? String(raw.email).toLowerCase().trim() : undefined,
    gender: raw.gender,
    gender_locked: raw.genderLocked ?? raw.gender_locked,
    role: isAdmin ? raw.role : undefined,
    age: raw.age != null ? Number(raw.age) : undefined,
    nationality: raw.nationality,
    country_code: country !== undefined ? String(country).toUpperCase() : undefined,
    bio: raw.bio,
    extended_bio: pick('extendedBio', 'extended_bio'),
    location_city: pick('locationCity', 'location_city'),
    zodiac: raw.zodiac,
    interests: raw.interests,
    interested_in: pick('interestedIn', 'interested_in'),
    tags: raw.tags,
    spoken_languages: pick('spokenLanguages', 'spoken_languages'),
    avatar_url: pick('avatarUrl', 'avatar_url'),
    gallery: raw.gallery,
    gallery_videos: pick('galleryVideos', 'gallery_videos'),
    intro_video_url: pick('introVideoUrl', 'intro_video_url'),
    latitude:
      raw.exactLocation && raw.exactLocation.latitude !== undefined
        ? raw.exactLocation.latitude
        : raw.latitude,
    longitude:
      raw.exactLocation && raw.exactLocation.longitude !== undefined
        ? raw.exactLocation.longitude
        : raw.longitude,
    is_using_mock_location: pick('isUsingMockLocation', 'is_using_mock_location'),
    mock_location_city: pick('mockLocationCity', 'mock_location_city'),
    mock_location_country: pick('mockLocationCountry', 'mock_location_country'),
    hourly_coin_rate:
      raw.hourlyCoinRate != null
        ? Number(raw.hourlyCoinRate)
        : raw.hourly_coin_rate != null
          ? Number(raw.hourly_coin_rate)
          : undefined,
    is_verified: raw.isVerified ?? raw.is_verified,
    is_onboarded: raw.isOnboarded ?? raw.is_onboarded,
    online_status: pick('onlineStatus', 'online_status'),
    agency_name: raw.agencyName || raw.agency_name,
    team_leader_id: raw.teamLeaderId || raw.team_leader_id,
    created_by_id: raw.createdById || raw.created_by_id,
    has_password_set: raw.hasPasswordSet ?? raw.has_password_set,
    updated_at: new Date().toISOString(),
  };
  Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);
  return payload;
}

async function handleSupabase(path, req, res) {
  if (!String(path || '').startsWith('supabase/')) return null;
  const auth = await requireAuth(req);
  if (auth.ok === false) return send(res, auth.status, { success: false, error: auth.error });

  if (path === 'supabase/update-status' && (req.method === 'POST' || req.method === 'PUT')) {
    const body = await readJsonBody(req);
    const status = String((body && body.status) || 'online').toLowerCase();
    // Client sets online|offline|busy; logout/offline always wins. Open call forces busy
    // unless forceOnline (login). Manual busy is allowed when not in a call.
    let onlineStatus = 'online';
    if (status === 'offline') {
      onlineStatus = 'offline';
    } else if (status === 'busy' || status === 'in_call') {
      onlineStatus = 'busy';
    } else {
      onlineStatus = 'online';
    }
    if (onlineStatus === 'offline' || body?.forceOnline || body?.clearCalls) {
      await closeOpenCallLogsForUsers(
        auth.client,
        [auth.profileId, auth.userId],
        body?.forceOnline ? 'force_online_clear' : 'update_status_clear'
      );
    }
    if (onlineStatus !== 'offline' && !body?.forceOnline) {
      const busyIds = await fetchActiveCallParticipantIds(auth.client);
      if (busyIds.has(String(auth.profileId)) || busyIds.has(String(auth.userId))) {
        onlineStatus = 'busy';
      }
    } else if (body?.forceOnline && onlineStatus !== 'offline') {
      onlineStatus = 'online';
    }
    const nowIso = new Date().toISOString();
    await auth.client
      .from('profiles')
      .update({
        online_status: onlineStatus,
        last_seen_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', auth.profileId);
    return send(res, 200, { success: true, userId: auth.profileId, status: onlineStatus });
  }

  if (
    (path === 'supabase/update-profile' || path === 'supabase/upsert-profile') &&
    req.method === 'POST'
  ) {
    const body = await readJsonBody(req);
    const payload = profilePayloadFromBody(body, auth);
    if (!isAdminRole(auth.role, auth.email) && payload.id !== auth.profileId) {
      return send(res, 403, { success: false, error: { message: 'Forbidden' } });
    }

    // Dual-write: always embed videos in gallery TEXT[] sentinel (works when
    // gallery_videos column is missing on production). Prefer column when present.
    const writingVideos = payload.gallery_videos !== undefined;
    const writingGallery = payload.gallery !== undefined;
    const profileLookupId = payload.id;
    if (writingGallery || writingVideos) {
      let curGalleryRow = null;
      {
        const byId = await auth.client
          .from('profiles')
          .select('id, gallery')
          .eq('id', profileLookupId)
          .maybeSingle();
        curGalleryRow = byId.data || null;
      }
      if (!curGalleryRow && auth.userId) {
        const byAuth = await auth.client
          .from('profiles')
          .select('id, gallery')
          .eq('auth_id', auth.userId)
          .maybeSingle();
        curGalleryRow = byAuth.data || null;
        if (curGalleryRow && curGalleryRow.id) {
          payload.id = String(curGalleryRow.id);
        }
      }
      const existingSplit = splitGalleryPhotosAndVideos(curGalleryRow && curGalleryRow.gallery);
      if (writingVideos) {
        const photos = writingGallery
          ? splitGalleryPhotosAndVideos(payload.gallery).photos
          : existingSplit.photos;
        const videos = Array.isArray(payload.gallery_videos) ? payload.gallery_videos : [];
        // Only embed sentinel when there are real videos — empty `__mc_gv1__:[]`
        // was showing up as a blank broken photo tile via /api/users.
        payload.gallery =
          videos.length > 0 ? mergeGalleryWithVideoSentinel(photos, videos) : photos;
      } else if (writingGallery) {
        const photos = splitGalleryPhotosAndVideos(payload.gallery).photos;
        const keepVideos = Array.isArray(existingSplit.videos) ? existingSplit.videos : [];
        payload.gallery =
          keepVideos.length > 0 ? mergeGalleryWithVideoSentinel(photos, keepVideos) : photos;
      }
    }

    // Partial UPDATE (not upsert): upsert without name fails NOT NULL on insert-miss,
    // and was returning "Profile was not updated" after successful R2 uploads.
    const updateId = payload.id;
    const patch = { ...payload };
    delete patch.id;

    function isNoRowResult(res) {
      if (res && res.data) return false;
      if (!res || !res.error) return true;
      const code = String(res.error.code || '');
      const msg = String(res.error.message || '');
      return code === 'PGRST116' || /0 rows|multiple \(or no\) rows/i.test(msg);
    }

    async function runProfileUpdate(body) {
      let res = await auth.client
        .from('profiles')
        .update(body)
        .eq('id', updateId)
        .select('*')
        .maybeSingle();
      // Only fall through on "no matching row" — do not mask real DB errors.
      if (isNoRowResult(res) && auth.userId) {
        const byAuth = await auth.client
          .from('profiles')
          .update(body)
          .eq('auth_id', auth.userId)
          .select('*')
          .maybeSingle();
        if (!isNoRowResult(byAuth) || byAuth.data) res = byAuth;
      }
      if (isNoRowResult(res) && (payload.email || auth.email)) {
        const email = String(payload.email || auth.email)
          .toLowerCase()
          .trim();
        const byEmail = await auth.client
          .from('profiles')
          .update(body)
          .ilike('email', email)
          .select('*')
          .limit(1);
        if (!byEmail.error && Array.isArray(byEmail.data) && byEmail.data[0]) {
          res = { data: byEmail.data[0], error: null };
        }
      }
      return res;
    }

    let result = await runProfileUpdate(patch);

    // Column missing: drop gallery_videos and retry — gallery sentinel already set.
    if (result.error && isMissingGalleryVideosColumnError(result.error)) {
      delete patch.gallery_videos;
      result = await runProfileUpdate(patch);
    }

    if (result.error) {
      console.error('[supabase/update-profile] update failed:', result.error.message, {
        id: updateId,
        keys: Object.keys(patch),
      });
      return send(res, 500, { success: false, error: { message: result.error.message } });
    }
    if (!result.data) {
      console.error('[supabase/update-profile] no row matched', {
        id: updateId,
        authUserId: auth.userId,
        keys: Object.keys(patch),
      });
      return send(res, 500, {
        success: false,
        error: { message: 'Profile was not updated — no matching profile row for this account' },
      });
    }
    return send(res, 200, { success: true, user: mapProfileRow(result.data) });
  }

  if (path === 'supabase/user-statuses' && req.method === 'GET') {
    const presence = await buildPresenceMap(auth.client);
    const { data, error } = await auth.client
      .from('profiles')
      .select('id, online_status, last_seen_at')
      .limit(1000);
    if (error) return send(res, 500, { success: false, error: error.message });
    // Client expects statuses[] with { id, online_status } — apply stale-offline rule
    const statuses = (data || []).map((row) => ({
      id: row.id,
      online_status: presence[row.id] || 'offline',
      last_seen_at: row.last_seen_at,
    }));
    return send(res, 200, { success: true, statuses });
  }

  // Real latency probe (replaces Express mock random pool stats). Same response keys for Admin UI.
  if (path === 'supabase/test-query' && req.method === 'POST') {
    if (!isAdminRole(auth.role, auth.email)) {
      return send(res, 403, { success: false, error: { message: 'Admin role required.' } });
    }
    const startTime = performance.now();
    try {
      const { error, count } = await auth.client
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .limit(1);
      const queryExecutionMs = Math.round(performance.now() - startTime);
      if (error) {
        return send(res, 500, {
          success: false,
          message: error.message || 'Supabase probe query failed',
          latencyMs: queryExecutionMs,
        });
      }
      return send(res, 200, {
        success: true,
        latencyMs: queryExecutionMs,
        poolStats: {
          activeConnections: 'managed',
          maxPoolSize: 'supabase-pooler',
          idleTimeoutSeconds: null,
          statementTimeoutMs: null,
          queryExecutionMs,
          queryPlan: 'COUNT profiles (head) via service role',
          cacheHitRate: 'n/a (serverless)',
          profileCount: typeof count === 'number' ? count : null,
        },
        message: `Supabase service-role probe completed in ${queryExecutionMs}ms.`,
      });
    } catch (err) {
      const latencyMs = Math.round(performance.now() - startTime);
      return send(res, 500, {
        success: false,
        message: (err && err.message) || 'Query test failed',
        latencyMs,
      });
    }
  }

  if (path === 'supabase/bulk-upsert-profiles' && req.method === 'POST') {
    if (!isAdminRole(auth.role, auth.email)) {
      return send(res, 403, { success: false, error: { message: 'Admin role required.' } });
    }
    const body = await readJsonBody(req);
    const users = Array.isArray(body && body.users) ? body.users : [];
    let count = 0;
    for (const u of users) {
      const payload = profilePayloadFromBody(u, auth);
      if (!payload.id) continue;
      const { error } = await auth.client.from('profiles').upsert(payload, { onConflict: 'id' });
      if (!error) count += 1;
    }
    return send(res, 200, { success: true, count });
  }

  return send(res, 501, {
    success: false,
    error: { message: `Unimplemented supabase path: ${path}`, code: 'VERCEL_ROUTE_NOT_IMPLEMENTED' },
  });
}

async function handleCore(path, req, res) {
  // Sub-handlers return null when path does not match; otherwise they already wrote the response.
  let r = await handlePresence(path, req, res);
  if (r !== null) return r;
  r = await handleMessages(path, req, res);
  if (r !== null) return r;
  r = await handleCalls(path, req, res);
  if (r !== null) return r;
  r = await handleGifts(path, req, res);
  if (r !== null) return r;
  r = await handleUsersExtra(path, req, res);
  if (r !== null) return r;
  r = await handleSupabase(path, req, res);
  if (r !== null) return r;
  return null;
}

module.exports = { handleCore };
