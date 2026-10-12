/**
 * Host call-activity analytics helpers.
 *
 * IMPORTANT (Phase 8 / Phase 1 peg): USD estimates here (coins × Fixed Peg via getCoinUsdPeg)
 * are operational charts only — NOT settlement / cash-out truth.
 * Payable amounts live in settlement_batches / settlement_line_items via the Financial Module.
 */

import { CallLogItem, PayoutRequest, UserProfile, TransactionReceipt, WalletLedgerEntry, SystemSettings } from '../types';
import { DEFAULT_COIN_USD_PEG, getCoinUsdPeg, coinsToUsd } from '../../shared/finance/fx';
import {
  DEFAULT_COIN_BURN_RATE_PER_MIN,
  DEFAULT_COIN_BURN_RATE_FRIEND_PER_MIN,
} from '../../shared/finance/economyBurn';
import { groupLiveLedgerRowsByCall } from '../../shared/finance/groupWalletLedgerByCall';

export interface EarningsDataPoint {
  period: string;
  videoCallsUSD: number;
  audioCallsUSD: number;
  giftsUSD: number;
  rouletteUSD: number;
  totalUSD: number;
  callMinutes: number;
  coinsEarned: number;
}

export interface SpendingDataPoint {
  period: string;
  videoCallsCoins: number;
  chatCoins: number;
  giftsCoins: number;
  momentsCoins: number;
  totalCoins: number;
  totalUSD: number;
}

export interface PeakHourMetric {
  hourLabel: string;
  callVolumePercent: number;
  minutesHosted: number;
  earningsCoins: number;
}

export interface HostMetrics {
  totalCalls: number;
  totalMinutes: number;
  totalCoinsEarned: number;
  lifetimeUSD: number;
  totalCallersCount: number;
  repeatCallersCount: number;
  repeatCallerRatePercent: number;
  videoMinutes: number;
  videoSessions: number;
  videoPercent: number;
  videoAvgMins: number;
  audioMinutes: number;
  audioSessions: number;
  audioPercent: number;
  audioAvgMins: number;
  rouletteMinutes: number;
  rouletteSessions: number;
  roulettePercent: number;
  rouletteAvgMins: number;
  peakHours: PeakHourMetric[];
  peakWindowLabel: string;
  /** null when not stored / no reviews — never invent 5.0 */
  hostQualityScore: number | null;
  /** null when not stored — never invent 100% */
  acceptanceRatePercent: number | null;
  /** True when call_logs (or client) actually record audio/roulette flags */
  hasCallTypeBreakdown: boolean;
}

export interface CallerMetrics {
  totalMinutes: number;
  videoMinutes: number;
  audioMinutes: number;
  totalCoinsSpent: number;
  totalUSDSpent: number;
  monthlyCoinsSpent: number;
  monthlyUSDSpent: number;
  /** null when no persisted gift-sent source exists */
  totalGiftsCount: number | null;
  friendSavingsCoins: number;
  friendSavingsUSD: number;
}

export interface FavoriteHostStat {
  creatorId: string;
  name: string;
  avatarUrl: string;
  nationality: string;
  countryCode: string;
  totalMinutes: number;
  totalCoinsSpent: number;
  totalUSDSpent: number;
  callsCount: number;
  /** null when no persisted gift-sent source exists */
  giftsSentCount: number | null;
  lastCallDate: string;
  isFriend: boolean;
  hourlyCoinRate: number;
  friendHourlyRate: number;
}

/**
 * Generate female host earnings data points dynamically from live call logs
 */
