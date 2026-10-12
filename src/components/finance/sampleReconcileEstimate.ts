/**
 * Interactive sample for Preview estimated salaries — walk reconcile → Admin remit →
 * Agency Mark paid → Host ack → Complete without a real closed period.
 */

import type { SalaryEstimatePreview, SalaryPayeeRow } from '../../services/financeApi';

export type SampleDemoPhase =
  | 'unreconciled'
  | 'reconciled_awaiting_remit'
  | 'admin_remitted'
  | 'hosts_partially_paid'
  | 'complete';

export const SAMPLE_DEMO_PHASES: SampleDemoPhase[] = [
  'unreconciled',
  'reconciled_awaiting_remit',
  'admin_remitted',
  'hosts_partially_paid',
  'complete',
];

export function nextSampleDemoPhase(phase: SampleDemoPhase): SampleDemoPhase {
  const i = SAMPLE_DEMO_PHASES.indexOf(phase);
  return SAMPLE_DEMO_PHASES[Math.min(i + 1, SAMPLE_DEMO_PHASES.length - 1)];
}

export function sampleDemoPhaseLabel(phase: SampleDemoPhase): string {
  switch (phase) {
    case 'unreconciled':
      return '1/5 Not reconciled — Admin or Agency taps Reconcile';
    case 'reconciled_awaiting_remit':
      return '2/5 Reconciled — waiting for Admin remittance';
    case 'admin_remitted':
      return '3/5 Admin remitted — Agency can Mark paid per host';
    case 'hosts_partially_paid':
      return '4/5 Hosts marked Salary Paid — Host can Acknowledge';
    case 'complete':
      return '5/5 All Received — batch Complete';
    default:
      return phase;
  }
}

function payout(
  method: 'paypal' | 'bank_account' | 'wallet',
  label: string,
  details: Record<string, string>
): NonNullable<SalaryPayeeRow['payout']> {
  const summary = Object.entries(details)
    .map(([k, v]) => `${k}: ${v}`)
    .join(' · ');
  return {
    methodKey: method,
    methodLabel: label,
    countryCode: 'US',
    isPrimary: true,
    details,
    summary,
  };
}

function hostRow(opts: {
  userId: string;
  name: string;
  batchId: string;
  callUsd: number;
  giftUsd: number;
  trueUpUsd: number;
  bonusUsd: number;
  ackStatus: SalaryPayeeRow['ackStatus'];
  payout: NonNullable<SalaryPayeeRow['payout']>;
}): SalaryPayeeRow {
  const components = [
    { component: 'call_earnings', amountCoins: opts.callUsd * 100, amountUsd: opts.callUsd },
    { component: 'gift_earnings', amountCoins: opts.giftUsd * 100, amountUsd: opts.giftUsd },
    {
      component: 'target_share_true_up',
      amountCoins: opts.trueUpUsd * 100,
      amountUsd: opts.trueUpUsd,
    },
    { component: 'target_bonus', amountCoins: opts.bonusUsd * 100, amountUsd: opts.bonusUsd },
  ].filter((c) => c.amountUsd > 0);
  const amountUsd = components.reduce((s, c) => s + c.amountUsd, 0);
  return {
    userId: opts.userId,
    name: opts.name,
    email: null,
    role: 'host',
    amountCoins: amountUsd * 100,
    amountUsd,
    ackStatus: opts.ackStatus,
    batchId: opts.batchId,
    components,
    payout: opts.payout,
  };
}

export type SampleHostOverrides = Record<string, SalaryPayeeRow['ackStatus']>;

