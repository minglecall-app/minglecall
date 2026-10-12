/**
 * k6 load-test scenario catalog for Admin Control Center.
 * Smoke runs hit POST /api/admin/k6-smoke (capped concurrency).
 * Full acceptance targets still require local `k6 run` against staging.
 */
import { authFetch } from '../../../utils/apiClient';

export type K6ScenarioKind = 'concurrent_smoke' | 'route_auth_only';

export type K6SmokeStep = {
  id: string;
  label: string;
  ok: boolean;
  latencyMs: number;
  detail: string;
  data?: Record<string, unknown>;
};

export type K6SmokeClientResult = {
  ok: boolean;
  latencyMs: number;
  summary: string;
  finishedAt: string;
  steps: K6SmokeStep[];
  metrics?: {
    okCount: number;
    failCount: number;
    avgMs: number;
    maxMs: number;
  } | null;
};

export type K6Scenario = {
  id: string;
  title: string;
  description: string;
  scriptPath: string;
  acceptanceTarget: string;
  kind: K6ScenarioKind;
  /** Extra -e flags beyond BASE_URL and TOKEN */
  extraEnvHint?: string;
  buildCli: (baseUrl: string) => string;
  runSmoke: (opts: { concurrency: number; baseUrl: string }) => Promise<K6SmokeClientResult>;
};

async function readBody(res: Response): Promise<any> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 500) };
  }
}

async function postSmoke(
  scenarioId: string,
  concurrency: number,
  baseUrl: string
): Promise<K6SmokeClientResult> {
  const t0 = Date.now();
  try {
    const res = await authFetch('/api/admin/k6-smoke', {
      method: 'POST',
      body: JSON.stringify({
        scenarioId,
        concurrency,
        baseUrl: baseUrl || undefined,
      }),
    });
    const body = await readBody(res);
    const data = body?.data;
    if (res.status >= 200 && res.status < 300 && data && Array.isArray(data.steps)) {
      return {
        ok: Boolean(data.ok),
        latencyMs: Number(data.latencyMs) || Date.now() - t0,
        summary: String(data.summary || ''),
        finishedAt: String(data.finishedAt || new Date().toISOString()),
        steps: data.steps,
        metrics: data.metrics ?? null,
      };
    }
    const message =
      body?.error?.message || body?.error || body?.message || `HTTP ${res.status}`;
    return {
      ok: false,
      latencyMs: Date.now() - t0,
      summary: typeof message === 'string' ? message : 'k6 smoke failed',
      finishedAt: new Date().toISOString(),
      steps: [
        {
          id: 'http',
          label: 'Smoke API',
          ok: false,
          latencyMs: Date.now() - t0,
          detail: typeof message === 'string' ? message : 'Request failed',
          data: { httpStatus: res.status },
        },
      ],
      metrics: null,
    };
  } catch (err: any) {
    return {
      ok: false,
      latencyMs: Date.now() - t0,
      summary: err?.message || 'Smoke request crashed',
      finishedAt: new Date().toISOString(),
      steps: [],
      metrics: null,
    };
  }
}

function cli(script: string, baseUrl: string, extra = ''): string {
  const base = (baseUrl || 'https://your-staging.vercel.app').replace(/\/$/, '');
  const extras = extra ? ` ${extra}` : '';
  return `k6 run -e BASE_URL=${base} -e TOKEN="<supabase_jwt>"${extras} ${script}`;
}

