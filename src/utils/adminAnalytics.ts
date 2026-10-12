import {
  CallLogItem,
  PayoutRequest,
  SystemSettings,
  UserProfile,
  isFemaleCreatorRole,
} from '../types';
import { getCoinUsdPeg } from '../../shared/finance/fx';
import { computePlatformRetentionCoins } from './analyticsHelper';

/** Admin analytics cohort roles used in filters / badges. */
export type AdminAnalyticsRole =
  | 'male_user'
  | 'female_user'
  | 'female_creator'
  | 'team_leader'
  | 'admin'
  | 'other';

export type DatePreset =
  | 'today'
  | '7d'
  | '15d'
  | '30d'
  | '365d'
  | 'settlement_period'
  | 'custom';

export interface DateRange {
  start: Date;
  end: Date;
  preset: DatePreset;
}

export interface AdminAnalyticsFilters {
  range: DateRange;
  role: AdminAnalyticsRole | 'all';
  country: string | 'all';
  agencyId: string | 'all';
  search: string;
}

export const ROLE_COLORS: Record<AdminAnalyticsRole, { bg: string; text: string; border: string; label: string }> = {
  male_user: {
    bg: 'bg-indigo-500/20',
    text: 'text-indigo-300',
    border: 'border-indigo-500/30',
    label: 'Male User',
  },
  female_user: {
    bg: 'bg-pink-500/20',
    text: 'text-pink-300',
    border: 'border-pink-500/30',
    label: 'Regular Female',
  },
  female_creator: {
    bg: 'bg-emerald-500/20',
    text: 'text-emerald-300',
    border: 'border-emerald-500/30',
    label: 'Female Creator',
  },
  team_leader: {
    bg: 'bg-amber-500/20',
    text: 'text-amber-300',
    border: 'border-amber-500/30',
    label: 'Agency',
  },
  admin: {
    bg: 'bg-slate-500/20',
    text: 'text-slate-300',
    border: 'border-slate-500/30',
    label: 'Admin',
  },
  other: {
    bg: 'bg-slate-700/40',
    text: 'text-slate-400',
    border: 'border-slate-600/40',
    label: 'Other',
  },
};

export function resolveAdminAnalyticsRole(user: UserProfile): AdminAnalyticsRole {
  const role = user.role;
  if (role === 'admin') return 'admin';
  if (role === 'team_leader' || role === 'agency_manager') return 'team_leader';
  if (isFemaleCreatorRole(role)) return 'female_creator';
  if (role === 'female_user') return 'female_user';
  if (role === 'male_user') return 'male_user';
  if (user.gender === 'female') {
    // Legacy profiles: TL-managed female without explicit creator role still count as supply
    if (user.teamLeaderId) return 'female_creator';
    return 'female_user';
  }
  if (user.gender === 'male') return 'male_user';
  return 'other';
}

export function isEarningEligibleCreator(
  user: UserProfile,
  settings: SystemSettings
): boolean {
  const cohort = resolveAdminAnalyticsRole(user);
  if (cohort === 'female_creator') return true;
  if (cohort === 'female_user') {
    return Boolean(settings.enableRegularFemaleCoinEarning);
  }
  return false;
}

/** Start of calendar day in UTC. */
export function utcStartOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

/** Inclusive end of calendar day in UTC (23:59:59.999). */
export function utcEndOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

/** Parse YYYY-MM-DD as a UTC calendar day (start or inclusive end). */
export function parseUtcDateOnly(ymd: string, endOfDay = false): Date {
  const parts = String(ymd || '')
    .trim()
    .slice(0, 10)
    .split('-')
    .map(Number);
  const y = parts[0];
  const m = parts[1];
  const day = parts[2];
  if (!y || !m || !day) {
    const fallback = new Date();
    return endOfDay ? utcEndOfDay(fallback) : utcStartOfDay(fallback);
  }
  if (endOfDay) return new Date(Date.UTC(y, m - 1, day, 23, 59, 59, 999));
  return new Date(Date.UTC(y, m - 1, day, 0, 0, 0, 0));
}

/** Last N UTC calendar days inclusive of today (N=7 → today + prior 6). */
function utcRollingInclusiveDays(daysInclusive: number): { start: Date; end: Date } {
  const now = new Date();
  const end = utcEndOfDay(now);
  const start = utcStartOfDay(now);
  start.setUTCDate(start.getUTCDate() - (Math.max(1, daysInclusive) - 1));
  return { start, end };
}

/**
 * Build analytics date range with consistent UTC bounds.
 * Rolling presets are inclusive calendar days in UTC.
 * Settlement period uses finance [periodStart, periodEnd) → inclusive end is periodEnd − 1ms.
 */
