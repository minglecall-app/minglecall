/**
 * Admin system diagnostics for the Vercel CJS router and the Express/Next adapters.
 * Register new server probes on SERVER_DIAGNOSTIC_MODULES.
 */
const net = require('net');
const { Redis } = require('@upstash/redis');
const { TokenVerifier } = require('livekit-server-sdk');
const { clean, createServiceClient, getPooledDatabaseUrl } = require('./helpers');

const CHANNEL_RE = /^admin-diag-[A-Za-z0-9_-]{6,64}$/;
const NONCE_RE = /^[A-Za-z0-9_-]{6,80}$/;

function nowIso() {
  return new Date().toISOString();
}

function elapsed(t0) {
  return Date.now() - t0;
}

function finish(moduleId, tAll, steps, summary) {
  return {
    moduleId,
    ok: steps.every((step) => step.ok),
    latencyMs: elapsed(tAll),
    summary,
    finishedAt: nowIso(),
    steps,
  };
}

function isTransactionPoolerUrl(url) {
  const value = String(url || '').trim();
  if (!value) return false;
  if (/[?&]pgbouncer=true\b/i.test(value)) return true;
  if (/:6543(\/|\?|$)/.test(value)) return true;
  if (/\.pooler\.supabase\.com/i.test(value)) return true;
  return false;
}

