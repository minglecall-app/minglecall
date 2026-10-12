/**
 * Canonical source of truth: which host earning components enter salary / settlement.
 *
 * Salary formula (host): call + gift + target_share_trueup + target_bonus
 * NOT in salary: REWARD_* (spendable coin_balance), peak-hours discovery boosts,
 * and any separate "instant cash bonus" product line (does not exist — tier cash bonus only).
 */

import type { SettlementLineComponent } from './types';

/** Settlement line components that count toward host salary. */
export const HOST_SALARY_LINE_COMPONENTS: readonly SettlementLineComponent[] = [
  'call_earnings',
  'gift_earnings',
  'target_share_trueup',
  'target_bonus',
] as const;

/** financial_ledger entry types that count toward host salary books. */
export const HOST_SALARY_FINANCIAL_ENTRY_TYPES = [
  'HOST_EARN',
  'TARGET_SHARE_TRUEUP',
  'TARGET_BONUS',
] as const;

/** wallet_ledger types that accrue into host salary (live). TARGET_BONUS is close-only. */
export const HOST_SALARY_WALLET_TYPES = ['HOST_EARN', 'TARGET_SHARE_TRUEUP'] as const;

/** Spendable rewards — never salary. */
export const NON_SALARY_REWARD_WALLET_TYPES = [
  'REWARD_STREAK',
  'REWARD_MISSION',
  'REWARD_MASTER_CHEST',
] as const;

export type EarningsMoneyCategory =
  | 'call'
  | 'gift'
  | 'true_up'
  | 'tier_bonus'
  | 'tl_commission'
  | 'platform'
  | 'reward'
  | 'other';

export function isGiftWalletMetadata(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== 'object') return false;
  const m = metadata as Record<string, unknown>;
  const kind = String(m.kind || m.source || m.category || '').toLowerCase();
  return kind === 'gift' || kind === 'virtual_gift' || m.is_gift === true;
}

export function isNonSalaryRewardType(transactionType: string): boolean {
  return (NON_SALARY_REWARD_WALLET_TYPES as readonly string[]).includes(String(transactionType));
}

export function isHostSalaryFinancialEntryType(entryType: string): boolean {
  return (HOST_SALARY_FINANCIAL_ENTRY_TYPES as readonly string[]).includes(String(entryType));
}

export function labelEarningsMoneyCategory(cat: EarningsMoneyCategory): string {
  switch (cat) {
    case 'call':
      return 'Call earn';
    case 'gift':
      return 'Gift earn';
    case 'true_up':
      return 'Share true-up';
    case 'tier_bonus':
      return 'Tier cash bonus';
    case 'tl_commission':
      return 'Agency commission';
    case 'platform':
      return 'Platform retained';
    case 'reward':
      return 'Reward (not salary)';
    default:
      return 'Other';
  }
}

/** Map settlement component → money category. */
export function categoryFromSettlementComponent(component: string): EarningsMoneyCategory {
  switch (String(component)) {
    case 'call_earnings':
      return 'call';
    case 'gift_earnings':
      return 'gift';
    case 'target_share_trueup':
      return 'true_up';
    case 'target_bonus':
      return 'tier_bonus';
    case 'tl_commission':
      return 'tl_commission';
    default:
      return 'other';
  }
}