export function buildSampleReconcileEstimate(
  variant: 'admin' | 'tl' | 'host',
  opts?: {
    phase?: SampleDemoPhase;
    hostOverrides?: SampleHostOverrides;
    tlAckOverride?: SalaryPayeeRow['ackStatus'];
  }
): SalaryEstimatePreview {
  const phase = opts?.phase ?? 'admin_remitted';
  const now = new Date();
  const periodStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 3)
  );
  const periodEnd = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 4)
  );

  const agencyBatchId = 'sample-agency-bundle-1';
  const directBatchId = 'sample-direct-host-1';

  const reconcileStatus: 'unreconciled' | 'reconciled' =
    phase === 'unreconciled' ? 'unreconciled' : 'reconciled';

  let batchStatus = 'pending_admin_pay';
  if (phase === 'admin_remitted' || phase === 'hosts_partially_paid') {
    batchStatus = 'admin_paid';
  } else if (phase === 'complete') {
    batchStatus = 'tl_confirmed';
  }

  const defaultHostStatus = (id: string, fallback: SalaryPayeeRow['ackStatus']) =>
    opts?.hostOverrides?.[id] ?? fallback;

  let hostA: SalaryPayeeRow['ackStatus'] = 'pending';
  let hostB: SalaryPayeeRow['ackStatus'] = 'pending';
  let hostC: SalaryPayeeRow['ackStatus'] = 'pending';
  let tlAck: SalaryPayeeRow['ackStatus'] = 'pending';

  if (phase === 'admin_remitted') {
    hostA = 'pending';
    hostB = 'pending';
    hostC = 'pending';
    tlAck = 'admin_paid';
  } else if (phase === 'hosts_partially_paid') {
    hostA = 'admin_paid';
    hostB = 'pending';
    hostC = 'acknowledged';
    tlAck = 'admin_paid';
  } else if (phase === 'complete') {
    hostA = 'acknowledged';
    hostB = 'acknowledged';
    hostC = 'acknowledged';
    tlAck = 'acknowledged';
  }

  hostA = defaultHostStatus('sample-host-1', hostA);
  hostB = defaultHostStatus('sample-host-2', hostB);
  hostC = defaultHostStatus('sample-host-3', hostC);
  if (opts?.tlAckOverride) tlAck = opts.tlAckOverride;

  const agencyTl: SalaryPayeeRow = {
    userId: 'sample-agency-1',
    name: 'Sample Agency (TL)',
    email: null,
    role: 'team_leader',
    amountCoins: 4500,
    amountUsd: 45,
    ackStatus: tlAck,
    batchId: agencyBatchId,
    components: [{ component: 'tl_commission', amountCoins: 4500, amountUsd: 45 }],
    payout: payout('paypal', 'PayPal', { email: 'agency@example.com' }),
  };

  const agencyHosts = [
    hostRow({
      userId: 'sample-host-1',
      name: 'Host A',
      batchId: agencyBatchId,
      callUsd: 28,
      giftUsd: 12,
      trueUpUsd: 4,
      bonusUsd: 15,
      ackStatus: hostA,
      payout: payout('bank_account', 'Bank', { bank: 'Chase', last4: '4242' }),
    }),
    hostRow({
      userId: 'sample-host-2',
      name: 'Host B',
      batchId: agencyBatchId,
      callUsd: 18,
      giftUsd: 6,
      trueUpUsd: 2,
      bonusUsd: 0,
      ackStatus: hostB,
      payout: payout('wallet', 'Wallet', { note: 'In-app wallet' }),
    }),
    hostRow({
      userId: 'sample-host-3',
      name: 'Host C',
      batchId: agencyBatchId,
      callUsd: 22,
      giftUsd: 8,
      trueUpUsd: 3,
      bonusUsd: 15,
      ackStatus: hostC,
      payout: payout('paypal', 'PayPal', { email: 'hostc@example.com' }),
    }),
  ];

  const totalHostSalaryUsd = agencyHosts.reduce((s, h) => s + h.amountUsd, 0);
  const totalTlCommissionUsd = agencyTl.amountUsd;
  const agencyDue = totalHostSalaryUsd + totalTlCommissionUsd;

  const hostsPaidCount = agencyHosts.filter((h) => h.ackStatus !== 'pending').length;
  const hostsAckedCount = agencyHosts.filter((h) => h.ackStatus === 'acknowledged').length;
  const ackTotal = agencyHosts.length + 1;
  const ackDone =
    hostsAckedCount + (agencyTl.ackStatus === 'acknowledged' ? 1 : 0);

  const agencySection = {
    teamLeaderId: agencyTl.userId,
    teamLeader: agencyTl,
    hosts: agencyHosts,
    totalHostSalaryUsd,
    totalTlCommissionUsd,
    totalDueUsd: agencyDue,
    batchId: agencyBatchId,
    batchStatus,
    reconcileStatus,
    reconciledAt: reconcileStatus === 'reconciled' ? now.toISOString() : null,
    reconciledByRole: (reconcileStatus === 'reconciled' ? 'admin' : null) as
      | 'admin'
      | 'team_leader'
      | null,
    hostsPaidCount,
    hostsAckedCount,
    hostsTotal: agencyHosts.length,
    ackProgress: { acknowledged: ackDone, total: ackTotal },
  };

  const directHostStatus: SalaryPayeeRow['ackStatus'] =
    phase === 'complete'
      ? 'acknowledged'
      : phase === 'hosts_partially_paid' || phase === 'admin_remitted'
        ? 'admin_paid'
        : 'pending';

  const directHost = hostRow({
    userId: 'sample-direct-1',
    name: 'Direct Host (no Agency)',
    batchId: directBatchId,
    callUsd: 35,
    giftUsd: 10,
    trueUpUsd: 5,
    bonusUsd: 15,
    ackStatus: phase === 'unreconciled' || phase === 'reconciled_awaiting_remit' ? 'pending' : directHostStatus,
    payout: payout('bank_account', 'Bank', { bank: 'Wells', last4: '9911' }),
  });

  const periodClock = {
    periodId: 'sample-period',
    cycleType: 'weekly',
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    closeScheduledAt: periodEnd.toISOString(),
    periodStatus: 'open',
    accrualEnd: now.toISOString(),
  };

  const disclaimer =
    'SAMPLE demo (not real money). Use Next step / Mark paid / Acknowledge below. Live path: Agency Portal → Settlements → open batch → Mark paid; Host → Salary status → Acknowledge.';

  if (variant === 'host') {
    const me =
      agencyHosts.find((h) => h.ackStatus === 'admin_paid') ||
      agencyHosts.find((h) => h.ackStatus === 'acknowledged') ||
      agencyHosts[0];
    return {
      isEstimate: true,
      isSample: true,
      asOf: now.toISOString(),
      periodClock,
      tlSections: [],
      directHosts: [me],
      totals: {
        totalDueUsd: me.amountUsd,
        totalHostSalaryUsd: me.amountUsd,
        totalTlCommissionUsd: 0,
        outstandingDueUsd: me.amountUsd,
        batchCount: 1,
        pendingAdminPayCount: 0,
        adminPaidCount: me.ackStatus !== 'pending' ? 1 : 0,
        fullyAckedBatchCount: me.ackStatus === 'acknowledged' ? 1 : 0,
        unreconciledCount: 0,
        reconciledCount: 1,
      },
      disclaimer:
        'SAMPLE host view — when Agency marks Salary Paid, Acknowledge unlocks. After ack → Received.',
    };
  }

  if (variant === 'tl') {
    return {
      isEstimate: true,
      isSample: true,
      asOf: now.toISOString(),
      periodClock,
      tlSections: [agencySection],
      directHosts: [],
      totals: {
        totalDueUsd: agencyDue,
        totalHostSalaryUsd,
        totalTlCommissionUsd,
        outstandingDueUsd: agencyDue,
        batchCount: 1,
        pendingAdminPayCount: batchStatus === 'pending_admin_pay' ? 1 : 0,
        adminPaidCount: batchStatus === 'admin_paid' || batchStatus === 'tl_confirmed' ? 1 : 0,
        fullyAckedBatchCount: batchStatus === 'tl_confirmed' ? 1 : 0,
        unreconciledCount: reconcileStatus === 'unreconciled' ? 1 : 0,
        reconciledCount: reconcileStatus === 'reconciled' ? 1 : 0,
      },
      disclaimer:
        'SAMPLE Agency view — after Admin remittance, use Mark paid on each host row. That unlocks Host Acknowledge.',
    };
  }

  const directReconciled = phase !== 'unreconciled';
  return {
    isEstimate: true,
    isSample: true,
    asOf: now.toISOString(),
    periodClock,
    tlSections: [agencySection],
    directHosts: [directHost],
    totals: {
      totalDueUsd: agencyDue + directHost.amountUsd,
      totalHostSalaryUsd: totalHostSalaryUsd + directHost.amountUsd,
      totalTlCommissionUsd,
      outstandingDueUsd: agencyDue + directHost.amountUsd,
      batchCount: 2,
      pendingAdminPayCount: batchStatus === 'pending_admin_pay' ? 1 : 0,
      adminPaidCount: batchStatus === 'admin_paid' || batchStatus === 'tl_confirmed' ? 1 : 0,
      fullyAckedBatchCount: batchStatus === 'tl_confirmed' ? 1 : 0,
      unreconciledCount: (reconcileStatus === 'unreconciled' ? 1 : 0) + (directReconciled ? 0 : 1),
      reconciledCount: (reconcileStatus === 'reconciled' ? 1 : 0) + (directReconciled ? 1 : 0),
    },
    disclaimer,
  };
}
