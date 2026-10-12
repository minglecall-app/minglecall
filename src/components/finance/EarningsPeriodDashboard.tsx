/**
 * Shared week / month / lifetime earnings dashboard for Platform, TL, and Host.
 * Data from /api/v1/finance/earnings-overview + /earnings-ledger (role-scoped).
 */

import React, { useCallback, useEffect, useId, useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Tooltip,
} from 'recharts';
import { ChevronDown, ChevronRight, Loader2, RefreshCw } from 'lucide-react';
import {
  fetchEarningsOverview,
  fetchEarningsLedger,
  type EarningsScope,
  type EarningsLedgerMode,
  type EarningsGroupBy,
  type EarningsOverviewData,
  type EarningsLedgerRow,
  type EarningsLifetimeGroup,
} from '../../services/financeApi';

export type EarningsPeriodDashboardProps = {
  scope: EarningsScope;
  userId?: string;
  teamLeaderId?: string;
  /** Optional title override */
  title?: string;
  /** Accent: amber platform, indigo TL, emerald host */
  accent?: 'amber' | 'indigo' | 'emerald';
  className?: string;
};

function formatUsd(n: number | undefined | null) {
  const v = Number(n) || 0;
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
}

function formatCoins(n: number | undefined | null) {
  return `${(Number(n) || 0).toLocaleString()} 🪙`;
}

function formatWhen(iso: string | null | undefined) {
  if (!iso) return '—';
  try {
    return new Date(iso).toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
  } catch {
    return String(iso);
  }
}