export function buildDateRange(
  preset: DatePreset,
  customStart?: string,
  customEnd?: string
): DateRange {
  if (preset === 'today') {
    const now = new Date();
    return { start: utcStartOfDay(now), end: utcEndOfDay(now), preset };
  }
  if (preset === '7d') {
    const { start, end } = utcRollingInclusiveDays(7);
    return { start, end, preset };
  }
  if (preset === '15d') {
    const { start, end } = utcRollingInclusiveDays(15);
    return { start, end, preset };
  }
  if (preset === '30d') {
    const { start, end } = utcRollingInclusiveDays(30);
    return { start, end, preset };
  }
  if (preset === '365d') {
    const { start, end } = utcRollingInclusiveDays(365);
    return { start, end, preset };
  }
  if (preset === 'settlement_period') {
    // Bounds must come from finance API via buildSettlementPeriodRange — fall back to 7d UTC
    const { start, end } = utcRollingInclusiveDays(7);
    return { start, end, preset: 'settlement_period' };
  }

  const s = customStart ? parseUtcDateOnly(customStart, false) : utcStartOfDay(new Date());
  const e = customEnd ? parseUtcDateOnly(customEnd, true) : utcEndOfDay(new Date());
  return { start: s, end: e.getTime() < s.getTime() ? utcEndOfDay(s) : e, preset: 'custom' };
}

/**
 * Map finance current-period bounds (half-open UTC) onto inclusive analytics DateRange.
 */
export function buildSettlementPeriodRange(periodStartIso: string, periodEndIso: string): DateRange {
  const start = new Date(periodStartIso);
  const endExclusive = new Date(periodEndIso);
  const end = new Date(Math.max(start.getTime(), endExclusive.getTime() - 1));
  return { start, end, preset: 'settlement_period' };
}

/** Short UTC label for filter helper text. */
export function formatDateRangeUtcLabel(range: DateRange): string {
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return `${fmt(range.start)} → ${fmt(range.end)} UTC`;
}

