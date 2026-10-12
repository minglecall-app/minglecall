/**
 * Minglecall Financial Module (server)
 *
 * Responsibility:
 * - Own period bounds (weekly Mon→Mon UTC, monthly 1st→1st UTC) and close scheduling
 * - Own FX / share / target-bonus money rules used at settlement time
 * - Close settlement periods, append financial_ledger, build settlement batches (Phase 3+)
 * - Enforce period-end payout policy (no mid-period cash-outs when settlement_enabled)
 *
 * Scheduling rule:
 * - Accrual window [period_start, period_end)
 * - close_scheduled_at = UTC date of period_end at period_close_utc_time (HH:mm)
 *
 * Phase 2: services. Phase 3: closePeriod + job. Phase 4: /api/v1/finance REST.
 * Do not put money math in React.
 *
 * Payable truth: settlement_line_items (see payableModel.ts).
 */

export type {
  SettlementCycleType,
  SettlementPeriodStatus,
  FinancialLedgerEntryType,
  FinancialCounterpartyRole,
  SettlementBatchKind,
  SettlementBatchStatus,
  SettlementPayeeRole,
  SettlementLineComponent,
  HostSalaryStatus,
  SettlementEventType,
  CreatorPerformanceTier,
  SettlementConfigSnapshot,
  SettlementPeriod,
  FinancialLedgerEntry,
  SettlementBatch,
  SettlementLineItem,
  SettlementEvent,
  CreatorPeriodSnapshot,
} from '../../shared/finance/types';

// Config
export {
  loadFinanceSystemConfig,
  getCachedFinanceConfig,
  invalidateFinanceConfigCache,
  refreshFinanceConfigInBackground,
  defaultFinanceSystemConfig,
  updateFinanceSystemConfig,
  type FinanceSystemConfig,
  type FinanceConfigPatch,
} from './config';

export { freezeFinanceConfigSnapshot } from './configSnapshot';

// Period
export {
  getCurrentPeriodBounds,
  getNextCloseAt,
  ensureOpenPeriod,
  computeCloseScheduledAt,
  normalizeCycleType,
  type PeriodBounds,
} from './period';

// FX
export {
  coinsToUsd,
  usdToCoins,
  normalizeFxRatio,
  getCoinUsdPeg,
  formatPegExample,
  DEFAULT_COIN_USD_PEG,
  DEFAULT_FEMALE_PAYOUT_RATIO_USD,
  DEFAULT_COIN_TO_USD_RATIO,
  coinsToUsdWithLiveRatio,
  coinsToUsdWithCachedRatio,
  coinsToUsdWithSnapshot,
  getCachedCoinUsdPeg,
} from './fx';

// Target bonus / tiers
export {
  computePerformanceTier,
  computePerformanceTierFromCache,
  computePerformanceTierFromConfig,
  resolveTargetThresholds,
  targetBonusUsdForTier,
  getTargetThresholds,
  DEFAULT_TARGET_THRESHOLDS,
  type TargetTierThresholds,
} from './targetBonus';

// Accrual
export {
  aggregateWalletLedgerEarnings,
  getUserPeriodAccrual,
  type UserAccrualTotals,
  type AccrualQueryResult,
  type AccrualLedgerType,
} from './accrualQuery';

// Payout policy
export {
  PAYOUT_PERIOD_END_ONLY,
  PayoutPolicyError,
  evaluateManualPayoutPolicy,
  assertManualPayoutAllowed,
  assertManualPayoutAllowedSync,
  checkManualPayoutAllowed,
  type PayoutPolicyDecision,
} from './payoutPolicy';

// Ledger
export {
  appendFinancialLedgerEntry,
  appendFinancialLedgerEntries,
  appendReversalEntry,
  type AppendLedgerInput,
} from './ledger';

// Settlement builders
export {
  buildSettlementBatches,
  createSettlementBatchesForPeriod,
  type SettlementPayeeAccrual,
  type BuiltSettlementBatch,
  type BuiltLineItem,
} from './settlement';

// Host share true-up (period close)
export {
  aggregateHostCallBurnForTrueUp,
  planHostShareTrueUps,
  postHostShareTrueUpWallet,
  type HostTrueUpAgg,
  type HostTrueUpPlan,
} from './hostShareTrueUp';

// Status transitions
export {
  SETTLEMENT_STATUS_TRANSITIONS,
  canTransitionSettlementStatus,
  reconcileBatch,
  agencyMarkHostPaid,
  markBatchAdminPaid,
  markPeriodAdminPaid,
  acknowledgePayeeSalary,
  markBatchTlConfirmed,
  cancelSettlementBatch,
  appendSettlementNote,
  recordBatchCreatedEvent,
  normalizePayeeSalaryStatus,
  type TransitionResult,
} from './statusTransition';

// Operational wallet_ledger (gifts/tips → accrual)
export {
  appendGiftEarnLedger,
  loadGiftSharePercents,
  resolveCatalogGiftById,
  type GiftEarnLedgerInput,
  type GiftLedgerKind,
} from './walletLedgerWrite';

export {
  completeCoinPurchase,
  createCheckoutIntent,
  failCheckoutIntent,
  type CoinPurchaseChannel,
  type CoinPurchaseStatus,
  type CompleteCoinPurchaseInput,
  type CompleteCoinPurchaseResult,
  type CheckoutIntentInput,
  type CheckoutIntentResult,
} from './completeCoinPurchase';

export {
  applyCreatorEarnCoins,
  type CreatorMetricsRecord,
} from './creatorEarnMetrics';

// Period close (Phase 3)
export {
  closePeriod,
  closeDuePeriods,
  findDueOpenPeriods,
  findRetryableFailedPeriods,
  type ClosePeriodResult,
  type CloseDuePeriodsResult,
  type ClosePeriodOptions,
} from './closePeriod';

export {
  PAYABLE_SOURCE_OF_TRUTH,
  PAYABLE_MODEL_NOTES,
} from './payableModel';

export {
  listSalaryPeriods,
  loadSalaryPeriodDetail,
  type SalaryPeriodDetail,
  type SalaryTlSection,
  type SalaryPayeeRow,
} from './salaryPeriodView';

export {
  buildSalaryEstimatePreview,
  type SalaryEstimatePreview,
  type SalaryEstimatePayeeRow,
  type SalaryEstimateTlSection,
  type SalaryEstimateScope,
} from './salaryEstimatePreview';

export {
  loadSalaryPayoutDetailsByUserIds,
  type SalaryPayoutDetails,
} from './salaryPayoutAttach';

export { buildSalaryPeriodXlsx, buildSalaryPeriodPdf } from './salaryExport';

export {
  resolveEarningsScopeAccess,
  buildEarningsOverview,
  buildEarningsLedger,
  type ResolveEarningsScopeInput,
  type ResolveEarningsScopeResult,
} from './earningsOverview';

export {
  HOST_SALARY_LINE_COMPONENTS,
  HOST_SALARY_FINANCIAL_ENTRY_TYPES,
  HOST_SALARY_WALLET_TYPES,
  NON_SALARY_REWARD_WALLET_TYPES,
  isGiftWalletMetadata,
  isNonSalaryRewardType,
  isHostSalaryFinancialEntryType,
  labelEarningsMoneyCategory,
  categoryFromSettlementComponent,
} from '../../shared/finance/salaryComponents';

export {
  groupWalletLedgerByCall,
  groupLiveLedgerRowsByCall,
  resolveSessionCallId,
} from '../../shared/finance/groupWalletLedgerByCall';
