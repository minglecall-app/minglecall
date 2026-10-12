/**
 * Group wallet_ledger-like rows to call-composite level for earnings UI/API lists.
 * Pure — no React / Node / DB.
 *
 * One row per (sessionCallId, userId) merging:
 * - Call-minute CALL_DEBIT / HOST_EARN / TL_EARN (billing_minute >= 1)
 * - In-call gifts linked via metadata.session_call_id (GIFT_DEBIT / gift HOST_EARN / TL_EARN)
 *
 * Standalone: feed/chat tips without session_call_id, true-up, rewards, purchases, etc.
 * Burn/gift writes stay per-event; this is group-on-read only.
 */

import type { EarningsLedgerRow, EarningsMoneyCategory } from './types';
import { isGiftWalletMetadata } from './salaryComponents';

export type WalletLedgerGroupInput = {
  id: string;
  createdAt: string;
  entryType: string;
  userId: string | null;
  userName?: string | null;
  teamLeaderId?: string | null;
  callId?: string | null;
  hostId?: string | null;
  hostName?: string | null;
  billingMinute?: number | null;
  amountCoins: number;
  amountUsd: number;
  fxRatio?: number;
  source?: 'wallet' | 'financial';
  category?: EarningsMoneyCategory;
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
  metadata?: unknown;
};

/** Real video-call id for composite grouping (not gift idempotency / tip keys). */
export function resolveSessionCallId(row: {
  callId?: string | null;
  billingMinute?: number | null;
  metadata?: unknown;
}): string | null {
  const meta = row.metadata;
  if (meta && typeof meta === 'object') {
    const sid = String((meta as Record<string, unknown>).session_call_id || '').trim();
    if (sid) return sid;
  }
  const minute = Number(row.billingMinute);
  const callId = String(row.callId || '').trim();
  if (!callId) return null;
  // Minute burns store the real call UUID on call_id
  if (Number.isFinite(minute) && minute >= 1) return callId;
  return null;
}

function isCompositeEligibleType(entryType: string): boolean {
  const t = String(entryType || '');
  return t === 'CALL_DEBIT' || t === 'GIFT_DEBIT' || t === 'HOST_EARN' || t === 'TL_EARN';
}

function pickPrimaryEntryType(types: Set<string>): string {
  if (types.has('CALL_DEBIT')) return 'CALL_DEBIT';
  if (types.has('HOST_EARN')) return 'HOST_EARN';
  if (types.has('TL_EARN')) return 'TL_EARN';
  if (types.has('GIFT_DEBIT')) return 'GIFT_DEBIT';
  return [...types][0] || 'HOST_EARN';
}

function pickCategory(acc: {
  callCoins: number;
  giftCoins: number;
  trueUpCoins: number;
  rewardCoins: number;
  entryType: string;
}): EarningsMoneyCategory {
  if (acc.giftCoins > 0 && acc.callCoins <= 0) return 'gift';
  if (acc.callCoins > 0) {
    if (acc.entryType === 'CALL_DEBIT' || acc.entryType === 'GIFT_DEBIT') return 'platform';
    if (acc.entryType === 'TL_EARN') return 'tl_commission';
    return 'call';
  }
  if (acc.trueUpCoins > 0) return 'true_up';
  if (acc.rewardCoins > 0) return 'reward';
  if (acc.entryType === 'CALL_DEBIT' || acc.entryType === 'GIFT_DEBIT') return 'platform';
  if (acc.entryType === 'TL_EARN') return 'tl_commission';
  return 'other';
}