export function getLogTimestamp(log: CallLogItem): number {
  if (typeof log.startTime === 'number' && Number.isFinite(log.startTime) && log.startTime > 0) {
    return log.startTime;
  }
  if (log.timestamp) {
    const parsed = Date.parse(log.timestamp);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

export function isInRange(ts: number, range: DateRange): boolean {
  if (!ts) return false;
  return ts >= range.start.getTime() && ts <= range.end.getTime();
}

export function filterCallLogsByRange(logs: CallLogItem[], range: DateRange): CallLogItem[] {
  return logs.filter((l) => isInRange(getLogTimestamp(l), range));
}

export function filterPayoutsByRange(
  payouts: PayoutRequest[],
  range: DateRange,
  dateField: 'request' | 'processed' = 'request'
): PayoutRequest[] {
  return payouts.filter((p) => {
    const raw = dateField === 'processed' ? p.processedDate || p.requestDate : p.requestDate;
    const ts = Date.parse(raw || '');
    return Number.isFinite(ts) && isInRange(ts, range);
  });
}

export interface BurnSplit {
  burnedCoins: number;
  hostEarnedCoins: number;
  tlEarnedCoins: number;
  platformRetainedCoins: number;
  managedBurnCoins: number;
  unmanagedBurnCoins: number;
}

export function computeBurnSplit(logs: CallLogItem[]): BurnSplit {
  let burnedCoins = 0;
  let hostEarnedCoins = 0;
  let tlEarnedCoins = 0;
  let platformRetainedCoins = 0;
  let managedBurnCoins = 0;
  let unmanagedBurnCoins = 0;

  logs.forEach((l) => {
    const burned = l.coinsSpent || 0;
    const host = l.coinsEarned || 0;
    const tl = l.teamLeaderEarnedCoins ?? 0;
    burnedCoins += burned;
    hostEarnedCoins += host;
    tlEarnedCoins += tl;
    platformRetainedCoins += computePlatformRetentionCoins(burned, host, tl);
    if (host > 0) managedBurnCoins += burned;
    else unmanagedBurnCoins += burned;
  });

  return {
    burnedCoins,
    hostEarnedCoins,
    tlEarnedCoins,
    platformRetainedCoins,
    managedBurnCoins,
    unmanagedBurnCoins,
  };
}

export interface SessionMix {
  hasCallTypeBreakdown: boolean;
  videoMinutes: number;
  audioMinutes: number;
  rouletteMinutes: number;
  videoPercent: number;
  audioPercent: number;
  roulettePercent: number;
  totalMinutes: number;
  callCount: number;
}

export function computeSessionMix(logs: CallLogItem[]): SessionMix {
  const hasCallTypeBreakdown = logs.some((l) => l.isAudioOnly === true || l.isRoulette === true);
  const totalMinutes = Math.round(
    logs.reduce((acc, l) => acc + (l.durationSeconds || 0), 0) / 60
  );

  if (!hasCallTypeBreakdown) {
    return {
      hasCallTypeBreakdown: false,
      videoMinutes: totalMinutes,
      audioMinutes: 0,
      rouletteMinutes: 0,
      videoPercent: totalMinutes > 0 ? 100 : 0,
      audioPercent: 0,
      roulettePercent: 0,
      totalMinutes,
      callCount: logs.length,
    };
  }

  const videoMinutes = Math.round(
    logs
      .filter((l) => !l.isAudioOnly && !l.isRoulette)
      .reduce((acc, l) => acc + (l.durationSeconds || 0), 0) / 60
  );
  const audioMinutes = Math.round(
    logs.filter((l) => l.isAudioOnly).reduce((acc, l) => acc + (l.durationSeconds || 0), 0) / 60
  );
  const rouletteMinutes = Math.round(
    logs.filter((l) => l.isRoulette).reduce((acc, l) => acc + (l.durationSeconds || 0), 0) / 60
  );
  const total = videoMinutes + audioMinutes + rouletteMinutes || 1;

  return {
    hasCallTypeBreakdown: true,
    videoMinutes,
    audioMinutes,
    rouletteMinutes,
    videoPercent: Math.round((videoMinutes / total) * 100),
    audioPercent: Math.round((audioMinutes / total) * 100),
    roulettePercent: Math.max(0, 100 - Math.round((videoMinutes / total) * 100) - Math.round((audioMinutes / total) * 100)),
    totalMinutes,
    callCount: logs.length,
  };
}

export interface TrendPoint {
  label: string;
  startMs: number;
  endMs: number;
  burnUSD: number;
  hostPayableUSD: number;
  platformMarginUSD: number;
  callCount: number;
  minutes: number;
}

/** Real date-bucket trends from call log timestamps (no synthetic factors). */
export function computeRealTrendSeries(
  logs: CallLogItem[],
  range: DateRange,
  coinToUSD: number,
  femalePayoutRatio: number
): TrendPoint[] {
  const start = new Date(range.start);
  start.setHours(0, 0, 0, 0);
  const end = new Date(range.end);
  end.setHours(23, 59, 59, 999);

  const dayMs = 24 * 60 * 60 * 1000;
  const spanDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / dayMs) + 1);

  // Bucket by day for ≤45d, else by week
  const useDaily = spanDays <= 45;
  const buckets: TrendPoint[] = [];

  if (useDaily) {
    for (let i = 0; i < spanDays; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const bucketStart = new Date(d);
      bucketStart.setHours(0, 0, 0, 0);
      const bucketEnd = new Date(d);
      bucketEnd.setHours(23, 59, 59, 999);
      const dayLogs = logs.filter((l) => {
        const ts = getLogTimestamp(l);
        return ts >= bucketStart.getTime() && ts <= bucketEnd.getTime();
      });
      const split = computeBurnSplit(dayLogs);
      buckets.push({
        label: `${d.toLocaleString('default', { month: 'short' })} ${d.getDate()}`,
        startMs: bucketStart.getTime(),
        endMs: bucketEnd.getTime(),
        burnUSD: Number((split.burnedCoins * coinToUSD).toFixed(2)),
        hostPayableUSD: Number((split.hostEarnedCoins * femalePayoutRatio).toFixed(2)),
        platformMarginUSD: Number((split.platformRetainedCoins * coinToUSD).toFixed(2)),
        callCount: dayLogs.length,
        minutes: Math.round(dayLogs.reduce((a, l) => a + (l.durationSeconds || 0), 0) / 60),
      });
    }
  } else {
    const weeks = Math.ceil(spanDays / 7);
    for (let i = 0; i < weeks; i++) {
      const bucketStart = new Date(start);
      bucketStart.setDate(start.getDate() + i * 7);
      bucketStart.setHours(0, 0, 0, 0);
      const bucketEnd = new Date(bucketStart);
      bucketEnd.setDate(bucketStart.getDate() + 6);
      bucketEnd.setHours(23, 59, 59, 999);
      if (bucketEnd > end) bucketEnd.setTime(end.getTime());
      const weekLogs = logs.filter((l) => {
        const ts = getLogTimestamp(l);
        return ts >= bucketStart.getTime() && ts <= bucketEnd.getTime();
      });
      const split = computeBurnSplit(weekLogs);
      buckets.push({
        label: `${bucketStart.toLocaleString('default', { month: 'short' })} ${bucketStart.getDate()}`,
        startMs: bucketStart.getTime(),
        endMs: bucketEnd.getTime(),
        burnUSD: Number((split.burnedCoins * coinToUSD).toFixed(2)),
        hostPayableUSD: Number((split.hostEarnedCoins * femalePayoutRatio).toFixed(2)),
        platformMarginUSD: Number((split.platformRetainedCoins * coinToUSD).toFixed(2)),
        callCount: weekLogs.length,
        minutes: Math.round(weekLogs.reduce((a, l) => a + (l.durationSeconds || 0), 0) / 60),
      });
    }
  }

  return buckets;
}

export interface PayoutAging {
  aging0to3USD: number;
  aging3to7USD: number;
  aging7plusUSD: number;
  pendingCount: number;
  pendingUSD: number;
  completedUSD: number;
  completedCount: number;
  processingUSD: number;
}

