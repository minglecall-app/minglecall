/**
 * Admin Salary Batches — one record per closed week/month.
 * View salaries grouped by TL+hosts, export Excel/PDF, whole-period Salary Paid.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Wallet,
  RefreshCw,
  Loader2,
  AlertTriangle,
  Eye,
  FileSpreadsheet,
  FileText,
  CheckCircle2,
  X,
  Users,
  Building2,
} from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import {
  downloadSalaryPeriodExport,
  fetchAdminSalaryEstimatePreview,
  fetchSalaryPeriodDetail,
  fetchSalaryPeriods,
  postAdminReconcileBatch,
  postSalaryPeriodMarkPaid,
  type SalaryPeriodDetail,
  type SalaryPeriodListItem,
  type SalaryPayeeRow,
} from '../../../services/financeApi';
import { summarizeHostSettlementLines } from '../../../../shared/finance/hostEarningsBreakdown';
import { SalaryEstimatePreviewModal } from '../../finance/SalaryEstimatePreviewModal';

function formatUsd(n: number | undefined | null) {
  const v = Number(n) || 0;
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
}

function payeeComponentCells(payee: SalaryPayeeRow) {
  if (payee.role === 'team_leader') {
    return {
      call: formatUsd(payee.amountUsd),
      gift: '—',
      trueUp: '—',
      tierBonus: '—',
    };
  }
  const b = summarizeHostSettlementLines(payee.components || []);
  return {
    call: formatUsd(b.callEarningsUsd),
    gift: formatUsd(b.giftEarningsUsd),
    trueUp: formatUsd(b.targetShareTrueUpUsd),
    tierBonus: formatUsd(b.targetBonusUsd),
  };
}

function formatWhen(iso: string | null | undefined) {
  if (!iso) return '—';
  try {
    return new Date(iso).toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
  } catch {
    return String(iso);
  }
}

function formatWindow(start: string | null | undefined, end: string | null | undefined) {
  if (!start || !end) return '—';
  try {
    return `${new Date(start).toISOString().slice(0, 10)} → ${new Date(end).toISOString().slice(0, 10)} UTC`;
  } catch {
    return '—';
  }
}

function ackBadge(status: string) {
  if (status === 'acknowledged') {
    return 'bg-emerald-950/50 border-emerald-700/50 text-emerald-300';
  }
  if (status === 'admin_paid') {
    return 'bg-amber-950/40 border-amber-700/40 text-amber-300';
  }
  return 'bg-slate-900 border-slate-700 text-slate-400';
}

function reconcileBadge(status: string | undefined) {
  if (status === 'reconciled') {
    return 'bg-sky-950/50 border-sky-700/50 text-sky-300';
  }
  return 'bg-rose-950/40 border-rose-700/40 text-rose-300';
}

function ackLabel(status: string) {
  if (status === 'acknowledged') return 'Received';
  if (status === 'admin_paid') return 'Salary Paid';
  return 'Unpaid';
}

function PayoutCell({ payee }: { payee: SalaryPayeeRow }) {
  const p = payee.payout;
  if (!p) {
    return <span className="text-[10px] text-rose-400/80 font-mono">No payout card</span>;
  }
  return (
    <div className="max-w-[240px]" title={p.summary}>
      <div className="text-[10px] font-bold text-slate-200">
        {p.methodLabel}
        <span className="text-slate-500 font-mono"> · {p.countryCode || '—'}</span>
        {p.isPrimary ? (
          <span className="ml-1 text-[9px] text-amber-300/90">PRIMARY</span>
        ) : null}
      </div>
      <div className="text-[10px] text-slate-400 break-all leading-snug line-clamp-3">
        {Object.entries(p.details)
          .map(([k, v]) => `${k}: ${v}`)
          .join(' · ') || p.summary}
      </div>
    </div>
  );
}

export const AdminSalaryBatchesPage: React.FC = () => {
  const { showToast } = useApp();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [periods, setPeriods] = useState<SalaryPeriodListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SalaryPeriodDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [payRef, setPayRef] = useState('');
  const [payNote, setPayNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [estimateOpen, setEstimateOpen] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetchSalaryPeriods({ limit: 40 });
    setLoading(false);
    if (!res.success) {
      setError(res.error?.message || 'Failed to load salary periods');
      setPeriods([]);
      return;
    }
    setPeriods(res.data?.periods || []);
  }, []);

  const loadDetail = useCallback(
    async (periodId: string) => {
      setDetailLoading(true);
      const res = await fetchSalaryPeriodDetail(periodId);
      setDetailLoading(false);
      if (!res.success || !res.data) {
        showToast('Salary detail failed', res.error?.message || 'Error', 'error');
        setDetail(null);
        return;
      }
      setDetail(res.data);
    },
    [showToast]
  );

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  const openView = (periodId: string) => {
    setPayRef('');
    setPayNote('');
    setSelectedId(periodId);
  };

  const reconcileBatch = async (batchId: string) => {
    setBusy(true);
    const res = await postAdminReconcileBatch(batchId);
    setBusy(false);
    if (!res.success) {
      showToast('Reconcile failed', res.error?.message || 'Error', 'error');
      return;
    }
    showToast(
      'Reconciled',
      res.data?.alreadyReconciled ? 'Batch was already reconciled.' : 'Amounts confirmed.',
      'success'
    );
    if (selectedId) await loadDetail(selectedId);
    await loadList();
  };

  const markPaid = async () => {
    if (!selectedId) return;
    setBusy(true);
    const res = await postSalaryPeriodMarkPaid(selectedId, {
      note: payNote || undefined,
      paymentReference: payRef || undefined,
    });
    setBusy(false);
    if (!res.success) {
      showToast('Remit failed', res.error?.message || 'Error', 'error');
      return;
    }
    showToast(
      'Admin remittance',
      res.data?.alreadyPaid
        ? 'Reconciled batches were already remitted.'
        : `Remitted ${res.data?.batchesUpdated ?? 0} batch(es). Agency marks host salaries next.`,
      'success'
    );
    if (res.data?.detail) setDetail(res.data.detail);
    else await loadDetail(selectedId);
    await loadList();
  };

  const exportFile = async (format: 'xlsx' | 'pdf') => {
    if (!selectedId) return;
    setBusy(true);
    const res = await downloadSalaryPeriodExport(selectedId, format);
    setBusy(false);
    if (!res.success) {
      showToast('Export failed', res.error?.message || 'Error', 'error');
      return;
    }
    showToast('Export ready', res.data?.filename || format.toUpperCase(), 'success');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Wallet className="w-4 h-4 text-emerald-400" />
            Salary batches
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Salary reconcile → Admin remits Agency bundles (or pays direct hosts) → Agency marks host
            salaries paid → Hosts acknowledge. Badges show reconciled / unpaid / paid / received.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setEstimateOpen(true)}
            className="px-3 py-2 rounded-xl bg-emerald-950/50 border border-emerald-700/50 text-emerald-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <Eye className="w-3.5 h-3.5" />
            Preview estimated salaries
          </button>
          <button
            type="button"
            onClick={() => void loadList()}
            disabled={loading}
            className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Refresh
          </button>
        </div>
      </div>

      <SalaryEstimatePreviewModal
        open={estimateOpen}
        onClose={() => setEstimateOpen(false)}
        variant="admin"
        load={fetchAdminSalaryEstimatePreview}
      />

      {error && (
        <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-700/50 text-rose-200 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="bg-[#161922] border border-slate-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto max-h-[520px]">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 sticky top-0">
              <tr>
                <th className="p-3 font-mono">Period</th>
                <th className="p-3 font-mono">Cycle</th>
                <th className="p-3 font-mono">Total due</th>
                <th className="p-3 font-mono">Outstanding</th>
                <th className="p-3 font-mono">Ack</th>
                <th className="p-3 font-mono">Reconcile</th>
                <th className="p-3 font-mono">Batches</th>
                <th className="p-3 font-mono">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && periods.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-500">
                    <Loader2 className="w-5 h-5 animate-spin inline-block mr-2" />
                    Loading closed periods…
                  </td>
                </tr>
              ) : periods.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-500 font-mono text-[11px]">
                    No closed salary periods yet. When the week/month ends, auto-close (or Run
                    close-due-periods) creates the salary record.
                  </td>
                </tr>
              ) : (
                periods.map((p) => (
                  <tr key={p.periodId} className="border-t border-slate-800/80 hover:bg-slate-900/40">
                    <td className="p-3 font-mono text-slate-300 whitespace-nowrap">
                      {formatWindow(p.periodStart, p.periodEnd)}
                      <div className="text-[10px] text-slate-500">Closed {formatWhen(p.closedAt)}</div>
                    </td>
                    <td className="p-3 font-mono text-indigo-300">{p.cycleType}</td>
                    <td className="p-3 font-mono text-emerald-400 font-bold">
                      {formatUsd(p.totalDueUsd)}
                    </td>
                    <td className="p-3 font-mono text-rose-300">
                      {formatUsd(p.outstandingDueUsd)}
                    </td>
                    <td className="p-3 font-mono text-slate-300">
                      {p.ackProgress.acknowledged}/{p.ackProgress.total}
                    </td>
                    <td className="p-3 font-mono">
                      {(p.unreconciledCount ?? 0) > 0 ? (
                        <span className="text-amber-300">
                          {p.unreconciledCount} not reconciled
                        </span>
                      ) : (
                        <span className="text-emerald-400">All reconciled</span>
                      )}
                    </td>
                    <td className="p-3 font-mono text-slate-400">{p.batchCount}</td>
                    <td className="p-3">
                      <button
                        type="button"
                        onClick={() => openView(p.periodId)}
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-950/50 border border-emerald-700/50 text-emerald-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Eye className="w-3 h-3" />
                        View salaries
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedId && (
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-[#12151F] border border-slate-700 w-full max-w-5xl max-h-[92vh] rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800 flex items-start justify-between gap-3 shrink-0">
              <div>
                <h3 className="text-sm font-black text-white">View salaries</h3>
                <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                  {detail
                    ? formatWindow(detail.period.periodStart, detail.period.periodEnd)
                    : selectedId.slice(0, 8) + '…'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 space-y-4">
              {detailLoading || !detail ? (
                <div className="p-10 text-center text-slate-500 text-xs">
                  <Loader2 className="w-5 h-5 animate-spin inline-block mr-2" />
                  Loading sections…
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <div className="text-slate-500">Total due</div>
                      <div className="font-black text-emerald-300 mt-1">
                        {formatUsd(detail.totals.totalDueUsd)}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <div className="text-slate-500">Outstanding</div>
                      <div className="font-black text-rose-300 mt-1">
                        {formatUsd(detail.totals.outstandingDueUsd)}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <div className="text-slate-500">Ack progress</div>
                      <div className="font-black text-white mt-1">
                        {detail.ackProgress.acknowledged}/{detail.ackProgress.total}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <div className="text-slate-500">Reconcile</div>
                      <div className="font-black text-white mt-1">
                        {detail.totals.reconciledCount ?? 0}/
                        {(detail.totals.reconciledCount ?? 0) +
                          (detail.totals.unreconciledCount ?? 0)}{' '}
                        <span className="text-[10px] font-mono text-slate-500">reconciled</span>
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <div className="text-slate-500">Can remit</div>
                      <div
                        className={`font-black mt-1 ${
                          detail.canMarkPaid ? 'text-amber-300' : 'text-slate-400'
                        }`}
                      >
                        {detail.canMarkPaid ? 'Yes' : 'No'}
                      </div>
                    </div>
                  </div>

                  {detail.tlSections.map((section) => (
                    <div
                      key={section.batchId}
                      className="rounded-2xl border border-indigo-900/40 bg-indigo-950/10 overflow-hidden"
                    >
                      <div className="px-4 py-3 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-indigo-400" />
                          <div>
                            <div className="text-xs font-bold text-white">
                              Agency · {section.teamLeader?.name || section.teamLeaderId.slice(0, 8)}
                            </div>
                            <div className="text-[10px] font-mono text-slate-500">
                              Due {formatUsd(section.totalDueUsd)} · Hosts paid{' '}
                              {section.hostsPaidCount ?? 0}/{section.hostsTotal ?? section.hosts.length}{' '}
                              · Received {section.hostsAckedCount ?? 0} · Ack{' '}
                              {section.ackProgress.acknowledged}/{section.ackProgress.total}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`px-2 py-0.5 rounded border font-mono text-[10px] ${reconcileBadge(
                              section.reconcileStatus
                            )}`}
                          >
                            {section.reconcileStatus === 'reconciled'
                              ? 'Reconciled'
                              : 'Not reconciled'}
                          </span>
                          <span className="px-2 py-0.5 rounded border border-slate-700 font-mono text-[10px] text-slate-300">
                            {section.batchStatus === 'tl_confirmed'
                              ? 'Complete'
                              : section.batchStatus === 'admin_paid'
                                ? 'Admin remitted'
                                : 'Awaiting remittance'}
                          </span>
                          {section.reconcileStatus !== 'reconciled' && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void reconcileBatch(section.batchId)}
                              className="px-2 py-1 rounded-lg bg-sky-600/80 text-white text-[10px] font-bold disabled:opacity-50"
                            >
                              Reconcile
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-[11px]">
                          <thead className="bg-slate-950/60 text-slate-500">
                            <tr>
                              <th className="p-2">Role</th>
                              <th className="p-2">Name</th>
                              <th className="p-2">Payout</th>
                              <th className="p-2">Call</th>
                              <th className="p-2">Gift</th>
                              <th className="p-2">True-up</th>
                              <th className="p-2">Tier bonus</th>
                              <th className="p-2">Total USD</th>
                              <th className="p-2">Ack</th>
                            </tr>
                          </thead>
                          <tbody>
                            {section.teamLeader && (
                              <tr className="border-t border-slate-800/60">
                                <td className="p-2 font-mono text-indigo-300">TL</td>
                                <td className="p-2 text-slate-200">
                                  {section.teamLeader.name || section.teamLeader.userId}
                                </td>
                                <td className="p-2">
                                  <PayoutCell payee={section.teamLeader} />
                                </td>
                                {(() => {
                                  const c = payeeComponentCells(section.teamLeader);
                                  return (
                                    <>
                                      <td className="p-2 font-mono text-slate-300">{c.call}</td>
                                      <td className="p-2 font-mono text-slate-500">{c.gift}</td>
                                      <td className="p-2 font-mono text-slate-500">{c.trueUp}</td>
                                      <td className="p-2 font-mono text-slate-500">{c.tierBonus}</td>
                                    </>
                                  );
                                })()}
                                <td className="p-2 font-mono text-emerald-400">
                                  {formatUsd(section.teamLeader.amountUsd)}
                                </td>
                                <td className="p-2">
                                  <span
                                    className={`px-2 py-0.5 rounded border font-mono text-[10px] ${ackBadge(
                                      section.teamLeader.ackStatus
                                    )}`}
                                  >
                                    {ackLabel(section.teamLeader.ackStatus)}
                                  </span>
                                </td>
                              </tr>
                            )}
                            {section.hosts.map((h) => {
                              const c = payeeComponentCells(h);
                              return (
                                <tr key={h.userId} className="border-t border-slate-800/60">
                                  <td className="p-2 font-mono text-emerald-300">Host</td>
                                  <td className="p-2 text-slate-200">{h.name || h.userId}</td>
                                  <td className="p-2">
                                    <PayoutCell payee={h} />
                                  </td>
                                  <td className="p-2 font-mono text-slate-300">{c.call}</td>
                                  <td className="p-2 font-mono text-pink-300">{c.gift}</td>
                                  <td className="p-2 font-mono text-sky-300">{c.trueUp}</td>
                                  <td className="p-2 font-mono text-amber-300">{c.tierBonus}</td>
                                  <td className="p-2 font-mono text-emerald-400">
                                    {formatUsd(h.amountUsd)}
                                  </td>
                                  <td className="p-2">
                                    <span
                                      className={`px-2 py-0.5 rounded border font-mono text-[10px] ${ackBadge(
                                        h.ackStatus
                                      )}`}
                                    >
                                      {ackLabel(h.ackStatus)}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                            {section.hosts.length === 0 && (
                              <tr className="border-t border-slate-800/60">
                                <td colSpan={9} className="p-3 text-slate-500 text-center">
                                  No host lines in this TL bundle (commission only).
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}

                  {detail.directHosts.length > 0 && (
                    <div className="rounded-2xl border border-emerald-900/40 bg-emerald-950/10 overflow-hidden">
                      <div className="px-4 py-3 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4 text-emerald-400" />
                          <div className="text-xs font-bold text-white">Direct hosts</div>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {[...new Set(detail.directHosts.map((h) => h.batchId))].map((bid) => (
                            <button
                              key={bid}
                              type="button"
                              disabled={busy}
                              onClick={() => void reconcileBatch(bid)}
                              className="px-2 py-1 rounded-lg bg-sky-600/80 text-white text-[10px] font-bold disabled:opacity-50"
                              title={bid}
                            >
                              Reconcile batch
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-[11px]">
                          <thead className="bg-slate-950/60 text-slate-500">
                            <tr>
                              <th className="p-2">Name</th>
                              <th className="p-2">Payout</th>
                              <th className="p-2">Call</th>
                              <th className="p-2">Gift</th>
                              <th className="p-2">True-up</th>
                              <th className="p-2">Tier bonus</th>
                              <th className="p-2">Total USD</th>
                              <th className="p-2">Ack</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detail.directHosts.map((h) => {
                              const c = payeeComponentCells(h);
                              return (
                                <tr key={h.userId} className="border-t border-slate-800/60">
                                  <td className="p-2 text-slate-200">{h.name || h.userId}</td>
                                  <td className="p-2">
                                    <PayoutCell payee={h} />
                                  </td>
                                  <td className="p-2 font-mono text-slate-300">{c.call}</td>
                                  <td className="p-2 font-mono text-pink-300">{c.gift}</td>
                                  <td className="p-2 font-mono text-sky-300">{c.trueUp}</td>
                                  <td className="p-2 font-mono text-amber-300">{c.tierBonus}</td>
                                  <td className="p-2 font-mono text-emerald-400">
                                    {formatUsd(h.amountUsd)}
                                  </td>
                                  <td className="p-2">
                                    <span
                                      className={`px-2 py-0.5 rounded border font-mono text-[10px] ${ackBadge(
                                        h.ackStatus
                                      )}`}
                                    >
                                      {ackLabel(h.ackStatus)}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {detail.tlSections.length === 0 && detail.directHosts.length === 0 && (
                    <div className="p-8 text-center text-slate-500 text-xs">
                      No payees in this period.
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="px-4 py-3 border-t border-slate-800 space-y-2 shrink-0 bg-[#0f121a]">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy || !detail}
                  onClick={() => void exportFile('xlsx')}
                  className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  Export Excel
                </button>
                <button
                  type="button"
                  disabled={busy || !detail}
                  onClick={() => void exportFile('pdf')}
                  className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <FileText className="w-3.5 h-3.5" />
                  Export PDF
                </button>
              </div>
              {detail?.canMarkPaid && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    value={payRef}
                    onChange={(e) => setPayRef(e.target.value)}
                    placeholder="Payment reference"
                    className="sm:col-span-1 p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs font-mono"
                  />
                  <input
                    value={payNote}
                    onChange={(e) => setPayNote(e.target.value)}
                    placeholder="Admin note"
                    className="sm:col-span-1 p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs"
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void markPaid()}
                    className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 text-xs font-black flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {busy ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    )}
                    Remit reconciled batches
                  </button>
                </div>
              )}
              {detail && !detail.canMarkPaid && (
                <p className="text-[10px] text-slate-500 font-mono">
                  {(detail.totals.unreconciledCount ?? 0) > 0
                    ? 'Reconcile remaining batches before remittance. Agency then marks host salaries paid.'
                    : 'No batches awaiting remittance. Hosts/Agency acknowledge from their salary pages.'}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