function toStandaloneRow(row: WalletLedgerGroupInput): EarningsLedgerRow {
  const minute =
    row.billingMinute != null && Number.isFinite(Number(row.billingMinute))
      ? Number(row.billingMinute)
      : null;
  return {
    id: String(row.id),
    createdAt: row.createdAt,
    entryType: String(row.entryType || ''),
    userId: row.userId ? String(row.userId) : null,
    userName: row.userName ?? null,
    teamLeaderId: row.teamLeaderId ?? null,
    callId: row.callId ? String(row.callId) : null,
    hostId: row.hostId ? String(row.hostId) : null,
    hostName: row.hostName ?? null,
    billingMinute: minute,
    billedMinutes: minute != null && minute >= 1 ? 1 : null,
    minuteFrom: minute != null && minute >= 1 ? minute : null,
    minuteTo: minute != null && minute >= 1 ? minute : null,
    grouped: false,
    firstAt: row.createdAt,
    lastAt: row.createdAt,
    amountCoins: Number(row.amountCoins) || 0,
    amountUsd: Number(row.amountUsd) || 0,
    fxRatio: Number(row.fxRatio) || 0,
    source: row.source || 'wallet',
    category: row.category || 'other',
    inSalary: row.inSalary !== false,
    callCoins: Number(row.callCoins) || 0,
    callUsd: Number(row.callUsd) || 0,
    giftCoins: Number(row.giftCoins) || 0,
    giftUsd: Number(row.giftUsd) || 0,
    trueUpCoins: Number(row.trueUpCoins) || 0,
    trueUpUsd: Number(row.trueUpUsd) || 0,
    tierBonusCoins: Number(row.tierBonusCoins) || 0,
    tierBonusUsd: Number(row.tierBonusUsd) || 0,
    rewardCoins: Number(row.rewardCoins) || 0,
    rewardUsd: Number(row.rewardUsd) || 0,
    hostEarnCoins: Number(row.hostEarnCoins) || 0,
    hostEarnUsd: Number(row.hostEarnUsd) || 0,
    tlEarnCoins: Number(row.tlEarnCoins) || 0,
    tlEarnUsd: Number(row.tlEarnUsd) || 0,
    platformRetainedCoins: Number(row.platformRetainedCoins) || 0,
    platformRetainedUsd: Number(row.platformRetainedUsd) || 0,
  };
}

type Acc = {
  callId: string;
  userId: string | null;
  userName: string | null;
  teamLeaderId: string | null;
  hostId: string | null;
  hostName: string | null;
  entryTypes: Set<string>;
  inSalary: boolean;
  fxRatio: number;
  source: 'wallet' | 'financial';
  amountCoins: number;
  amountUsd: number;
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
  hostEarnCoins: number;
  hostEarnUsd: number;
  tlEarnCoins: number;
  tlEarnUsd: number;
  platformRetainedCoins: number;
  platformRetainedUsd: number;
  minutes: Set<number>;
  minuteFrom: number | null;
  minuteTo: number | null;
  firstAt: string;
  lastAt: string;
};

/**
 * Group wallet ledger rows into one composite row per (sessionCallId, userId).
 */