export const K6_SCENARIOS: K6Scenario[] = [
  {
    id: 'presence_heartbeat',
    title: 'Presence heartbeat',
    description:
      'Concurrent presence heartbeats. Smoke fans out a small burst with the admin JWT; full k6 targets 10k VUs / Redis-backed presence.',
    scriptPath: 'k6/presence_heartbeat.js',
    acceptanceTarget: '10k VUs, jittered ~30s, near-zero Postgres presence writes',
    kind: 'concurrent_smoke',
    extraEnvHint: '-e VUS=1000 -e DURATION=2m',
    buildCli: (baseUrl) => cli('k6/presence_heartbeat.js', baseUrl, '-e VUS=1000 -e DURATION=2m'),
    runSmoke: ({ concurrency, baseUrl }) =>
      postSmoke('presence_heartbeat', concurrency, baseUrl),
  },
  {
    id: 'auth_profile_burst',
    title: 'Auth / health burst',
    description:
      'Burst reads against /api/health (same path as the k6 script). Smoke uses capped concurrency.',
    scriptPath: 'k6/auth_profile_burst.js',
    acceptanceTarget: '500–1000 RPS, p95 ≤ 300ms',
    kind: 'concurrent_smoke',
    extraEnvHint: '-e RPS=500 -e DURATION=1m',
    buildCli: (baseUrl) => cli('k6/auth_profile_burst.js', baseUrl, '-e RPS=500 -e DURATION=1m'),
    runSmoke: ({ concurrency, baseUrl }) =>
      postSmoke('auth_profile_burst', concurrency, baseUrl),
  },
  {
    id: 'reconnect_storm',
    title: 'Reconnect storm',
    description:
      'Short burst of health + presence pairs to approximate reconnect pressure. Full k6 ramps to thousands of VUs.',
    scriptPath: 'k6/reconnect_storm.js',
    acceptanceTarget: '5k reconnect / ~30s, http_req_failed < 10%',
    kind: 'concurrent_smoke',
    extraEnvHint: '-e PEAK=5000',
    buildCli: (baseUrl) => cli('k6/reconnect_storm.js', baseUrl, '-e PEAK=5000'),
    runSmoke: ({ concurrency, baseUrl }) =>
      postSmoke('reconnect_storm', concurrency, baseUrl),
  },
  {
    id: 'chat_send',
    title: 'Chat send',
    description:
      'Full load requires RECEIVER_ID and sends real messages. In-app smoke only checks auth/validation — no inserts.',
    scriptPath: 'k6/chat_send.js',
    acceptanceTarget: 'API p95 ≤ 500ms',
    kind: 'route_auth_only',
    extraEnvHint: '-e RECEIVER_ID=<uuid> -e VUS=50 -e DURATION=1m',
    buildCli: (baseUrl) =>
      cli('k6/chat_send.js', baseUrl, '-e RECEIVER_ID=<uuid> -e VUS=50 -e DURATION=1m'),
    runSmoke: ({ concurrency, baseUrl }) => postSmoke('chat_send', concurrency, baseUrl),
  },
  {
    id: 'billing_burn',
    title: 'Billing burn',
    description:
      'Full load burns the same callId:minute for idempotency. Smoke only verifies route/auth — no CALL_DEBIT.',
    scriptPath: 'k6/billing_burn.js',
    acceptanceTarget: '1k parallel burns, zero duplicate CALL_DEBIT',
    kind: 'route_auth_only',
    extraEnvHint: '-e CALL_ID=<uuid> -e VUS=1000',
    buildCli: (baseUrl) => cli('k6/billing_burn.js', baseUrl, '-e CALL_ID=<uuid> -e VUS=1000'),
    runSmoke: ({ concurrency, baseUrl }) => postSmoke('billing_burn', concurrency, baseUrl),
  },
  {
    id: 'billing_gift',
    title: 'Billing gift',
    description:
      'Full load uses a shared idempotency key. Smoke only verifies route/auth — no gift debit.',
    scriptPath: 'k6/billing_gift.js',
    acceptanceTarget: 'Shared idempotency key, zero double-debits',
    kind: 'route_auth_only',
    extraEnvHint:
      '-e RECEIVER_ID=<uuid> -e GIFT_ID=rose -e IDEMPOTENCY_KEY=gift:test:1 -e VUS=200',
    buildCli: (baseUrl) =>
      cli(
        'k6/billing_gift.js',
        baseUrl,
        '-e RECEIVER_ID=<uuid> -e GIFT_ID=rose -e IDEMPOTENCY_KEY=gift:test:1 -e VUS=200'
      ),
    runSmoke: ({ concurrency, baseUrl }) => postSmoke('billing_gift', concurrency, baseUrl),
  },
];
