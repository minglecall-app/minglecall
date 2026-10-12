/**
 * Client wrappers for Financial Module REST APIs (/api/v1/finance).
 * Auth via Supabase session Bearer token (authFetch).
 * Host salary-status responses contain NO amounts by design.
 */

import { authFetch } from '../utils/apiClient';

const FINANCE_BASE = '/api/v1/finance';

export type FinanceApiError = {
  message: string;
  code?: string;
};

export type FinanceApiResult<T> = {
  success: boolean;
  data?: T;
  error?: FinanceApiError;
  status: number;
};

async function financeRequest<T>(
  path: string,
  init?: RequestInit
): Promise<FinanceApiResult<T>> {
  try {
    const res = await authFetch(`${FINANCE_BASE}${path}`, init);
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.success === false) {
      return {
        success: false,
        status: res.status,
        error: {
          message: json?.error?.message || res.statusText || 'Request failed',
          code: json?.error?.code,
        },
      };
    }
    return { success: true, status: res.status, data: json.data as T };
  } catch (err: any) {
    return {
      success: false,
      status: 0,
      error: { message: err?.message || 'Network error', code: 'NETWORK_ERROR' },
    };
  }
}

function qs(params?: Record<string, string | number | undefined | null>): string {
  if (!params) return '';
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

// --- Health ---

export function fetchFinanceHealth() {
  return financeRequest<{
    module: string;
    phase: number;
    payableSourceOfTruth: string;
    payableModelNotes?: string;
  }>('/health');
}

/** Authenticated period clock for countdown UI (hosts + admin). No amounts. */
export function fetchPeriodClock() {
  return financeRequest<{
    cycleType: string;
    periodCloseUtcTime: string;
    settlementEnabled: boolean;
    periodStart: string;
    periodEnd: string;
    nextCloseAt: string;
    periodId: string | null;
    periodStatus: string | null;
  }>('/period-clock');
}

// --- Admin: periods ---

export function fetchFinancePeriods(params?: {
  status?: string;
  cycleType?: string;
  limit?: number;
}) {
  return financeRequest<{ periods: any[] }>(`/periods${qs(params)}`);
}

export function fetchCurrentFinancePeriod() {
  return financeRequest<{
    period: any;
    created?: boolean;
    bounds: { cycleType: string; periodStart: string; periodEnd: string };
    nextCloseAt: string;
    config: {
      creatorTargetCycle: string;
      periodCloseUtcTime: string;
      settlementEnabled: boolean;
    };
  }>('/periods/current');
}

export function fetchFinancePeriod(id: string) {
  return financeRequest<{ period: any }>(`/periods/${encodeURIComponent(id)}`);
}

// --- Admin: config ---

export function patchFinanceConfig(body: {
  creatorTargetCycle?: 'weekly' | 'monthly' | string;
  periodCloseUtcTime?: string;
  settlementEnabled?: boolean;
}) {
  return financeRequest<{ config: any }>('/config', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

// --- Jobs ---

export function postCloseDuePeriods(body?: {
  includeFailedRetries?: boolean;
  jobSecret?: string;
}) {
  const headers: Record<string, string> = {};
  if (body?.jobSecret) headers['X-Finance-Job-Secret'] = body.jobSecret;
  return financeRequest<{
    ensuredOpenPeriodId?: string | null;
    results: any[];
    payableSourceOfTruth?: string;
  }>('/jobs/close-due-periods', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      includeFailedRetries: body?.includeFailedRetries,
    }),
  });
}

export function postEnsureOpenPeriod(jobSecret?: string) {
  const headers: Record<string, string> = {};
  if (jobSecret) headers['X-Finance-Job-Secret'] = jobSecret;
  return financeRequest<{
    period: any;
    bounds: { cycleType: string; periodStart: string; periodEnd: string };
    created: boolean;
  }>('/jobs/ensure-open-period', { method: 'POST', headers, body: '{}' });
}

// --- Admin: ledger / batches / summary ---

export function fetchFinanceLedger(params?: {
  periodId?: string;
  userId?: string;
  entryType?: string;
  teamLeaderId?: string;
  limit?: number;
}) {
  return financeRequest<{ entries: any[] }>(`/ledger${qs(params)}`);
}