export function groupWalletLedgerByCall(
  rows: WalletLedgerGroupInput[],
  opts?: { sortDesc?: boolean }
): EarningsLedgerRow[] {
  const sortDesc = opts?.sortDesc !== false;
  const groups = new Map<string, Acc>();
  const standalone: EarningsLedgerRow[] = [];
  const orderKeys: string[] = [];

  for (const row of rows) {
    const type = String(row.entryType || '');
    const sessionCallId = resolveSessionCallId(row);
    if (!sessionCallId || !isCompositeEligibleType(type)) {
      standalone.push(toStandaloneRow(row));
      continue;
    }

    const key = `${sessionCallId}|${String(row.userId || '')}`;
    const minuteRaw = Number(row.billingMinute);
    const minute =
      Number.isFinite(minuteRaw) && minuteRaw >= 1 ? Math.floor(minuteRaw) : null;
    const createdAt = String(row.createdAt || '');
    const existing = groups.get(key);
    if (!existing) {
      orderKeys.push(key);
      groups.set(key, {
        callId: sessionCallId,
        userId: row.userId ? String(row.userId) : null,
        userName: row.userName ?? null,
        teamLeaderId: row.teamLeaderId ?? null,
        hostId: row.hostId ? String(row.hostId) : null,
        hostName: row.hostName ?? null,
        entryTypes: new Set([type]),
        inSalary: row.inSalary !== false,
        fxRatio: Number(row.fxRatio) || 0,
        source: row.source || 'wallet',
        amountCoins: Number(row.amountCoins) || 0,
        amountUsd: Number(row.amountUsd) || 0,
        callCoins: Number(row.callCoins) || 0,
        callUsd: Number(row.callUsd) || 0,
        giftCoins: Number(row.giftCoins) || 0,
        giftUsd: Number(row.giftUsd) || 0,
        trueUpCoins: Number(row.trueUpCoins) || 0,
        trueUpUsd: Number(row.trueUpUsd) || 0,
        tierBonusCoins: Number(row.tierBonusCoins) || 0,
        tierBonusUsd: Number(row.tierBonusUsd) || 0,
        rewardCoins: Number(row.rewardCoins) || 0,
        rewardUsd: Number(row.rewardUsd) || 0,
        hostEarnCoins: Number(row.hostEarnCoins) || 0,
        hostEarnUsd: Number(row.hostEarnUsd) || 0,
        tlEarnCoins: Number(row.tlEarnCoins) || 0,
        tlEarnUsd: Number(row.tlEarnUsd) || 0,
        platformRetainedCoins: Number(row.platformRetainedCoins) || 0,
        platformRetainedUsd: Number(row.platformRetainedUsd) || 0,
        minutes: minute != null ? new Set([minute]) : new Set(),
        minuteFrom: minute,
        minuteTo: minute,
        firstAt: createdAt,
        lastAt: createdAt,
      });
      continue;
    }

    existing.entryTypes.add(type);
    existing.amountCoins += Number(row.amountCoins) || 0;
    existing.amountUsd += Number(row.amountUsd) || 0;
    existing.callCoins += Number(row.callCoins) || 0;
    existing.callUsd += Number(row.callUsd) || 0;
    existing.giftCoins += Number(row.giftCoins) || 0;
    existing.giftUsd += Number(row.giftUsd) || 0;
    existing.trueUpCoins += Number(row.trueUpCoins) || 0;
    existing.trueUpUsd += Number(row.trueUpUsd) || 0;
    existing.tierBonusCoins += Number(row.tierBonusCoins) || 0;
    existing.tierBonusUsd += Number(row.tierBonusUsd) || 0;
    existing.rewardCoins += Number(row.rewardCoins) || 0;
    existing.rewardUsd += Number(row.rewardUsd) || 0;
    existing.hostEarnCoins += Number(row.hostEarnCoins) || 0;
    existing.hostEarnUsd += Number(row.hostEarnUsd) || 0;
    existing.tlEarnCoins += Number(row.tlEarnCoins) || 0;
    existing.tlEarnUsd += Number(row.tlEarnUsd) || 0;
    existing.platformRetainedCoins += Number(row.platformRetainedCoins) || 0;
    existing.platformRetainedUsd += Number(row.platformRetainedUsd) || 0;
    if (minute != null) {
      existing.minutes.add(minute);
      existing.minuteFrom =
        existing.minuteFrom == null ? minute : Math.min(existing.minuteFrom, minute);
      existing.minuteTo =
        existing.minuteTo == null ? minute : Math.max(existing.minuteTo, minute);
    }
    if (createdAt && (!existing.firstAt || createdAt < existing.firstAt)) {
      existing.firstAt = createdAt;
    }
    if (createdAt && (!existing.lastAt || createdAt > existing.lastAt)) {
      existing.lastAt = createdAt;
    }
    if (!existing.userName && row.userName) existing.userName = row.userName;
    if (!existing.hostId && row.hostId) existing.hostId = String(row.hostId);
    if (!existing.hostName && row.hostName) existing.hostName = row.hostName;
    if (row.inSalary === false) existing.inSalary = false;
  }

  const groupedRows: EarningsLedgerRow[] = orderKeys.map((key) => {
    const g = groups.get(key)!;
    const entryType = pickPrimaryEntryType(g.entryTypes);
    const billedMinutes = g.minutes.size > 0 ? g.minutes.size : null;
    const category = pickCategory({
      callCoins: g.callCoins,
      giftCoins: g.giftCoins,
      trueUpCoins: g.trueUpCoins,
      rewardCoins: g.rewardCoins,
      entryType,
    });
    return {
      id: `callgrp:${g.callId}:${g.userId || 'none'}`,
      createdAt: g.lastAt || g.firstAt,
      entryType,
      userId: g.userId,
      userName: g.userName,
      teamLeaderId: g.teamLeaderId,
      callId: g.callId,
      hostId: g.hostId,
      hostName: g.hostName,
      billingMinute: null,
      billedMinutes,
      minuteFrom: g.minuteFrom,
      minuteTo: g.minuteTo,
      grouped: true,
      firstAt: g.firstAt,
      lastAt: g.lastAt,
      amountCoins: g.amountCoins,
      amountUsd: g.amountUsd,
      fxRatio: g.fxRatio,
      source: g.source,
      category,
      inSalary: g.inSalary,
      callCoins: g.callCoins,
      callUsd: g.callUsd,
      giftCoins: g.giftCoins,
      giftUsd: g.giftUsd,
      trueUpCoins: g.trueUpCoins,
      trueUpUsd: g.trueUpUsd,
      tierBonusCoins: g.tierBonusCoins,
      tierBonusUsd: g.tierBonusUsd,
      rewardCoins: g.rewardCoins,
      rewardUsd: g.rewardUsd,
      hostEarnCoins: g.hostEarnCoins,
      hostEarnUsd: g.hostEarnUsd,
      tlEarnCoins: g.tlEarnCoins,
      tlEarnUsd: g.tlEarnUsd,
      platformRetainedCoins: g.platformRetainedCoins,
      platformRetainedUsd: g.platformRetainedUsd,
    };
  });

  const merged = [...groupedRows, ...standalone];
  merged.sort((a, b) => {
    const ta = String(a.lastAt || a.createdAt || '');
    const tb = String(b.lastAt || b.createdAt || '');
    return sortDesc ? tb.localeCompare(ta) : ta.localeCompare(tb);
  });
  return merged;
}

