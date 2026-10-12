/**
 * Estimated salary preview modal — current open period accrued till now.
 * Empty/failed live load → interactive sample reconcile walkthrough
 * (Agency Mark paid → Host Acknowledge).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  CheckCircle2,
  HandCoins,
  Loader2,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { summarizeHostSettlementLines } from '../../../shared/finance/hostEarningsBreakdown';
import type { SalaryEstimatePreview, SalaryPayeeRow } from '../../services/financeApi';
import {
  buildSampleReconcileEstimate,
  nextSampleDemoPhase,
  sampleDemoPhaseLabel,
  type SampleDemoPhase,
  type SampleHostOverrides,
} from './sampleReconcileEstimate';

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
      </div>
      <div className="text-[10px] text-slate-400 break-all leading-snug line-clamp-3">
        {Object.entries(p.details)
          .map(([k, v]) => `${k}: ${v}`)
          .join(' · ') || p.summary}
      </div>
    </div>
  );
}

function formatUsd(n: number | undefined | null) {
  const v = Number(n) || 0;
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
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

function ackLabel(status: string | undefined, role: SalaryPayeeRow['role']) {
  if (status === 'acknowledged' || status === 'paid') return 'Received';
  if (status === 'admin_paid') {
    return role === 'team_leader' ? 'Remitted' : 'Salary Paid';
  }
  return 'Unpaid';
}

function ackBadge(status: string | undefined) {
  if (status === 'acknowledged' || status === 'paid') {
    return 'bg-emerald-950 text-emerald-300 border-emerald-500/40';
  }
  if (status === 'admin_paid') {
    return 'bg-indigo-950 text-indigo-300 border-indigo-500/40';
  }
  return 'bg-amber-950 text-amber-300 border-amber-500/40';
}

function reconcileBadge(status: string | undefined) {
  return status === 'reconciled'
    ? 'bg-emerald-950 text-emerald-300 border-emerald-500/40'
    : 'bg-amber-950 text-amber-300 border-amber-500/40';
}

function batchStatusLabel(status: string | undefined) {
  if (status === 'tl_confirmed') return 'Complete';
  if (status === 'admin_paid') return 'Admin remitted';
  if (status === 'estimate') return 'Estimate (pre-close)';
  return 'Awaiting remittance';
}

function isPreviewEmpty(data: SalaryEstimatePreview | null) {
  if (!data) return true;
  return data.tlSections.length === 0 && data.directHosts.length === 0;
}

export type SalaryEstimatePreviewModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  variant: 'admin' | 'tl' | 'host';
  load: () => Promise<{
    success: boolean;
    data?: SalaryEstimatePreview | null;
    error?: { message?: string } | null;
  }>;
};

export const SalaryEstimatePreviewModal: React.FC<SalaryEstimatePreviewModalProps> = ({
  open,
  onClose,
  title = 'Estimated salary (current period till date)',
  variant,
  load,
}) => {
  const [loading, setLoading] = useState(false);
  const [liveNote, setLiveNote] = useState<string | null>(null);
  const [liveData, setLiveData] = useState<SalaryEstimatePreview | null>(null);
  const [usingSample, setUsingSample] = useState(false);
  const [demoPhase, setDemoPhase] = useState<SampleDemoPhase>('admin_remitted');
  const [hostOverrides, setHostOverrides] = useState<SampleHostOverrides>({});
  const [tlAckOverride, setTlAckOverride] = useState<SalaryPayeeRow['ackStatus'] | undefined>();
  const [actionFlash, setActionFlash] = useState<string | null>(null);

  const sampleData = useMemo(
    () =>
      buildSampleReconcileEstimate(variant, {
        phase: demoPhase,
        hostOverrides,
        tlAckOverride,
      }),
    [variant, demoPhase, hostOverrides, tlAckOverride]
  );

  const data = usingSample ? sampleData : liveData;

  const flash = useCallback((msg: string) => {
    setActionFlash(msg);
    window.setTimeout(() => setActionFlash(null), 2800);
  }, []);

  const startSample = useCallback(
    (phase: SampleDemoPhase = 'admin_remitted') => {
      setUsingSample(true);
      setDemoPhase(phase);
      setHostOverrides({});
      setTlAckOverride(undefined);
      setLiveNote(null);
      flash(
        phase === 'admin_remitted'
          ? 'Sample ready — Agency Mark paid is on unpaid host rows (Action column).'
          : `Sample step: ${sampleDemoPhaseLabel(phase)}`
      );
    },
    [flash]
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setLiveNote(null);
    try {
      const res = await load();
      if (!res.success || !res.data) {
        setLiveData(null);
        setLiveNote(res.error?.message || 'Live estimate unavailable');
        startSample('admin_remitted');
        return;
      }
      if (isPreviewEmpty(res.data)) {
        setLiveData(null);
        setLiveNote('No live accruals yet — sample reconcile demo loaded');
        startSample('admin_remitted');
        return;
      }
      setUsingSample(false);
      setLiveData(res.data);
      setLiveNote(null);
    } finally {
      setLoading(false);
    }
  }, [load, startSample]);

  useEffect(() => {
    if (!open) {
      setLiveData(null);
      setLiveNote(null);
      setUsingSample(false);
      setHostOverrides({});
      setTlAckOverride(undefined);
      setActionFlash(null);
      setLoading(false);
      return;
    }
    void refresh();
    // Only re-load when the modal opens — not when sample demo state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const advanceSampleStep = () => {
    if (!usingSample) {
      startSample('unreconciled');
      return;
    }
    if (demoPhase === 'complete') {
      startSample('unreconciled');
      flash('Sample restarted from Not reconciled');
      return;
    }
    const next = nextSampleDemoPhase(demoPhase);
    setDemoPhase(next);
    setHostOverrides({});
    setTlAckOverride(undefined);
    flash(sampleDemoPhaseLabel(next));
  };

  const sampleMarkHostPaid = (hostUserId: string) => {
    setHostOverrides((prev) => ({ ...prev, [hostUserId]: 'admin_paid' }));
    if (demoPhase === 'admin_remitted') setDemoPhase('hosts_partially_paid');
    flash(`Agency marked host Salary Paid → Host can now Acknowledge (${hostUserId.slice(0, 12)}…)`);
  };

  const sampleHostAck = (hostUserId: string) => {
    setHostOverrides((prev) => ({ ...prev, [hostUserId]: 'acknowledged' }));
    flash('Host acknowledged → Received');
  };

  const sampleTlAck = () => {
    setTlAckOverride('acknowledged');
    flash('Agency acknowledged commission → Received');
  };

  const canAgencyMarkPaid =
    usingSample &&
    (demoPhase === 'admin_remitted' || demoPhase === 'hosts_partially_paid') &&
    variant !== 'host';

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-label="Close estimate preview"
        onClick={onClose}
      />
      <div className="relative z-10 w-full sm:max-w-5xl max-h-[92vh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-[#0f1219] border border-slate-800 shadow-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800 flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h3 className="text-sm font-black text-white flex items-center gap-2">
              <Wallet className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="truncate">{title}</span>
              {usingSample && (
                <span className="px-2 py-0.5 rounded border border-violet-500/50 bg-violet-950/50 text-violet-200 text-[10px] font-mono shrink-0">
                  SAMPLE
                </span>
              )}
            </h3>
            {data ? (
              <p className="text-[10px] font-mono text-slate-500 mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="inline-flex items-center gap-1">
                  <CalendarClock className="w-3 h-3" />
                  {formatWindow(data.periodClock.periodStart, data.periodClock.periodEnd)}
                </span>
                <span>· {usingSample ? 'sample demo' : `accrued till ${formatWhen(data.asOf)}`}</span>
                <span>· {data.periodClock.cycleType}</span>
              </p>
            ) : (
              <p className="text-[10px] text-slate-500 mt-1">Loading open-period accrual…</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1 space-y-4">
          {actionFlash && (
            <div className="rounded-xl border border-emerald-600/50 bg-emerald-950/40 px-3 py-2 text-[11px] text-emerald-100 font-semibold">
              {actionFlash}
            </div>
          )}

          <div className="rounded-xl border border-amber-700/40 bg-amber-950/30 px-3 py-2 text-[11px] text-amber-100/90 flex gap-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
            <span>
              {data?.disclaimer ||
                'Estimate only — not payable until period close creates settlement batches.'}
            </span>
          </div>

          {usingSample && (
            <div className="rounded-xl border border-violet-700/40 bg-violet-950/25 px-3 py-2.5 text-[11px] text-violet-100/95 space-y-2">
              <div className="font-bold text-violet-200">
                {sampleDemoPhaseLabel(demoPhase)}
              </div>
              <p className="text-violet-100/80 text-[10px] sm:text-[11px]">
                <strong className="text-violet-100">Where Agency marks paid (live app):</strong>{' '}
                Agency portal → Settlements → open your batch → after Admin remittance, each unpaid
                host row shows <span className="text-emerald-300 font-bold">Mark paid</span>. That
                sets Salary Paid so the host can Acknowledge.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => advanceSampleStep()}
                  className="px-3 py-1.5 rounded-lg bg-violet-600 text-white text-[10px] font-black cursor-pointer"
                >
                  {demoPhase === 'complete' ? 'Restart sample' : 'Next step →'}
                </button>
                <button
                  type="button"
                  onClick={() => startSample('admin_remitted')}
                  className="px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-[10px] font-black cursor-pointer inline-flex items-center gap-1"
                >
                  <HandCoins className="w-3 h-3" />
                  Jump to Agency Mark paid
                </button>
              </div>
            </div>
          )}

          {liveNote && (
            <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-700 text-[10px] text-slate-400 font-mono">
              {liveNote}
            </div>
          )}

          {loading && (
            <div className="p-10 text-center text-slate-500 text-xs">
              <Loader2 className="w-5 h-5 animate-spin inline-block mr-2" />
              Computing estimate…
            </div>
          )}

          {!loading && data && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-slate-500">Est. total due</div>
                  <div className="font-black text-emerald-300 mt-1">
                    {formatUsd(data.totals.totalDueUsd)}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-slate-500">Host salaries</div>
                  <div className="font-black text-white mt-1">
                    {formatUsd(data.totals.totalHostSalaryUsd)}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-slate-500">
                    {variant === 'host' ? 'Your total' : 'Agency commission'}
                  </div>
                  <div className="font-black text-amber-300 mt-1">
                    {formatUsd(
                      variant === 'host'
                        ? data.totals.totalHostSalaryUsd
                        : data.totals.totalTlCommissionUsd
                    )}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-slate-500">Reconcile</div>
                  <div className="font-black text-white mt-1">
                    {data.totals.reconciledCount ?? 0}/
                    {(() => {
                      const n =
                        (data.totals.reconciledCount ?? 0) +
                        (data.totals.unreconciledCount ?? 0);
                      return n > 0 ? n : data.totals.batchCount;
                    })()}{' '}
                    <span className="text-[10px] font-mono text-slate-500">reconciled</span>
                  </div>
                </div>
              </div>

              {variant === 'host' &&
                data.directHosts.map((h) => {
                  const c = payeeComponentCells(h);
                  return (
                    <div
                      key={h.userId}
                      className="rounded-2xl border border-emerald-900/40 bg-emerald-950/10 overflow-hidden"
                    >
                      <div className="px-4 py-3 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-xs font-bold text-white">Your salary (sample)</div>
                          <div className="text-[10px] font-mono text-emerald-300 mt-0.5">
                            {formatUsd(h.amountUsd)}
                          </div>
                          <div className="mt-2">
                            <PayoutCell payee={h} />
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <span
                            className={`px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wider ${ackBadge(
                              h.ackStatus
                            )}`}
                          >
                            {ackLabel(h.ackStatus, h.role)}
                          </span>
                          {usingSample && h.ackStatus === 'admin_paid' && (
                            <button
                              type="button"
                              onClick={() => sampleHostAck(h.userId)}
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[10px] font-black inline-flex items-center gap-1 cursor-pointer"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              Acknowledge
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 text-[11px]">
                        <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800">
                          <div className="text-slate-500">Call</div>
                          <div className="font-mono text-slate-200 mt-0.5">{c.call}</div>
                        </div>
                        <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800">
                          <div className="text-slate-500">Gift</div>
                          <div className="font-mono text-pink-300 mt-0.5">{c.gift}</div>
                        </div>
                        <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800">
                          <div className="text-slate-500">True-up</div>
                          <div className="font-mono text-sky-300 mt-0.5">{c.trueUp}</div>
                        </div>
                        <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800">
                          <div className="text-slate-500">Tier bonus</div>
                          <div className="font-mono text-amber-300 mt-0.5">{c.tierBonus}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}

              {variant !== 'host' &&
                data.tlSections.map((section) => (
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
                            {section.hostsPaidCount ?? 0}/
                            {section.hostsTotal ?? section.hosts.length} · Received{' '}
                            {section.hostsAckedCount ?? 0}
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
                          {batchStatusLabel(section.batchStatus)}
                        </span>
                      </div>
                    </div>

                    {canAgencyMarkPaid && (
                      <div className="px-3 py-2 bg-emerald-950/30 border-b border-emerald-800/40 text-[10px] text-emerald-100/90 flex items-start gap-2">
                        <HandCoins className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>
                          Agency action: use <strong>Mark paid</strong> on unpaid hosts (same control
                          as Agency Settlements). Host then sees Salary Paid and can Acknowledge.
                        </span>
                      </div>
                    )}

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-[11px]">
                        <thead className="bg-slate-950/60 text-slate-500">
                          <tr>
                            <th className="p-2">Role</th>
                            <th className="p-2">Name</th>
                            <th className="p-2">Payout</th>
                            <th className="p-2">Total USD</th>
                            <th className="p-2">Status</th>
                            <th className="p-2">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {section.teamLeader && (
                            <tr className="border-t border-slate-800/60">
                              <td className="p-2 font-mono text-indigo-300">Agency</td>
                              <td className="p-2 text-slate-200">
                                {section.teamLeader.name || section.teamLeader.userId}
                              </td>
                              <td className="p-2">
                                <PayoutCell payee={section.teamLeader} />
                              </td>
                              <td className="p-2 font-mono text-emerald-400">
                                {formatUsd(section.teamLeader.amountUsd)}
                              </td>
                              <td className="p-2">
                                <span
                                  className={`px-2 py-0.5 rounded border font-mono text-[10px] ${ackBadge(
                                    section.teamLeader.ackStatus
                                  )}`}
                                >
                                  {ackLabel(section.teamLeader.ackStatus, 'team_leader')}
                                </span>
                              </td>
                              <td className="p-2">
                                {usingSample &&
                                  section.batchStatus === 'admin_paid' &&
                                  section.teamLeader.ackStatus === 'admin_paid' && (
                                    <button
                                      type="button"
                                      onClick={() => sampleTlAck()}
                                      className="px-2 py-1 rounded-lg bg-teal-600 text-white text-[10px] font-bold cursor-pointer"
                                    >
                                      Acknowledge commission
                                    </button>
                                  )}
                              </td>
                            </tr>
                          )}
                          {section.hosts.map((h) => {
                            const c = payeeComponentCells(h);
                            return (
                              <tr key={h.userId} className="border-t border-slate-800/60">
                                <td className="p-2 font-mono text-emerald-300">Host</td>
                                <td className="p-2 text-slate-200">
                                  <div>{h.name || h.userId}</div>
                                  <div className="text-[9px] text-slate-500 font-mono">
                                    {c.call} call · {c.gift} gift
                                  </div>
                                </td>
                                <td className="p-2">
                                  <PayoutCell payee={h} />
                                </td>
                                <td className="p-2 font-mono text-emerald-400">
                                  {formatUsd(h.amountUsd)}
                                </td>
                                <td className="p-2">
                                  <span
                                    className={`px-2 py-0.5 rounded border font-mono text-[10px] ${ackBadge(
                                      h.ackStatus
                                    )}`}
                                  >
                                    {ackLabel(h.ackStatus, 'host')}
                                  </span>
                                </td>
                                <td className="p-2">
                                  {canAgencyMarkPaid && h.ackStatus === 'pending' && (
                                    <button
                                      type="button"
                                      onClick={() => sampleMarkHostPaid(h.userId)}
                                      className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black cursor-pointer inline-flex items-center gap-1"
                                    >
                                      <HandCoins className="w-3 h-3" />
                                      Mark paid
                                    </button>
                                  )}
                                  {usingSample && h.ackStatus === 'admin_paid' && (
                                    <button
                                      type="button"
                                      onClick={() => sampleHostAck(h.userId)}
                                      className="px-2.5 py-1.5 rounded-lg bg-teal-600 text-white text-[10px] font-black cursor-pointer inline-flex items-center gap-1"
                                    >
                                      <CheckCircle2 className="w-3 h-3" />
                                      Host Ack
                                    </button>
                                  )}
                                  {h.ackStatus === 'acknowledged' && (
                                    <span className="text-[10px] text-emerald-400/80">Done</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}

              {variant === 'admin' && data.directHosts.length > 0 && (
                <div className="rounded-2xl border border-emerald-900/40 bg-emerald-950/10 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-emerald-400" />
                      <div>
                        <div className="text-xs font-bold text-white">Direct hosts</div>
                        <div className="text-[10px] font-mono text-slate-500">
                          Admin reconciles → Admin Salary Paid → Host Acknowledge (no Agency Mark
                          paid)
                        </div>
                      </div>
                    </div>
                    {usingSample && (
                      <span
                        className={`px-2 py-0.5 rounded border font-mono text-[10px] ${reconcileBadge(
                          demoPhase === 'unreconciled' ? 'unreconciled' : 'reconciled'
                        )}`}
                      >
                        {demoPhase === 'unreconciled' ? 'Not reconciled' : 'Reconciled'}
                      </span>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[11px]">
                      <thead className="bg-slate-950/60 text-slate-500">
                        <tr>
                          <th className="p-2">Name</th>
                          <th className="p-2">Payout</th>
                          <th className="p-2">Total USD</th>
                          <th className="p-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.directHosts.map((h) => (
                          <tr key={h.userId} className="border-t border-slate-800/60">
                            <td className="p-2 text-slate-200">{h.name || h.userId}</td>
                            <td className="p-2">
                              <PayoutCell payee={h} />
                            </td>
                            <td className="p-2 font-mono text-emerald-400">
                              {formatUsd(h.amountUsd)}
                            </td>
                            <td className="p-2">
                              <span
                                className={`px-2 py-0.5 rounded border font-mono text-[10px] ${ackBadge(
                                  h.ackStatus
                                )}`}
                              >
                                {ackLabel(h.ackStatus, 'host')}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-4 py-3 border-t border-slate-800 flex flex-wrap justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={() => startSample('admin_remitted')}
            className="px-3 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-black cursor-pointer inline-flex items-center gap-1.5"
          >
            <HandCoins className="w-3.5 h-3.5" />
            Sample reconcile
          </button>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-xs font-bold disabled:opacity-50 cursor-pointer"
          >
            Refresh live
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 rounded-xl bg-slate-100 text-slate-900 text-xs font-black cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