export type LiveWalletLedgerRow = {
  id: string;
  userId: string;
  userName?: string | null;
  userEmail?: string | null;
  callId?: string | null;
  transactionType:
    | 'PURCHASE'
    | 'CALL_DEBIT'
    | 'GIFT_DEBIT'
    | 'HOST_EARN'
    | 'TL_EARN'
    | 'TARGET_SHARE_TRUEUP'
    | 'REWARD_STREAK'
    | 'REWARD_MISSION'
    | 'REWARD_MASTER_CHEST'
    | string;
  amountCoins: number;
  balanceAfter: number;
  billingMinute: number;
  /** Distinct billed minutes when call-grouped. */
  billedMinutes?: number | null;
  minuteFrom?: number | null;
  minuteTo?: number | null;
  grouped?: boolean;
  firstAt?: string | null;
  lastAt?: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type LiveWalletLedgerAggregates = {
  callDebitCoins: number;
  giftDebitCoins?: number;
  hostEarnCoins: number;
  tlEarnCoins: number;
  platformRetainedCoins: number;
  purchaseCoins: number;
  rewardCoins: number;
  callDebitUsd: number;
  giftDebitUsd?: number;
  hostPayableUsd: number;
  tlPayableUsd: number;
  platformRetainedUsd: number;
  coinUsdPeg?: number;
};

export function fetchFinanceLiveLedger(params?: {
  transactionType?: string;
  userId?: string;
  callId?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}) {
  return financeRequest<{
    entries: LiveWalletLedgerRow[];
    aggregates: LiveWalletLedgerAggregates;
    pagination: { limit: number; offset: number; count: number };
  }>(`/ledger/live${qs(params as Record<string, string | number | undefined | null>)}`);
}

export function fetchFinanceBatches(params?: {
  periodId?: string;
  status?: string;
  batchKind?: string;
  limit?: number;
}) {
  return financeRequest<{ batches: any[] }>(`/batches${qs(params)}`);
}

export function fetchFinanceBatch(id: string) {
  return financeRequest<{
    batch: any;
    lineItems: any[];
    events: any[];
    period: any | null;
  }>(`/batches/${encodeURIComponent(id)}`);
}

export function postAdminMarkBatchPaid(
  id: string,
  body?: { note?: string; paymentReference?: string }
) {
  return financeRequest<{ batch: any }>(
    `/batches/${encodeURIComponent(id)}/admin-mark-paid`,
    {
      method: 'POST',
      body: JSON.stringify(body || {}),
    }
  );
}

export function postAdminReconcileBatch(id: string, body?: { note?: string }) {
  return financeRequest<{ batch: any; alreadyReconciled?: boolean }>(
    `/batches/${encodeURIComponent(id)}/reconcile`,
    {
      method: 'POST',
      body: JSON.stringify(body || {}),
    }
  );
}

// --- Funding / purchases (Phase 1) ---

export type CoinPurchaseRow = {
  id: string;
  userId: string;
  userName?: string | null;
  userEmail?: string | null;
  channel: 'ADMIN_MANUAL' | 'GATEWAY';
  status: string;
  amountCoins: number;
  /** Cash paid / retail (USD). Not forced to coins×peg. */
  amountUsd?: number | null;
  /** Fixed Peg snapshot at purchase ($/coin). */
  coinUsdPegAtPurchase?: number | null;
  /** amount_coins × peg at purchase. */
  pegValueUsd?: number | null;
  /** amount_usd − peg_value_usd when paid known. */
  loadMarginUsd?: number | null;
  packageId?: string | null;
  paymentProvider?: string | null;
  externalRef?: string | null;
  actorAdminId?: string | null;
  reason?: string | null;
  walletLedgerId?: string | null;
  createdAt: string;
  completedAt?: string | null;
};

export function postAdminFundingCredit(body: {
  userId: string;
  amountCoins: number;
  reason?: string;
  amountUsd?: number;
}) {
  return financeRequest<{
    purchase: CoinPurchaseRow | null;
    walletLedgerId: string;
    coinBalance: number;
    duplicate?: boolean;
  }>('/funding/admin-credit', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function fetchFinanceFunding(params?: {
  channel?: 'ADMIN_MANUAL' | 'GATEWAY' | '';
  userId?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}) {
  return financeRequest<{ purchases: CoinPurchaseRow[]; pagination: { limit: number; offset: number; count: number } }>(
    `/funding${qs(params as Record<string, string | number | undefined | null>)}`
  );
}

export function fetchMyFunding(params?: { limit?: number; offset?: number }) {
  return financeRequest<{ purchases: CoinPurchaseRow[]; pagination: { limit: number; offset: number; count: number } }>(
    `/funding/mine${qs(params)}`
  );
}

/** Create pending GATEWAY purchase from coin_packages SKU (no wallet credit yet). */
export function postFundingCheckoutIntent(body: { packageId: string; provider?: string }) {
  return financeRequest<{
    purchase: {
      id: string;
      userId: string;
      channel: 'GATEWAY';
      status: 'pending';
      amountCoins: number;
      amountUsd: number | null;
      packageId: string;
      paymentProvider: string;
      createdAt: string;
    };
    package: {
      id: string;
      title: string;
      coins: number;
      bonusCoins: number;
      totalCoins: number;
      priceUsd: number;
    };
    checkoutToken: string;
    note?: string;
  }>('/funding/checkout-intent', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * Non-production admin: pending GATEWAY intent → completeCoinPurchase(GATEWAY).
 * Disabled when NODE_ENV=production.
 */
export function postSimulateGatewayPurchase(body: { userId: string; packageId: string }) {
  return financeRequest<{
    purchase: CoinPurchaseRow | null;
    package?: { id: string; title: string; coins: number; bonusCoins: number; totalCoins: number; priceUsd: number };
    walletLedgerId: string;
    coinBalance: number;
    path: string;
  }>('/funding/simulate-gateway', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export type FinanceAdminSummary = {
  periodId: string | null;
  settlementPeriodId?: string | null;
  settlementPeriodStatus?: string | null;
  openPeriodId?: string | null;
  payableSourceOfTruth?: string;
  platformEarnedUsd: number;
  hostAccruedUsd: number;
  tlAccruedUsd: number;
  totalDueToTeamLeadersUsd: number;
  totalDueToDirectHostsUsd: number;
  outstandingBatchCount: number;
  outstandingDueUsd: number;
  batchCountsByStatus: Record<string, number>;
  live?: {
    periodId: string | null;
    periodStart: string;
    periodEnd: string;
    nextCloseAt: string;
    coinUsdPeg: number;
    callDebitCoins: number;
    giftDebitCoins: number;
    hostEarnCoins: number;
    tlEarnCoins: number;
    targetShareTrueUpCoins: number;
    platformRetainedCoins: number;
    callDebitUsd: number;
    giftDebitUsd: number;
    hostPayableUsd: number;
    tlPayableUsd: number;
    platformRetainedUsd: number;
  };
  funding?: {
    periodId: string | null;
    completedCount: number;
    completedCoins: number;
    paidUsd: number;
    pegValueUsd: number;
    loadMarginUsd: number;
  };
  remittanceAll?: {
    outstandingBatchCount: number;
    outstandingDueUsd: number;
    directHostCount: number;
    tlBundleCount: number;
  };
  period?: {
    cycleType: string;
    periodCloseUtcTime: string;
    settlementEnabled: boolean;
    coinUsdPeg: number;
    periodStart: string;
    periodEnd: string;
    nextCloseAt: string;
    openPeriodId: string | null;
    settlementPeriodId: string | null;
    settlementPeriodStatus: string | null;
  };
};

export function fetchFinanceAdminSummary(params?: { periodId?: string }) {
  return financeRequest<FinanceAdminSummary>(`/admin/summary${qs(params)}`);
}

// --- Team leader ---

export function fetchTlFinanceBatches(params?: { periodId?: string; limit?: number }) {
  return financeRequest<{ batches: any[] }>(`/tl/batches${qs(params)}`);
}

export function fetchTlFinanceBatch(id: string) {
  return financeRequest<{
    batch: any;
    lineItems: any[];
    events: any[];
  }>(`/tl/batches/${encodeURIComponent(id)}`);
}

export function postTlConfirmReceived(id: string, body?: { note?: string }) {
  return financeRequest<{ batch: any }>(
    `/tl/batches/${encodeURIComponent(id)}/confirm-received`,
    {
      method: 'POST',
      body: JSON.stringify(body || {}),
    }
  );
}

export function postTlReconcileBatch(id: string, body?: { note?: string }) {
  return financeRequest<{ batch: any; alreadyReconciled?: boolean }>(
    `/tl/batches/${encodeURIComponent(id)}/reconcile`,
    {
      method: 'POST',
      body: JSON.stringify(body || {}),
    }
  );
}

export function postTlMarkHostPaid(
  batchId: string,
  hostUserId: string,
  body?: { note?: string }
) {
  return financeRequest<{ batch: any; alreadyPaid?: boolean }>(
    `/tl/batches/${encodeURIComponent(batchId)}/hosts/${encodeURIComponent(hostUserId)}/mark-paid`,
    {
      method: 'POST',
      body: JSON.stringify(body || {}),
    }
  );
}

// --- Host (status strips amounts; period-earnings returns own breakdown) ---

export type HostSalaryStatusItem = {
  periodId: string;
  cycleType: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  periodStatus: string | null;
  batchId: string;
  batchKind: string;
  batchStatus: string;
  /** unpaid | admin_paid | acknowledged (legacy pending/paid still accepted by UI) */
  salaryStatus: 'unpaid' | 'admin_paid' | 'acknowledged' | 'pending' | 'paid';
  canAcknowledge?: boolean;
};

export function fetchHostSalaryStatus(params?: { limit?: number }) {
  return financeRequest<{ items: HostSalaryStatusItem[] }>(
    `/host/salary-status${qs(params)}`
  );
}

export function postHostSalaryAcknowledge(batchId: string, body?: { note?: string }) {
  return financeRequest<{ acknowledged: boolean; alreadyAcknowledged?: boolean }>(
    `/host/salary/${encodeURIComponent(batchId)}/acknowledge`,
    {
      method: 'POST',
      body: JSON.stringify(body || {}),
    }
  );
}

// --- Admin salary periods (period-level salary batches) ---

export type SalaryPeriodListItem = {
  periodId: string;
  cycleType: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  closedAt: string | null;
  totalDueUsd: number;
  outstandingDueUsd: number;
  batchCount: number;
  pendingAdminPayCount: number;
  adminPaidCount: number;
  unreconciledCount?: number;
  reconciledCount?: number;
  ackProgress: { acknowledged: number; total: number };
  canMarkPaid: boolean;
};

export type SalaryPayoutDetails = {
  methodKey: 'paypal' | 'bank_account' | 'wallet';
  methodLabel: string;
  countryCode: string;
  isPrimary: boolean;
  details: Record<string, string>;
  summary: string;
};

export type SalaryPayeeRow = {
  userId: string;
  name: string | null;
  email: string | null;
  role: 'host' | 'team_leader';
  amountCoins: number;
  amountUsd: number;
  ackStatus: 'pending' | 'admin_paid' | 'acknowledged';
  batchId: string;
  components: Array<{ component: string; amountCoins: number; amountUsd: number }>;
  payout?: SalaryPayoutDetails | null;
};

export type SalaryPeriodDetail = {
  period: {
    id: string;
    cycleType: string;
    periodStart: string;
    periodEnd: string;
    status: string;
    closedAt: string | null;
    configSnapshot: Record<string, unknown>;
  };
  tlSections: Array<{
    teamLeaderId: string;
    teamLeader: SalaryPayeeRow | null;
    hosts: SalaryPayeeRow[];
    totalHostSalaryUsd: number;
    totalTlCommissionUsd: number;
    totalDueUsd: number;
    batchId: string;
    batchStatus: string;
    reconcileStatus?: 'unreconciled' | 'reconciled';
    reconciledAt?: string | null;
    reconciledByRole?: 'admin' | 'team_leader' | null;
    hostsPaidCount?: number;
    hostsAckedCount?: number;
    hostsTotal?: number;
    ackProgress: { acknowledged: number; total: number };
  }>;
  directHosts: SalaryPayeeRow[];
  totals: {
    totalDueUsd: number;
    totalHostSalaryUsd: number;
    totalTlCommissionUsd: number;
    outstandingDueUsd: number;
    batchCount: number;
    pendingAdminPayCount: number;
    adminPaidCount: number;
    fullyAckedBatchCount: number;
    unreconciledCount?: number;
    reconciledCount?: number;
  };
  ackProgress: { acknowledged: number; total: number };
  canMarkPaid: boolean;
  paymentReferences: string[];
};

export type SalaryEstimatePreview = {
  isEstimate: true;
  /** Client/server demo when open period has no accruals yet */
  isSample?: boolean;
  asOf: string;
  periodClock: {
    periodId: string | null;
    cycleType: string;
    periodStart: string;
    periodEnd: string;
    closeScheduledAt: string | null;
    periodStatus: string;
    accrualEnd: string;
  };
  tlSections: SalaryPeriodDetail['tlSections'];
  directHosts: SalaryPayeeRow[];
  totals: SalaryPeriodDetail['totals'];
  disclaimer: string;
};

export function fetchAdminSalaryEstimatePreview() {
  return financeRequest<SalaryEstimatePreview>('/admin/salary-estimate-preview');
}

export function fetchTlSalaryEstimatePreview() {
  return financeRequest<SalaryEstimatePreview>('/tl/salary-estimate-preview');
}

export function fetchHostSalaryEstimatePreview() {
  return financeRequest<SalaryEstimatePreview>('/host/salary-estimate-preview');
}

export function fetchSalaryPeriods(params?: { limit?: number }) {
  return financeRequest<{ periods: SalaryPeriodListItem[] }>(
    `/admin/salary-periods${qs(params)}`
  );
}

export function fetchSalaryPeriodDetail(periodId: string) {
  return financeRequest<SalaryPeriodDetail>(
    `/admin/salary-periods/${encodeURIComponent(periodId)}`
  );
}

export function postSalaryPeriodMarkPaid(
  periodId: string,
  body?: { note?: string; paymentReference?: string }
) {
  return financeRequest<{
    batchesUpdated: number;
    alreadyPaid?: boolean;
    detail: SalaryPeriodDetail | null;
  }>(`/admin/salary-periods/${encodeURIComponent(periodId)}/mark-paid`, {
    method: 'POST',
    body: JSON.stringify(body || {}),
  });
}

/** Download formatted Excel or PDF (binary). Triggers browser download. */
export async function downloadSalaryPeriodExport(
  periodId: string,
  format: 'xlsx' | 'pdf'
): Promise<FinanceApiResult<{ filename: string }>> {
  try {
    const res = await authFetch(
      `${FINANCE_BASE}/admin/salary-periods/${encodeURIComponent(periodId)}/export?format=${format}`
    );
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      return {
        success: false,
        status: res.status,
        error: {
          message: json?.error?.message || res.statusText || 'Export failed',
          code: json?.error?.code,
        },
      };
    }
    const blob = await res.blob();
    const cd = res.headers.get('Content-Disposition') || '';
    const match = cd.match(/filename="?([^"]+)"?/i);
    const filename =
      match?.[1] ||
      `salary.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return { success: true, status: res.status, data: { filename } };
  } catch (err: any) {
    return {
      success: false,
      status: 0,
      error: { message: err?.message || 'Network error', code: 'NETWORK_ERROR' },
    };
  }
}

export type HostPeriodEarningsItem = {
  periodId: string;
  cycleType: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  periodStatus: string | null;
  closedAt: string | null;
  salaryStatus?: 'unpaid' | 'admin_paid' | 'acknowledged' | 'pending' | 'paid';
  hasTrueUp: boolean;
  breakdown: {
    callEarningsCoins: number;
    callEarningsUsd: number;
    giftEarningsCoins: number;
    giftEarningsUsd: number;
    targetShareTrueUpCoins: number;
    targetShareTrueUpUsd: number;
    targetBonusCoins: number;
    targetBonusUsd: number;
    totalCoins: number;
    totalUsd: number;
  };
  lineItems?: any[];
};

export function fetchHostPeriodEarnings(params?: { periodId?: string; limit?: number }) {
  return financeRequest<{ periods: HostPeriodEarningsItem[] }>(
    `/host/period-earnings${qs(params)}`
  );
}

export function fetchAdminHostPeriodEarnings(params: {
  userId: string;
  periodId?: string;
  limit?: number;
}) {
  return financeRequest<{ userId: string; periods: HostPeriodEarningsItem[] }>(
    `/admin/host-period-earnings${qs(params)}`
  );
}

/** Always rejected with PAYOUT_PERIOD_END_ONLY — settlement batches are the only cash-out path. */
export function postManualPayout(body?: Record<string, unknown>) {
  return financeRequest<never>(`/manual-payouts`, {
    method: 'POST',
    body: JSON.stringify(body || {}),
  });
}

// --- Role-scoped earnings overview / ledger (Platform / TL / Host) ---

export type EarningsScope = 'platform' | 'tl' | 'host';
export type EarningsLedgerMode = 'week' | 'month' | 'lifetime';
export type EarningsGroupBy = 'week' | 'month';

export type EarningsOverviewData = {
  scope: EarningsScope;
  coinUsdPeg: number;
  week: {
    coins: number;
    usd: number;
    entryCount: number;
    periodStart: string | null;
    periodEnd: string | null;
  };
  month: {
    coins: number;
    usd: number;
    entryCount: number;
    periodStart: string | null;
    periodEnd: string | null;
  };
  lifetime: {
    coins: number;
    usd: number;
    entryCount: number;
    periodStart: string | null;
    periodEnd: string | null;
  };
  periodClock: {
    cycleType: string;
    periodCloseUtcTime: string;
    settlementEnabled: boolean;
    periodStart: string;
    periodEnd: string;
    nextCloseAt: string;
    remainingMs: number;
    elapsedRatio: number;
    periodId: string | null;
    periodStatus: string | null;
  };
  extras: {
    entriesThisWeek: number;
    avgDailyUsdThisWeek: number;
    settlementCycleLabel: string;
  };
  series: {
    week: Array<{ date: string; label: string; coins: number; usd: number }>;
    month: Array<{ date: string; label: string; coins: number; usd: number }>;
  };
  componentSplit?: {
    week: EarningsComponentSplit;
    month: EarningsComponentSplit;
    lifetime: EarningsComponentSplit;
  };
};

export type EarningsComponentSplit = {
  callCoins: number;
  callUsd: number;
  giftCoins: number;
  giftUsd: number;
  trueUpCoins: number;
  trueUpUsd: number;
  tierBonusCoins: number;
  tierBonusUsd: number;
  rewardCoins: number;
  rewardUsd: number;
  salaryCoins: number;
  salaryUsd: number;
  totalCoins: number;
  totalUsd: number;
};

export type EarningsLedgerRow = {
  id: string;
  createdAt: string;
  entryType: string;
  userId: string | null;
  userName?: string | null;
  teamLeaderId: string | null;
  callId?: string | null;
  hostId?: string | null;
  hostName?: string | null;
  billingMinute?: number | null;
  billedMinutes?: number | null;
  minuteFrom?: number | null;
  minuteTo?: number | null;
  grouped?: boolean;
  firstAt?: string | null;
  lastAt?: string | null;
  amountCoins: number;
  amountUsd: number;
  fxRatio: number;
  source: 'wallet' | 'financial';
  category?: string;
  inSalary?: boolean;
  callCoins?: number;
  callUsd?: number;
  giftCoins?: number;
  giftUsd?: number;
  trueUpCoins?: number;
  trueUpUsd?: number;
  tierBonusCoins?: number;
  tierBonusUsd?: number;
  rewardCoins?: number;
  rewardUsd?: number;
  hostEarnCoins?: number;
  hostEarnUsd?: number;
  tlEarnCoins?: number;
  tlEarnUsd?: number;
  platformRetainedCoins?: number;
  platformRetainedUsd?: number;
};

export type EarningsLifetimeGroup = {
  periodKey: string;
  label: string;
  periodStart: string;
  periodEnd: string;
  totalCoins: number;
  totalUsd: number;
  entryCount: number;
};

export type EarningsLedgerData = {
  scope: EarningsScope;
  mode: EarningsLedgerMode;
  groupBy: EarningsGroupBy | null;
  periodKey?: string | null;
  rows: EarningsLedgerRow[];
  groups: EarningsLifetimeGroup[];
  periodStart: string | null;
  periodEnd: string | null;
};

export function fetchEarningsOverview(params: {
  scope: EarningsScope;
  userId?: string;
  teamLeaderId?: string;
}) {
  return financeRequest<EarningsOverviewData>(`/earnings-overview${qs(params)}`);
}

export function fetchEarningsLedger(params: {
  scope: EarningsScope;
  mode: EarningsLedgerMode;
  groupBy?: EarningsGroupBy;
  periodKey?: string;
  userId?: string;
  teamLeaderId?: string;
  limit?: number;
}) {
  return financeRequest<EarningsLedgerData>(`/earnings-ledger${qs(params)}`);
}