export function computePayoutAging(payouts: PayoutRequest[], now = new Date()): PayoutAging {
  const pending = payouts.filter((p) => p.status === 'pending' || p.status === 'processing');
  const completed = payouts.filter((p) => p.status === 'completed');
  let aging0to3USD = 0;
  let aging3to7USD = 0;
  let aging7plusUSD = 0;

  pending.forEach((p) => {
    const ts = Date.parse(p.requestDate || '');
    const ageDays = Number.isFinite(ts)
      ? (now.getTime() - ts) / (24 * 60 * 60 * 1000)
      : 0;
    const usd = p.amountUSD || 0;
    if (ageDays < 3) aging0to3USD += usd;
    else if (ageDays < 7) aging3to7USD += usd;
    else aging7plusUSD += usd;
  });

  return {
    aging0to3USD,
    aging3to7USD,
    aging7plusUSD,
    pendingCount: pending.length,
    pendingUSD: pending.reduce((a, p) => a + (p.amountUSD || 0), 0),
    completedUSD: completed.reduce((a, p) => a + (p.amountUSD || 0), 0),
    completedCount: completed.length,
    processingUSD: payouts
      .filter((p) => p.status === 'processing')
      .reduce((a, p) => a + (p.amountUSD || 0), 0),
  };
}

export interface PlatformFinanceSnapshot {
  burn: BurnSplit;
  burnUSD: number;
  hostPayableUSD: number;
  tlPayableUSD: number;
  platformRetainedUSD: number;
  idleWalletCoins: number;
  idleWalletUSD: number;
  /** Purchases: no authoritative purchase ledger in app state — labeled as unavailable. */
  purchaseDataAvailable: boolean;
  purchaseUSD: number;
  purchaseLabel: string;
  payoutAging: PayoutAging;
  remainingHostLiabilityUSD: number;
  remainingTlLiabilityUSD: number;
  marginByManaged: { managedBurnUSD: number; unmanagedBurnUSD: number; managedPlatformUSD: number; unmanagedPlatformUSD: number };
  sessionMix: SessionMix;
  activeCallers: number;
  activeHosts: number;
  liveCalls: number;
  newUsersByRole: Record<AdminAnalyticsRole, number>;
  callCount: number;
  totalMinutes: number;
}

export function computePlatformFinance(
  users: UserProfile[],
  callLogs: CallLogItem[],
  payoutRequests: PayoutRequest[],
  settings: SystemSettings,
  range: DateRange,
  liveCallsCount: number
): PlatformFinanceSnapshot {
  const periodLogs = filterCallLogsByRange(callLogs, range);
  const burn = computeBurnSplit(periodLogs);
  const coinToUSD = getCoinUsdPeg(settings);
  const payoutRatio = coinToUSD;
  const payoutAging = computePayoutAging(payoutRequests);
  const sessionMix = computeSessionMix(periodLogs);

  const idleWalletCoins = users
    .filter((u) => resolveAdminAnalyticsRole(u) === 'male_user')
    .reduce((a, u) => a + (u.coinBalance || 0), 0);

  // Host/TL remaining liability ≈ current earnings balances converted at payout ratio
  // minus nothing already paid in-period (use lifetime-ish balances as ops liability)
  const creatorUsers = users.filter((u) => isEarningEligibleCreator(u, settings));
  const tlUsers = users.filter((u) => resolveAdminAnalyticsRole(u) === 'team_leader');

  const hostEarningsCoins = creatorUsers.reduce((a, u) => a + (u.earningsCoins || 0), 0);
  const tlEarningsCoins = tlUsers.reduce((a, u) => a + (u.earningsCoins || 0), 0);

  const remainingHostLiabilityUSD = Math.max(0, hostEarningsCoins * payoutRatio);
  const remainingTlLiabilityUSD = Math.max(0, tlEarningsCoins * payoutRatio);

  const callerIds = new Set(periodLogs.map((l) => l.callerId));
  const hostIds = new Set(periodLogs.map((l) => l.receiverId));

  const newUsersByRole: Record<AdminAnalyticsRole, number> = {
    male_user: 0,
    female_user: 0,
    female_creator: 0,
    team_leader: 0,
    admin: 0,
    other: 0,
  };
  users.forEach((u) => {
    if (!u.createdAt) return;
    const ts = Date.parse(u.createdAt);
    if (!Number.isFinite(ts) || !isInRange(ts, range)) return;
    newUsersByRole[resolveAdminAnalyticsRole(u)] += 1;
  });

  const managedLogs = periodLogs.filter((l) => (l.coinsEarned || 0) > 0);
  const unmanagedLogs = periodLogs.filter((l) => (l.coinsEarned || 0) <= 0);
  const managedSplit = computeBurnSplit(managedLogs);
  const unmanagedSplit = computeBurnSplit(unmanagedLogs);

  return {
    burn,
    burnUSD: Number((burn.burnedCoins * coinToUSD).toFixed(2)),
    hostPayableUSD: Number((burn.hostEarnedCoins * payoutRatio).toFixed(2)),
    tlPayableUSD: Number((burn.tlEarnedCoins * payoutRatio).toFixed(2)),
    platformRetainedUSD: Number((burn.platformRetainedCoins * coinToUSD).toFixed(2)),
    idleWalletCoins,
    idleWalletUSD: Number((idleWalletCoins * coinToUSD).toFixed(2)),
    purchaseDataAvailable: false,
    purchaseUSD: 0,
    purchaseLabel: 'Purchase ledger unavailable — show burn & liability only',
    payoutAging,
    remainingHostLiabilityUSD: Number(remainingHostLiabilityUSD.toFixed(2)),
    remainingTlLiabilityUSD: Number(remainingTlLiabilityUSD.toFixed(2)),
    marginByManaged: {
      managedBurnUSD: Number((managedSplit.burnedCoins * coinToUSD).toFixed(2)),
      unmanagedBurnUSD: Number((unmanagedSplit.burnedCoins * coinToUSD).toFixed(2)),
      managedPlatformUSD: Number((managedSplit.platformRetainedCoins * coinToUSD).toFixed(2)),
      unmanagedPlatformUSD: Number((unmanagedSplit.platformRetainedCoins * coinToUSD).toFixed(2)),
    },
    sessionMix,
    activeCallers: callerIds.size,
    activeHosts: hostIds.size,
    liveCalls: liveCallsCount,
    newUsersByRole,
    callCount: periodLogs.length,
    totalMinutes: sessionMix.totalMinutes,
  };
}