/** Live-ledger shaped rows — minute-level group (ops helpers / male wallet). */
export type LiveLedgerGroupInput = {
  id: string;
  userId: string;
  userName?: string | null;
  userEmail?: string | null;
  callId?: string | null;
  transactionType: string;
  amountCoins: number;
  balanceAfter?: number;
  billingMinute?: number;
  metadata?: unknown;
  createdAt: string;
};

export type LiveLedgerGroupedRow = LiveLedgerGroupInput & {
  billedMinutes: number | null;
  minuteFrom: number | null;
  minuteTo: number | null;
  grouped: boolean;
  firstAt: string | null;
  lastAt: string | null;
};

/**
 * Group live-ledger CALL_DEBIT minutes only (gifts stay standalone).
 * Used by male wallet; admin live ledger should stay raw per-event.
 */
export function groupLiveLedgerRowsByCall(
  rows: LiveLedgerGroupInput[],
  opts?: { sortDesc?: boolean }
): LiveLedgerGroupedRow[] {
  type LiveAcc = {
    callId: string;
    userId: string;
    userName: string | null;
    userEmail: string | null;
    transactionType: string;
    amountCoins: number;
    balanceAfter: number;
    metadata: unknown;
    minutes: Set<number>;
    minuteFrom: number;
    minuteTo: number;
    firstAt: string;
    lastAt: string;
  };

  const groups = new Map<string, LiveAcc>();
  const standalone: LiveLedgerGroupedRow[] = [];
  const orderKeys: string[] = [];
  const sortDesc = opts?.sortDesc !== false;

  for (const row of rows) {
    const type = String(row.transactionType || '');
    const sessionCallId = resolveSessionCallId({
      callId: row.callId,
      billingMinute: row.billingMinute,
      metadata: row.metadata,
    });
    const minute = Number(row.billingMinute);
    const canGroup =
      type === 'CALL_DEBIT' &&
      Boolean(sessionCallId) &&
      Number.isFinite(minute) &&
      minute >= 1 &&
      !isGiftWalletMetadata(row.metadata);

    if (!canGroup) {
      const m =
        row.billingMinute != null && Number.isFinite(Number(row.billingMinute))
          ? Number(row.billingMinute)
          : null;
      standalone.push({
        ...row,
        billedMinutes: m != null && m >= 1 ? 1 : null,
        minuteFrom: m != null && m >= 1 ? m : null,
        minuteTo: m != null && m >= 1 ? m : null,
        grouped: false,
        firstAt: row.createdAt,
        lastAt: row.createdAt,
      });
      continue;
    }

    const key = `${sessionCallId}|${row.userId}`;
    const min = Math.floor(minute);
    const createdAt = String(row.createdAt || '');
    const coins = Number(row.amountCoins) || 0;
    const existing = groups.get(key);
    if (!existing) {
      orderKeys.push(key);
      groups.set(key, {
        callId: String(sessionCallId),
        userId: String(row.userId),
        userName: row.userName ?? null,
        userEmail: row.userEmail ?? null,
        transactionType: type,
        amountCoins: coins,
        balanceAfter: Number(row.balanceAfter) || 0,
        metadata: row.metadata,
        minutes: new Set([min]),
        minuteFrom: min,
        minuteTo: min,
        firstAt: createdAt,
        lastAt: createdAt,
      });
      continue;
    }

    existing.amountCoins += coins;
    existing.minutes.add(min);
    existing.minuteFrom = Math.min(existing.minuteFrom, min);
    existing.minuteTo = Math.max(existing.minuteTo, min);
    if (createdAt && (!existing.firstAt || createdAt < existing.firstAt)) {
      existing.firstAt = createdAt;
    }
    if (createdAt && (!existing.lastAt || createdAt > existing.lastAt)) {
      existing.lastAt = createdAt;
      existing.balanceAfter = Number(row.balanceAfter) || existing.balanceAfter;
      existing.metadata = row.metadata ?? existing.metadata;
    }
    if (!existing.userName && row.userName) existing.userName = row.userName;
    if (!existing.userEmail && row.userEmail) existing.userEmail = row.userEmail;
  }

  const groupedRows: LiveLedgerGroupedRow[] = orderKeys.map((key) => {
    const g = groups.get(key)!;
    return {
      id: `callgrp:call_debit:${g.callId}:${g.userId}`,
      userId: g.userId,
      userName: g.userName,
      userEmail: g.userEmail,
      callId: g.callId,
      transactionType: g.transactionType,
      amountCoins: g.amountCoins,
      balanceAfter: g.balanceAfter,
      billingMinute: g.minuteTo,
      metadata: g.metadata,
      createdAt: g.lastAt || g.firstAt,
      billedMinutes: g.minutes.size,
      minuteFrom: g.minuteFrom,
      minuteTo: g.minuteTo,
      grouped: true,
      firstAt: g.firstAt,
      lastAt: g.lastAt,
    };
  });

  const merged = [...groupedRows, ...standalone];
  merged.sort((a, b) => {
    const ta = String(a.lastAt || a.createdAt || '');
    const tb = String(b.lastAt || b.createdAt || '');
    return sortDesc ? tb.localeCompare(ta) : ta.localeCompare(tb);
  });
  return merged;
}
