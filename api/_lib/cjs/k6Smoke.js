/**
 * Admin-gated k6-style smoke probes (tiny concurrency — not full k6 load).
 * Presence / auth / reconnect fan out real requests; chat + billing only verify
 * auth/route behavior without mutating wallets or inserting messages.
 */

const SCENARIO_IDS = [
  'presence_heartbeat',
  'auth_profile_burst',
  'reconnect_storm',
  'chat_send',
  'billing_burn',
  'billing_gift',
];

const DEFAULT_CONCURRENCY = 5;
const MAX_CONCURRENCY = 20;
const REQUEST_TIMEOUT_MS = 8000;

function nowIso() {
  return new Date().toISOString();
}

function elapsed(t0) {
  return Date.now() - t0;
}

function clampConcurrency(raw) {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n) || n < 1) return DEFAULT_CONCURRENCY;
  return Math.min(MAX_CONCURRENCY, n);
}

function listK6SmokeScenarios() {
  return [...SCENARIO_IDS];
}

function resolveBaseUrl(input) {
  const fromInput = String(input?.baseUrl || '').trim().replace(/\/$/, '');
  if (fromInput && /^https?:\/\//i.test(fromInput)) return fromInput;
  const proto = String(input?.proto || 'https').replace(/:$/, '') || 'https';
  const host = String(input?.host || '').trim();
  if (host) return `${proto}://${host}`.replace(/\/$/, '');
  if (process.env.VERCEL_URL) return `https://${String(process.env.VERCEL_URL).replace(/\/$/, '')}`;
  const pub = String(process.env.PUBLIC_APP_URL || process.env.NEXT_PUBLIC_APP_URL || '').trim();
  if (pub) return pub.replace(/\/$/, '');
  return 'http://localhost:3000';
}

function authHeader(authorization) {
  const raw = String(authorization || '').trim();
  if (!raw) return {};
  if (/^bearer\s+/i.test(raw)) return { Authorization: raw };
  return { Authorization: `Bearer ${raw}` };
}

async function timedFetch(url, init, timeoutMs = REQUEST_TIMEOUT_MS) {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text.slice(0, 200) };
    }
    return {
      okHttp: res.status >= 200 && res.status < 500,
      status: res.status,
      latencyMs: elapsed(t0),
      body,
    };
  } catch (err) {
    return {
      okHttp: false,
      status: 0,
      latencyMs: elapsed(t0),
      body: null,
      error: err && err.name === 'AbortError' ? 'timeout' : String((err && err.message) || err),
    };
  } finally {
    clearTimeout(timer);
  }
}

function metricsFromLatencies(results) {
  const okCount = results.filter((r) => r.pass).length;
  const failCount = results.length - okCount;
  const latencies = results.map((r) => r.latencyMs).filter((n) => Number.isFinite(n));
  const sum = latencies.reduce((a, b) => a + b, 0);
  return {
    okCount,
    failCount,
    avgMs: latencies.length ? Math.round(sum / latencies.length) : 0,
    maxMs: latencies.length ? Math.max(...latencies) : 0,
  };
}

function finish(scenarioId, tAll, steps, summary, metrics) {
  return {
    scenarioId,
    ok: steps.every((s) => s.ok),
    latencyMs: elapsed(tAll),
    summary,
    finishedAt: nowIso(),
    steps,
    metrics: metrics || null,
  };
}

async function runConcurrent(n, fn) {
  const jobs = [];
  for (let i = 0; i < n; i += 1) jobs.push(fn(i));
  return Promise.all(jobs);
}

