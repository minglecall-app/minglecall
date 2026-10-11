/**
 * Plug-in diagnostic suites for the admin System Testing panel.
 * Add a suite by appending an object to DIAGNOSTIC_MODULES — the dashboard
 * renders summary, cards, spinners, and logs from this list alone.
 */
import { supabase, isSupabaseConfigured } from '../../../lib/supabase';
import { apiFetch, authFetch } from '../../../utils/apiClient';

export type DiagnosticCategory = 'cache' | 'database' | 'billing' | 'media' | 'realtime';

export type DiagnosticStep = {
  id: string;
  label: string;
  ok: boolean;
  latencyMs: number;
  detail: string;
  data?: Record<string, unknown>;
};

export type ClientDiagnosticResult = {
  ok: boolean;
  latencyMs: number;
  summary: string;
  finishedAt: string;
  steps: DiagnosticStep[];
};

export interface DiagnosticModule {
  id: string;
  title: string;
  description: string;
  category: DiagnosticCategory;
  run: () => Promise<ClientDiagnosticResult>;
}

export const DIAGNOSTIC_CATEGORY_LABELS: Record<DiagnosticCategory, string> = {
  cache: 'Cache',
  database: 'Database',
  billing: 'Billing',
  media: 'Media',
  realtime: 'Realtime',
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

function stepFromResponse(
  id: string,
  label: string,
  ok: boolean,
  latencyMs: number,
  detail: string,
  data?: Record<string, unknown>
): DiagnosticStep {
  return { id, label, ok, latencyMs, detail, data };
}

async function postServerModule(
  moduleId: string,
  extra?: Record<string, unknown>
): Promise<{ httpStatus: number; body: any; latencyMs: number }> {
  const t0 = Date.now();
  const res = await authFetch('/api/admin/system-diagnostics', {
    method: 'POST',
    body: JSON.stringify({ moduleId, ...(extra || {}) }),
  });
  const body = await readBody(res);
  return { httpStatus: res.status, body, latencyMs: Date.now() - t0 };
}

function absorbServerResult(prefix: string, payload: { httpStatus: number; body: any; latencyMs: number }): DiagnosticStep[] {
  const data = payload.body?.data;
  if (payload.httpStatus >= 200 && payload.httpStatus < 300 && Array.isArray(data?.steps)) {
    return data.steps.map((step: DiagnosticStep) => ({
      ...step,
      id: `${prefix}-${step.id}`,
    }));
  }
  const message =
    payload.body?.error?.message ||
    payload.body?.error ||
    payload.body?.message ||
    `HTTP ${payload.httpStatus}`;
  return [
    stepFromResponse(
      `${prefix}-http`,
      'Server diagnostic',
      false,
      payload.latencyMs,
      typeof message === 'string' ? message : 'Server diagnostic failed',
      { httpStatus: payload.httpStatus }
    ),
  ];
}

function pack(steps: DiagnosticStep[], summaryPass: string, summaryFail: string): ClientDiagnosticResult {
  const ok = steps.length > 0 && steps.every((step) => step.ok);
  const latencyMs = steps.reduce((sum, step) => sum + (Number(step.latencyMs) || 0), 0);
  return {
    ok,
    latencyMs,
    summary: ok ? summaryPass : summaryFail,
    finishedAt: new Date().toISOString(),
    steps,
  };
}

async function runRedisPresence(): Promise<ClientDiagnosticResult> {
  const steps: DiagnosticStep[] = [];

  const tAuth = Date.now();
  try {
    const res = await authFetch('/api/presence/heartbeat', {
      method: 'POST',
      body: JSON.stringify({ status: 'online' }),
    });
    const body = await readBody(res);
    const ok = res.ok && body?.success === true && body?.redis === true;
    steps.push(
      stepFromResponse(
        'heartbeat-auth',
        'Authenticated heartbeat',
        ok,
        Date.now() - tAuth,
        ok
          ? `HTTP ${res.status} · status=${body.status || 'online'} · redis=true`
          : body?.error?.message || body?.error || `HTTP ${res.status}`,
        {
          httpStatus: res.status,
          success: body?.success === true,
          redis: body?.redis === true,
          status: body?.status || null,
        }
      )
    );
  } catch (err: any) {
    steps.push(
      stepFromResponse('heartbeat-auth', 'Authenticated heartbeat', false, Date.now() - tAuth, err?.message || 'Request failed')
    );
  }

  const tAnon = Date.now();
  try {
    const res = await apiFetch('/api/presence/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'online' }),
    });
    const body = await readBody(res);
    const ok = res.status === 401;
    steps.push(
      stepFromResponse(
        'heartbeat-anon',
        'Unauthenticated heartbeat rejected',
        ok,
        Date.now() - tAnon,
        ok ? 'HTTP 401 without a bearer token' : `Expected 401, received HTTP ${res.status}`,
        { httpStatus: res.status, code: body?.error?.code || null }
      )
    );
  } catch (err: any) {
    steps.push(
      stepFromResponse(
        'heartbeat-anon',
        'Unauthenticated heartbeat rejected',
        false,
        Date.now() - tAnon,
        err?.message || 'Request failed'
      )
    );
  }

  try {
    const server = await postServerModule('redis-fallback');
    steps.push(...absorbServerResult('redis', server));
  } catch (err: any) {
    steps.push(
      stepFromResponse('redis-server', 'Redis fallback probe', false, 0, err?.message || 'Server probe failed')
    );
  }

  return pack(
    steps,
    'Heartbeat accepted the admin session, rejected a missing token, and Redis failed closed on a bad credential.',
    'Redis presence diagnostic found a failing step.'
  );
}