export interface DailySettlementRow {
  dateLabel: string;
  burnCoins: number;
  burnUSD: number;
  hostUSD: number;
  tlUSD: number;
  platformUSD: number;
  calls: number;
  completedPayoutsUSD: number;
}

export function computeDailySettlement(
  logs: CallLogItem[],
  payouts: PayoutRequest[],
  range: DateRange,
  coinToUSD: number,
  payoutRatio: number
): DailySettlementRow[] {
  const trends = computeRealTrendSeries(logs, range, coinToUSD, payoutRatio);
  return trends.map((t) => {
    const dayPayouts = payouts.filter((p) => {
      if (p.status !== 'completed') return false;
      const ts = Date.parse(p.processedDate || p.requestDate || '');
      return Number.isFinite(ts) && ts >= t.startMs && ts <= t.endMs;
    });
    const periodLogs = logs.filter((l) => {
      const ts = getLogTimestamp(l);
      return ts >= t.startMs && ts <= t.endMs;
    });
    const split = computeBurnSplit(periodLogs);
    return {
      dateLabel: t.label,
      burnCoins: split.burnedCoins,
      burnUSD: t.burnUSD,
      hostUSD: t.hostPayableUSD,
      tlUSD: Number((split.tlEarnedCoins * payoutRatio).toFixed(2)),
      platformUSD: t.platformMarginUSD,
      calls: t.callCount,
      completedPayoutsUSD: Number(
        dayPayouts.reduce((a, p) => a + (p.amountUSD || 0), 0).toFixed(2)
      ),
    };
  });
}

export interface AgencyPnLRow {
  leader: UserProfile;
  roster: UserProfile[];
  rosterSize: number;
  onlineCount: number;
  onlinePercent: number;
  gmvCoins: number;
  gmvUSD: number;
  hostEarningsCoins: number;
  hostEarningsUSD: number;
  tlCommissionCoins: number;
  tlCommissionUSD: number;
  platformTakeUSD: number;
  top3ConcentrationPercent: number | null;
  pendingPayoutUSD: number;
  periodCalls: number;
  periodMinutes: number;
}

export function getAgencyRoster(tl: UserProfile, users: UserProfile[]): UserProfile[] {
  return users.filter((u) => {
    const cohort = resolveAdminAnalyticsRole(u);
    if (cohort !== 'female_creator' && cohort !== 'female_user') return false;
    if (u.teamLeaderId === tl.id || u.createdById === tl.id) return true;
    if (
      tl.agencyName &&
      u.agencyName &&
      u.agencyName.trim().toLowerCase() === tl.agencyName.trim().toLowerCase()
    ) {
      return true;
    }
    return false;
  });
}

