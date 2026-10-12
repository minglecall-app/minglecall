/**
 * Live / Degraded / Unavailable strip for core infra (polls while panel is mounted).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Radio, RefreshCw } from 'lucide-react';
import { authFetch } from '../../../utils/apiClient';

export type InfraSystemMode = 'live' | 'degraded' | 'unavailable';

export type InfraSystemStatus = {
  id: string;
  label: string;
  mode: InfraSystemMode;
  detail: string;
  latencyMs: number;
  checkedAt: string;
};

export type InfraStatusSnapshot = {
  checkedAt: string;
  latencyMs: number;
  overall: 'healthy' | 'degraded' | 'critical';
  systems: InfraSystemStatus[];
};

const MODE_STYLES: Record<
  InfraSystemMode,
  { badge: string; dot: string; label: string }
> = {
  live: {
    badge: 'border-emerald-600/40 bg-emerald-950/40 text-emerald-200',
    dot: 'bg-emerald-400',
    label: 'Live',
  },
  degraded: {
    badge: 'border-amber-600/40 bg-amber-950/40 text-amber-200',
    dot: 'bg-amber-400',
    label: 'Degraded',
  },
  unavailable: {
    badge: 'border-rose-600/40 bg-rose-950/40 text-rose-200',
    dot: 'bg-rose-400',
    label: 'Unavailable',
  },
};

const POLL_MS = 45_000;

export const InfraStatusStrip: React.FC = () => {
  const [snapshot, setSnapshot] = useState<InfraStatusSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch('/api/admin/infra-status');
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.success) {
        setError(body?.error?.message || body?.error || `HTTP ${res.status}`);
        setSnapshot(null);
        return;
      }
      setSnapshot(body.data as InfraStatusSnapshot);
    } catch (e: any) {
      setError(e?.message || 'Failed to load infra status');
      setSnapshot(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const overallLabel =
    snapshot?.overall === 'healthy'
      ? 'All primary paths live'
      : snapshot?.overall === 'critical'
        ? 'Multiple systems unavailable'
        : snapshot?.overall === 'degraded'
          ? 'Some systems degraded or offline'
          : 'Checking…';

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h4 className="text-sm font-bold text-white flex items-center gap-2">
            <Radio className="w-4 h-4 text-cyan-400" />
            Infrastructure mode
          </h4>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Current Live vs Degraded / Unavailable (not a suite Pass/Fail). Refreshes while this
            page is open.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono text-slate-500">
            {snapshot?.checkedAt
              ? new Date(snapshot.checkedAt).toLocaleTimeString()
              : '—'}
            {snapshot ? ` · ${snapshot.latencyMs} ms` : ''}
          </span>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 text-slate-200 text-[11px] font-bold px-2.5 py-1.5 cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <p className="text-xs text-rose-300 border border-rose-800/40 rounded-xl px-3 py-2 bg-rose-950/20">
          {error}
        </p>
      )}

      <p
        className={`text-xs font-semibold ${
          snapshot?.overall === 'healthy'
            ? 'text-emerald-300'
            : snapshot?.overall === 'critical'
              ? 'text-rose-300'
              : 'text-amber-300'
        }`}
      >
        {overallLabel}
      </p>

      <div className="flex flex-wrap gap-2">
        {(snapshot?.systems || []).map((sys) => {
          const style = MODE_STYLES[sys.mode] || MODE_STYLES.unavailable;
          return (
            <div
              key={sys.id}
              title={sys.detail}
              className={`inline-flex flex-col gap-0.5 rounded-xl border px-3 py-2 min-w-[140px] ${style.badge}`}
            >
              <span className="text-[10px] uppercase tracking-wide font-semibold opacity-80">
                {sys.label}
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs font-bold">
                <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                {style.label}
              </span>
              <span className="text-[10px] opacity-70 line-clamp-2 max-w-[200px]">{sys.detail}</span>
            </div>
          );
        })}
        {!snapshot && !error && loading && (
          <span className="text-xs text-slate-500 inline-flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Probing Redis, DB, billing, LiveKit, Realtime…
          </span>
        )}
      </div>
    </div>
  );
};