export function computeHostEarningsData(
  hostId: string,
  callLogs: CallLogItem[],
  femalePayoutRatioUSD: number = DEFAULT_COIN_USD_PEG,
  timeframe: 'daily' | 'weekly' | 'monthly' | 'yearly' = 'daily'
): EarningsDataPoint[] {
  const hostLogs = callLogs.filter((log) => log.receiverId === hostId || log.callerId === hostId);
  const now = new Date();
  const points: EarningsDataPoint[] = [];

  if (timeframe === 'daily') {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(now.getDate() - i);
      const dayName = days[d.getDay()];
      const monthDay = `${d.toLocaleString('default', { month: 'short' })} ${d.getDate()}`;
      const periodLabel = `${dayName} (${monthDay})`;

      const dayLogs = hostLogs.filter((l) => {
        const logDate = new Date(l.startTime || l.timestamp || Date.now());
        return logDate.toDateString() === d.toDateString();
      });

      const coinsEarned = dayLogs.reduce((acc, l) => acc + (l.coinsEarned || 0), 0);
      const minutes = dayLogs.reduce((acc, l) => acc + Math.round((l.durationSeconds || 0) / 60), 0);
      const totalUSD = Number((coinsEarned * femalePayoutRatioUSD).toFixed(2));

      // Real call earnings only — no cosmetic Video/Audio/Gifts percentage splits
      points.push({
        period: periodLabel,
        videoCallsUSD: totalUSD,
        audioCallsUSD: 0,
        giftsUSD: 0,
        rouletteUSD: 0,
        totalUSD,
        callMinutes: minutes,
        coinsEarned,
      });
    }
  } else if (timeframe === 'weekly') {
    for (let i = 7; i >= 0; i--) {
      const weekStart = new Date();
      weekStart.setDate(now.getDate() - i * 7);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);

      const weekLabel = `${weekStart.toLocaleString('default', { month: 'short' })} ${weekStart.getDate()}`;

      const weekLogs = hostLogs.filter((l) => {
        const logDate = new Date(l.startTime || l.timestamp || Date.now());
        return logDate >= weekStart && logDate <= weekEnd;
      });

      const coinsEarned = weekLogs.reduce((acc, l) => acc + (l.coinsEarned || 0), 0);
      const minutes = weekLogs.reduce((acc, l) => acc + Math.round((l.durationSeconds || 0) / 60), 0);
      const totalUSD = Number((coinsEarned * femalePayoutRatioUSD).toFixed(2));

      points.push({
        period: weekLabel,
        videoCallsUSD: totalUSD,
        audioCallsUSD: 0,
        giftsUSD: 0,
        rouletteUSD: 0,
        totalUSD,
        callMinutes: minutes,
        coinsEarned,
      });
    }
  } else if (timeframe === 'monthly') {
    for (let i = 5; i >= 0; i--) {
      const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthLabel = m.toLocaleString('default', { month: 'short', year: 'numeric' });

      const monthLogs = hostLogs.filter((l) => {
        const logDate = new Date(l.startTime || l.timestamp || Date.now());
        return logDate.getMonth() === m.getMonth() && logDate.getFullYear() === m.getFullYear();
      });

      const coinsEarned = monthLogs.reduce((acc, l) => acc + (l.coinsEarned || 0), 0);
      const minutes = monthLogs.reduce((acc, l) => acc + Math.round((l.durationSeconds || 0) / 60), 0);
      const totalUSD = Number((coinsEarned * femalePayoutRatioUSD).toFixed(2));

      points.push({
        period: monthLabel,
        videoCallsUSD: totalUSD,
        audioCallsUSD: 0,
        giftsUSD: 0,
        rouletteUSD: 0,
        totalUSD,
        callMinutes: minutes,
        coinsEarned,
      });
    }
  } else {
    // Yearly
    for (let i = 2; i >= 0; i--) {
      const year = now.getFullYear() - i;
      const yearLogs = hostLogs.filter((l) => {
        const logDate = new Date(l.startTime || l.timestamp || Date.now());
        return logDate.getFullYear() === year;
      });

      const coinsEarned = yearLogs.reduce((acc, l) => acc + (l.coinsEarned || 0), 0);
      const minutes = yearLogs.reduce((acc, l) => acc + Math.round((l.durationSeconds || 0) / 60), 0);
      const totalUSD = Number((coinsEarned * femalePayoutRatioUSD).toFixed(2));

      points.push({
        period: `${year}`,
        videoCallsUSD: totalUSD,
        audioCallsUSD: 0,
        giftsUSD: 0,
        rouletteUSD: 0,
        totalUSD,
        callMinutes: minutes,
        coinsEarned,
      });
    }
  }

  return points;
}

/**
 * Compute real host comprehensive metrics from database call logs
 */