export function computeAgencyPnL(
  users: UserProfile[],
  callLogs: CallLogItem[],
  payoutRequests: PayoutRequest[],
  settings: SystemSettings,
  range: DateRange
): AgencyPnLRow[] {
  const leaders = users.filter((u) => resolveAdminAnalyticsRole(u) === 'team_leader');
  const periodLogs = filterCallLogsByRange(callLogs, range);
  const coinToUSD = getCoinUsdPeg(settings);
  const payoutRatio = coinToUSD;

  return leaders
    .map((tl) => {
      const roster = getAgencyRoster(tl, users).filter((u) =>
        isEarningEligibleCreator(u, settings)
      );
      const rosterIds = new Set(roster.map((r) => r.id));
      const agencyLogs = periodLogs.filter((l) => rosterIds.has(l.receiverId));
      const split = computeBurnSplit(agencyLogs);

      const hostEarningsByCreator = roster.map((c) => {
        const cLogs = agencyLogs.filter((l) => l.receiverId === c.id);
        return cLogs.reduce((a, l) => a + (l.coinsEarned || 0), 0);
      });
      const sorted = [...hostEarningsByCreator].sort((a, b) => b - a);
      const top3 = sorted.slice(0, 3).reduce((a, v) => a + v, 0);
      const totalHost = sorted.reduce((a, v) => a + v, 0);
      const top3ConcentrationPercent =
        totalHost > 0 ? Number(((top3 / totalHost) * 100).toFixed(1)) : null;

      const onlineCount = roster.filter(
        (u) => u.onlineStatus === 'online' || u.onlineStatus === 'in_call' || u.onlineStatus === 'busy'
      ).length;

      const pendingPayoutUSD = payoutRequests
        .filter(
          (p) =>
            (p.status === 'pending' || p.status === 'processing') &&
            (p.teamLeaderId === tl.id || rosterIds.has(p.userId) || p.userId === tl.id)
        )
        .reduce((a, p) => a + (p.amountUSD || 0), 0);

      const onlinePercent =
        roster.length > 0 ? Number(((onlineCount / roster.length) * 100).toFixed(1)) : 0;

      return {
        leader: tl,
        roster,
        rosterSize: roster.length,
        onlineCount,
        onlinePercent,
        gmvCoins: split.burnedCoins,
        gmvUSD: Number((split.burnedCoins * coinToUSD).toFixed(2)),
        hostEarningsCoins: split.hostEarnedCoins,
        hostEarningsUSD: Number((split.hostEarnedCoins * payoutRatio).toFixed(2)),
        tlCommissionCoins: split.tlEarnedCoins,
        tlCommissionUSD: Number((split.tlEarnedCoins * payoutRatio).toFixed(2)),
        platformTakeUSD: Number((split.platformRetainedCoins * coinToUSD).toFixed(2)),
        top3ConcentrationPercent,
        pendingPayoutUSD: Number(pendingPayoutUSD.toFixed(2)),
        periodCalls: agencyLogs.length,
        periodMinutes: Math.round(
          agencyLogs.reduce((a, l) => a + (l.durationSeconds || 0), 0) / 60
        ),
      };
    })
    .sort((a, b) => b.gmvUSD - a.gmvUSD);
}

export interface UserCohortRow {
  user: UserProfile;
  role: AdminAnalyticsRole;
  country: string;
  balance: number;
  lifetimeSpendCoins: number;
  lifetimeSpendUSD: number;
  earningsCoins: number;
  earningsUSD: number;
  minutes: number;
  acceptanceRatePercent: number | null;
  ratingScore: number | null;
  agencyName: string | null;
  managedHostCount: number;
  agencyGmvUSD: number;
  agencyCommissionUSD: number;
  earningEligible: boolean;
  lastActiveLabel: string;
  periodSpendCoins: number;
  periodEarnCoins: number;
  periodMinutes: number;
  periodCalls: number;
}

export function buildUserCohortRows(
  users: UserProfile[],
  callLogs: CallLogItem[],
  settings: SystemSettings,
  range: DateRange,
  agencyPnL: AgencyPnLRow[]
): UserCohortRow[] {
  const periodLogs = filterCallLogsByRange(callLogs, range);
  const coinToUSD = getCoinUsdPeg(settings);
  const payoutRatio = coinToUSD;
  const agencyByLeader = new Map(agencyPnL.map((a) => [a.leader.id, a]));

  return users
    .filter((u) => resolveAdminAnalyticsRole(u) !== 'admin')
    .map((user) => {
      const role = resolveAdminAnalyticsRole(user);
      const asCaller = periodLogs.filter((l) => l.callerId === user.id);
      const asHost = periodLogs.filter((l) => l.receiverId === user.id);
      const periodSpendCoins = asCaller.reduce((a, l) => a + (l.coinsSpent || 0), 0);
      const periodEarnCoins = asHost.reduce((a, l) => a + (l.coinsEarned || 0), 0);
      const periodMinutes = Math.round(
        [...asCaller, ...asHost].reduce((a, l) => a + (l.durationSeconds || 0), 0) / 60
      );

      const allCallerLogs = callLogs.filter((l) => l.callerId === user.id);
      const lifetimeSpendCoins =
        allCallerLogs.reduce((a, l) => a + (l.coinsSpent || 0), 0) || 0;

      const agency = agencyByLeader.get(user.id);
      const tl = user.teamLeaderId
        ? users.find((x) => x.id === user.teamLeaderId)
        : null;

      const hasStoredRating =
        typeof user.ratingScore === 'number' &&
        Number.isFinite(user.ratingScore) &&
        (user.totalReviewsCount || 0) > 0;
      const hasStoredAcceptance =
        typeof user.acceptanceRatePercent === 'number' &&
        Number.isFinite(user.acceptanceRatePercent);

      let lastActiveLabel = '—';
      const lastLog = [...asCaller, ...asHost].sort(
        (a, b) => getLogTimestamp(b) - getLogTimestamp(a)
      )[0];
      if (lastLog) {
        const ts = getLogTimestamp(lastLog);
        lastActiveLabel = new Date(ts).toLocaleDateString();
      } else if (user.onlineStatus === 'online' || user.onlineStatus === 'in_call') {
        lastActiveLabel = 'Now';
      }

      return {
        user,
        role,
        country: user.country || user.nationality || user.countryCode || '—',
        balance: user.coinBalance || 0,
        lifetimeSpendCoins,
        lifetimeSpendUSD: Number((lifetimeSpendCoins * coinToUSD).toFixed(2)),
        earningsCoins: user.earningsCoins || 0,
        earningsUSD: Number(
          (
            user.totalLifetimeEarnedUSD ||
            (user.earningsCoins || 0) * payoutRatio
          ).toFixed(2)
        ),
        minutes: user.totalCallMinutes || periodMinutes,
        acceptanceRatePercent: hasStoredAcceptance ? user.acceptanceRatePercent! : null,
        ratingScore: hasStoredRating ? user.ratingScore! : null,
        agencyName: tl?.agencyName || user.agencyName || null,
        managedHostCount: agency?.rosterSize || 0,
        agencyGmvUSD: agency?.gmvUSD || 0,
        agencyCommissionUSD: agency?.tlCommissionUSD || 0,
        earningEligible: isEarningEligibleCreator(user, settings),
        lastActiveLabel,
        periodSpendCoins,
        periodEarnCoins,
        periodMinutes,
        periodCalls: asCaller.length + asHost.length,
      };
    });
}