async function runPooler(): Promise<ClientDiagnosticResult> {
  try {
    const server = await postServerModule('supabase-pooler');
    const steps = absorbServerResult('pool', server);
    return pack(
      steps,
      'Pooler configuration, connect time, and a lightweight query all passed.',
      'Database pooler diagnostic found a failing step.'
    );
  } catch (err: any) {
    return pack(
      [stepFromResponse('pool-http', 'Pooler probe', false, 0, err?.message || 'Request failed')],
      '',
      'Database pooler diagnostic could not reach the server.'
    );
  }
}

async function runBilling(): Promise<ClientDiagnosticResult> {
  try {
    const server = await postServerModule('billing-safety');
    const steps = absorbServerResult('billing', server);
    return pack(
      steps,
      'Balance was read from the server, invalid burns were rejected, and no coins moved.',
      'Billing safety diagnostic found a failing step. No coins were intentionally deducted.'
    );
  } catch (err: any) {
    return pack(
      [stepFromResponse('billing-http', 'Billing probe', false, 0, err?.message || 'Request failed')],
      '',
      'Billing safety diagnostic could not reach the server.'
    );
  }
}

function tokenShape(token: string): Record<string, unknown> {
  const parts = token.split('.');
  let alg: string | null = null;
  if (parts[0]) {
    try {
      const header = JSON.parse(atob(parts[0].replace(/-/g, '+').replace(/_/g, '/')));
      alg = typeof header?.alg === 'string' ? header.alg : null;
    } catch {
      alg = null;
    }
  }
  return {
    segments: parts.length,
    alg,
    signaturePresent: Boolean(parts[2] && parts[2].length > 10),
    length: token.length,
  };
}

async function runLiveKit(): Promise<ClientDiagnosticResult> {
  const steps: DiagnosticStep[] = [];
  const roomName = `admin_test_room_diag_${Date.now()}`;

  const tAnon = Date.now();
  try {
    const res = await apiFetch('/api/livekit/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomName }),
    });
    const body = await readBody(res);
    const ok = res.status === 401;
    steps.push(
      stepFromResponse(
        'livekit-anon',
        'Missing authorization rejected',
        ok,
        Date.now() - tAnon,
        ok ? 'HTTP 401 without a bearer token' : `Expected 401, received HTTP ${res.status}`,
        { httpStatus: res.status, code: body?.error?.code || null }
      )
    );
  } catch (err: any) {
    steps.push(
      stepFromResponse('livekit-anon', 'Missing authorization rejected', false, Date.now() - tAnon, err?.message || 'Request failed')
    );
  }

  let minted = '';
  const tAuth = Date.now();
  try {
    const res = await authFetch('/api/livekit/token', {
      method: 'POST',
      body: JSON.stringify({ roomName }),
    });
    const body = await readBody(res);
    minted = typeof body?.token === 'string' ? body.token : '';
    const shape = minted ? tokenShape(minted) : null;
    const ok = res.ok && Boolean(minted) && shape?.segments === 3 && shape?.signaturePresent === true;
    steps.push(
      stepFromResponse(
        'livekit-mint',
        'Authorized admin test room',
        ok,
        Date.now() - tAuth,
        ok
          ? `HTTP ${res.status} · JWT ${String(shape?.alg || 'signed')} · ${shape?.segments} segments`
          : body?.message || body?.error?.message || body?.error || `HTTP ${res.status}`,
        {
          httpStatus: res.status,
          configured: body?.configured !== false,
          roomName,
          token: minted ? '[redacted]' : null,
          shape,
        }
      )
    );
  } catch (err: any) {
    steps.push(
      stepFromResponse('livekit-mint', 'Authorized admin test room', false, Date.now() - tAuth, err?.message || 'Request failed')
    );
  }

  if (minted) {
    try {
      const server = await postServerModule('livekit-verify', { token: minted });
      steps.push(...absorbServerResult('livekit', server));
    } catch (err: any) {
      steps.push(
        stepFromResponse('livekit-verify', 'Signature verification', false, 0, err?.message || 'Verify request failed')
      );
    }
  }

  return pack(
    steps,
    'Missing credentials were rejected and the admin test-room token signature verified.',
    'LiveKit token diagnostic found a failing step.'
  );
}