export function computeHostMetrics(
  user: UserProfile,
  callLogs: CallLogItem[],
  femalePayoutRatioUSD: number = DEFAULT_COIN_USD_PEG
): HostMetrics {
  const hostLogs = callLogs.filter((l) => l.receiverId === user.id);
  const totalCalls = hostLogs.length || (user.totalCallsHosted || 0);
  const totalMinutes = hostLogs.reduce((acc, l) => acc + Math.round((l.durationSeconds || 0) / 60), 0) || (user.totalCallMinutes || 0);
  const totalCoinsEarned = user.earningsCoins ?? hostLogs.reduce((acc, l) => acc + (l.coinsEarned || 0), 0);
  const lifetimeUSD = user.totalLifetimeEarnedUSD || (totalCoinsEarned * femalePayoutRatioUSD);

  // Callers
  const callerIds = hostLogs.map((l) => l.callerId);
  const callerCountMap = new Map<string, number>();
  callerIds.forEach((id) => {
    callerCountMap.set(id, (callerCountMap.get(id) || 0) + 1);
  });
  const totalCallersCount = callerCountMap.size;
  let repeatCallersCount = 0;
  callerCountMap.forEach((count) => {
    if (count > 1) repeatCallersCount++;
  });
  const repeatCallerRatePercent = totalCallersCount > 0 ? Number(((repeatCallersCount / totalCallersCount) * 100).toFixed(1)) : 0;

  // Session Types — only when logs actually carry audio/roulette flags (schema does not persist these)
  const hasCallTypeBreakdown = hostLogs.some(
    (l) => l.isAudioOnly === true || l.isRoulette === true
  );
  const videoLogs = hasCallTypeBreakdown
    ? hostLogs.filter((l) => !l.isAudioOnly && !l.isRoulette)
    : hostLogs;
  const audioLogs = hasCallTypeBreakdown ? hostLogs.filter((l) => l.isAudioOnly) : [];
  const rouletteLogs = hasCallTypeBreakdown ? hostLogs.filter((l) => l.isRoulette) : [];

  const videoMinutes = videoLogs.reduce((acc, l) => acc + Math.round((l.durationSeconds || 0) / 60), 0);
  const audioMinutes = audioLogs.reduce((acc, l) => acc + Math.round((l.durationSeconds || 0) / 60), 0);
  const rouletteMinutes = rouletteLogs.reduce((acc, l) => acc + Math.round((l.durationSeconds || 0) / 60), 0);

  const totalTypeMins = (videoMinutes + audioMinutes + rouletteMinutes) || 1;
  const videoPercent = hasCallTypeBreakdown
    ? Math.round((videoMinutes / totalTypeMins) * 100)
    : hostLogs.length > 0
    ? 100
    : 0;
  const audioPercent = hasCallTypeBreakdown ? Math.round((audioMinutes / totalTypeMins) * 100) : 0;
  const roulettePercent = hasCallTypeBreakdown
    ? Math.max(0, 100 - videoPercent - audioPercent)
    : 0;

  const videoAvgMins = videoLogs.length > 0 ? Number((videoMinutes / videoLogs.length).toFixed(1)) : 0;
  const audioAvgMins = audioLogs.length > 0 ? Number((audioMinutes / audioLogs.length).toFixed(1)) : 0;
  const rouletteAvgMins = rouletteLogs.length > 0 ? Number((rouletteMinutes / rouletteLogs.length).toFixed(1)) : 0;

  // Peak Hours Heatmap (8 3-hour windows)
  const hourBuckets = [
    { label: '12 AM', start: 0, end: 2 },
    { label: '3 AM', start: 3, end: 5 },
    { label: '6 AM', start: 6, end: 8 },
    { label: '9 AM', start: 9, end: 11 },
    { label: '12 PM', start: 12, end: 14 },
    { label: '3 PM', start: 15, end: 17 },
    { label: '6 PM', start: 18, end: 20 },
    { label: '9 PM', start: 21, end: 23 },
  ];

  let maxBucketIndex = -1;
  let maxBucketCount = -1;

  const peakHours: PeakHourMetric[] = hourBuckets.map((bucket, idx) => {
    const bucketLogs = hostLogs.filter((l) => {
      const d = new Date(l.startTime || l.timestamp || Date.now());
      const h = d.getHours();
      return h >= bucket.start && h <= bucket.end;
    });

    const mins = bucketLogs.reduce((acc, l) => acc + Math.round((l.durationSeconds || 0) / 60), 0);
    const coins = bucketLogs.reduce((acc, l) => acc + (l.coinsEarned || 0), 0);
    const percent = hostLogs.length > 0 ? Math.round((bucketLogs.length / hostLogs.length) * 100) : 0;

    if (bucketLogs.length > maxBucketCount) {
      maxBucketCount = bucketLogs.length;
      maxBucketIndex = idx;
    }

    return {
      hourLabel: bucket.label,
      callVolumePercent: percent,
      minutesHosted: mins,
      earningsCoins: coins,
    };
  });

  const peakWindowLabel = hostLogs.length > 0 && maxBucketIndex >= 0
    ? `${hourBuckets[maxBucketIndex].label} - ${hourBuckets[(maxBucketIndex + 1) % 8].label}`
    : 'N/A';

  // Only surface stored quality/acceptance — never invent 5.0 / 100% in the helper
  const hasStoredRating =
    typeof user.ratingScore === 'number' &&
    Number.isFinite(user.ratingScore) &&
    (user.totalReviewsCount || 0) > 0;
  const hasStoredAcceptance =
    typeof user.acceptanceRatePercent === 'number' && Number.isFinite(user.acceptanceRatePercent);

  return {
    totalCalls,
    totalMinutes,
    totalCoinsEarned,
    lifetimeUSD: Number(lifetimeUSD.toFixed(2)),
    totalCallersCount,
    repeatCallersCount,
    repeatCallerRatePercent,
    videoMinutes,
    videoSessions: videoLogs.length,
    videoPercent,
    videoAvgMins,
    audioMinutes,
    audioSessions: audioLogs.length,
    audioPercent,
    audioAvgMins,
    rouletteMinutes,
    rouletteSessions: rouletteLogs.length,
    roulettePercent,
    rouletteAvgMins,
    peakHours,
    peakWindowLabel,
    hostQualityScore: hasStoredRating ? user.ratingScore! : null,
    acceptanceRatePercent: hasStoredAcceptance ? user.acceptanceRatePercent! : null,
    hasCallTypeBreakdown,
  };
}

