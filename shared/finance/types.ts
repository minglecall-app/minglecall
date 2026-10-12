/**
 * Shared Financial Module types — periods, immutable ledger, settlement batches.
 * Keep this module free of React / DOM / Node-only APIs so server and (later) client can import it.
 *
 * Period rules (locked):
 * - Weekly: Monday 00:00 UTC → next Monday 00:00 UTC
 * - Monthly: calendar month 1st 00:00 UTC → next 1st 00:00 UTC (NOT rolling 30 days)
 * - Close clock: system_configs.period_close_utc_time (UTC HH:mm)
 *
 * Money mutations and period math live in server/finance (Phase 2+). This file is contracts only.
 */

export type SettlementCycleType = 'weekly' | 'monthly';

export type SettlementPeriodStatus = 'open' | 'closing' | 'closed' | 'failed';

export type FinancialLedgerEntryType =
  | 'PLATFORM_EARN'
  | 'HOST_EARN'
  | 'TL_EARN'
  | 'TARGET_BONUS'
  | 'TARGET_SHARE_TRUEUP'
  | 'SETTLEMENT_ACCRUAL'
  | 'SETTLEMENT_PAID'
  | 'REVERSAL';

export type FinancialCounterpartyRole = 'platform' | 'host' | 'team_leader';

export type SettlementBatchKind = 'team_leader_bundle' | 'direct_host';

export type SettlementBatchStatus =
  | 'pending_admin_pay'
  | 'admin_paid'
  | 'tl_confirmed'
  | 'cancelled';

/** Confirm-amounts gate before Admin remittance / Agency host pay (2A). */
export type SettlementReconcileStatus = 'unreconciled' | 'reconciled';

export type SettlementReconciledByRole = 'admin' | 'team_leader';

export type SettlementPayeeRole = 'host' | 'team_leader';

export type SettlementLineComponent =
  | 'call_earnings'
  | 'gift_earnings'
  | 'target_bonus'
  | 'target_share_trueup'
  | 'tl_commission'
  | 'other';

/** Payee-facing line status (host and TL commission lines). Legacy `paid` maps to acknowledged. */
export type HostSalaryStatus = 'pending' | 'admin_paid' | 'acknowledged' | 'paid';

export type SettlementEventType =
  | 'created'
  | 'reconciled'
  | 'admin_marked_paid'
  | 'agency_marked_host_paid'
  | 'tl_confirmed'
  | 'cancelled'
  | 'note'
  | 'host_acknowledged'
  | 'tl_acknowledged';

export type CreatorPerformanceTier = 'bronze' | 'silver' | 'gold';

/** Snapshot of money rules frozen onto a settlement period at close. */
export interface SettlementConfigSnapshot {
  period_close_utc_time?: string;
  creator_target_cycle?: SettlementCycleType | string;
  /** Fixed Peg — USD per coin for host/TL/platform (Phase 1 canonical). */
  coin_usd_peg?: number;
  /** Call burn coins/min (non-friends) frozen at close. */
  coin_burn_rate_per_min?: number;
  /** Call burn coins/min (friends) frozen at close. */
  coin_burn_rate_friend_per_min?: number;
  /**
   * @deprecated Synced to coin_usd_peg for backward compat.
   */
  female_payout_ratio_usd?: number;
  /**
   * @deprecated Synced to coin_usd_peg for backward compat.
   */
  coin_to_usd_ratio?: number;
  /** Host target share % — period-end true-up if bronze+ met (not mid-call). Default 40. */
  female_host_target_share_percent?: number;
  /** Host base share % on live call burns — default 30, never gift 70. */
  female_host_share_percent?: number;
  team_leader_share_percent?: number;
  gift_female_host_share_percent?: number;
  gift_team_leader_share_percent?: number;
  creator_target_bronze_hours?: number;
  creator_target_bronze_coins?: number;
  creator_target_bronze_bonus_usd?: number;
  creator_target_silver_hours?: number;
  creator_target_silver_coins?: number;
  creator_target_silver_bonus_usd?: number;
  creator_target_gold_hours?: number;
  creator_target_gold_coins?: number;
  creator_target_gold_bonus_usd?: number;
  [key: string]: unknown;
}

