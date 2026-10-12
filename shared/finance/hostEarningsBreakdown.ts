/**
 * Host period earnings breakdown — call base / share true-up / tier bonus / gifts.
 * Pure helpers for Finance + host/admin surfaces (Phase 4).
 */

import type { SettlementLineComponent } from './types';
import type { FinancialLedgerEntryType } from './types';

export interface HostEarningsBreakdownAmounts {
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
}

export const EMPTY_HOST_EARNINGS_BREAKDOWN: HostEarningsBreakdownAmounts = {
  callEarningsCoins: 0,
  callEarningsUsd: 0,
  giftEarningsCoins: 0,
  giftEarningsUsd: 0,
  targetShareTrueUpCoins: 0,
  targetShareTrueUpUsd: 0,
  targetBonusCoins: 0,
  targetBonusUsd: 0,
  totalCoins: 0,
  totalUsd: 0,
};

export function labelSettlementComponent(component: string): string {
  switch (component) {
    case 'call_earnings':
      return 'Call earnings (base)';
    case 'gift_earnings':
      return 'Gift earnings';
    case 'target_share_trueup':
      return 'Target share true-up';
    case 'target_bonus':
      return 'Target cash bonus';
    case 'tl_commission':
      return 'Agency commission';
    default:
      return component.replace(/_/g, ' ');
  }
}

export function labelFinancialEntryType(entryType: string): string {
  switch (entryType) {
    case 'HOST_EARN':
      return 'Call / gift earnings (base)';
    case 'TARGET_SHARE_TRUEUP':
      return 'Target share true-up';
    case 'TARGET_BONUS':
      return 'Target cash bonus';
    case 'TL_EARN':
      return 'Agency commission';
    case 'PLATFORM_EARN':
      return 'Platform retained';
    default:
      return entryType;
  }
}

function add(
  a: HostEarningsBreakdownAmounts,
  patch: Partial<HostEarningsBreakdownAmounts>
): HostEarningsBreakdownAmounts {
  const next = { ...a };
  for (const [k, v] of Object.entries(patch)) {
    const key = k as keyof HostEarningsBreakdownAmounts;
    next[key] = (Number(next[key]) || 0) + (Number(v) || 0);
  }
  next.totalCoins =
    next.callEarningsCoins +
    next.giftEarningsCoins +
    next.targetShareTrueUpCoins +
    next.targetBonusCoins;
  next.totalUsd =
    next.callEarningsUsd +
    next.giftEarningsUsd +
    next.targetShareTrueUpUsd +
    next.targetBonusUsd;
  return next;
}

/** Aggregate settlement_line_items for one host payee. */
export function summarizeHostSettlementLines(
  lines: Array<{
    component?: string;
    amountCoins?: number;
    amountUsd?: number;
    amount_coins?: number;
    amount_usd?: number;
  }>
): HostEarningsBreakdownAmounts {
  let out = { ...EMPTY_HOST_EARNINGS_BREAKDOWN };
  for (const li of lines) {
    const coins = Number(li.amountCoins ?? li.amount_coins) || 0;
    const usd = Number(li.amountUsd ?? li.amount_usd) || 0;
    const c = String(li.component || '') as SettlementLineComponent | string;
    if (c === 'call_earnings') {
      out = add(out, { callEarningsCoins: coins, callEarningsUsd: usd });
    } else if (c === 'gift_earnings') {
      out = add(out, { giftEarningsCoins: coins, giftEarningsUsd: usd });
    } else if (c === 'target_share_trueup') {
      out = add(out, { targetShareTrueUpCoins: coins, targetShareTrueUpUsd: usd });
    } else if (c === 'target_bonus') {
      out = add(out, { targetBonusCoins: coins, targetBonusUsd: usd });
    } else if (c !== 'tl_commission') {
      // unknown host components → count toward call base for visibility
      out = add(out, { callEarningsCoins: coins, callEarningsUsd: usd });
    }
  }
  return out;
}

/**
 * Aggregate financial_ledger host rows for one user.
 * HOST_EARN may include call+gift (metadata.call / metadata.gift preferred when present).
 */
export function summarizeHostFinancialLedgerRows(
  rows: Array<{
    entryType?: string;
    entry_type?: string;
    amountCoins?: number;
    amountUsd?: number;
    amount_coins?: number;
    amount_usd?: number;
    metadata?: Record<string, unknown> | null;
  }>
): HostEarningsBreakdownAmounts {
  let out = { ...EMPTY_HOST_EARNINGS_BREAKDOWN };
  for (const row of rows) {
    const t = String(row.entryType ?? row.entry_type ?? '') as FinancialLedgerEntryType | string;
    const coins = Number(row.amountCoins ?? row.amount_coins) || 0;
    const usd = Number(row.amountUsd ?? row.amount_usd) || 0;
    const meta = row.metadata || {};

    if (t === 'TARGET_SHARE_TRUEUP') {
      out = add(out, { targetShareTrueUpCoins: coins, targetShareTrueUpUsd: usd });
    } else if (t === 'TARGET_BONUS') {
      out = add(out, { targetBonusCoins: coins, targetBonusUsd: usd });
    } else if (t === 'HOST_EARN') {
      const call = Number(meta.call);
      const gift = Number(meta.gift);
      if (Number.isFinite(call) || Number.isFinite(gift)) {
        const callC = Math.max(0, Math.round(Number.isFinite(call) ? call : 0));
        const giftC = Math.max(0, Math.round(Number.isFinite(gift) ? gift : 0));
        const sum = callC + giftC;
        const callUsd = sum > 0 ? usd * (callC / sum) : usd;
        const giftUsd = sum > 0 ? usd * (giftC / sum) : 0;
        out = add(out, {
          callEarningsCoins: callC,
          callEarningsUsd: callUsd,
          giftEarningsCoins: giftC,
          giftEarningsUsd: giftUsd,
        });
      } else {
        out = add(out, { callEarningsCoins: coins, callEarningsUsd: usd });
      }
    }
  }
  return out;
}