/**
 * Generate male caller spending points dynamically from live call logs
 */
export function computeCallerSpendingData(
  callerId: string,
  callLogs: CallLogItem[],
  coinToUSDRatio: number = DEFAULT_COIN_USD_PEG,
  timeframe: 'daily' | 'weekly' = 'daily'
): SpendingDataPoint[] {
  const userLogs = callLogs.filter((log) => log.callerId === callerId);
  const now = new Date();
  const points: SpendingDataPoint[] = [];

  if (timeframe === 'daily') {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(now.getDate() - i);
      const dayName = days[d.getDay()];
      const monthDay = `${d.toLocaleString('default', { month: 'short' })} ${d.getDate()}`;
      const periodLabel = `${dayName} (${monthDay})`;

      const dayLogs = userLogs.filter((l) => {
        const logDate = new Date(l.startTime || l.timestamp || Date.now());
        return logDate.toDateString() === d.toDateString();
      });

      const totalCoins = dayLogs.reduce((acc, l) => acc + (l.coinsSpent || 0), 0);

      points.push({
        period: periodLabel,
        videoCallsCoins: totalCoins,
        chatCoins: 0,
        giftsCoins: 0,
        momentsCoins: 0,
        totalCoins,
        totalUSD: Number((totalCoins * coinToUSDRatio).toFixed(2)),
      });
    }
  } else {
    for (let i = 7; i >= 0; i--) {
      const weekStart = new Date();
      weekStart.setDate(now.getDate() - i * 7);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      const weekLabel = `${weekStart.toLocaleString('default', { month: 'short' })} ${weekStart.getDate()}`;

      const weekLogs = userLogs.filter((l) => {
        const logDate = new Date(l.startTime || l.timestamp || Date.now());
        return logDate >= weekStart && logDate <= weekEnd;
      });

      const totalCoins = weekLogs.reduce((acc, l) => acc + (l.coinsSpent || 0), 0);

      points.push({
        period: weekLabel,
        videoCallsCoins: totalCoins,
        chatCoins: 0,
        giftsCoins: 0,
        momentsCoins: 0,
        totalCoins,
        totalUSD: Number((totalCoins * coinToUSDRatio).toFixed(2)),
      });
    }
  }

  return points;
}