async function smokePresence(base, authorization, concurrency) {
  const headers = {
    'Content-Type': 'application/json',
    ...authHeader(authorization),
  };
  const results = await runConcurrent(concurrency, async () => {
    const res = await timedFetch(`${base}/api/presence/heartbeat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ status: 'online', peerIds: [], durable: false }),
    });
    const pass = res.status >= 200 && res.status < 300;
    return {
      pass,
      latencyMs: res.latencyMs,
      status: res.status,
      redis: res.body && (res.body.redis === true || res.body.data?.redis === true),
      error: res.error,
    };
  });
  const metrics = metricsFromLatencies(results);
  const redisHits = results.filter((r) => r.redis).length;
  const steps = [
    {
      id: 'presence-burst',
      label: `Presence heartbeat ×${concurrency}`,
      ok: metrics.failCount === 0,
      latencyMs: metrics.maxMs,
      detail:
        metrics.failCount === 0
          ? `All ${metrics.okCount} ok · avg ${metrics.avgMs}ms · max ${metrics.maxMs}ms · redis=${redisHits}/${results.length}`
          : `${metrics.failCount}/${results.length} failed · avg ${metrics.avgMs}ms · max ${metrics.maxMs}ms`,
      data: { metrics, sampleStatus: results[0]?.status, redisHits },
    },
  ];
  return { steps, metrics };
}

async function smokeAuthProfile(base, authorization, concurrency) {
  const headers = { ...authHeader(authorization) };
  const results = await runConcurrent(concurrency, async () => {
    const res = await timedFetch(`${base}/api/health`, {
      method: 'GET',
      headers,
    });
    const pass = res.status === 200 || res.status === 501;
    return { pass, latencyMs: res.latencyMs, status: res.status, error: res.error };
  });
  const metrics = metricsFromLatencies(results);
  const steps = [
    {
      id: 'health-burst',
      label: `GET /api/health ×${concurrency}`,
      ok: metrics.failCount === 0,
      latencyMs: metrics.maxMs,
      detail:
        metrics.failCount === 0
          ? `All ${metrics.okCount} ok · avg ${metrics.avgMs}ms · max ${metrics.maxMs}ms`
          : `${metrics.failCount}/${results.length} failed`,
      data: { metrics, sampleStatus: results[0]?.status },
    },
  ];
  return { steps, metrics };
}

async function smokeReconnect(base, authorization, concurrency) {
  const headers = {
    'Content-Type': 'application/json',
    ...authHeader(authorization),
  };
  const results = await runConcurrent(concurrency, async () => {
    const h = await timedFetch(`${base}/api/health`, { method: 'GET', headers });
    const p = await timedFetch(`${base}/api/presence/heartbeat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ status: 'online', peerIds: [], durable: false }),
    });
    const pass = h.status < 500 && p.status < 500 && !h.error && !p.error;
    return {
      pass,
      latencyMs: h.latencyMs + p.latencyMs,
      healthStatus: h.status,
      presenceStatus: p.status,
    };
  });
  const metrics = metricsFromLatencies(results);
  const steps = [
    {
      id: 'reconnect-burst',
      label: `Health + presence reconnect ×${concurrency}`,
      ok: metrics.failCount === 0,
      latencyMs: metrics.maxMs,
      detail:
        metrics.failCount === 0
          ? `All pairs ok · avg ${metrics.avgMs}ms · max ${metrics.maxMs}ms`
          : `${metrics.failCount}/${results.length} pairs failed`,
      data: { metrics },
    },
  ];
  return { steps, metrics };
}

/** Route/auth only — never inserts a message. */
async function smokeChatRoute(base, authorization) {
  const steps = [];
  const anon = await timedFetch(`${base}/api/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const anonOk = anon.status === 401 || anon.status === 403;
  steps.push({
    id: 'chat-anon',
    label: 'POST /api/messages without token',
    ok: anonOk,
    latencyMs: anon.latencyMs,
    detail: anonOk
      ? `Expected auth reject (HTTP ${anon.status})`
      : `Unexpected HTTP ${anon.status}${anon.error ? ` · ${anon.error}` : ''}`,
    data: { status: anon.status },
  });

  const bad = await timedFetch(`${base}/api/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader(authorization),
    },
    body: JSON.stringify({}),
  });
  const badOk = bad.status === 400 || bad.status === 422 || bad.status === 401 || bad.status === 403;
  steps.push({
    id: 'chat-validation',
    label: 'POST /api/messages with auth + empty body (no insert)',
    ok: badOk,
    latencyMs: bad.latencyMs,
    detail: badOk
      ? `Validation/auth response HTTP ${bad.status} — no message sent`
      : `Unexpected HTTP ${bad.status}`,
    data: { status: bad.status },
  });
  return { steps, metrics: null };
}