export interface RoleActivityMixPoint {
  role: AdminAnalyticsRole;
  label: string;
  calls: number;
  minutes: number;
  coins: number;
}

export function computeActivityMixByRole(
  users: UserProfile[],
  logs: CallLogItem[]
): RoleActivityMixPoint[] {
  const byId = new Map(users.map((u) => [u.id, u]));
  const buckets: Record<AdminAnalyticsRole, RoleActivityMixPoint> = {
    male_user: { role: 'male_user', label: 'Male', calls: 0, minutes: 0, coins: 0 },
    female_user: { role: 'female_user', label: 'Regular Female', calls: 0, minutes: 0, coins: 0 },
    female_creator: { role: 'female_creator', label: 'Creator', calls: 0, minutes: 0, coins: 0 },
    team_leader: { role: 'team_leader', label: 'Agency', calls: 0, minutes: 0, coins: 0 },
    admin: { role: 'admin', label: 'Admin', calls: 0, minutes: 0, coins: 0 },
    other: { role: 'other', label: 'Other', calls: 0, minutes: 0, coins: 0 },
  };

  logs.forEach((l) => {
    const host = byId.get(l.receiverId);
    const role = host ? resolveAdminAnalyticsRole(host) : 'other';
    const b = buckets[role];
    b.calls += 1;
    b.minutes += Math.round((l.durationSeconds || 0) / 60);
    b.coins += l.coinsEarned || 0;
  });

  return Object.values(buckets).filter((b) => b.calls > 0 || b.minutes > 0);
}

export interface UserEarningsDetail {
  periodEarnedCoins: number;
  periodEarnedUSD: number;
  paidUSD: number;
  pendingUSD: number;
  sourceCallsCoins: number;
  sourceGiftsCoins: number | null;
  sourceBonusCoins: number | null;
  payoutHistory: PayoutRequest[];
  recentCalls: CallLogItem[];
  splitWaterfall: {
    burnedOnHost: number;
    hostShare: number;
    tlShare: number;
    platformShare: number;
  };
}

export function computeUserEarningsDetail(
  user: UserProfile,
  callLogs: CallLogItem[],
  payoutRequests: PayoutRequest[],
  settings: SystemSettings,
  range: DateRange
): UserEarningsDetail {
  const periodLogs = filterCallLogsByRange(callLogs, range).filter(
    (l) => l.receiverId === user.id || (resolveAdminAnalyticsRole(user) === 'team_leader' && l.teamLeaderId === user.id)
  );
  const asHost = periodLogs.filter((l) => l.receiverId === user.id);
  const asTl = periodLogs.filter((l) => l.teamLeaderId === user.id);

  const periodEarnedCoins =
    resolveAdminAnalyticsRole(user) === 'team_leader'
      ? asTl.reduce((a, l) => a + (l.teamLeaderEarnedCoins || 0), 0)
      : asHost.reduce((a, l) => a + (l.coinsEarned || 0), 0);

  const payoutRatio = getCoinUsdPeg(settings);
  const userPayouts = payoutRequests.filter((p) => p.userId === user.id);
  const paidUSD = userPayouts
    .filter((p) => p.status === 'completed')
    .reduce((a, p) => a + (p.amountUSD || 0), 0);
  const pendingUSD = userPayouts
    .filter((p) => p.status === 'pending' || p.status === 'processing')
    .reduce((a, p) => a + (p.amountUSD || 0), 0);

  const burnedOnHost = asHost.reduce((a, l) => a + (l.coinsSpent || 0), 0);
  const hostShare = asHost.reduce((a, l) => a + (l.coinsEarned || 0), 0);
  const tlShare = asHost.reduce((a, l) => a + (l.teamLeaderEarnedCoins || 0), 0);

  return {
    periodEarnedCoins,
    periodEarnedUSD: Number((periodEarnedCoins * payoutRatio).toFixed(2)),
    paidUSD: Number(paidUSD.toFixed(2)),
    pendingUSD: Number(pendingUSD.toFixed(2)),
    sourceCallsCoins: periodEarnedCoins,
    sourceGiftsCoins: null,
    sourceBonusCoins: null,
    payoutHistory: [...userPayouts].sort(
      (a, b) => Date.parse(b.requestDate || '') - Date.parse(a.requestDate || '')
    ),
    recentCalls: [...asHost, ...asTl]
      .sort((a, b) => getLogTimestamp(b) - getLogTimestamp(a))
      .slice(0, 25),
    splitWaterfall: {
      burnedOnHost,
      hostShare,
      tlShare,
      platformShare: computePlatformRetentionCoins(burnedOnHost, hostShare, tlShare),
    },
  };
}

