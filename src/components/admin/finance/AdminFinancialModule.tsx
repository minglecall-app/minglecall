/**
 * Admin Financial Module hub — amounts and settlement actions via /api/v1/finance only.
 * No client-side FX or settlement math.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Landmark,
  Building2,
  Users,
  Wallet,
  Banknote,
  CalendarClock,
  RefreshCw,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  Coins,
  LayoutDashboard,
} from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import {
  fetchFinanceAdminSummary,
  fetchFinanceBatch,
  fetchFinanceBatches,
  fetchCurrentFinancePeriod,
  fetchFinancePeriods,
  patchFinanceConfig,
  postAdminMarkBatchPaid,
  postCloseDuePeriods,
  fetchFinanceFunding,
  type CoinPurchaseRow,
  fetchFinanceLiveLedger,
  type LiveWalletLedgerRow,
  type LiveWalletLedgerAggregates,
  type FinanceAdminSummary,
  postSimulateGatewayPurchase,
} from '../../../services/financeApi';
import {
  labelSettlementComponent,
  summarizeHostSettlementLines,
} from '../../../../shared/finance/hostEarningsBreakdown';
import { HostPeriodEarningsBreakdown } from '../../finance/HostPeriodEarningsBreakdown';
import { EarningsPeriodDashboard } from '../../finance/EarningsPeriodDashboard';
import { AdminSalaryBatchesPage } from './AdminSalaryBatchesPage';

type FinanceHubTab =
  | 'overview'
  | 'salary_batches'
  | 'live_ledger'
  | 'platform'
  | 'team_leaders'
  | 'hosts'
  | 'funding'
  | 'batches'
  | 'settlement'
  | 'period';

const TABS: { id: FinanceHubTab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <LayoutDashboard className="w-3.5 h-3.5" /> },
  { id: 'salary_batches', label: 'Salary reconcile', icon: <Wallet className="w-3.5 h-3.5" /> },
  { id: 'live_ledger', label: 'Live ledger', icon: <Coins className="w-3.5 h-3.5" /> },
  { id: 'platform', label: 'Platform earnings', icon: <Landmark className="w-3.5 h-3.5" /> },
  { id: 'team_leaders', label: 'Agency earnings', icon: <Building2 className="w-3.5 h-3.5" /> },
  { id: 'hosts', label: 'Host earnings', icon: <Users className="w-3.5 h-3.5" /> },
  { id: 'funding', label: 'Funding / Purchases', icon: <Coins className="w-3.5 h-3.5" /> },
  { id: 'batches', label: 'Payout / settlement requests', icon: <Wallet className="w-3.5 h-3.5" /> },
  { id: 'settlement', label: 'Payment settlement', icon: <Banknote className="w-3.5 h-3.5" /> },
  { id: 'period', label: 'Period & close settings', icon: <CalendarClock className="w-3.5 h-3.5" /> },
];

function KpiCard(props: {
  label: string;
  value: string;
  hint?: string;
  valueClassName?: string;
}) {
  return (
    <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">{props.label}</div>
      <div className={`text-xl font-black mt-1 ${props.valueClassName || 'text-white'}`}>{props.value}</div>
      {props.hint ? <div className="text-[10px] text-slate-500 mt-1 font-mono">{props.hint}</div> : null}
    </div>
  );
}

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

interface AdminFinancialModuleProps {
  tab?: FinanceHubTab;
  onTabChange?: (tab: FinanceHubTab) => void;
  navPlacement?: 'inline' | 'sidebar';
}

export const AdminFinancialModule: React.FC<AdminFinancialModuleProps> = ({
  tab: tabProp,
  onTabChange,
  navPlacement = 'inline',
}) => {
  const { showToast, coinPackages, users } = useApp();
  const [tabInternal, setTabInternal] = useState<FinanceHubTab>('overview');
  const tab = tabProp ?? tabInternal;
  const setTab = (next: FinanceHubTab) => {
    onTabChange?.(next);
    if (tabProp === undefined) setTabInternal(next);
  };
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [summary, setSummary] = useState<FinanceAdminSummary | null>(null);
  const [periods, setPeriods] = useState<any[]>([]);
  const [currentPeriod, setCurrentPeriod] = useState<any>(null);
  const [batches, setBatches] = useState<any[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [batchDetail, setBatchDetail] = useState<any>(null);

  const [cycle, setCycle] = useState<'weekly' | 'monthly'>('weekly');
  const [closeTime, setCloseTime] = useState('00:00');
  const [settlementEnabled, setSettlementEnabled] = useState(true);
  const [payNote, setPayNote] = useState('');
  const [payRef, setPayRef] = useState('');
  const [busyAction, setBusyAction] = useState(false);
  const [fundingRows, setFundingRows] = useState<CoinPurchaseRow[]>([]);
  const [fundingChannel, setFundingChannel] = useState<'ALL' | 'ADMIN_MANUAL' | 'GATEWAY'>('ALL');
  const [fundingLoading, setFundingLoading] = useState(false);
  const [simUserId, setSimUserId] = useState('');
  const [simPackageId, setSimPackageId] = useState('');
  const [simBusy, setSimBusy] = useState(false);
  const [liveLedgerRows, setLiveLedgerRows] = useState<LiveWalletLedgerRow[]>([]);
  const [liveLedgerAgg, setLiveLedgerAgg] = useState<LiveWalletLedgerAggregates | null>(null);
  const [liveLedgerLoading, setLiveLedgerLoading] = useState(false);
  const [liveLedgerRefreshing, setLiveLedgerRefreshing] = useState(false);
  const [liveTypeFilter, setLiveTypeFilter] = useState<string>('ALL');
  /** Draft text filters — do not refetch on every keystroke */
  const [liveUserFilter, setLiveUserFilter] = useState('');
  const [liveCallFilter, setLiveCallFilter] = useState('');
  const [liveFromFilter, setLiveFromFilter] = useState('');
  const [liveToFilter, setLiveToFilter] = useState('');

  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;
  const liveLedgerRowsRef = useRef(liveLedgerRows);
  liveLedgerRowsRef.current = liveLedgerRows;
  const liveLedgerReqIdRef = useRef(0);

  const batchHostBreakdowns = useMemo(() => {
    const lines = (batchDetail?.lineItems || []).filter((li: any) => li.payeeRole === 'host');
    const byUser = new Map<string, any[]>();
    for (const li of lines) {
      const uid = String(li.payeeUserId || '');
      if (!uid) continue;
      const list = byUser.get(uid) || [];
      list.push(li);
      byUser.set(uid, list);
    }
    return Array.from(byUser.entries()).map(([userId, rows]) => ({
      userId,
      breakdown: summarizeHostSettlementLines(rows),
    }));
  }, [batchDetail]);
  /** Applied text filters for fetch (Refresh / Enter only) */
  const liveUserFilterAppliedRef = useRef('');
  const liveCallFilterAppliedRef = useRef('');

  const loadCore = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [sumRes, curRes, perRes, batchRes] = await Promise.all([
      fetchFinanceAdminSummary(),
      fetchCurrentFinancePeriod(),
      fetchFinancePeriods({ limit: 30 }),
      fetchFinanceBatches({ limit: 100 }),
    ]);
    if (!sumRes.success) setError(sumRes.error?.message || 'Failed to load summary');
    else setSummary(sumRes.data);

    if (curRes.success && curRes.data) {
      setCurrentPeriod(curRes.data);
      setCycle((curRes.data.config?.creatorTargetCycle as any) === 'monthly' ? 'monthly' : 'weekly');
      setCloseTime(curRes.data.config?.periodCloseUtcTime || '00:00');
      setSettlementEnabled(curRes.data.config?.settlementEnabled !== false);
    }
    if (perRes.success) setPeriods(perRes.data?.periods || []);
    if (batchRes.success) setBatches(batchRes.data?.batches || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadCore();
  }, [loadCore]);

  const loadFunding = useCallback(async () => {
    setFundingLoading(true);
    const res = await fetchFinanceFunding({
      channel: fundingChannel === 'ALL' ? '' : fundingChannel,
      limit: 200,
    });
    if (!res.success) {
      showToast('Funding load failed', res.error?.message || 'Error', 'error');
      setFundingRows([]);
    } else {
      setFundingRows(res.data?.purchases || []);
    }
    setFundingLoading(false);
  }, [fundingChannel, showToast]);

  const loadLiveLedger = useCallback(
    async (overrides?: { userId?: string; callId?: string }) => {
      const reqId = ++liveLedgerReqIdRef.current;
      const hasRows = liveLedgerRowsRef.current.length > 0;
      if (hasRows) {
        setLiveLedgerRefreshing(true);
      } else {
        setLiveLedgerLoading(true);
      }

      const userId =
        overrides && 'userId' in overrides
          ? overrides.userId?.trim() || undefined
          : liveUserFilterAppliedRef.current.trim() || undefined;
      const callId =
        overrides && 'callId' in overrides
          ? overrides.callId?.trim() || undefined
          : liveCallFilterAppliedRef.current.trim() || undefined;

      try {
        const res = await fetchFinanceLiveLedger({
          transactionType: liveTypeFilter === 'ALL' ? '' : liveTypeFilter,
          userId,
          callId,
          from: liveFromFilter ? `${liveFromFilter}T00:00:00.000Z` : undefined,
          to: liveToFilter ? `${liveToFilter}T23:59:59.999Z` : undefined,
          limit: 500,
        });
        if (reqId !== liveLedgerReqIdRef.current) return;

        if (!res.success || !res.data) {
          showToastRef.current('Live ledger load failed', res.error?.message || 'Error', 'error');
          if (!hasRows) {
            setLiveLedgerRows([]);
            setLiveLedgerAgg(null);
          }
        } else {
          setLiveLedgerRows(res.data.entries || []);
          setLiveLedgerAgg(res.data.aggregates || null);
        }
      } finally {
        if (reqId === liveLedgerReqIdRef.current) {
          setLiveLedgerLoading(false);
          setLiveLedgerRefreshing(false);
        }
      }
    },
    [liveTypeFilter, liveFromFilter, liveToFilter]
  );

  const applyLiveTextFiltersAndRefresh = useCallback(() => {
    const nextUser = liveUserFilter.trim();
    const nextCall = liveCallFilter.trim();
    liveUserFilterAppliedRef.current = nextUser;
    liveCallFilterAppliedRef.current = nextCall;
    void loadLiveLedger({ userId: nextUser, callId: nextCall });
  }, [liveUserFilter, liveCallFilter, loadLiveLedger]);

  useEffect(() => {
    if (tab === 'live_ledger') {
      void loadLiveLedger();
    }
    if (tab === 'funding') {
      void loadFunding();
    }
  }, [tab, loadFunding, loadLiveLedger]);

  useEffect(() => {
    if (!selectedBatchId) {
      setBatchDetail(null);
      return;
    }
    void (async () => {
      const res = await fetchFinanceBatch(selectedBatchId);
      if (res.success) setBatchDetail(res.data);
      else {
        setBatchDetail(null);
        showToast('Batch load failed', res.error?.message || 'Error', 'error');
      }
    })();
  }, [selectedBatchId, showToast]);

  const pendingBatches = useMemo(
    () => batches.filter((b) => b.status === 'pending_admin_pay'),
    [batches]
  );

  const tlBundles = useMemo(
    () => batches.filter((b) => b.batchKind === 'team_leader_bundle'),
    [batches]
  );

  const directHosts = useMemo(
    () => batches.filter((b) => b.batchKind === 'direct_host'),
    [batches]
  );

  const savePeriodSettings = async () => {
    setBusyAction(true);
    const res = await patchFinanceConfig({
      creatorTargetCycle: cycle,
      periodCloseUtcTime: closeTime,
      settlementEnabled,
    });
    setBusyAction(false);
    if (!res.success) {
      showToast('Config save failed', res.error?.message || 'Error', 'error');
      return;
    }
    showToast('Finance config saved', 'Cycle, UTC close time, and settlement switch updated.', 'success');
    await loadCore();
  };

  const runCloseJob = async () => {
    setBusyAction(true);
    const res = await postCloseDuePeriods({ includeFailedRetries: true });
    setBusyAction(false);
    if (!res.success) {
      showToast('Close job failed', res.error?.message || 'Error', 'error');
      return;
    }
    const closed = (res.data?.results || []).filter((r: any) => r.status === 'closed').length;
    const failed = (res.data?.results || []).filter((r: any) => r.status === 'failed').length;
    showToast(
      'Close job finished',
      `Closed: ${closed}. Failed: ${failed}.`,
      failed ? 'error' : 'success'
    );
    await loadCore();
  };

  const markPaid = async () => {
    if (!selectedBatchId) return;
    setBusyAction(true);
    const res = await postAdminMarkBatchPaid(selectedBatchId, {
      note: payNote || undefined,
      paymentReference: payRef || undefined,
    });
    setBusyAction(false);
    if (!res.success) {
      showToast('Mark paid failed', res.error?.message || 'Error', 'error');
      return;
    }
    showToast('Batch marked paid', 'Settlement event recorded via Finance API.', 'success');
    setPayNote('');
    setPayRef('');
    await loadCore();
    const detail = await fetchFinanceBatch(selectedBatchId);
    if (detail.success) setBatchDetail(detail.data);
  };

  const isEarningsTab = tab === 'platform' || tab === 'team_leaders' || tab === 'hosts';

  return (
    <div className="space-y-5">
      {!isEarningsTab ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => {
              void loadCore();
              if (tab === 'live_ledger') void applyLiveTextFiltersAndRefresh();
              if (tab === 'funding') void loadFunding();
            }}
            disabled={loading || busyAction || liveLedgerRefreshing}
            className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-xs font-bold flex items-center gap-2 hover:bg-slate-800 cursor-pointer disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Refresh
          </button>
        </div>
      ) : null}

      {error && (
        <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-700/50 text-rose-200 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {navPlacement !== 'sidebar' && (
        <div className="bg-[#12151F] border border-slate-800 rounded-2xl p-2 flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
                tab === t.id
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/40'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/70'
              }`}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      )}

      {tab === 'salary_batches' && <AdminSalaryBatchesPage />}

      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-white">Finance overview</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Live open-period accruals from wallet_ledger · settlement books from financial_ledger after close.
              </p>
            </div>
            <span className="text-[10px] font-mono text-slate-500">
              peg {Number(summary?.live?.coinUsdPeg ?? summary?.period?.coinUsdPeg ?? 0).toFixed(4)} · next close{' '}
              {formatWhen(summary?.live?.nextCloseAt || summary?.period?.nextCloseAt)}
            </span>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2">
              Live open period (wallet_ledger)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiCard
                label="Platform retained"
                value={formatUsd(summary?.live?.platformRetainedUsd)}
                hint={`${formatCoins(summary?.live?.platformRetainedCoins)} · open window`}
                valueClassName="text-amber-300"
              />
              <KpiCard
                label="Host accrued"
                value={formatUsd(summary?.live?.hostPayableUsd)}
                hint={`${formatCoins(summary?.live?.hostEarnCoins)} · HOST_EARN`}
                valueClassName="text-emerald-300"
              />
              <KpiCard
                label="Agency accrued"
                value={formatUsd(summary?.live?.tlPayableUsd)}
                hint={`${formatCoins(summary?.live?.tlEarnCoins)} · TL_EARN`}
                valueClassName="text-indigo-300"
              />
              <KpiCard
                label="Burn volume"
                value={formatUsd(
                  (Number(summary?.live?.callDebitUsd) || 0) + (Number(summary?.live?.giftDebitUsd) || 0)
                )}
                hint={`${formatCoins(
                  (Number(summary?.live?.callDebitCoins) || 0) + (Number(summary?.live?.giftDebitCoins) || 0)
                )} · CALL+GIFT debit`}
                valueClassName="text-cyan-300"
              />
            </div>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2">
              Funding (open period completed purchases)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiCard
                label="Coins funded"
                value={formatCoins(summary?.funding?.completedCoins)}
                hint={`${summary?.funding?.completedCount ?? 0} completed row(s)`}
                valueClassName="text-amber-300"
              />
              <KpiCard
                label="Cash paid"
                value={formatUsd(summary?.funding?.paidUsd)}
                hint="retail amount_usd"
                valueClassName="text-emerald-300"
              />
              <KpiCard
                label="Peg value"
                value={formatUsd(summary?.funding?.pegValueUsd)}
                hint="coins × peg snapshot"
                valueClassName="text-cyan-300"
              />
              <KpiCard
                label="Load margin"
                value={formatUsd(summary?.funding?.loadMarginUsd)}
                hint="paid − peg value"
                valueClassName={
                  (Number(summary?.funding?.loadMarginUsd) || 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'
                }
              />
            </div>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2">
              Settlement books
              {summary?.settlementPeriodStatus
                ? ` · ${summary.settlementPeriodStatus} period`
                : summary?.periodId
                  ? ''
                  : ' · no closed period yet'}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiCard
                label="Platform earned (closed)"
                value={formatUsd(summary?.platformEarnedUsd)}
                hint="financial_ledger PLATFORM_EARN"
                valueClassName="text-amber-300"
              />
              <KpiCard
                label="Host accrued (closed)"
                value={formatUsd(summary?.hostAccruedUsd)}
                hint="HOST_EARN + TRUEUP + BONUS"
                valueClassName="text-emerald-300"
              />
              <KpiCard
                label="Agency accrued (closed)"
                value={formatUsd(summary?.tlAccruedUsd)}
                hint="financial_ledger TL_EARN"
                valueClassName="text-indigo-300"
              />
              <KpiCard
                label="Batch due (period)"
                value={formatUsd(
                  (Number(summary?.totalDueToDirectHostsUsd) || 0) +
                    (Number(summary?.totalDueToTeamLeadersUsd) || 0)
                )}
                hint={`${directHosts.length} direct · ${tlBundles.length} TL bundle`}
                valueClassName="text-white"
              />
            </div>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2">
              Remittance queue (all periods)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiCard
                label="Outstanding due"
                value={formatUsd(summary?.remittanceAll?.outstandingDueUsd ?? summary?.outstandingDueUsd)}
                hint={`${summary?.remittanceAll?.outstandingBatchCount ?? summary?.outstandingBatchCount ?? 0} pending_admin_pay`}
                valueClassName="text-rose-300"
              />
              <KpiCard
                label="Direct host pending"
                value={String(summary?.remittanceAll?.directHostCount ?? directHosts.filter((b) => b.status === 'pending_admin_pay').length)}
                hint={formatUsd(summary?.totalDueToDirectHostsUsd)}
                valueClassName="text-emerald-300"
              />
              <KpiCard
                label="Agency bundle pending"
                value={String(summary?.remittanceAll?.tlBundleCount ?? tlBundles.filter((b) => b.status === 'pending_admin_pay').length)}
                hint={formatUsd(summary?.totalDueToTeamLeadersUsd)}
                valueClassName="text-indigo-300"
              />
              <KpiCard
                label="Settlement enabled"
                value={summary?.period?.settlementEnabled === false ? 'Off' : 'On'}
                hint={`${summary?.period?.cycleType || '—'} · close ${summary?.period?.periodCloseUtcTime || '—'}`}
                valueClassName={
                  summary?.period?.settlementEnabled === false ? 'text-rose-300' : 'text-emerald-300'
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="p-4 bg-[#161922] border border-slate-800 rounded-2xl space-y-2 text-xs font-mono">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold font-sans">
                Open period clock
              </div>
              <div className="flex justify-between gap-2 border-b border-slate-800 pb-2">
                <span className="text-slate-500">Start</span>
                <span className="text-white">{formatWhen(summary?.period?.periodStart || summary?.live?.periodStart)}</span>
              </div>
              <div className="flex justify-between gap-2 border-b border-slate-800 pb-2">
                <span className="text-slate-500">End (exclusive)</span>
                <span className="text-white">{formatWhen(summary?.period?.periodEnd || summary?.live?.periodEnd)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Open period id</span>
                <span className="text-slate-300 truncate max-w-[220px]">
                  {summary?.openPeriodId || summary?.live?.periodId || '—'}
                </span>
              </div>
            </div>
            <div className="p-4 bg-[#161922] border border-slate-800 rounded-2xl space-y-2 text-xs font-mono">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold font-sans">
                Settlement period in focus
              </div>
              <div className="flex justify-between gap-2 border-b border-slate-800 pb-2">
                <span className="text-slate-500">Status</span>
                <span className="text-white">{summary?.settlementPeriodStatus || '—'}</span>
              </div>
              <div className="flex justify-between gap-2 border-b border-slate-800 pb-2">
                <span className="text-slate-500">Period id</span>
                <span className="text-slate-300 truncate max-w-[220px]">{summary?.periodId || '—'}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Payable truth</span>
                <span className="text-emerald-300 truncate max-w-[220px]">
                  {summary?.payableSourceOfTruth || 'settlement_line_items'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'live_ledger' && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <KpiCard
              label="Platform retained (filter view)"
              value={formatCoins(
                liveLedgerAgg?.platformRetainedCoins ?? summary?.live?.platformRetainedCoins ?? 0
              )}
              hint={`${formatUsd(liveLedgerAgg?.platformRetainedUsd ?? summary?.live?.platformRetainedUsd ?? 0)}${
                (liveLedgerAgg?.coinUsdPeg ?? summary?.live?.coinUsdPeg) != null
                  ? ` · peg ${Number(liveLedgerAgg?.coinUsdPeg ?? summary?.live?.coinUsdPeg).toFixed(4)}`
                  : ''
              }`}
              valueClassName="text-amber-300"
            />
            <KpiCard
              label="Host earn (filter view)"
              value={formatCoins(liveLedgerAgg?.hostEarnCoins ?? summary?.live?.hostEarnCoins ?? 0)}
              hint={formatUsd(liveLedgerAgg?.hostPayableUsd ?? summary?.live?.hostPayableUsd ?? 0)}
              valueClassName="text-emerald-300"
            />
            <KpiCard
              label="Agency earn (filter view)"
              value={formatCoins(liveLedgerAgg?.tlEarnCoins ?? summary?.live?.tlEarnCoins ?? 0)}
              hint={formatUsd(liveLedgerAgg?.tlPayableUsd ?? summary?.live?.tlPayableUsd ?? 0)}
              valueClassName="text-indigo-300"
            />
          </div>

          <div className="bg-[#161922] border border-slate-800 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800 space-y-3">
              <div>
                <h3 className="text-sm font-bold text-white">Live wallet ledger</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Source of truth for PURCHASE, CALL_DEBIT, HOST_EARN, TL_EARN, TARGET_SHARE_TRUEUP, and
                  REWARD_*.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
                <select
                  value={liveTypeFilter}
                  onChange={(e) => setLiveTypeFilter(e.target.value)}
                  className="px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-[11px] font-mono text-slate-200"
                >
                  <option value="ALL">All types</option>
                  <option value="PURCHASE">PURCHASE</option>
                  <option value="CALL_DEBIT">CALL_DEBIT</option>
                  <option value="GIFT_DEBIT">GIFT_DEBIT</option>
                  <option value="HOST_EARN">HOST_EARN</option>
                  <option value="TL_EARN">TL_EARN</option>
                  <option value="TARGET_SHARE_TRUEUP">TARGET_SHARE_TRUEUP</option>
                  <option value="REWARD_STREAK">REWARD_STREAK</option>
                  <option value="REWARD_MISSION">REWARD_MISSION</option>
                  <option value="REWARD_MASTER_CHEST">REWARD_MASTER_CHEST</option>
                </select>
                <input
                  value={liveUserFilter}
                  onChange={(e) => setLiveUserFilter(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      applyLiveTextFiltersAndRefresh();
                    }
                  }}
                  placeholder="User id (Enter / Refresh)"
                  className="px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-[11px] font-mono text-slate-200"
                />
                <input
                  value={liveCallFilter}
                  onChange={(e) => setLiveCallFilter(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      applyLiveTextFiltersAndRefresh();
                    }
                  }}
                  placeholder="Call id (Enter / Refresh)"
                  className="px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-[11px] font-mono text-slate-200"
                />
                <input
                  type="date"
                  value={liveFromFilter}
                  onChange={(e) => setLiveFromFilter(e.target.value)}
                  className="px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-[11px] font-mono text-slate-200"
                />
                <input
                  type="date"
                  value={liveToFilter}
                  onChange={(e) => setLiveToFilter(e.target.value)}
                  className="px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-[11px] font-mono text-slate-200"
                />
                <button
                  type="button"
                  onClick={() => applyLiveTextFiltersAndRefresh()}
                  disabled={liveLedgerLoading || liveLedgerRefreshing}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-[11px] font-bold text-slate-200 flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  {liveLedgerLoading || liveLedgerRefreshing ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3 h-3" />
                  )}
                  Refresh
                </button>
              </div>
            </div>

            <div className="overflow-x-auto max-h-[500px] relative">
              {liveLedgerRefreshing && (
                <div className="absolute inset-0 z-10 pointer-events-none bg-slate-950/20" aria-hidden />
              )}
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 text-slate-400 sticky top-0">
                  <tr>
                    <th className="p-3 font-mono">Date</th>
                    <th className="p-3 font-mono">Type</th>
                    <th className="p-3 font-mono">User</th>
                    <th className="p-3 font-mono">Call</th>
                    <th className="p-3 font-mono">Coins</th>
                    <th className="p-3 font-mono">Balance after</th>
                    <th className="p-3 font-mono">Minute</th>
                  </tr>
                </thead>
                <tbody>
                  {liveLedgerLoading && liveLedgerRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-500">
                        <Loader2 className="w-5 h-5 animate-spin inline-block mr-2" />
                        Loading ledger rows…
                      </td>
                    </tr>
                  ) : liveLedgerRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-500 font-mono">
                        No live wallet_ledger rows for this filter.
                      </td>
                    </tr>
                  ) : (
                    liveLedgerRows.map((row) => (
                      <tr key={row.id} className="border-t border-slate-800/80 hover:bg-slate-900/40">
                        <td className="p-3 font-mono text-slate-400 whitespace-nowrap">{formatWhen(row.createdAt)}</td>
                        <td className="p-3 font-mono text-amber-300">{row.transactionType}</td>
                        <td className="p-3 font-mono text-slate-300">
                          <div className="truncate max-w-[150px]">{row.userName || row.userId}</div>
                          <div className="text-[10px] text-slate-500 truncate max-w-[150px]">{row.userEmail || row.userId}</div>
                        </td>
                        <td className="p-3 font-mono text-slate-500 truncate max-w-[140px]" title={row.callId || ''}>
                          {row.callId ? `${row.callId.slice(0, 8)}…` : '—'}
                        </td>
                        <td className="p-3 font-mono text-white">{formatCoins(row.amountCoins)}</td>
                        <td className="p-3 font-mono text-emerald-400">{formatCoins(row.balanceAfter)}</td>
                        <td className="p-3 font-mono text-slate-500">{row.billingMinute || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              <p className="px-3 py-2 text-[10px] text-slate-500 border-t border-slate-800">
                Ops detail: one wallet_ledger event per row (per billed minute / gift). Earnings tabs
                use call-composite rows instead.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Funding / Purchases — wallet_ledger PURCHASE + coin_purchases */}
      {tab === 'funding' && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard
              label="Coins funded (open period)"
              value={formatCoins(summary?.funding?.completedCoins)}
              hint={`${summary?.funding?.completedCount ?? 0} completed`}
              valueClassName="text-amber-300"
            />
            <KpiCard
              label="Cash paid"
              value={formatUsd(summary?.funding?.paidUsd)}
              hint="completed amount_usd"
              valueClassName="text-emerald-300"
            />
            <KpiCard
              label="Peg value"
              value={formatUsd(summary?.funding?.pegValueUsd)}
              hint="coins × peg"
              valueClassName="text-cyan-300"
            />
            <KpiCard
              label="Load margin"
              value={formatUsd(summary?.funding?.loadMarginUsd)}
              hint="paid − peg value"
              valueClassName={
                (Number(summary?.funding?.loadMarginUsd) || 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'
              }
            />
          </div>
          <div className="bg-[#161922] border border-indigo-900/40 rounded-2xl px-4 py-3">
              <div className="text-xs font-bold text-indigo-200">Simulate GATEWAY purchase (non-production)</div>
              <p className="text-[10px] text-slate-500 mt-1 font-mono">
                createCheckoutIntent → completeCoinPurchase(GATEWAY) — same completer as admin-credit and the webhook stub.
                Server rejects this route when NODE_ENV=production.
              </p>
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1 min-w-[160px]">
                  <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">User</span>
                  <select
                    value={simUserId}
                    onChange={(e) => setSimUserId(e.target.value)}
                    className="px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-[11px] font-mono text-slate-200 max-w-[220px]"
                  >
                    <option value="">Select user…</option>
                    {(users || []).slice(0, 200).map((u: any) => (
                      <option key={u.id} value={u.id}>
                        {u.name || u.email || u.id}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 min-w-[160px]">
                  <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Package SKU</span>
                  <select
                    value={simPackageId}
                    onChange={(e) => setSimPackageId(e.target.value)}
                    className="px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-[11px] font-mono text-slate-200 max-w-[260px]"
                  >
                    <option value="">Select package…</option>
                    {(coinPackages || []).map((pkg) => {
                      const pay =
                        pkg.discountPriceUSD != null && Number.isFinite(Number(pkg.discountPriceUSD))
                          ? Number(pkg.discountPriceUSD)
                          : Number(pkg.priceUSD) || 0;
                      return (
                      <option key={pkg.id} value={pkg.id}>
                        {pkg.title || pkg.id} · {(Number(pkg.coins) || 0) + (Number(pkg.bonusCoins) || 0)}🪙 · $
                        {pay}
                      </option>
                      );
                    })}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={simBusy || !simUserId || !simPackageId}
                  onClick={async () => {
                    setSimBusy(true);
                    const res = await postSimulateGatewayPurchase({
                      userId: simUserId,
                      packageId: simPackageId,
                    });
                    setSimBusy(false);
                    if (!res.success) {
                      showToast('Simulate failed', res.error?.message || 'Error', 'error');
                      return;
                    }
                    showToast(
                      'GATEWAY purchase completed',
                      `${formatCoins(res.data?.purchase?.amountCoins)} credited`,
                      'success'
                    );
                    setFundingChannel('GATEWAY');
                    void loadFunding();
                  }}
                  className="px-3 py-1.5 rounded-lg bg-indigo-950 border border-indigo-700 text-[11px] font-bold text-indigo-100 flex items-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  {simBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Coins className="w-3 h-3" />}
                  Run simulate
                </button>
              </div>
            </div>

          <div className="bg-[#161922] border border-slate-800 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white">Funding / Purchases</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Paid USD = retail cash. Peg value / load margin = coins × peg snapshot vs paid
                  (package price is not forced to coins×peg).
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={fundingChannel}
                  onChange={(e) => setFundingChannel(e.target.value as typeof fundingChannel)}
                  className="px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-[11px] font-mono text-slate-200"
                >
                  <option value="ALL">All channels</option>
                  <option value="ADMIN_MANUAL">ADMIN_MANUAL</option>
                  <option value="GATEWAY">GATEWAY</option>
                </select>
                <button
                  type="button"
                  onClick={() => void loadFunding()}
                  disabled={fundingLoading}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-[11px] font-bold text-slate-200 flex items-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  {fundingLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  Refresh
                </button>
              </div>
            </div>
            <div className="overflow-x-auto max-h-[480px]">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 text-slate-400 sticky top-0">
                  <tr>
                    <th className="p-3 font-mono">Date</th>
                    <th className="p-3 font-mono">User</th>
                    <th className="p-3 font-mono">Coins</th>
                    <th className="p-3 font-mono">Paid USD</th>
                    <th className="p-3 font-mono">Peg value</th>
                    <th className="p-3 font-mono">Load margin</th>
                    <th className="p-3 font-mono">Channel</th>
                    <th className="p-3 font-mono">Status</th>
                    <th className="p-3 font-mono">Admin / provider ref</th>
                    <th className="p-3 font-mono">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {fundingLoading ? (
                    <tr>
                      <td colSpan={10} className="p-8 text-center text-slate-500">
                        <Loader2 className="w-5 h-5 animate-spin inline-block mr-2" />
                        Loading purchases…
                      </td>
                    </tr>
                  ) : fundingRows.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="p-8 text-center text-slate-500 font-mono text-[11px] leading-relaxed">
                        {fundingChannel === 'GATEWAY' ? (
                          <>
                            No GATEWAY rows yet.
                            <br />
                            Use Simulate above, or POST /api/v1/finance/funding/checkout-intent then
                            /funding/webhook/provider.
                          </>
                        ) : fundingChannel === 'ADMIN_MANUAL' ? (
                          <>No ADMIN_MANUAL credits yet. Use Manual Coin Credit — posts completed PURCHASE via completeCoinPurchase.</>
                        ) : (
                          <>
                            No PURCHASE funding rows yet.
                            <br />
                            Admin credits → ADMIN_MANUAL · Gateway checkout/webhook → GATEWAY (same completer).
                          </>
                        )}
                      </td>
                    </tr>
                  ) : (
                    fundingRows.map((row) => (
                      <tr key={row.id} className="border-t border-slate-800/80 hover:bg-slate-900/40">
                        <td className="p-3 font-mono text-slate-400 whitespace-nowrap">
                          {formatWhen(row.completedAt || row.createdAt)}
                        </td>
                        <td className="p-3 font-mono text-slate-300">
                          <div className="truncate max-w-[140px]">{row.userName || row.userId}</div>
                          <div className="text-[10px] text-slate-500 truncate max-w-[140px]">
                            {row.userEmail || row.userId}
                          </div>
                        </td>
                        <td className="p-3 font-mono text-amber-300">{formatCoins(row.amountCoins)}</td>
                        <td className="p-3 font-mono text-emerald-400">
                          {row.amountUsd != null ? formatUsd(row.amountUsd) : '—'}
                        </td>
                        <td className="p-3 font-mono text-cyan-300">
                          {row.pegValueUsd != null ? formatUsd(row.pegValueUsd) : '—'}
                          {row.coinUsdPegAtPurchase != null ? (
                            <div className="text-[9px] text-slate-500">
                              @{Number(row.coinUsdPegAtPurchase).toFixed(4)}/🪙
                            </div>
                          ) : null}
                        </td>
                        <td
                          className={`p-3 font-mono font-bold ${
                            row.loadMarginUsd == null
                              ? 'text-slate-500'
                              : row.loadMarginUsd >= 0
                                ? 'text-emerald-400'
                                : 'text-rose-400'
                          }`}
                        >
                          {row.loadMarginUsd != null
                            ? `${row.loadMarginUsd >= 0 ? '+' : ''}${formatUsd(row.loadMarginUsd)}`
                            : '—'}
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded font-mono text-[10px] border ${
                              row.channel === 'GATEWAY'
                                ? 'bg-indigo-950/50 border-indigo-700/50 text-indigo-300'
                                : 'bg-amber-950/40 border-amber-700/40 text-amber-300'
                            }`}
                          >
                            {row.channel}
                          </span>
                        </td>
                        <td className="p-3 font-mono text-[10px] text-slate-400">{row.status || '—'}</td>
                        <td className="p-3 font-mono text-slate-400 text-[10px] truncate max-w-[160px]">
                          {row.channel === 'ADMIN_MANUAL'
                            ? row.actorAdminId || '—'
                            : row.externalRef || row.paymentProvider || '—'}
                        </td>
                        <td className="p-3 font-mono text-slate-400 text-[10px] truncate max-w-[200px]">
                          {row.reason || '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Platform / TL / Host earnings — week·month·lifetime KPI + ledger */}
      {tab === 'platform' && <EarningsPeriodDashboard scope="platform" accent="amber" />}
      {tab === 'team_leaders' && <EarningsPeriodDashboard scope="tl" accent="indigo" />}
      {tab === 'hosts' && <EarningsPeriodDashboard scope="host" accent="emerald" />}

      {/* Batches queue */}
      {tab === 'batches' && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard
              label="Outstanding due"
              value={formatUsd(summary?.remittanceAll?.outstandingDueUsd ?? summary?.outstandingDueUsd)}
              hint={`${summary?.remittanceAll?.outstandingBatchCount ?? summary?.outstandingBatchCount ?? 0} pending_admin_pay`}
              valueClassName="text-rose-300"
            />
            <KpiCard
              label="Direct host batches"
              value={String(directHosts.length)}
              hint={formatUsd(summary?.totalDueToDirectHostsUsd)}
              valueClassName="text-emerald-300"
            />
            <KpiCard
              label="Agency bundle batches"
              value={String(tlBundles.length)}
              hint={formatUsd(summary?.totalDueToTeamLeadersUsd)}
              valueClassName="text-indigo-300"
            />
            <KpiCard
              label="Loaded rows"
              value={String(batches.length)}
              hint={`paid ${summary?.batchCountsByStatus?.admin_paid ?? 0} · confirmed ${summary?.batchCountsByStatus?.tl_confirmed ?? 0}`}
            />
          </div>
        <div className="bg-[#161922] border border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800">
            <h3 className="text-sm font-bold text-white">Settlement batches (payable queue)</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              One Agency bundle = Agency commission + managed host salaries. Direct hosts are separate batches.
            </p>
          </div>
          <div className="overflow-x-auto max-h-[480px]">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 sticky top-0">
                <tr>
                  <th className="p-3">Kind</th>
                  <th className="p-3">Payee</th>
                  <th className="p-3">Host salary</th>
                  <th className="p-3">Agency commission</th>
                  <th className="p-3">Total due</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Created</th>
                </tr>
              </thead>
              <tbody>
                {batches.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-slate-500">
                      No settlement batches yet. Run period close when due.
                    </td>
                  </tr>
                ) : (
                  batches.map((b) => (
                    <tr
                      key={b.id}
                      className="border-t border-slate-800/80 hover:bg-slate-900/50 cursor-pointer"
                      onClick={() => {
                        setSelectedBatchId(b.id);
                        setTab('settlement');
                      }}
                    >
                      <td className="p-3 font-mono text-indigo-300">{b.batchKind}</td>
                      <td className="p-3 font-mono text-slate-300 truncate max-w-[120px]">{b.payeeUserId}</td>
                      <td className="p-3 font-mono text-white">{formatUsd(b.totalHostSalaryUsd)}</td>
                      <td className="p-3 font-mono text-white">{formatUsd(b.totalTlCommissionUsd)}</td>
                      <td className="p-3 font-mono font-bold text-emerald-400">{formatUsd(b.totalDueUsd)}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 font-mono text-[10px]">
                          {b.status}
                        </span>
                      </td>
                      <td className="p-3 font-mono text-slate-500 whitespace-nowrap">{formatWhen(b.createdAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        </div>
      )}

      {/* Payment settlement workspace */}
      {tab === 'settlement' && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <KpiCard
              label="Pending remittance"
              value={formatUsd(
                pendingBatches.reduce((s, b) => s + (Number(b.totalDueUsd) || 0), 0)
              )}
              hint={`${pendingBatches.length} pending_admin_pay in loaded list`}
              valueClassName="text-rose-300"
            />
            <KpiCard
              label="All-period outstanding"
              value={formatUsd(summary?.remittanceAll?.outstandingDueUsd)}
              hint={`${summary?.remittanceAll?.outstandingBatchCount ?? 0} batches`}
              valueClassName="text-rose-200"
            />
            <KpiCard
              label="Selected batch"
              value={selectedBatchId ? formatUsd(batchDetail?.batch?.totalDueUsd) : '—'}
              hint={selectedBatchId ? batchDetail?.batch?.status || 'loading…' : 'pick a batch'}
              valueClassName="text-emerald-300"
            />
          </div>
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
          <div className="xl:col-span-2 bg-[#161922] border border-slate-800 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white">Pending remittance</h3>
              <p className="text-[11px] text-slate-500">{pendingBatches.length} pending_admin_pay</p>
            </div>
            <div className="max-h-[420px] overflow-y-auto divide-y divide-slate-800/80">
              {pendingBatches.length === 0 ? (
                <div className="p-6 text-center text-slate-500 text-xs">No pending batches.</div>
              ) : (
                pendingBatches.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setSelectedBatchId(b.id)}
                    className={`w-full text-left p-3 hover:bg-slate-900/60 cursor-pointer ${
                      selectedBatchId === b.id ? 'bg-emerald-950/30 border-l-2 border-emerald-500' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-mono text-indigo-300">{b.batchKind}</span>
                      <span className="text-xs font-black text-emerald-400">{formatUsd(b.totalDueUsd)}</span>
                    </div>
                    <div className="text-[11px] font-mono text-slate-400 mt-1 truncate">{b.payeeUserId}</div>
                    <div className="text-[10px] text-slate-500 mt-1">
                      Hosts {formatUsd(b.totalHostSalaryUsd)} · TL {formatUsd(b.totalTlCommissionUsd)}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="xl:col-span-3 bg-[#161922] border border-slate-800 rounded-2xl p-4 space-y-4">
            {!selectedBatchId || !batchDetail ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                Select a batch to review line items and mark paid.
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-white">Settlement workspace</h3>
                    <p className="text-[11px] font-mono text-slate-500 mt-0.5">{batchDetail.batch?.id}</p>
                  </div>
                  <span className="px-2 py-1 rounded bg-slate-950 border border-slate-700 text-[10px] font-mono">
                    {batchDetail.batch?.status}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="text-slate-500">Host salaries</div>
                    <div className="font-black text-white mt-1">{formatUsd(batchDetail.batch?.totalHostSalaryUsd)}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="text-slate-500">Agency commission</div>
                    <div className="font-black text-white mt-1">{formatUsd(batchDetail.batch?.totalTlCommissionUsd)}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-700/40">
                    <div className="text-emerald-400/80">Admin remits</div>
                    <div className="font-black text-emerald-300 mt-1">{formatUsd(batchDetail.batch?.totalDueUsd)}</div>
                  </div>
                </div>

                {batchHostBreakdowns.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {batchHostBreakdowns.map(({ userId, breakdown }) => {
                      const u = users.find((x) => x.id === userId);
                      return (
                        <HostPeriodEarningsBreakdown
                          key={userId}
                          breakdown={breakdown}
                          compact
                          title={u?.name || 'Host payee'}
                          subtitle={`${userId.slice(0, 8)}… · settlement line items`}
                        />
                      );
                    })}
                  </div>
                )}

                <div className="overflow-x-auto max-h-[220px] rounded-xl border border-slate-800">
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-slate-950 text-slate-400">
                      <tr>
                        <th className="p-2">Payee</th>
                        <th className="p-2">Role</th>
                        <th className="p-2">Component</th>
                        <th className="p-2">USD</th>
                        <th className="p-2">Host status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(batchDetail.lineItems || []).map((li: any) => (
                        <tr key={li.id} className="border-t border-slate-800/80">
                          <td className="p-2 font-mono truncate max-w-[100px]">{li.payeeUserId}</td>
                          <td className="p-2 font-mono">{li.payeeRole}</td>
                          <td className="p-2 font-mono text-amber-300" title={li.component}>
                            {labelSettlementComponent(String(li.component || ''))}
                          </td>
                          <td className="p-2 font-mono text-emerald-400">{formatUsd(li.amountUsd)}</td>
                          <td className="p-2 font-mono">{li.hostSalaryStatus}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {batchDetail.batch?.status === 'pending_admin_pay' && (
                  <div className="space-y-2 border-t border-slate-800 pt-3">
                    <input
                      value={payRef}
                      onChange={(e) => setPayRef(e.target.value)}
                      placeholder="Payment reference"
                      className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs font-mono"
                    />
                    <input
                      value={payNote}
                      onChange={(e) => setPayNote(e.target.value)}
                      placeholder="Admin note"
                      className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs"
                    />
                    <button
                      type="button"
                      disabled={busyAction}
                      onClick={() => void markPaid()}
                      className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 text-xs font-black flex items-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {busyAction ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                      Mark admin paid
                    </button>
                    <p className="text-[10px] text-slate-500">
                      Direct hosts → salary paid now. TL bundles → hosts paid after TL confirms received.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        </div>
      )}

      {/* Period & close settings */}
      {tab === 'period' && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard
              label="Cycle"
              value={String(summary?.period?.cycleType || currentPeriod?.config?.creatorTargetCycle || '—')}
              hint={`close ${summary?.period?.periodCloseUtcTime || closeTime} UTC`}
              valueClassName="text-indigo-300"
            />
            <KpiCard
              label="Next close"
              value={formatWhen(summary?.period?.nextCloseAt || currentPeriod?.nextCloseAt)}
              hint="period_end @ close clock"
              valueClassName="text-emerald-300"
            />
            <KpiCard
              label="Coin USD peg"
              value={Number(summary?.period?.coinUsdPeg ?? 0).toFixed(4)}
              hint="Fixed Peg"
              valueClassName="text-amber-300"
            />
            <KpiCard
              label="Settlement"
              value={summary?.period?.settlementEnabled === false ? 'Off' : 'On'}
              hint={summary?.openPeriodId ? `open ${String(summary.openPeriodId).slice(0, 8)}…` : 'no open period'}
              valueClassName={
                summary?.period?.settlementEnabled === false ? 'text-rose-300' : 'text-emerald-300'
              }
            />
          </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="p-5 bg-[#161922] border border-slate-800 rounded-2xl space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-indigo-400" />
              Period & close settings
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <label className={`p-3 rounded-xl border cursor-pointer ${cycle === 'weekly' ? 'border-indigo-500 bg-indigo-950/40' : 'border-slate-800 bg-slate-950'}`}>
                <input
                  type="radio"
                  className="mr-2 accent-indigo-500"
                  checked={cycle === 'weekly'}
                  onChange={() => setCycle('weekly')}
                />
                <span className="text-xs font-bold text-white">Weekly</span>
                <div className="text-[10px] text-slate-400 mt-1">Mon 00:00 UTC → next Mon 00:00 UTC</div>
              </label>
              <label className={`p-3 rounded-xl border cursor-pointer ${cycle === 'monthly' ? 'border-indigo-500 bg-indigo-950/40' : 'border-slate-800 bg-slate-950'}`}>
                <input
                  type="radio"
                  className="mr-2 accent-indigo-500"
                  checked={cycle === 'monthly'}
                  onChange={() => setCycle('monthly')}
                />
                <span className="text-xs font-bold text-white">Monthly</span>
                <div className="text-[10px] text-slate-400 mt-1">1st 00:00 UTC → next 1st 00:00 UTC</div>
              </label>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1">UTC close time (HH:mm)</label>
              <input
                value={closeTime}
                onChange={(e) => setCloseTime(e.target.value)}
                placeholder="00:00"
                className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-sm"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                close_scheduled_at = period_end calendar date at this UTC clock.
              </p>
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={settlementEnabled}
                onChange={(e) => setSettlementEnabled(e.target.checked)}
                className="accent-emerald-500"
              />
              Settlement enabled (period-end payouts)
            </label>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busyAction}
                onClick={() => void savePeriodSettings()}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                Save finance config
              </button>
              <button
                type="button"
                disabled={busyAction}
                onClick={() => void runCloseJob()}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black cursor-pointer disabled:opacity-50"
              >
                Run close-due-periods job
              </button>
            </div>
          </div>

          <div className="p-5 bg-[#161922] border border-slate-800 rounded-2xl space-y-3">
            <h3 className="text-sm font-bold text-white">Current window (from API)</h3>
            <div className="space-y-2 text-xs font-mono">
              <div className="flex justify-between gap-2 border-b border-slate-800 pb-2">
                <span className="text-slate-500">Cycle</span>
                <span className="text-white">{currentPeriod?.config?.creatorTargetCycle || '—'}</span>
              </div>
              <div className="flex justify-between gap-2 border-b border-slate-800 pb-2">
                <span className="text-slate-500">Period start</span>
                <span className="text-white">{formatWhen(currentPeriod?.bounds?.periodStart)}</span>
              </div>
              <div className="flex justify-between gap-2 border-b border-slate-800 pb-2">
                <span className="text-slate-500">Period end (exclusive)</span>
                <span className="text-white">{formatWhen(currentPeriod?.bounds?.periodEnd)}</span>
              </div>
              <div className="flex justify-between gap-2 border-b border-slate-800 pb-2">
                <span className="text-slate-500">Next close</span>
                <span className="text-emerald-300 font-bold">{formatWhen(currentPeriod?.nextCloseAt)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Open period id</span>
                <span className="text-slate-300 truncate max-w-[180px]">{currentPeriod?.period?.id || '—'}</span>
              </div>
            </div>

            <div className="pt-2">
              <h4 className="text-xs font-bold text-slate-300 mb-2">Recent periods</h4>
              <div className="max-h-[180px] overflow-y-auto space-y-1">
                {periods.slice(0, 12).map((p) => (
                  <div key={p.id} className="text-[10px] font-mono flex justify-between gap-2 text-slate-400 bg-slate-950/60 rounded-lg px-2 py-1.5">
                    <span className="truncate">{p.cycleType} · {p.status}</span>
                    <span className="shrink-0">{formatWhen(p.closeScheduledAt)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        </div>
      )}
    </div>
  );
};