/**
 * Compute real male caller comprehensive metrics
 */
export function computeCallerMetrics(
  user: UserProfile,
  callLogs: CallLogItem[],
  systemSettings: SystemSettings
): CallerMetrics {
  const userLogs = callLogs.filter((l) => l.callerId === user.id);
  const totalMinutes = userLogs.reduce((acc, l) => acc + Math.round((l.durationSeconds || 0) / 60), 0);
  const videoLogs = userLogs.filter((l) => !l.isAudioOnly);
  const audioLogs = userLogs.filter((l) => l.isAudioOnly);

  const videoMinutes = videoLogs.reduce((acc, l) => acc + Math.round((l.durationSeconds || 0) / 60), 0);
  const audioMinutes = audioLogs.reduce((acc, l) => acc + Math.round((l.durationSeconds || 0) / 60), 0);

  const totalCoinsSpent = userLogs.reduce((acc, l) => acc + (l.coinsSpent || 0), 0);
  const coinToUSDRatio = getCoinUsdPeg(systemSettings);
  const totalUSDSpent = Number((totalCoinsSpent * coinToUSDRatio).toFixed(2));

  // Current month spend
  const now = new Date();
  const currentMonthLogs = userLogs.filter((l) => {
    const d = new Date(l.startTime || l.timestamp || Date.now());
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const monthlyCoinsSpent = currentMonthLogs.reduce((acc, l) => acc + (l.coinsSpent || 0), 0);
  const monthlyUSDSpent = Number((monthlyCoinsSpent * coinToUSDRatio).toFixed(2));

  // Friend rate savings: (standardRate - friendRate) * callMinutes
  const standardRate = systemSettings.coinBurnRatePerMin || DEFAULT_COIN_BURN_RATE_PER_MIN;
  const friendRate = systemSettings.coinBurnRateFriendPerMin || DEFAULT_COIN_BURN_RATE_FRIEND_PER_MIN;
  const discountPerMin = Math.max(0, standardRate - friendRate);

  const friendSavingsCoins = userLogs
    .filter((l) => l.wasFriendCall)
    .reduce((acc, l) => acc + Math.round((l.durationSeconds || 0) / 60) * discountPerMin, 0);

  const friendSavingsUSD = Number((friendSavingsCoins * coinToUSDRatio).toFixed(2));

  return {
    totalMinutes,
    videoMinutes,
    audioMinutes,
    totalCoinsSpent,
    totalUSDSpent,
    monthlyCoinsSpent,
    monthlyUSDSpent,
    // GIFT_DEBIT rows exist for finance; male spend KPI still omits gift count until a dedicated counter is wired
    totalGiftsCount: null,
    friendSavingsCoins,
    friendSavingsUSD,
  };
}

/**
 * Build dynamic favorite hosts for a male caller from call logs
 */
export function computeFavoriteHosts(
  callerId: string,
  callLogs: CallLogItem[],
  allUsers: UserProfile[],
  friendsList: string[] = [],
  coinToUSDRatio: number = DEFAULT_COIN_USD_PEG
): FavoriteHostStat[] {
  const userLogs = callLogs.filter((l) => l.callerId === callerId);
  const hostMap = new Map<string, { minutes: number; coins: number; count: number; lastDate: string }>();
  const usdRatio = Number.isFinite(coinToUSDRatio) && coinToUSDRatio > 0 ? coinToUSDRatio : DEFAULT_COIN_USD_PEG;

  userLogs.forEach((l) => {
    const prev = hostMap.get(l.receiverId) || { minutes: 0, coins: 0, count: 0, lastDate: l.timestamp };
    hostMap.set(l.receiverId, {
      minutes: prev.minutes + Math.round((l.durationSeconds || 0) / 60),
      coins: prev.coins + (l.coinsSpent || 0),
      count: prev.count + 1,
      lastDate: l.timestamp || prev.lastDate,
    });
  });

  const results: FavoriteHostStat[] = [];
  hostMap.forEach((stat, hostId) => {
    const host = allUsers.find((u) => u.id === hostId);
    if (host) {
      results.push({
        creatorId: host.id,
        name: host.name,
        avatarUrl: host.avatarUrl,
        nationality: host.nationality,
        countryCode: host.countryCode || 'US',
        totalMinutes: stat.minutes,
        totalCoinsSpent: stat.coins,
        totalUSDSpent: Number((stat.coins * usdRatio).toFixed(2)),
        callsCount: stat.count,
        giftsSentCount: null,
        lastCallDate: stat.lastDate,
        isFriend: friendsList.includes(host.id),
        hourlyCoinRate: host.hourlyCoinRate || DEFAULT_COIN_BURN_RATE_PER_MIN,
        friendHourlyRate: Math.floor(
          (host.hourlyCoinRate || DEFAULT_COIN_BURN_RATE_PER_MIN) * 0.5
        ),
      });
    }
  });

  return results.sort((a, b) => b.totalMinutes - a.totalMinutes);
}

function normalizeCallStatementStatus(
  raw?: string
): TransactionReceipt['status'] {
  const s = String(raw || '').toLowerCase();
  if (s === 'completed' || s === 'ended' || s === 'success') return 'completed';
  if (s === 'missed') return 'missed';
  if (s === 'declined') return 'declined';
  if (s === 'rejected') return 'rejected';
  if (s === 'failed') return 'failed';
  // Billed sessions with coin spend are treated as completed call billing
  return 'completed';
}

/**
 * A1: Call spending statements from real call_logs (not payment-gateway purchase invoices).
 */
export function computeCallSpendingStatements(
  userId: string,
  callLogs: CallLogItem[],
  coinToUSDRatio: number = DEFAULT_COIN_USD_PEG
): TransactionReceipt[] {
  const usdRatio = Number.isFinite(coinToUSDRatio) && coinToUSDRatio > 0 ? coinToUSDRatio : DEFAULT_COIN_USD_PEG;
  const userLogs = callLogs
    .filter((l) => l.callerId === userId)
    .slice()
    .sort((a, b) => {
      const ta = new Date(a.startTime || a.timestamp || 0).getTime();
      const tb = new Date(b.startTime || b.timestamp || 0).getTime();
      return tb - ta;
    });

  return userLogs.map((l, idx) => {
    const mins = Math.max(0, Math.round((l.durationSeconds || 0) / 60));
    const coins = Number(l.coinsSpent || 0);
    const when = l.timestamp || (l.startTime ? new Date(l.startTime).toLocaleString() : 'Unknown');
    const host = l.receiverName || 'Host';
    const year = new Date(l.startTime || Date.now()).getFullYear();
    return {
      id: `stmt_${l.id || idx}`,
      statementNumber: `CALL-${year}-${String(idx + 1).padStart(4, '0')}`,
      userId,
      userName: l.callerName || 'Member',
      description: `1-on-1 call with ${host} (${mins} min)`,
      hostName: host,
      coinsDebited: coins,
      amountUSD: Number((coins * usdRatio).toFixed(2)),
      status: coins > 0 ? 'completed' : normalizeCallStatementStatus(l.status),
      createdAt: when,
      callLogId: l.id,
      durationMinutes: mins,
      source: 'call_log' as const,
    };
  });
}

/** @deprecated Use computeCallSpendingStatements — kept as alias for older imports */
export function computeTransactionReceipts(
  userId: string,
  callLogs: CallLogItem[],
  coinToUSDRatio: number = DEFAULT_COIN_USD_PEG
): TransactionReceipt[] {
  return computeCallSpendingStatements(userId, callLogs, coinToUSDRatio);
}

/** Male spender view: call debits + reward credits only (never host/TL earnings). */
const MALE_SPENDER_LEDGER_TYPES = new Set([
  'CALL_DEBIT',
  'REWARD_STREAK',
  'REWARD_MISSION',
  'REWARD_MASTER_CHEST',
]);

/**
 * Build wallet ledger entries from authoritative wallet_ledger rows.
 * Call debits are grouped per call (one row with total coins / minutes).
 */
export function mapWalletLedgerRows(
  rows: Array<{
    id: string;
    userId: string;
    callId?: string;
    transactionType: string;
    amount: number;
    balanceAfter: number;
    billingMinute?: number;
    metadata?: Record<string, any>;
    createdAt?: string;
  }>
): WalletLedgerEntry[] {
  const grouped = groupLiveLedgerRowsByCall(
    rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      callId: row.callId ?? null,
      transactionType: row.transactionType,
      amountCoins: Number(row.amount) || 0,
      balanceAfter: Number(row.balanceAfter) || 0,
      billingMinute: row.billingMinute,
      metadata: row.metadata,
      createdAt: row.createdAt || '',
    }))
  );

  return grouped.map((row) => {
    const isDebit = row.transactionType === 'CALL_DEBIT' || Number(row.amountCoins) < 0;
    const mins = row.billedMinutes;
    const title =
      row.transactionType === 'CALL_DEBIT'
        ? mins != null && mins > 0
          ? `Call billing · ${mins} min`
          : `Call billing · minute ${row.billingMinute ?? '?'}`
        : row.transactionType === 'REWARD_STREAK'
        ? 'Daily streak reward'
        : row.transactionType === 'REWARD_MISSION'
        ? 'Daily mission reward'
        : row.transactionType === 'REWARD_MASTER_CHEST'
        ? 'Daily master chest reward'
        : 'Wallet entry';

    const category: WalletLedgerEntry['category'] = row.transactionType?.startsWith('REWARD_')
      ? 'daily_bonus'
      : 'call_spend';

    return {
      id: row.id,
      userId: row.userId,
      type: isDebit ? 'debit' : 'credit',
      category,
      title,
      description: row.callId ? `Call ${row.callId}` : undefined,
      coins: Number(row.amountCoins) || 0,
      balanceAfter: Number(row.balanceAfter) || 0,
      timestamp: row.createdAt ? new Date(row.createdAt).toLocaleString() : 'Recent',
      referenceId: row.callId || row.id,
    };
  });
}

