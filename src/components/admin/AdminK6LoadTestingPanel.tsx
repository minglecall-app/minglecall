import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Copy,
  Loader2,
  Play,
  Terminal,
  XCircle,
} from 'lucide-react';
import {
  K6_SCENARIOS,
  type K6Scenario,
  type K6SmokeClientResult,
} from './k6LoadTesting/scenarios';

type SuiteStatus = 'idle' | 'running' | 'pass' | 'fail';

type SuiteState = {
  status: SuiteStatus;
  runs: number;
  passes: number;
  result: K6SmokeClientResult | null;
};

type FilterKey = 'all' | 'concurrent_smoke' | 'route_auth_only';

const FILTERS: { id: FilterKey; label: string }[] = [
  { id: 'all', label: 'All scenarios' },
  { id: 'concurrent_smoke', label: 'Concurrent smoke' },
  { id: 'route_auth_only', label: 'Route / auth only' },
];

function emptyState(): SuiteState {
  return { status: 'idle', runs: 0, passes: 0, result: null };
}

function StatusBadge({ status }: { status: SuiteStatus }) {
  if (status === 'running') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-500/15 text-cyan-200 px-2.5 py-1 text-[11px] font-semibold">
        <Loader2 className="w-3 h-3 animate-spin" />
        Running
      </span>
    );
  }
  if (status === 'pass') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 text-emerald-300 px-2.5 py-1 text-[11px] font-semibold">
        <CheckCircle2 className="w-3 h-3" />
        Pass
      </span>
    );
  }
  if (status === 'fail') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/15 text-rose-300 px-2.5 py-1 text-[11px] font-semibold">
        <XCircle className="w-3 h-3" />
        Fail
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-800 text-slate-400 px-2.5 py-1 text-[11px] font-semibold">
      Idle
    </span>
  );
}