export interface RiskSignals {
  highDeclineHosts: Array<{ user: UserProfile; acceptance: number; declines: number; calls: number }>;
  churnRiskMales: Array<{ user: UserProfile; spendCoins: number; balance: number }>;
  agingPayouts: PayoutRequest[];
  insufficientDataNotes: string[];
}

export function computeRiskSignals(
  users: UserProfile[],
  callLogs: CallLogItem[],
  payoutRequests: PayoutRequest[],
  settings: SystemSettings,
  range: DateRange
): RiskSignals {
  const periodLogs = filterCallLogsByRange(callLogs, range);
  const notes: string[] = [];
  const creators = users.filter((u) => isEarningEligibleCreator(u, settings));

  const highDeclineHosts: RiskSignals['highDeclineHosts'] = [];
  creators.forEach((u) => {
    const logs = periodLogs.filter((l) => l.receiverId === u.id);
    const declines = logs.filter(
      (l) => l.status === 'declined' || l.status === 'rejected' || l.status === 'missed'
    ).length;
    if (typeof u.acceptanceRatePercent === 'number' && u.acceptanceRatePercent < 70) {
      highDeclineHosts.push({
        user: u,
        acceptance: u.acceptanceRatePercent,
        declines,
        calls: logs.length,
      });
    } else if (logs.length >= 5 && declines / logs.length >= 0.4) {
      highDeclineHosts.push({
        user: u,
        acceptance: Number((((logs.length - declines) / logs.length) * 100).toFixed(1)),
        declines,
        calls: logs.length,
      });
    }
  });

  if (highDeclineHosts.length === 0) {
    notes.push('No high-decline hosts detected for this period (or acceptance data sparse).');
  }

  const coinToUSD = getCoinUsdPeg(settings);
  const churnRiskMales: RiskSignals['churnRiskMales'] = [];
  users
    .filter((u) => resolveAdminAnalyticsRole(u) === 'male_user')
    .forEach((u) => {
      const spend = periodLogs
        .filter((l) => l.callerId === u.id)
        .reduce((a, l) => a + (l.coinsSpent || 0), 0);
      const bal = u.coinBalance || 0;
      if (spend > 500 && bal < 50) {
        churnRiskMales.push({ user: u, spendCoins: spend, balance: bal });
      }
    });

  const aging = payoutRequests.filter((p) => {
    if (p.status !== 'pending' && p.status !== 'processing') return false;
    const ts = Date.parse(p.requestDate || '');
    if (!Number.isFinite(ts)) return false;
    return (Date.now() - ts) / (24 * 60 * 60 * 1000) >= 7;
  });

  notes.push('Reports/blocks platform-wide risk feed not wired — social risk placeholder only.');
  void coinToUSD;

  return {
    highDeclineHosts: highDeclineHosts.sort((a, b) => a.acceptance - b.acceptance).slice(0, 20),
    churnRiskMales: churnRiskMales.sort((a, b) => b.spendCoins - a.spendCoins).slice(0, 20),
    agingPayouts: aging,
    insufficientDataNotes: notes,
  };
}

export function filterUsersByAdminFilters(
  rows: UserCohortRow[],
  filters: AdminAnalyticsFilters
): UserCohortRow[] {
  const q = filters.search.trim().toLowerCase();
  return rows.filter((row) => {
    if (filters.role !== 'all' && row.role !== filters.role) return false;
    if (filters.country !== 'all') {
      const c = (row.country || '').toLowerCase();
      const code = (row.user.countryCode || '').toLowerCase();
      if (c !== filters.country.toLowerCase() && code !== filters.country.toLowerCase()) {
        return false;
      }
    }
    if (filters.agencyId !== 'all') {
      if (row.role === 'team_leader') {
        if (row.user.id !== filters.agencyId) return false;
      } else if (row.user.teamLeaderId !== filters.agencyId) {
        return false;
      }
    }
    if (!q) return true;
    return (
      row.user.name?.toLowerCase().includes(q) ||
      row.user.email?.toLowerCase().includes(q) ||
      row.user.id?.toLowerCase().includes(q) ||
      row.user.username?.toLowerCase().includes(q) ||
      (row.agencyName || '').toLowerCase().includes(q)
    );
  });
}

export function coinsToUsd(coins: number, ratio: number): number {
  return Number(((coins || 0) * (ratio || getCoinUsdPeg())).toFixed(2));
}

export function formatUsd(n: number): string {
  return `$${(n || 0).toFixed(2)}`;
}

export function formatCoins(n: number): string {
  return `${(n || 0).toLocaleString()} 🪙`;
}
