import React, { useMemo, useState } from 'react';
import { Activity, CheckCircle2, ChevronDown, FlaskConical, Loader2, Play, XCircle } from 'lucide-react';
import {
  DIAGNOSTIC_CATEGORY_LABELS,
  DIAGNOSTIC_MODULES,
  type ClientDiagnosticResult,
  type DiagnosticCategory,
  type DiagnosticModule,
} from './systemTesting/modules';
import { InfraStatusStrip } from './systemTesting/InfraStatusStrip';

type SuiteStatus = 'idle' | 'running' | 'pass' | 'fail';

type SuiteState = {
  status: SuiteStatus;
  runs: number;
  passes: number;
  result: ClientDiagnosticResult | null;
};

type FilterKey = 'all' | DiagnosticCategory;

const FILTERS: { id: FilterKey; label: string }[] = [
  { id: 'all', label: 'All suites' },
  { id: 'cache', label: DIAGNOSTIC_CATEGORY_LABELS.cache },
  { id: 'database', label: DIAGNOSTIC_CATEGORY_LABELS.database },
  { id: 'billing', label: DIAGNOSTIC_CATEGORY_LABELS.billing },
  { id: 'media', label: DIAGNOSTIC_CATEGORY_LABELS.media },
  { id: 'realtime', label: DIAGNOSTIC_CATEGORY_LABELS.realtime },
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

export const AdminSystemTestingPanel: React.FC = () => {
  const [suites, setSuites] = useState<Record<string, SuiteState>>(() =>
    Object.fromEntries(DIAGNOSTIC_MODULES.map((mod) => [mod.id, emptyState()]))
  );
  const [openLogId, setOpenLogId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [runningAll, setRunningAll] = useState(false);

  const totals = useMemo(() => {
    const rows = DIAGNOSTIC_MODULES.map((mod) => suites[mod.id] || emptyState());
    const runs = rows.reduce((sum, row) => sum + row.runs, 0);
    const passes = rows.reduce((sum, row) => sum + row.passes, 0);
    const anyRunning = rows.some((row) => row.status === 'running') || runningAll;
    const tested = rows.filter((row) => row.runs > 0);
    let health = 'Not tested';
    let healthClass = 'text-slate-300';
    if (anyRunning) {
      health = 'Checking';
      healthClass = 'text-cyan-300';
    } else if (tested.length === DIAGNOSTIC_MODULES.length && tested.every((row) => row.status === 'pass')) {
      health = 'Healthy';
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

  const visible = DIAGNOSTIC_MODULES.filter((mod) => filter === 'all' || mod.category === filter);

  const runModule = async (mod: DiagnosticModule) => {
    setSuites((prev) => ({
      ...prev,
      [mod.id]: { ...(prev[mod.id] || emptyState()), status: 'running' },
    }));
    setOpenLogId(mod.id);
    try {
      const result = await mod.run();
      setSuites((prev) => {
        const current = prev[mod.id] || emptyState();
        return {
          ...prev,
          [mod.id]: {
            status: result.ok ? 'pass' : 'fail',
            runs: current.runs + 1,
            passes: current.passes + (result.ok ? 1 : 0),
            result,
          },
        };
      });
    } catch (err: any) {
      const result: ClientDiagnosticResult = {
        ok: false,
        latencyMs: 0,
        summary: err?.message || 'Suite crashed before it could finish',
        finishedAt: new Date().toISOString(),
        steps: [],
      };
      setSuites((prev) => {
        const current = prev[mod.id] || emptyState();
        return {
          ...prev,
          [mod.id]: {
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
      for (const mod of DIAGNOSTIC_MODULES) {
        await runModule(mod);
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
            <FlaskConical className="w-5 h-5 text-cyan-400" />
            System Testing & Diagnostics
          </h3>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Each suite uses the signed-in admin session. Results stay in this view until you leave the page.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void runAll()}
          disabled={totals.anyRunning}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-bold px-4 py-2.5 cursor-pointer"
        >
          {totals.anyRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
          {totals.anyRunning ? 'Running suites…' : 'Run all suites'}
        </button>
      </div>

      <InfraStatusStrip />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Total tests run</p>
          <p className="mt-2 text-2xl font-bold text-white">{totals.runs}</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Success rate</p>
          <p className="mt-2 text-2xl font-bold text-white">
            {totals.successRate === null ? '—' : `${totals.successRate}%`}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            Suite health
          </p>
          <p className={`mt-2 text-2xl font-bold ${totals.healthClass}`}>{totals.health}</p>
          <p className="text-[10px] text-slate-500 mt-1">From last Run test results below</p>
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
        {visible.map((mod) => {
          const state = suites[mod.id] || emptyState();
          const open = openLogId === mod.id;
          return (
            <article key={mod.id} className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
                    {DIAGNOSTIC_CATEGORY_LABELS[mod.category]}
                  </p>
                  <h4 className="text-sm font-bold text-white mt-1">{mod.title}</h4>
                </div>
                <StatusBadge status={state.status} />
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">{mod.description}</p>
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 font-mono">
                <span>Latency {state.result ? `${state.result.latencyMs} ms` : '—'}</span>
                <span>Runs {state.runs}</span>
                {state.result?.finishedAt && <span>{new Date(state.result.finishedAt).toLocaleTimeString()}</span>}
              </div>
              {state.result?.summary && (
                <p className={`text-xs ${state.result.ok ? 'text-emerald-200/90' : 'text-rose-200/90'}`}>
                  {state.result.summary}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={state.status === 'running' || runningAll}
                  onClick={() => void runModule(mod)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-100 text-xs font-semibold px-3 py-2 cursor-pointer"
                >
                  {state.status === 'running' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Play className="w-3.5 h-3.5" />
                  )}
                  Run test
                </button>
                <button
                  type="button"
                  onClick={() => setOpenLogId(open ? null : mod.id)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 text-slate-300 text-xs font-semibold px-3 py-2 cursor-pointer hover:border-slate-500"
                >
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
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