/**
 * Prefer authoritative wallet_ledger API rows.
 * - Loaded empty → [] (honest empty; no fabricated opening balance).
 * - API null/unavailable with call history → clearly labeled call-history derivation.
 */
export function computeWalletLedger(
  user: UserProfile,
  callLogs: CallLogItem[],
  ledgerRows?: Array<{
    id: string;
    userId: string;
    callId?: string;
    transactionType: string;
    amount: number;
    balanceAfter: number;
    billingMinute?: number;
    metadata?: Record<string, any>;
    createdAt?: string;
  }> | null
): WalletLedgerEntry[] {
  if (Array.isArray(ledgerRows)) {
    const spenderRows = ledgerRows.filter((r) =>
      MALE_SPENDER_LEDGER_TYPES.has(String(r.transactionType || ''))
    );
    if (spenderRows.length > 0) {
      return mapWalletLedgerRows(spenderRows);
    }
    // Authoritative empty ledger — do not invent rows
    return [];
  }

  // Ledger API not loaded / failed: optional derivation from call logs only (no fake opening credit)
  const userLogs = callLogs.filter((l) => l.callerId === user.id && (l.coinsSpent || 0) > 0);
  if (userLogs.length === 0) return [];

  return userLogs
    .slice()
    .sort((a, b) => {
      const ta = new Date(a.startTime || a.timestamp || 0).getTime();
      const tb = new Date(b.startTime || b.timestamp || 0).getTime();
      return tb - ta;
    })
    .map((l) => ({
      id: `derived_${l.id}`,
      userId: user.id,
      type: 'debit' as const,
      category: 'call_spend' as const,
      title: `Derived from call history · ${l.receiverName || 'Host'}`,
      description: 'Estimated from call log (wallet ledger unavailable)',
      coins: -(l.coinsSpent || 0),
      balanceAfter: 0,
      counterpartName: l.receiverName,
      counterpartAvatar: l.receiverAvatar,
      timestamp: l.timestamp || (l.startTime ? new Date(l.startTime).toLocaleString() : 'Recent'),
      referenceId: l.id,
    }));
}

/**
 * Platform retention from a burned minute using creator split rules.
 * female_creator: host% + tl% to parties, remainder platform.
 * otherwise: 100% platform.
 */
export function computePlatformRetentionCoins(
  coinsBurned: number,
  hostEarned: number,
  tlEarned: number
): number {
  return Math.max(0, (coinsBurned || 0) - (hostEarned || 0) - (tlEarned || 0));
}