/** Route/auth only — never burns coins. */
async function smokeBillingBurnRoute(base, authorization) {
  const steps = [];
  const anon = await timedFetch(`${base}/api/calls/burn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const anonOk = anon.status === 401 || anon.status === 403;
  steps.push({
    id: 'burn-anon',
    label: 'POST /api/calls/burn without token',
    ok: anonOk,
    latencyMs: anon.latencyMs,
    detail: anonOk
      ? `Expected auth reject (HTTP ${anon.status})`
      : `Unexpected HTTP ${anon.status}`,
    data: { status: anon.status },
  });

  const bad = await timedFetch(`${base}/api/calls/burn`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader(authorization),
    },
    body: JSON.stringify({}),
  });
  const badOk =
    bad.status === 400 || bad.status === 422 || bad.status === 401 || bad.status === 403;
  steps.push({
    id: 'burn-validation',
    label: 'POST /api/calls/burn with auth + empty body (no debit)',
    ok: badOk,
    latencyMs: bad.latencyMs,
    detail: badOk
      ? `Validation/auth response HTTP ${bad.status} — no CALL_DEBIT`
      : `Unexpected HTTP ${bad.status}`,
    data: { status: bad.status },
  });
  return { steps, metrics: null };
}

/** Route/auth only — never sends a gift. */
async function smokeBillingGiftRoute(base, authorization) {
  const steps = [];
  const anon = await timedFetch(`${base}/api/gifts/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const anonOk = anon.status === 401 || anon.status === 403;
  steps.push({
    id: 'gift-anon',
    label: 'POST /api/gifts/send without token',
    ok: anonOk,
    latencyMs: anon.latencyMs,
    detail: anonOk
      ? `Expected auth reject (HTTP ${anon.status})`
      : `Unexpected HTTP ${anon.status}`,
    data: { status: anon.status },
  });

  const bad = await timedFetch(`${base}/api/gifts/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader(authorization),
    },
    body: JSON.stringify({}),
  });
  const badOk =
    bad.status === 400 || bad.status === 422 || bad.status === 401 || bad.status === 403;
  steps.push({
    id: 'gift-validation',
    label: 'POST /api/gifts/send with auth + empty body (no debit)',
    ok: badOk,
    latencyMs: bad.latencyMs,
    detail: badOk
      ? `Validation/auth response HTTP ${bad.status} — no gift debit`
      : `Unexpected HTTP ${bad.status}`,
    data: { status: bad.status },
  });
  return { steps, metrics: null };
}

/**
 * @param {string} scenarioId
 * @param {{
 *   authorization?: string,
 *   concurrency?: number,
 *   baseUrl?: string,
 *   host?: string,
 *   proto?: string,
 * }} input
 */
async function runK6Smoke(scenarioId, input = {}) {
  const id = String(scenarioId || '').trim();
  if (!SCENARIO_IDS.includes(id)) return null;

  const tAll = Date.now();
  const concurrency = clampConcurrency(input.concurrency);
  const base = resolveBaseUrl(input);
  const authorization = input.authorization || '';

  let pack;
  if (id === 'presence_heartbeat') {
    pack = await smokePresence(base, authorization, concurrency);
  } else if (id === 'auth_profile_burst') {
    pack = await smokeAuthProfile(base, authorization, concurrency);
  } else if (id === 'reconnect_storm') {
    pack = await smokeReconnect(base, authorization, concurrency);
  } else if (id === 'chat_send') {
    pack = await smokeChatRoute(base, authorization);
  } else if (id === 'billing_burn') {
    pack = await smokeBillingBurnRoute(base, authorization);
  } else if (id === 'billing_gift') {
    pack = await smokeBillingGiftRoute(base, authorization);
  } else {
    return null;
  }

  const ok = pack.steps.every((s) => s.ok);
  const summary = ok
    ? `Smoke OK for ${id} (concurrency=${concurrency}, base=${base})`
    : `Smoke FAILED for ${id} — see steps`;
  return finish(id, tAll, pack.steps, summary, pack.metrics);
}

module.exports = {
  listK6SmokeScenarios,
  runK6Smoke,
  DEFAULT_CONCURRENCY,
  MAX_CONCURRENCY,
};