export interface SettlementPeriod {
  id: string;
  cycleType: SettlementCycleType;
  /** Inclusive accrual window start (timestamptz ISO). */
  periodStart: string;
  /** Exclusive accrual window end (timestamptz ISO). */
  periodEnd: string;
  closeScheduledAt: string;
  closedAt: string | null;
  status: SettlementPeriodStatus;
  configSnapshot: SettlementConfigSnapshot;
  closeError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FinancialLedgerEntry {
  id: string;
  createdAt: string;
  periodId: string | null;
  entryType: FinancialLedgerEntryType;
  userId: string | null;
  teamLeaderId: string | null;
  counterpartyRole: FinancialCounterpartyRole | null;
  amountCoins: number;
  amountUsd: number;
  fxRatio: number;
  sourceRefType: string | null;
  sourceRefId: string | null;
  metadata: Record<string, unknown>;
}

export interface SettlementBatch {
  id: string;
  periodId: string;
  batchKind: SettlementBatchKind;
  teamLeaderId: string | null;
  /** TL for team_leader_bundle; host for direct_host. */
  payeeUserId: string;
  status: SettlementBatchStatus;
  totalHostSalaryUsd: number;
  totalTlCommissionUsd: number;
  totalDueUsd: number;
  totalHostSalaryCoins: number;
  totalTlCommissionCoins: number;
  currency: string;
  paymentReference: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SettlementLineItem {
  id: string;
  batchId: string;
  payeeUserId: string;
  payeeRole: SettlementPayeeRole;
  amountCoins: number;
  amountUsd: number;
  component: SettlementLineComponent;
  breakdown: Record<string, unknown>;
  hostSalaryStatus: HostSalaryStatus;
  createdAt: string;
}

export interface SettlementEvent {
  id: string;
  batchId: string | null;
  periodId: string | null;
  eventType: SettlementEventType;
  actorUserId: string;
  note: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface CreatorPeriodSnapshot {
  id: string;
  periodId: string;
  creatorId: string;
  agencyLeaderId: string | null;
  activeOnlineSeconds: number;
  activeOnlineHours: number;
  coinsEarnedFromCalls: number;
  coinsEarnedFromGifts: number;
  totalTargetCoins: number;
  performanceTier: CreatorPerformanceTier;
  bonusEarnedCoins: number;
  bonusEarnedUsd: number;
  currentStreakDays: number;
  responseHealthScore: number;
  metricsSnapshot: Record<string, unknown>;
  createdAt: string;
}

/** Role-scoped earnings dashboard (Platform / TL / Host). */
export type EarningsScope = 'platform' | 'tl' | 'host';

export type EarningsLedgerMode = 'week' | 'month' | 'lifetime';

export type EarningsGroupBy = 'week' | 'month';

export interface EarningsKpiBucket {
  coins: number;
  usd: number;
  entryCount: number;
  periodStart: string | null;
  periodEnd: string | null;
}

export interface EarningsSeriesPoint {
  date: string;
  label: string;
  coins: number;
  usd: number;
}

export interface EarningsPeriodClock {
  cycleType: SettlementCycleType | string;
  periodCloseUtcTime: string;
  settlementEnabled: boolean;
  periodStart: string;
  periodEnd: string;
  nextCloseAt: string;
  remainingMs: number;
  /** 0..1 progress through settlement window toward nextCloseAt. */
  elapsedRatio: number;
  periodId: string | null;
  periodStatus: string | null;
}

/** Component split for host (and TL/platform where applicable). */
export interface EarningsComponentSplit {
  callCoins: number;
  callUsd: number;
  giftCoins: number;
  giftUsd: number;
  trueUpCoins: number;
  trueUpUsd: number;
  tierBonusCoins: number;
  tierBonusUsd: number;
  /** Non-salary spendable rewards (REWARD_*). */
  rewardCoins: number;
  rewardUsd: number;
  /** Salary-included total (excludes rewards). */
  salaryCoins: number;
  salaryUsd: number;
  totalCoins: number;
  totalUsd: number;
}

export interface EarningsOverviewResponse {
  scope: EarningsScope;
  coinUsdPeg: number;
  week: EarningsKpiBucket;
  month: EarningsKpiBucket;
  lifetime: EarningsKpiBucket;
  periodClock: EarningsPeriodClock;
  extras: {
    entriesThisWeek: number;
    avgDailyUsdThisWeek: number;
    settlementCycleLabel: string;
  };
  series: {
    week: EarningsSeriesPoint[];
    month: EarningsSeriesPoint[];
  };
  /** Host-focused component split for current week / month / lifetime (salary buckets + rewards). */
  componentSplit?: {
    week: EarningsComponentSplit;
    month: EarningsComponentSplit;
    lifetime: EarningsComponentSplit;
  };
}

export type EarningsMoneyCategory =
  | 'call'
  | 'gift'
  | 'true_up'
  | 'tier_bonus'
  | 'tl_commission'
  | 'platform'
  | 'reward'
  | 'other';

export interface EarningsLedgerRow {
  id: string;
  createdAt: string;
  entryType: string;
  userId: string | null;
  /** Resolved from profiles.name when available. */
  userName: string | null;
  teamLeaderId: string | null;
  /** wallet_ledger.call_id when present. */
  callId: string | null;
  /** Host (receiver) for TL_EARN rows — from metadata or call_logs. */
  hostId: string | null;
  /** Resolved host display name for TL ledger. */
  hostName: string | null;
  /**
   * Single-minute rows: that minute.
   * Call-grouped rows: null (use billedMinutes / minuteFrom / minuteTo).
   */
  billingMinute: number | null;
  /** Distinct billed minutes in a call-grouped row. */
  billedMinutes: number | null;
  /** Min billing_minute in group (call-grouped). */
  minuteFrom: number | null;
  /** Max billing_minute in group (call-grouped). */
  minuteTo: number | null;
  /** True when this row aggregates multiple wallet_ledger minutes. */
  grouped: boolean;
  /** Earliest created_at in group (ISO); equals createdAt when not grouped. */
  firstAt: string | null;
  /** Latest created_at in group (ISO). */
  lastAt: string | null;
  amountCoins: number;
  amountUsd: number;
  fxRatio: number;
  source: 'wallet' | 'financial';
  /** Primary money category for this row. */
  category: EarningsMoneyCategory;
  /** False for REWARD_* and other non-settlement credits. */
  inSalary: boolean;
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
  /**
   * Platform ledger call-composite: host/TL shares credited for this call,
   * and platform retained = burn − host − TL.
   */
  hostEarnCoins: number;
  hostEarnUsd: number;
  tlEarnCoins: number;
  tlEarnUsd: number;
  platformRetainedCoins: number;
  platformRetainedUsd: number;
}

export interface EarningsLifetimeGroup {
  periodKey: string;
  label: string;
  periodStart: string;
  periodEnd: string;
  totalCoins: number;
  totalUsd: number;
  entryCount: number;
}

export interface EarningsLedgerResponse {
  scope: EarningsScope;
  mode: EarningsLedgerMode;
  groupBy: EarningsGroupBy | null;
  periodKey?: string | null;
  rows: EarningsLedgerRow[];
  groups: EarningsLifetimeGroup[];
  periodStart: string | null;
  periodEnd: string | null;
}