async function runRealtime(): Promise<ClientDiagnosticResult> {
  const steps: DiagnosticStep[] = [];
  if (!isSupabaseConfigured()) {
    return pack(
      [
        stepFromResponse(
          'realtime-client',
          'Browser realtime client',
          false,
          0,
          'Supabase client is not configured in this browser'
        ),
      ],
      '',
      'Realtime diagnostic could not start.'
    );
  }

  const nonce = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  const channelName = `admin-diag-${nonce}`;
  const t0 = Date.now();
  let serverSteps: DiagnosticStep[] = [];

  const delivered = await new Promise<DiagnosticStep>((resolve) => {
    let settled = false;
    const channel = supabase.channel(channelName, {
      config: { broadcast: { self: false, ack: false } },
    });
    const finish = (row: DiagnosticStep) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      try {
        void supabase.removeChannel(channel);
      } catch (err: any) {
        console.error('[system-testing] removeChannel', err?.message || err);
      }
      resolve(row);
    };
    const timer = window.setTimeout(() => {
      finish(
        stepFromResponse(
          'realtime-delivery',
          'Broadcast delivery',
          false,
          Date.now() - t0,
          'Timed out waiting for the diagnostic broadcast',
          { channel: channelName }
        )
      );
    }, 8000);

    channel.on('broadcast', { event: 'diag' }, (message: { payload?: { nonce?: string }; nonce?: string }) => {
      const got = String(message?.payload?.nonce || message?.nonce || '');
      finish(
        stepFromResponse(
          'realtime-delivery',
          'Broadcast delivery',
          got === nonce,
          Date.now() - t0,
          got === nonce ? `Received diag event on ${channelName}` : 'Received a broadcast with a different nonce',
          { channel: channelName, nonceMatched: got === nonce }
        )
      );
    });

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        void postServerModule('realtime-broadcast', { channel: channelName, nonce })
          .then((server) => {
            serverSteps = absorbServerResult('realtime', server);
            const sendOk = serverSteps.every((step) => step.ok);
            if (!sendOk) {
              finish(
                stepFromResponse(
                  'realtime-send',
                  'Server broadcast',
                  false,
                  Date.now() - t0,
                  serverSteps.map((step) => step.detail).join(' · ') || 'Server did not send',
                  { channel: channelName, steps: serverSteps }
                )
              );
            }
          })
          .catch((err: any) => {
            finish(
              stepFromResponse(
                'realtime-send',
                'Server broadcast',
                false,
                Date.now() - t0,
                err?.message || 'Broadcast request failed',
                { channel: channelName }
              )
            );
          });
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        finish(
          stepFromResponse(
            'realtime-subscribe',
            'Channel subscribe',
            false,
            Date.now() - t0,
            `Realtime status ${status}`,
            { channel: channelName }
          )
        );
      }
    });
  });

  if (delivered.id === 'realtime-delivery') steps.push(...serverSteps);
  steps.push(delivered);
  return pack(
    steps,
    'The browser joined the diagnostic channel and received the server broadcast.',
    'Realtime broadcast diagnostic found a failing step.'
  );
}

export const DIAGNOSTIC_MODULES: DiagnosticModule[] = [
  {
    id: 'redis-presence',
    title: 'Redis Presence & Heartbeat',
    description: 'Posts an authenticated heartbeat, expects 401 without a token, then checks Upstash latency and a bad-credential fallback.',
    category: 'cache',
    run: runRedisPresence,
  },
  {
    id: 'supabase-pooler',
    title: 'Supabase Pooling & Database Health',
    description: 'Checks the transaction pooler URL and connect time, then runs a lightweight service-role query.',
    category: 'database',
    run: runPooler,
  },
  {
    id: 'billing-safety',
    title: 'Atomic Billing & Coin Safety',
    description: 'Reads the admin balance on the server and rejects an invalid burn twice so no coins move and no ledger row is written.',
    category: 'billing',
    run: runBilling,
  },
  {
    id: 'livekit-token',
    title: 'LiveKit Token Minting & Security',
    description: 'Calls token minting with and without the admin session, then verifies the JWT signature on the server.',
    category: 'media',
    run: runLiveKit,
  },
  {
    id: 'realtime-broadcast',
    title: 'Real-Time Broadcast & Channel',
    description: 'Subscribes to a diagnostic Supabase channel and confirms the server broadcast arrives.',
    category: 'realtime',
    run: runRealtime,
  },
];