function describePooler(raw) {
  if (!raw) return { configured: false, transactionPooler: false, host: '', port: '' };
  const transactionPooler = isTransactionPoolerUrl(raw);
  let host = '';
  let port = '';
  try {
    const parsed = new URL(String(raw).replace(/^postgres(?:ql)?:/i, 'http:'));
    host = parsed.hostname;
    port = parsed.port;
  } catch (err) {
    const match = String(raw).match(/@([^/:?#]+)(?::(\d+))?/);
    host = (match && match[1]) || '';
    port = (match && match[2]) || '';
  }
  if (!port) port = transactionPooler ? '6543' : '5432';
  return { configured: true, transactionPooler, host, port };
}

function probeTcp(host, port, timeoutMs = 5000) {
  const t0 = Date.now();
  return new Promise((resolve) => {
    let settled = false;
    const socket = net.connect({ host, port });
    const done = (ok, detail) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.removeAllListeners();
      socket.destroy();
      resolve({
        id: 'pooler-tcp',
        label: 'Transaction pooler TCP connect',
        ok,
        latencyMs: elapsed(t0),
        detail,
        data: { host, port },
      });
    };
    const timer = setTimeout(() => done(false, `Timed out connecting to ${host}:${port}`), timeoutMs);
    socket.once('connect', () => done(true, `Connected to ${host}:${port}`));
    socket.once('error', (err) => done(false, (err && err.message) || 'TCP connect failed'));
  });
}

function redactSecret(message, secret) {
  if (!secret || secret.length < 4) return message;
  return String(message || '').split(secret).join('[redacted]');
}

function redisClient() {
  const url = clean(process.env.UPSTASH_REDIS_REST_URL || '');
  const token = clean(process.env.UPSTASH_REDIS_REST_TOKEN || '');
  if (!url || !token) return null;
  return new Redis({ url, token });
}

async function runRedisFallback(input) {
  const tAll = Date.now();
  const steps = [];
  const profileId = String((input && input.profileId) || '').trim();
  const client = redisClient();

  if (!client) {
    steps.push({
      id: 'redis-config',
      label: 'Upstash Redis configuration',
      ok: false,
      latencyMs: 0,
      detail: 'UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are not set. Heartbeat returns 503 REDIS_UNAVAILABLE.',
    });
    return finish('redis-fallback', tAll, steps, 'Redis is not configured, so presence heartbeat must fail closed.');
  }

  const tPing = Date.now();
  try {
    if (!profileId) throw new Error('Admin profile is missing');
    const key = `diag:probe:${profileId}`;
    await client.set(key, 'ok', { ex: 30 });
    const value = await client.get(key);
    await client.del(key);
    const ok = value === 'ok';
    steps.push({
      id: 'redis-rtt',
      label: 'Upstash Redis round trip',
      ok,
      latencyMs: elapsed(tPing),
      detail: ok ? 'SET / GET / DEL on a short-lived diagnostic key succeeded' : 'Diagnostic key read did not match',
      data: { key, ttlSec: 30 },
    });
  } catch (err) {
    const token = clean(process.env.UPSTASH_REDIS_REST_TOKEN || '');
    steps.push({
      id: 'redis-rtt',
      label: 'Upstash Redis round trip',
      ok: false,
      latencyMs: elapsed(tPing),
      detail: redactSecret((err && err.message) || 'Redis command failed', token),
    });
  }

  const tRead = Date.now();
  try {
    const status = profileId ? await client.get(`presence:${profileId}`) : null;
    const known = status === 'online' || status === 'busy';
    steps.push({
      id: 'presence-read',
      label: 'Presence key read-back',
      ok: known,
      latencyMs: elapsed(tRead),
      detail: known
        ? `presence:${profileId} = ${status}`
        : 'No presence lease found. Run the authenticated heartbeat step first.',
      data: { status: status || null },
    });
  } catch (err) {
    const token = clean(process.env.UPSTASH_REDIS_REST_TOKEN || '');
    steps.push({
      id: 'presence-read',
      label: 'Presence key read-back',
      ok: false,
      latencyMs: elapsed(tRead),
      detail: redactSecret((err && err.message) || 'Presence read failed', token),
    });
  }

  const tBad = Date.now();
  const url = clean(process.env.UPSTASH_REDIS_REST_URL || '');
  try {
    const bad = new Redis({ url, token: 'diagnostic-invalid-token' });
    await bad.get('diag:should-fail');
    steps.push({
      id: 'redis-fallback',
      label: 'Invalid-token fallback',
      ok: false,
      latencyMs: elapsed(tBad),
      detail: 'A bogus Upstash token was accepted. Heartbeat cannot fail closed.',
    });
  } catch (err) {
    const token = clean(process.env.UPSTASH_REDIS_REST_TOKEN || '');
    steps.push({
      id: 'redis-fallback',
      label: 'Invalid-token fallback',
      ok: true,
      latencyMs: elapsed(tBad),
      detail: `Bogus token rejected (${redactSecret((err && err.message) || 'unauthorized', token)}). Heartbeat maps this to HTTP 503 REDIS_UNAVAILABLE.`,
    });
  }

  const ok = steps.every((step) => step.ok);
  return finish(
    'redis-fallback',
    tAll,
    steps,
    ok
      ? 'Redis answered, the presence lease is readable, and a bad token fails closed.'
      : 'Redis presence diagnostic found a failing step.'
  );
}

async function runPooler() {
  const tAll = Date.now();
  const steps = [];
  const pooledUrl = getPooledDatabaseUrl();
  const described = describePooler(pooledUrl);
  steps.push({
    id: 'pooler-url',
    label: 'Transaction pooler URL',
    ok: described.configured && described.transactionPooler,
    latencyMs: 0,
    detail: !described.configured
      ? 'DATABASE_URL / SUPABASE_DB_URL is unset. Raw SQL must use the Supabase transaction pooler on port 6543.'
      : described.transactionPooler
        ? `Pooler host ${described.host}:${described.port}`
        : `URL is not a transaction pooler (${described.host}:${described.port}). Use port 6543.`,
    data: {
      configured: described.configured,
      transactionPooler: described.transactionPooler,
      host: described.host || null,
      port: described.port || null,
    },
  });

  if (described.configured && described.host && described.transactionPooler) {
    steps.push(await probeTcp(described.host, Number(described.port) || 6543));
  }

  const client = createServiceClient();
  const tQuery = Date.now();
  if (!client) {
    steps.push({
      id: 'postgrest',
      label: 'Lightweight database query',
      ok: false,
      latencyMs: elapsed(tQuery),
      detail: 'Supabase service role is not configured',
    });
  } else {
    const { error, count } = await client.from('profiles').select('id', { count: 'exact', head: true }).limit(1);
    steps.push({
      id: 'postgrest',
      label: 'Lightweight database query',
      ok: !error,
      latencyMs: elapsed(tQuery),
      detail: error
        ? error.message || 'Query failed'
        : `PostgREST head count succeeded (profiles visible to service role: ${count || 0})`,
      data: { via: 'postgrest', count: count || 0 },
    });
  }

  const ok = steps.every((step) => step.ok);
  return finish(
    'supabase-pooler',
    tAll,
    steps,
    ok ? 'Transaction pooler is reachable and a lightweight query succeeded.' : 'Database health check found a failing step.'
  );
}

async function runBillingSafety(input) {
  const tAll = Date.now();
  const steps = [];
  const profileId = String((input && input.profileId) || '').trim();
  const client = createServiceClient();
  if (!client || !profileId) {
    steps.push({
      id: 'billing-auth',
      label: 'Server-authoritative profile',
      ok: false,
      latencyMs: 0,
      detail: !profileId ? 'Admin profile id missing from session' : 'Supabase service role is not configured',
    });
    return finish('billing-safety', tAll, steps, 'Billing safety probe could not start.');
  }

  const readBalance = async () => {
    const t0 = Date.now();
    const { data, error } = await client.from('profiles').select('id, coin_balance').eq('id', profileId).maybeSingle();
    return { data, error, latencyMs: elapsed(t0) };
  };

  const before = await readBalance();
  const balanceBefore = Number(before.data && before.data.coin_balance);
  steps.push({
    id: 'balance-before',
    label: 'Authoritative balance read',
    ok: !before.error && before.data && before.data.id && Number.isFinite(balanceBefore),
    latencyMs: before.latencyMs,
    detail: before.error
      ? before.error.message
      : before.data
        ? `coin_balance=${balanceBefore}`
        : 'Admin profile row was not found',
    data: { profileId, coinBalance: Number.isFinite(balanceBefore) ? balanceBefore : null },
  });

  const probeCallId = `diag_noop_${Date.now()}`;
  const rpcArgs = {
    p_caller_id: profileId,
    p_receiver_id: '',
    p_tl_id: '',
    p_call_id: probeCallId,
    p_billing_minute: 0,
    p_coins_burned: 1,
    p_host_coins_earned: 0,
    p_tl_coins_earned: 0,
    p_metadata: { diagnostic: true, mutate: false },
  };
  const rejections = [];
  let rpcOk = true;
  const tRpc = Date.now();
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const { data, error } = await client.rpc('burn_call_coins_atomic', rpcArgs);
    if (error) {
      rpcOk = false;
      rejections.push(error.message || error.code || 'rpc error');
      break;
    }
    const payload = data || {};
    const rejected = payload.success === false && /invalid/i.test(String(payload.error_message || ''));
    if (!rejected) {
      rpcOk = false;
      rejections.push(`attempt ${attempt} did not reject before write`);
      break;
    }
    rejections.push(String(payload.error_message));
  }
  steps.push({
    id: 'rpc-reject',
    label: 'Atomic burn rejects invalid minute',
    ok: rpcOk,
    latencyMs: elapsed(tRpc),
    detail: rpcOk
      ? 'burn_call_coins_atomic rejected billing_minute=0 twice, before any row lock or debit.'
      : rejections.join(' · '),
    data: { callId: probeCallId, attempts: rpcOk ? 2 : 1 },
  });

  const after = await readBalance();
  const balanceAfter = Number(after.data && after.data.coin_balance);
  const unchanged = Number.isFinite(balanceBefore) && balanceBefore === balanceAfter;
  steps.push({
    id: 'balance-after',
    label: 'Balance unchanged',
    ok: !after.error && unchanged,
    latencyMs: after.latencyMs,
    detail: unchanged ? `coin_balance stayed ${balanceAfter}` : `Balance moved from ${balanceBefore} to ${balanceAfter}`,
    data: { coinBalance: Number.isFinite(balanceAfter) ? balanceAfter : null },
  });

  const tLedger = Date.now();
  const ledger = await client.from('wallet_ledger').select('id', { count: 'exact', head: true }).eq('call_id', probeCallId);
  steps.push({
    id: 'ledger-empty',
    label: 'No diagnostic ledger row',
    ok: !ledger.error && (ledger.count || 0) === 0,
    latencyMs: elapsed(tLedger),
    detail: ledger.error
      ? ledger.error.message
      : `wallet_ledger rows for ${probeCallId}: ${ledger.count || 0}. Duplicate burns are also guarded by wallet_ledger_unique_billing_idx.`,
    data: { callId: probeCallId, rows: ledger.count || 0 },
  });

  const ok = steps.every((step) => step.ok);
  return finish(
    'billing-safety',
    tAll,
    steps,
    ok
      ? 'Invalid burn input was rejected twice, the balance did not move, and no ledger row was written.'
      : 'Billing safety probe found a failing step. No coins were intentionally deducted.'
  );
}

function liveKitEnv() {
  return {
    apiKey: clean(process.env.LIVEKIT_API_KEY || ''),
    apiSecret: clean(process.env.LIVEKIT_API_SECRET || ''),
  };
}

async function runLiveKitVerify(input) {
  const tAll = Date.now();
  const steps = [];
  const token = String((input && input.token) || '').trim();
  const env = liveKitEnv();
  if (!env.apiKey || !env.apiSecret || env.apiKey === 'devkey' || env.apiSecret === 'secret') {
    steps.push({
      id: 'livekit-env',
      label: 'LiveKit signing secret',
      ok: false,
      latencyMs: 0,
      detail: 'LIVEKIT_API_KEY / LIVEKIT_API_SECRET are missing or still placeholders',
    });
    return finish('livekit-verify', tAll, steps, 'LiveKit signature check could not start.');
  }
  if (!token || token.split('.').length !== 3) {
    steps.push({
      id: 'livekit-signature',
      label: 'Token signature',
      ok: false,
      latencyMs: 0,
      detail: 'Expected a three-segment JWT from the authenticated token endpoint',
    });
    return finish('livekit-verify', tAll, steps, 'No token was supplied to verify.');
  }
  const t0 = Date.now();
  try {
    const claims = await new TokenVerifier(env.apiKey, env.apiSecret).verify(token);
    const room = String((claims.video && claims.video.room) || '');
    const roomJoin = Boolean(claims.video && claims.video.roomJoin === true);
    const adminRoom = room.startsWith('admin_test_room_');
    steps.push({
      id: 'livekit-signature',
      label: 'Token signature',
      ok: adminRoom && roomJoin && Boolean(claims.sub),
      latencyMs: elapsed(t0),
      detail: adminRoom
        ? 'Signature verified with the server LiveKit secret. Token body was not returned.'
        : 'Signature verified, but the room grant is not an admin diagnostic room.',
      data: { subject: claims.sub || null, room: room || null, roomJoin, expiresAt: claims.exp || null },
    });
  } catch (err) {
    steps.push({
      id: 'livekit-signature',
      label: 'Token signature',
      ok: false,
      latencyMs: elapsed(t0),
      detail: (err && err.message) || 'Signature verification failed',
    });
  }
  const ok = steps.every((step) => step.ok);
  return finish(
    'livekit-verify',
    tAll,
    steps,
    ok ? 'LiveKit JWT signature and admin-room grant verified.' : 'LiveKit token failed verification.'
  );
}

async function runRealtimeBroadcast(input) {
  const tAll = Date.now();
  const steps = [];
  const channelName = String((input && input.channel) || '').trim();
  const nonce = String((input && input.nonce) || '').trim();
  const client = createServiceClient();
  if (!CHANNEL_RE.test(channelName) || !NONCE_RE.test(nonce)) {
    steps.push({
      id: 'channel',
      label: 'Diagnostic channel',
      ok: false,
      latencyMs: 0,
      detail: 'Channel must be admin-diag-<id> and nonce must be a short token',
    });
    return finish('realtime-broadcast', tAll, steps, 'Broadcast target was rejected.');
  }
  if (!client) {
    steps.push({
      id: 'channel',
      label: 'Diagnostic channel',
      ok: false,
      latencyMs: 0,
      detail: 'Supabase service role is not configured',
    });
    return finish('realtime-broadcast', tAll, steps, 'Broadcast could not start.');
  }

  const t0 = Date.now();
  const channel = client.channel(channelName, { config: { broadcast: { self: false, ack: false } } });
  let subscribed = false;
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out subscribing to diagnostic channel')), 4000);
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          subscribed = true;
          clearTimeout(timer);
          resolve();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          clearTimeout(timer);
          reject(new Error(`Realtime status ${status}`));
        }
      });
    });
    const sendStatus = await channel.send({
      type: 'broadcast',
      event: 'diag',
      payload: { type: 'diag:ping', nonce, profileId: input.profileId, sentAt: nowIso() },
    });
    await new Promise((resolve) => setTimeout(resolve, 150));
    const ok = sendStatus !== 'error';
    steps.push({
      id: 'broadcast-send',
      label: 'Targeted broadcast send',
      ok,
      latencyMs: elapsed(t0),
      detail: ok ? `Sent diag event on ${channelName}` : `Channel send returned ${String(sendStatus)}`,
      data: { channel: channelName, event: 'diag', subscribed },
    });
  } catch (err) {
    steps.push({
      id: 'broadcast-send',
      label: 'Targeted broadcast send',
      ok: false,
      latencyMs: elapsed(t0),
      detail: (err && err.message) || 'Broadcast failed',
      data: { channel: channelName, subscribed },
    });
  } finally {
    try {
      await client.removeChannel(channel);
    } catch (err) {
      console.error('[system-diagnostics] removeChannel', (err && err.message) || err);
    }
  }
  const ok = steps.every((step) => step.ok);
  return finish(
    'realtime-broadcast',
    tAll,
    steps,
    ok ? 'Diagnostic broadcast was accepted by Supabase Realtime.' : 'Realtime broadcast did not send.'
  );
}

const SERVER_DIAGNOSTIC_MODULES = {
  'redis-fallback': runRedisFallback,
  'supabase-pooler': runPooler,
  'billing-safety': runBillingSafety,
  'livekit-verify': runLiveKitVerify,
  'realtime-broadcast': runRealtimeBroadcast,
};

function listServerDiagnosticModules() {
  return Object.keys(SERVER_DIAGNOSTIC_MODULES);
}

async function runServerDiagnostic(moduleId, input) {
  const runner = SERVER_DIAGNOSTIC_MODULES[moduleId];
  if (!runner) return null;
  return runner(input || {});
}

module.exports = {
  listServerDiagnosticModules,
  runServerDiagnostic,
};