export const AdminK6LoadTestingPanel: React.FC = () => {
  const [suites, setSuites] = useState<Record<string, SuiteState>>(() =>
    Object.fromEntries(K6_SCENARIOS.map((s) => [s.id, emptyState()]))
  );
  const [openLogId, setOpenLogId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [runningAll, setRunningAll] = useState(false);
  const [baseUrl, setBaseUrl] = useState(() =>
    typeof window !== 'undefined' ? window.location.origin : 'https://your-staging.vercel.app'
  );
  const [concurrency, setConcurrency] = useState(5);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const totals = useMemo(() => {
    const rows = K6_SCENARIOS.map((s) => suites[s.id] || emptyState());
    const runs = rows.reduce((sum, row) => sum + row.runs, 0);
    const passes = rows.reduce((sum, row) => sum + row.passes, 0);
    const anyRunning = rows.some((row) => row.status === 'running') || runningAll;
    const tested = rows.filter((row) => row.runs > 0);
    let health = 'Not tested';
    let healthClass = 'text-slate-300';
    if (anyRunning) {
      health = 'Checking';
      healthClass = 'text-cyan-300';
    } else if (tested.length === K6_SCENARIOS.length && tested.every((row) => row.status === 'pass')) {
      health = 'Smoke healthy';
      healthClass = 'text-emerald-300';
    } else if (tested.some((row) => row.status === 'fail')) {
      health = 'Degraded';
      healthClass = 'text-rose-300';
    } else if (tested.length > 0) {
      health = 'Partial';
      healthClass = 'text-amber-300';
    }
    return {
      runs,
      successRate: runs === 0 ? null : Math.round((passes / runs) * 100),
      health,
      healthClass,
      anyRunning,
    };
  }, [suites, runningAll]);

  const visible = K6_SCENARIOS.filter((s) => filter === 'all' || s.kind === filter);

  const copyCli = async (scenario: K6Scenario) => {
    const text = scenario.buildCli(baseUrl.trim());
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(scenario.id);
      window.setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setCopiedId(null);
    }
  };

  const runScenario = async (scenario: K6Scenario) => {
    setSuites((prev) => ({
      ...prev,
      [scenario.id]: { ...(prev[scenario.id] || emptyState()), status: 'running' },
    }));
    setOpenLogId(scenario.id);
    try {
      const result = await scenario.runSmoke({
        concurrency: Math.min(20, Math.max(1, concurrency)),
        baseUrl: baseUrl.trim(),
      });
      setSuites((prev) => {
        const current = prev[scenario.id] || emptyState();
        return {
          ...prev,
          [scenario.id]: {
            status: result.ok ? 'pass' : 'fail',
            runs: current.runs + 1,
            passes: current.passes + (result.ok ? 1 : 0),
            result,
          },
        };
      });
    } catch (err: any) {
      const result: K6SmokeClientResult = {
        ok: false,
        latencyMs: 0,
        summary: err?.message || 'Smoke crashed before it could finish',
        finishedAt: new Date().toISOString(),
        steps: [],
      };
      setSuites((prev) => {
        const current = prev[scenario.id] || emptyState();
        return {
          ...prev,
          [scenario.id]: {
            status: 'fail',
            runs: current.runs + 1,
            passes: current.passes,
            result,
          },
        };
      });
    }
  };

  const runAll = async () => {
    setRunningAll(true);
    try {
      for (const scenario of K6_SCENARIOS) {
        await runScenario(scenario);
      }
    } finally {
      setRunningAll(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-cyan-400" />
            K6 Load Testing
          </h3>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Catalog of repo k6 scripts with copy-paste CLI. In-app Run smoke uses tiny concurrency
            (max 20) — not a substitute for full staging k6.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void runAll()}
          disabled={totals.anyRunning}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-bold px-4 py-2.5 cursor-pointer"
        >
          {totals.anyRunning ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Play className="w-3.5 h-3.5" />
          )}
          {totals.anyRunning ? 'Running smokes…' : 'Run all smokes'}
        </button>
      </div>

      <div className="rounded-xl border border-amber-700/40 bg-amber-950/30 px-3 py-2 text-[11px] text-amber-100/90 flex gap-2">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
        <span>
          Smoke ≠ full k6. Chat and billing smokes only check auth/validation and never debit or
          insert messages. Use Copy CLI against staging for acceptance targets in{' '}
          <span className="font-mono">k6/README.md</span>.
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3 space-y-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            BASE_URL (CLI + optional smoke override)
          </span>
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white font-mono"
            placeholder="https://your-staging.vercel.app"
          />
        </label>
        <label className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3 space-y-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Smoke concurrency (1–20)
          </span>
          <input
            type="number"
            min={1}
            max={20}
            value={concurrency}
            onChange={(e) => setConcurrency(Number(e.target.value) || 5)}
            className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white font-mono"
          />
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Total smokes run
          </p>
          <p className="mt-2 text-2xl font-bold text-white">{totals.runs}</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Success rate
          </p>
          <p className="mt-2 text-2xl font-bold text-white">
            {totals.successRate === null ? '—' : `${totals.successRate}%`}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            Smoke health
          </p>
          <p className={`mt-2 text-2xl font-bold ${totals.healthClass}`}>{totals.health}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold cursor-pointer ${
              filter === item.id
                ? 'bg-cyan-600 text-white'
                : 'bg-slate-900 text-slate-300 border border-slate-800 hover:border-slate-600'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {visible.map((scenario) => {
          const state = suites[scenario.id] || emptyState();
          const open = openLogId === scenario.id;
          return (
            <article
              key={scenario.id}
              className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
                    {scenario.kind === 'route_auth_only'
                      ? 'CLI-only for load · route smoke'
                      : 'Concurrent smoke'}
                  </p>
                  <h4 className="text-sm font-bold text-white mt-1">{scenario.title}</h4>
                  <p className="text-[10px] font-mono text-slate-500 mt-0.5">
                    {scenario.scriptPath}
                  </p>
                </div>
                <StatusBadge status={state.status} />
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">{scenario.description}</p>
              <p className="text-[11px] text-slate-300">
                <span className="text-slate-500">k6 target:</span> {scenario.acceptanceTarget}
              </p>
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 font-mono">
                <span>Latency {state.result ? `${state.result.latencyMs} ms` : '—'}</span>
                <span>Runs {state.runs}</span>
                {state.result?.metrics && (
                  <span>
                    avg {state.result.metrics.avgMs}ms · max {state.result.metrics.maxMs}ms
                  </span>
                )}
                {state.result?.finishedAt && (
                  <span>{new Date(state.result.finishedAt).toLocaleTimeString()}</span>
                )}
              </div>
              {state.result?.summary && (
                <p
                  className={`text-xs ${
                    state.result.ok ? 'text-emerald-200/90' : 'text-rose-200/90'
                  }`}
                >
                  {state.result.summary}
                </p>
              )}
              <div className="rounded-xl bg-slate-950 border border-slate-800 p-2.5">
                <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mb-1">
                  <Terminal className="w-3 h-3" />
                  CLI
                </div>
                <pre className="text-[10px] font-mono text-slate-300 whitespace-pre-wrap break-all leading-relaxed">
                  {scenario.buildCli(baseUrl.trim())}
                </pre>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={state.status === 'running' || runningAll}
                  onClick={() => void runScenario(scenario)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-100 text-xs font-semibold px-3 py-2 cursor-pointer"
                >
                  {state.status === 'running' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Play className="w-3.5 h-3.5" />
                  )}
                  Run smoke
                </button>
                <button
                  type="button"
                  onClick={() => void copyCli(scenario)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 text-slate-300 text-xs font-semibold px-3 py-2 cursor-pointer hover:border-slate-500"
                >
                  <Copy className="w-3.5 h-3.5" />
                  {copiedId === scenario.id ? 'Copied' : 'Copy CLI'}
                </button>
                <button
                  type="button"
                  onClick={() => setOpenLogId(open ? null : scenario.id)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 text-slate-300 text-xs font-semibold px-3 py-2 cursor-pointer hover:border-slate-500"
                >
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
                  />
                  Response log
                </button>
              </div>
              {open && (
                <pre className="max-h-80 overflow-auto rounded-xl bg-slate-950 border border-slate-800 p-3 text-[11px] leading-relaxed text-slate-300 font-mono whitespace-pre-wrap break-all">
                  {state.result
                    ? JSON.stringify(state.result, null, 2)
                    : '{\n  "status": "idle"\n}'}
                </pre>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
};