function formatRemaining(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** Compact label for the period ring center. */
function formatRemainingShort(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (d > 0) return `${d}d`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function PeriodRemainRing(props: {
  elapsedRatio: number;
  remainingMs: number;
  stroke: string;
}) {
  const size = 44;
  const strokeW = 3.25;
  const r = (size - strokeW) / 2;
  const c = 2 * Math.PI * r;
  const elapsed = Math.min(1, Math.max(0, props.elapsedRatio));
  const dashOffset = c * (1 - elapsed);
  const left = formatRemaining(props.remainingMs);
  return (
    <div
      className="absolute top-2.5 right-2.5 w-11 h-11 shrink-0"
      title={`${left} left · ${Math.round(elapsed * 100)}% elapsed`}
    >
      <svg width={size} height={size} className="absolute inset-0 -rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#0f172a"
          strokeWidth={strokeW}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={props.stroke}
          strokeWidth={strokeW}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={dashOffset}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[9px] font-mono font-bold text-slate-300 leading-none">
          {formatRemainingShort(props.remainingMs)}
        </span>
      </div>
    </div>
  );
}

const ACCENT = {
  amber: {
    border: 'border-l-amber-400',
    value: 'text-amber-300',
    stroke: '#FBBF24',
  },
  indigo: {
    border: 'border-l-indigo-400',
    value: 'text-indigo-300',
    stroke: '#818CF8',
  },
  emerald: {
    border: 'border-l-emerald-400',
    value: 'text-emerald-300',
    stroke: '#34D399',
  },
} as const;

function MiniSpark(props: {
  data: Array<{ label: string; usd: number }>;
  color: string;
  gradId: string;
}) {
  const hasActivity = props.data.some((d) => d.usd > 0);
  if (!hasActivity) {
    return (
      <div className="h-10 w-full rounded-lg bg-slate-900/60 border border-dashed border-slate-800" />
    );
  }
  return (
    <div className="h-10 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={props.data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={props.gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={props.color} stopOpacity={0.35} />
              <stop offset="95%" stopColor={props.color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Tooltip
            contentStyle={{
              backgroundColor: '#0F172A',
              borderColor: '#334155',
              borderRadius: 10,
              fontSize: 10,
              color: '#F8FAFC',
            }}
            formatter={(value: number) => [formatUsd(value), 'USD']}
            labelFormatter={(_, payload) => (payload?.[0]?.payload?.label as string) || ''}
          />
          <Area
            type="monotone"
            dataKey="usd"
            stroke={props.color}
            fill={`url(#${props.gradId})`}
            strokeWidth={1.5}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function ChartKpiCard(props: {
  label: string;
  value: string;
  sub?: string;
  accentBorder: string;
  valueClass: string;
  /** Stroke color for the top-right period ring. */
  ringStroke?: string;
  /** 0–1 elapsed in this window; shows completing ring when set with remainingMs. */
  elapsedRatio?: number | null;
  remainingMs?: number | null;
  chart: React.ReactNode;
}) {
  const showRemain =
    props.remainingMs != null &&
    Number.isFinite(props.remainingMs) &&
    props.elapsedRatio != null &&
    Number.isFinite(props.elapsedRatio);
  return (
    <div
      className={`relative bg-[#13161F] border border-slate-800 border-l-[3px] ${props.accentBorder} rounded-2xl p-3.5 flex flex-col gap-2 min-h-[118px]`}
    >
      {showRemain && props.ringStroke ? (
        <PeriodRemainRing
          elapsedRatio={Number(props.elapsedRatio)}
          remainingMs={Number(props.remainingMs)}
          stroke={props.ringStroke}
        />
      ) : null}
      <div
        className={`text-[10px] font-bold uppercase tracking-wider text-slate-500 ${
          showRemain ? 'pr-12' : ''
        }`}
      >
        {props.label}
      </div>
      <div className={showRemain ? 'pr-12' : ''}>
        <div className={`text-xl font-black font-mono tracking-tight ${props.valueClass}`}>
          {props.value}
        </div>
        {props.sub ? (
          <div className="text-[10px] text-slate-400 mt-0.5 font-mono">{props.sub}</div>
        ) : null}
      </div>
      <div className="mt-auto">{props.chart}</div>
    </div>
  );
}

function cellUsd(n: number | undefined) {
  const v = Number(n) || 0;
  return v > 0 ? formatUsd(v) : '—';
}

function ComponentSplitStrip(props: {
  split: NonNullable<EarningsOverviewData['componentSplit']>['week'];
  label: string;
}) {
  const s = props.split;
  return (
    <div className="bg-[#161922] border border-slate-800 rounded-2xl p-4 space-y-2">
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
        {props.label} · salary components
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-[10px] font-mono">
        <div>
          <div className="text-slate-500">Call</div>
          <div className="text-white">{formatUsd(s.callUsd)}</div>
        </div>
        <div>
          <div className="text-slate-500">Gift</div>
          <div className="text-pink-300">{formatUsd(s.giftUsd)}</div>
        </div>
        <div>
          <div className="text-slate-500">True-up</div>
          <div className="text-sky-300">{formatUsd(s.trueUpUsd)}</div>
        </div>
        <div>
          <div className="text-slate-500">Tier bonus</div>
          <div className="text-amber-300">{formatUsd(s.tierBonusUsd)}</div>
        </div>
        <div>
          <div className="text-slate-500">Salary total</div>
          <div className="text-emerald-300 font-bold">{formatUsd(s.salaryUsd)}</div>
        </div>
        <div>
          <div className="text-slate-500">Rewards (not salary)</div>
          <div className="text-slate-400">{formatUsd(s.rewardUsd)}</div>
        </div>
      </div>
    </div>
  );
}

function formatUserCell(row: EarningsLedgerRow) {
  const name = String(row.userName || '').trim();
  if (name) {
    return (
      <span className="block truncate max-w-[160px]" title={row.userId || name}>
        <span className="text-slate-200">{name}</span>
        {row.userId ? (
          <span className="block text-[9px] font-mono text-slate-600 truncate">
            {row.userId.slice(0, 8)}…
          </span>
        ) : null}
      </span>
    );
  }
  if (row.userId) {
    return (
      <span className="font-mono text-slate-400" title={row.userId}>
        {row.userId.slice(0, 8)}…
      </span>
    );
  }
  return <span className="text-slate-500">—</span>;
}

function formatHostCell(row: EarningsLedgerRow) {
  const name = String(row.hostName || '').trim();
  if (name) {
    return (
      <span className="block truncate max-w-[140px]" title={row.hostId || name}>
        <span className="text-slate-200">{name}</span>
      </span>
    );
  }
  if (row.hostId) {
    return (
      <span className="font-mono text-slate-400" title={row.hostId}>
        {row.hostId.slice(0, 8)}…
      </span>
    );
  }
  if (row.callId) {
    return (
      <span className="font-mono text-slate-600" title={row.callId}>
        {row.callId.slice(0, 8)}…
      </span>
    );
  }
  return <span className="text-slate-500">—</span>;
}

function LedgerTable(props: {
  rows: EarningsLedgerRow[];
  empty: string;
  rich?: boolean;
  /** Host/TL/platform: show call/host + minutes columns. */
  showCallMeta?: boolean;
  /** TL page: hide Type; show Host instead of Call id. Platform shows burn split columns. */
  scope?: 'platform' | 'tl' | 'host';
}) {
  const isPlatform = props.scope === 'platform';
  const rich = props.rich !== false && !isPlatform;
  const showCallMeta = props.showCallMeta === true;
  const isTl = props.scope === 'tl';
  const showType = !isTl && !isPlatform;
  const metaLabel = isTl ? 'Host' : 'Call';
  const colSpan = isPlatform
    ? 11
    : (rich ? 11 : 5) + (showType ? 1 : 0) + (showCallMeta ? 2 : 0);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="bg-slate-950/80 text-slate-400 sticky top-0">
          <tr>
            <th className="p-3 font-mono">When</th>
            {showType ? <th className="p-3 font-mono">Type</th> : null}
            <th className="p-3 font-mono">{isTl ? 'TL' : isPlatform ? 'Spender' : 'User'}</th>
            {showCallMeta ? (
              <>
                <th className="p-3 font-mono">{metaLabel}</th>
                <th className="p-3 font-mono">Minutes</th>
              </>
            ) : null}
            {isPlatform ? (
              <>
                <th className="p-3 font-mono">Call burn</th>
                <th className="p-3 font-mono">Gift burn</th>
                <th className="p-3 font-mono">Host</th>
                <th className="p-3 font-mono">TL</th>
                <th className="p-3 font-mono">Platform</th>
                <th className="p-3 font-mono">Total burn</th>
                <th className="p-3 font-mono">Total USD</th>
              </>
            ) : rich ? (
              <>
                <th className="p-3 font-mono">Call $</th>
                <th className="p-3 font-mono">Gift</th>
                <th className="p-3 font-mono">True-up</th>
                <th className="p-3 font-mono">Tier bonus</th>
                <th className="p-3 font-mono">Reward*</th>
                <th className="p-3 font-mono">Total coins</th>
                <th className="p-3 font-mono">Total USD</th>
                <th className="p-3 font-mono">Salary?</th>
              </>
            ) : (
              <>
                <th className="p-3 font-mono">Coins</th>
                <th className="p-3 font-mono">USD</th>
              </>
            )}
            <th className="p-3 font-mono">Src</th>
          </tr>
        </thead>
        <tbody>
          {props.rows.length === 0 ? (
            <tr>
              <td colSpan={colSpan} className="p-6 text-center text-slate-500">
                {props.empty}
              </td>
            </tr>
          ) : (
            props.rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-800/80 hover:bg-slate-900/40">
                <td className="p-3 font-mono text-slate-400 whitespace-nowrap">
                  {formatWhen(row.createdAt)}
                </td>
                {showType ? (
                  <td className="p-3 font-mono text-amber-300" title={row.category || ''}>
                    {row.entryType}
                  </td>
                ) : null}
                <td className="p-3">{formatUserCell(row)}</td>
                {showCallMeta ? (
                  <>
                    <td className="p-3 truncate max-w-[140px]">
                      {isTl ? (
                        formatHostCell(row)
                      ) : (
                        <span
                          className="font-mono text-slate-400"
                          title={row.callId || ''}
                        >
                          {row.callId ? `${row.callId.slice(0, 8)}…` : '—'}
                        </span>
                      )}
                    </td>
                    <td className="p-3 font-mono text-indigo-300">
                      {row.billedMinutes != null
                        ? row.billedMinutes
                        : row.billingMinute != null
                          ? 1
                          : '—'}
                    </td>
                  </>
                ) : null}
                {isPlatform ? (
                  <>
                    <td className="p-3 font-mono text-slate-200">
                      {formatCoins(row.callCoins || 0)}
                    </td>
                    <td className="p-3 font-mono text-pink-300">
                      {formatCoins(row.giftCoins || 0)}
                    </td>
                    <td className="p-3 font-mono text-emerald-300">
                      {formatCoins(row.hostEarnCoins || 0)}
                    </td>
                    <td className="p-3 font-mono text-indigo-300">
                      {formatCoins(row.tlEarnCoins || 0)}
                    </td>
                    <td className="p-3 font-mono text-amber-300">
                      {formatCoins(row.platformRetainedCoins || 0)}
                    </td>
                    <td className="p-3 font-mono text-white">{formatCoins(row.amountCoins)}</td>
                    <td className="p-3 font-mono text-emerald-400">{formatUsd(row.amountUsd)}</td>
                  </>
                ) : rich ? (
                  <>
                    <td className="p-3 font-mono text-slate-200">{cellUsd(row.callUsd)}</td>
                    <td className="p-3 font-mono text-pink-300">{cellUsd(row.giftUsd)}</td>
                    <td className="p-3 font-mono text-sky-300">{cellUsd(row.trueUpUsd)}</td>
                    <td className="p-3 font-mono text-amber-300">{cellUsd(row.tierBonusUsd)}</td>
                    <td className="p-3 font-mono text-slate-500">{cellUsd(row.rewardUsd)}</td>
                    <td className="p-3 font-mono text-white">{formatCoins(row.amountCoins)}</td>
                    <td className="p-3 font-mono text-emerald-400">{formatUsd(row.amountUsd)}</td>
                    <td className="p-3 font-mono text-slate-400">
                      {row.inSalary === false ? 'No' : 'Yes'}
                    </td>
                  </>
                ) : (
                  <>
                    <td className="p-3 font-mono text-white">{formatCoins(row.amountCoins)}</td>
                    <td className="p-3 font-mono text-emerald-400">{formatUsd(row.amountUsd)}</td>
                  </>
                )}
                <td className="p-3 font-mono text-slate-500">{row.source}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <div className="px-3 py-2 text-[10px] text-slate-500 border-t border-slate-800 space-y-1">
        {rich ? (
          <p>
            * Rewards (login / streak / mission / chest) credit spendable coins and are not included
            in salary. Peak-hours boosts are discovery-only and do not appear as earn rows.
          </p>
        ) : null}
        {showCallMeta && !isPlatform ? (
          <p>
            One row per call: minute burns and in-call gifts are merged (Call $ / Gift $ columns).
            Minutes = distinct billed minutes. Feed tips, true-ups, and period bonuses stay separate
            rows. Per-minute wallet writes are unchanged for live billing.
          </p>
        ) : null}
        {isPlatform ? (
          <p>
            One row per call. Call burn / Gift burn = spender debits. Host / Agency = shares credited for
            that call. Platform = burn − host − TL. Tips without a call stay separate.
          </p>
        ) : null}
      </div>
    </div>
  );
}

export const EarningsPeriodDashboard: React.FC<EarningsPeriodDashboardProps> = ({
  scope,
  userId,
  teamLeaderId,
  title,
  accent,
  className,
}) => {
  const uid = useId().replace(/:/g, '');
  const theme =
    ACCENT[accent || (scope === 'platform' ? 'amber' : scope === 'tl' ? 'indigo' : 'emerald')];

  const [overview, setOverview] = useState<EarningsOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [remainingMs, setRemainingMs] = useState(0);

  const [ledgerMode, setLedgerMode] = useState<EarningsLedgerMode>('week');
  const [groupBy, setGroupBy] = useState<EarningsGroupBy>('week');
  const [ledgerRows, setLedgerRows] = useState<EarningsLedgerRow[]>([]);
  const [groups, setGroups] = useState<EarningsLifetimeGroup[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<EarningsLedgerRow[]>([]);
  const [expandLoading, setExpandLoading] = useState(false);

  const scopeParams = {
    scope,
    ...(userId ? { userId } : {}),
    ...(teamLeaderId ? { teamLeaderId } : {}),
  };

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetchEarningsOverview(scopeParams);
    if (!res.success || !res.data) {
      setError(res.error?.message || 'Failed to load earnings');
      setOverview(null);
      setLoading(false);
      return;
    }
    setOverview(res.data);
    setRemainingMs(res.data.periodClock.remainingMs);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scopeParams fields are explicit deps
  }, [scope, userId, teamLeaderId]);

  const loadLedger = useCallback(async () => {
    setLedgerLoading(true);
    setLedgerError(null);
    setExpandedKey(null);
    setExpandedRows([]);
    const res = await fetchEarningsLedger({
      ...scopeParams,
      mode: ledgerMode,
      ...(ledgerMode === 'lifetime' ? { groupBy } : {}),
      limit: 200,
    });
    if (!res.success || !res.data) {
      setLedgerError(res.error?.message || 'Failed to load ledger');
      setLedgerRows([]);
      setGroups([]);
      setLedgerLoading(false);
      return;
    }
    setLedgerRows(res.data.rows || []);
    setGroups(res.data.groups || []);
    setLedgerLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, userId, teamLeaderId, ledgerMode, groupBy]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    void loadLedger();
  }, [loadLedger]);

  useEffect(() => {
    if (!overview?.periodClock?.nextCloseAt) return;
    const tick = () => {
      const next = new Date(overview.periodClock.nextCloseAt).getTime();
      setRemainingMs(Math.max(0, next - Date.now()));
    };
    tick();
    const id = window.setInterval(tick, 30000);
    return () => window.clearInterval(id);
  }, [overview?.periodClock?.nextCloseAt]);

  const toggleGroup = async (g: EarningsLifetimeGroup) => {
    if (expandedKey === g.periodKey) {
      setExpandedKey(null);
      setExpandedRows([]);
      return;
    }
    setExpandedKey(g.periodKey);
    setExpandLoading(true);
    const res = await fetchEarningsLedger({
      ...scopeParams,
      mode: 'lifetime',
      groupBy,
      periodKey: g.periodKey,
      limit: 300,
    });
    setExpandLoading(false);
    if (!res.success || !res.data) {
      setExpandedRows([]);
      return;
    }
    setExpandedRows(res.data.rows || []);
  };

  const heading =
    title ||
    (scope === 'platform'
      ? 'Platform earnings'
      : scope === 'tl'
        ? 'Agency earnings'
        : 'Host earnings');

  const weekWindowMs = overview?.week?.periodStart && overview?.week?.periodEnd
    ? Math.max(
        1,
        new Date(overview.week.periodEnd).getTime() - new Date(overview.week.periodStart).getTime()
      )
    : 1;
  const weekRemainingMs = overview?.week?.periodEnd
    ? Math.max(0, new Date(overview.week.periodEnd).getTime() - Date.now())
    : remainingMs;
  const weekElapsedRatio = Math.min(1, Math.max(0, 1 - weekRemainingMs / weekWindowMs));

  const monthWindowMs = overview?.month?.periodStart && overview?.month?.periodEnd
    ? Math.max(
        1,
        new Date(overview.month.periodEnd).getTime() -
          new Date(overview.month.periodStart).getTime()
      )
    : 1;
  const monthRemainingMs = overview?.month?.periodEnd
    ? Math.max(0, new Date(overview.month.periodEnd).getTime() - Date.now())
    : remainingMs;
  const monthElapsedRatio = Math.min(1, Math.max(0, 1 - monthRemainingMs / monthWindowMs));

  const settlementCycle = String(
    overview?.periodClock?.cycleType || overview?.extras?.settlementCycleLabel || 'weekly'
  ).toLowerCase();
  const isMonthlyTarget = settlementCycle === 'monthly' || settlementCycle === 'month';

  const refreshBtn = (
    <button
      type="button"
      onClick={() => {
        void loadOverview();
        void loadLedger();
      }}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-slate-300 bg-slate-900 border border-slate-700 hover:bg-slate-800"
      aria-label={`Refresh ${heading}`}
    >
      <RefreshCw className="w-3.5 h-3.5" />
      Refresh
    </button>
  );

  return (
    <div className={`space-y-4 ${className || ''}`}>
      {title ? (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-sm font-bold text-white">{title}</h3>
          {refreshBtn}
        </div>
      ) : null}

      {loading && !overview ? (
        <div className="flex flex-col items-center gap-3 py-8">
          {!title ? <div className="self-end">{refreshBtn}</div> : null}
          <div className="flex items-center gap-2 text-slate-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading earnings…
          </div>
        </div>
      ) : error ? (
        <div className="space-y-2">
          {!title ? <div className="flex justify-end">{refreshBtn}</div> : null}
          <div className="p-4 rounded-2xl border border-rose-900/50 bg-rose-950/30 text-rose-300 text-sm">
            {error}
          </div>
        </div>
      ) : overview ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <ChartKpiCard
              label="This week"
              value={formatUsd(overview.week.usd)}
              sub={`${formatCoins(overview.week.coins)} · resets Mon 00:00 UTC`}
              accentBorder={theme.border}
              valueClass={theme.value}
              ringStroke={theme.stroke}
              remainingMs={weekRemainingMs}
              elapsedRatio={weekElapsedRatio}
              chart={
                <MiniSpark
                  data={overview.series.week}
                  color={theme.stroke}
                  gradId={`earn-week-${uid}`}
                />
              }
            />
            <ChartKpiCard
              label="This month"
              value={formatUsd(overview.month.usd)}
              sub={`${formatCoins(overview.month.coins)} · resets 1st 00:00 UTC`}
              accentBorder={theme.border}
              valueClass={theme.value}
              ringStroke={theme.stroke}
              remainingMs={monthRemainingMs}
              elapsedRatio={monthElapsedRatio}
              chart={
                <MiniSpark
                  data={overview.series.month}
                  color={theme.stroke}
                  gradId={`earn-month-${uid}`}
                />
              }
            />
            <ChartKpiCard
              label="Lifetime"
              value={formatUsd(overview.lifetime.usd)}
              sub={`${formatCoins(overview.lifetime.coins)} · books + open window`}
              accentBorder={theme.border}
              valueClass={theme.value}
              chart={
                <div className="h-10 flex items-end">
                  <div className="text-[10px] font-mono text-slate-500">
                    {overview.lifetime.entryCount.toLocaleString()} closed entries
                  </div>
                </div>
              }
            />
          </div>

          {overview.componentSplit ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {isMonthlyTarget ? (
                <ComponentSplitStrip split={overview.componentSplit.month} label="This month" />
              ) : (
                <ComponentSplitStrip split={overview.componentSplit.week} label="This week" />
              )}
              <ComponentSplitStrip split={overview.componentSplit.lifetime} label="Lifetime" />
            </div>
          ) : null}
        </>
      ) : null}

      <div className="bg-[#161922] border border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1 p-0.5 rounded-xl bg-slate-950 border border-slate-800">
            {(['week', 'month', 'lifetime'] as EarningsLedgerMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setLedgerMode(m)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold capitalize ${
                  ledgerMode === m
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {m === 'week' ? 'Weekly' : m === 'month' ? 'Monthly' : 'Lifetime'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {ledgerMode === 'lifetime' ? (
              <div className="flex items-center gap-1 text-[10px]">
                <span className="text-slate-500 font-bold uppercase tracking-wider mr-1">
                  Group by
                </span>
                {(['week', 'month'] as EarningsGroupBy[]).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGroupBy(g)}
                    className={`px-2 py-1 rounded-md font-bold capitalize ${
                      groupBy === g
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            ) : (
              <span className="text-[10px] font-mono text-slate-500">
                Current {ledgerMode} window
              </span>
            )}
            {!title ? refreshBtn : null}
          </div>
        </div>

        {ledgerLoading ? (
          <div className="flex items-center gap-2 text-slate-400 text-sm py-8 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading ledger…
          </div>
        ) : ledgerError ? (
          <div className="p-4 text-rose-300 text-sm">{ledgerError}</div>
        ) : ledgerMode === 'lifetime' ? (
          <div className="divide-y divide-slate-800/80">
            {groups.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-sm">
                No lifetime ledger groups yet.
              </div>
            ) : (
              groups.map((g) => {
                const open = expandedKey === g.periodKey;
                return (
                  <div key={g.periodKey}>
                    <button
                      type="button"
                      onClick={() => void toggleGroup(g)}
                      className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-slate-900/40"
                    >
                      {open ? (
                        <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-white truncate">{g.label}</div>
                        <div className="text-[10px] font-mono text-slate-500">
                          {g.entryCount} entries · {formatWhen(g.periodStart)} →{' '}
                          {formatWhen(g.periodEnd)}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className={`text-sm font-mono font-bold ${theme.value}`}>
                          {formatUsd(g.totalUsd)}
                        </div>
                        <div className="text-[10px] font-mono text-slate-500">
                          {formatCoins(g.totalCoins)}
                        </div>
                      </div>
                    </button>
                    {open ? (
                      <div className="border-t border-slate-800/60 bg-slate-950/40">
                        {expandLoading ? (
                          <div className="flex items-center gap-2 text-slate-400 text-sm py-6 justify-center">
                            <Loader2 className="w-4 h-4 animate-spin" /> Loading period…
                          </div>
                        ) : (
                          <LedgerTable
                            rows={expandedRows}
                            empty="No rows in this period."
                            rich
                            showCallMeta
                            scope={scope}
                          />
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        ) : (
          <LedgerTable
            rows={ledgerRows}
            empty={`No ${ledgerMode} earnings yet in the current window.`}
            rich
            showCallMeta
            scope={scope}
          />
        )}
      </div>
    </div>
  );
};

export default EarningsPeriodDashboard;
