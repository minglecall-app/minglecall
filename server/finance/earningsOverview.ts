/**
 * Role-scoped earnings overview + ledger for Platform / TL / Host pages.
 * Current week/month: wallet_ledger accruals (calendar UTC windows).
 * Lifetime: financial_ledger books, grouped by calendar week/month.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '../supabaseAdmin';
import {
  startOfUtcDay,
  startOfUtcWeekMonday,
  startOfUtcMonth,
  addUtcMonths,
  toIso,
} from '../../shared/finance/periodBounds';
import type {
  EarningsScope,
  EarningsLedgerMode,
  EarningsGroupBy,
  EarningsKpiBucket,
  EarningsSeriesPoint,
  EarningsLedgerRow,
  EarningsLifetimeGroup,
  EarningsOverviewResponse,
  EarningsLedgerResponse,
  EarningsComponentSplit,
  EarningsMoneyCategory,
} from '../../shared/finance/types';
import {
  HOST_SALARY_FINANCIAL_ENTRY_TYPES,
  HOST_SALARY_WALLET_TYPES,
  NON_SALARY_REWARD_WALLET_TYPES,
  isGiftWalletMetadata,
} from '../../shared/finance/salaryComponents';
import {
  groupWalletLedgerByCall,
  resolveSessionCallId,
} from '../../shared/finance/groupWalletLedgerByCall';
import { aggregateWalletLedgerEarnings } from './accrualQuery';
import { coinsToUsd, getCoinUsdPeg } from './fx';
import { loadFinanceSystemConfig, type FinanceSystemConfig } from './config';
import { ensureOpenPeriod, getNextCloseAt, getCurrentPeriodBounds } from './period';

const HOST_FIN_TYPES = [...HOST_SALARY_FINANCIAL_ENTRY_TYPES] as string[];
const TL_FIN_TYPES = ['TL_EARN'] as const;
const PLATFORM_FIN_TYPES = ['PLATFORM_EARN'] as const;

const HOST_WALLET_TYPES = [
  ...HOST_SALARY_WALLET_TYPES,
  ...NON_SALARY_REWARD_WALLET_TYPES,
] as string[];
const TL_WALLET_TYPES = ['TL_EARN'] as const;
const PLATFORM_WALLET_TYPES = ['CALL_DEBIT', 'GIFT_DEBIT'] as const;

function emptyComponentSplit(): EarningsComponentSplit {
  return {
    callCoins: 0,
    callUsd: 0,
    giftCoins: 0,
    giftUsd: 0,
    trueUpCoins: 0,
    trueUpUsd: 0,
    tierBonusCoins: 0,
    tierBonusUsd: 0,
    rewardCoins: 0,
    rewardUsd: 0,
    salaryCoins: 0,
    salaryUsd: 0,
    totalCoins: 0,
    totalUsd: 0,
  };
}

function finalizeSplit(s: EarningsComponentSplit): EarningsComponentSplit {
  s.salaryCoins = s.callCoins + s.giftCoins + s.trueUpCoins + s.tierBonusCoins;
  s.salaryUsd = s.callUsd + s.giftUsd + s.trueUpUsd + s.tierBonusUsd;
  s.totalCoins = s.salaryCoins + s.rewardCoins;
  s.totalUsd = s.salaryUsd + s.rewardUsd;
  return s;
}

function emptyLedgerAmounts(): Pick<
  EarningsLedgerRow,
  | 'callCoins'
  | 'callUsd'
  | 'giftCoins'
  | 'giftUsd'
  | 'trueUpCoins'
  | 'trueUpUsd'
  | 'tierBonusCoins'
  | 'tierBonusUsd'
  | 'rewardCoins'
  | 'rewardUsd'
  | 'hostEarnCoins'
  | 'hostEarnUsd'
  | 'tlEarnCoins'
  | 'tlEarnUsd'
  | 'platformRetainedCoins'
  | 'platformRetainedUsd'
> {
  return {
    callCoins: 0,
    callUsd: 0,
    giftCoins: 0,
    giftUsd: 0,
    trueUpCoins: 0,
    trueUpUsd: 0,
    tierBonusCoins: 0,
    tierBonusUsd: 0,
    rewardCoins: 0,
    rewardUsd: 0,
    hostEarnCoins: 0,
    hostEarnUsd: 0,
    tlEarnCoins: 0,
    tlEarnUsd: 0,
    platformRetainedCoins: 0,
    platformRetainedUsd: 0,
  };
}

function hostIdFromWalletMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const m = metadata as Record<string, unknown>;
  const raw = m.receiverId ?? m.receiver_id ?? m.hostId ?? m.host_id;
  const id = String(raw || '').trim();
  return id || null;
}

function mapWalletRowToLedger(
  row: {
    id: string;
    user_id?: string | null;
    transaction_type: string;
    amount: number;
    created_at: string;
    metadata?: unknown;
    call_id?: string | null;
    billing_minute?: number | null;
  },
  peg: number
): EarningsLedgerRow {
  const coins = Math.abs(Number(row.amount) || 0);
  const usd = coinsToUsd(coins, peg);
  const type = String(row.transaction_type || '');
  const amounts = emptyLedgerAmounts();
  let category: EarningsMoneyCategory = 'other';
  let inSalary = true;
  const billingRaw = Number(row.billing_minute);
  const billingMinute =
    Number.isFinite(billingRaw) && billingRaw > 0 ? Math.floor(billingRaw) : null;
  const hostId = type === 'TL_EARN' ? hostIdFromWalletMetadata(row.metadata) : null;

  if (type === 'HOST_EARN') {
    if (isGiftWalletMetadata(row.metadata)) {
      category = 'gift';
      amounts.giftCoins = coins;
      amounts.giftUsd = usd;
    } else {
      category = 'call';
      amounts.callCoins = coins;
      amounts.callUsd = usd;
    }
  } else if (type === 'TARGET_SHARE_TRUEUP') {
    category = 'true_up';
    amounts.trueUpCoins = coins;
    amounts.trueUpUsd = usd;
  } else if (type === 'TL_EARN') {
    if (isGiftWalletMetadata(row.metadata)) {
      category = 'gift';
      amounts.giftCoins = coins;
      amounts.giftUsd = usd;
    } else {
      category = 'tl_commission';
      amounts.callCoins = coins;
      amounts.callUsd = usd;
    }
  } else if (
    type === 'REWARD_STREAK' ||
    type === 'REWARD_MISSION' ||
    type === 'REWARD_MASTER_CHEST'
  ) {
    category = 'reward';
    inSalary = false;
    amounts.rewardCoins = coins;
    amounts.rewardUsd = usd;
  } else if (type === 'CALL_DEBIT') {
    category = 'platform';
    amounts.callCoins = coins;
    amounts.callUsd = usd;
  } else if (type === 'GIFT_DEBIT') {
    category = 'platform';
    amounts.giftCoins = coins;
    amounts.giftUsd = usd;
  }

  return {
    id: String(row.id),
    createdAt: row.created_at,
    entryType: type,
    userId: row.user_id ? String(row.user_id) : null,
    userName: null,
    teamLeaderId: null,
    callId: row.call_id ? String(row.call_id) : null,
    hostId,
    hostName: null,
    billingMinute,
    billedMinutes: billingMinute != null ? 1 : null,
    minuteFrom: billingMinute,
    minuteTo: billingMinute,
    grouped: false,
    firstAt: row.created_at,
    lastAt: row.created_at,
    amountCoins: coins,
    amountUsd: usd,
    fxRatio: peg,
    source: 'wallet',
    category,
    inSalary,
    ...amounts,
  };
}

function mapFinancialRowToLedger(row: {
  id: string;
  created_at: string;
  entry_type: string;
  user_id?: string | null;
  team_leader_id?: string | null;
  amount_coins?: number;
  amount_usd?: number;
  fx_ratio?: number;
  metadata?: Record<string, unknown> | null;
}): EarningsLedgerRow {
  const coins = Number(row.amount_coins) || 0;
  const usd = Number(row.amount_usd) || 0;
  const type = String(row.entry_type || '');
  const amounts = emptyLedgerAmounts();
  let category: EarningsMoneyCategory = 'other';
  const inSalary = true;
  const meta = row.metadata || {};

  if (type === 'TARGET_SHARE_TRUEUP') {
    category = 'true_up';
    amounts.trueUpCoins = coins;
    amounts.trueUpUsd = usd;
  } else if (type === 'TARGET_BONUS') {
    category = 'tier_bonus';
    amounts.tierBonusCoins = coins;
    amounts.tierBonusUsd = usd;
  } else if (type === 'TL_EARN') {
    category = 'tl_commission';
    amounts.callCoins = coins;
    amounts.callUsd = usd;
  } else if (type === 'PLATFORM_EARN') {
    category = 'platform';
    amounts.callCoins = coins;
    amounts.callUsd = usd;
    amounts.platformRetainedCoins = coins;
    amounts.platformRetainedUsd = usd;
  } else if (type === 'HOST_EARN') {
    const call = Number(meta.call);
    const gift = Number(meta.gift);
    if (Number.isFinite(call) || Number.isFinite(gift)) {
      const callC = Math.max(0, Math.round(Number.isFinite(call) ? call : 0));
      const giftC = Math.max(0, Math.round(Number.isFinite(gift) ? gift : 0));
      const sum = callC + giftC;
      amounts.callCoins = callC;
      amounts.giftCoins = giftC;
      amounts.callUsd = sum > 0 ? usd * (callC / sum) : usd;
      amounts.giftUsd = sum > 0 ? usd * (giftC / sum) : 0;
      category = giftC > callC ? 'gift' : 'call';
    } else {
      category = 'call';
      amounts.callCoins = coins;
      amounts.callUsd = usd;
    }
  }

  return {
    id: String(row.id),
    createdAt: row.created_at,
    entryType: type,
    userId: row.user_id ? String(row.user_id) : null,
    userName: null,
    teamLeaderId: row.team_leader_id ? String(row.team_leader_id) : null,
    callId: null,
    hostId: null,
    hostName: null,
    billingMinute: null,
    billedMinutes: null,
    minuteFrom: null,
    minuteTo: null,
    grouped: false,
    firstAt: row.created_at,
    lastAt: row.created_at,
    amountCoins: coins,
    amountUsd: usd,
    fxRatio: Number(row.fx_ratio) || 0,
    source: 'financial',
    category,
    inSalary,
    ...amounts,
  };
}

async function loadProfileNames(
  client: SupabaseClient,
  ids: string[]
): Promise<Map<string, string>> {
  const nameById = new Map<string, string>();
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const chunk = 200;
  for (let i = 0; i < unique.length; i += chunk) {
    const slice = unique.slice(i, i + chunk);
    const { data, error } = await client.from('profiles').select('id, name').in('id', slice);
    if (error) throw new Error(error.message);
    for (const p of data || []) {
      const id = String((p as any).id || '');
      const name = String((p as any).name || '').trim();
      if (id && name) nameById.set(id, name);
    }
  }
  return nameById;
}

/** Resolve host ids from call_logs when TL rows lack metadata.receiverId. */
async function hydrateHostIdsFromCallLogs(
  client: SupabaseClient,
  rows: EarningsLedgerRow[]
): Promise<EarningsLedgerRow[]> {
  const needCallIds = Array.from(
    new Set(
      rows
        .filter((r) => r.entryType === 'TL_EARN' && !r.hostId && r.callId)
        .map((r) => String(r.callId))
    )
  );
  if (!needCallIds.length) return rows;

  const hostByCall = new Map<string, string>();
  const chunk = 100;
  for (let i = 0; i < needCallIds.length; i += chunk) {
    const slice = needCallIds.slice(i, i + chunk);
    const { data, error } = await client
      .from('call_logs')
      .select('id, host_id, receiver_id, host_name')
      .in('id', slice);
    if (error) throw new Error(error.message);
    for (const c of data || []) {
      const callId = String((c as any).id || '');
      const hostId = String((c as any).host_id || (c as any).receiver_id || '').trim();
      if (callId && hostId) hostByCall.set(callId, hostId);
    }
  }

  return rows.map((r) => {
    if (r.hostId || r.entryType !== 'TL_EARN' || !r.callId) return r;
    const hostId = hostByCall.get(String(r.callId)) || null;
    return hostId ? { ...r, hostId } : r;
  });
}

/** Batch-load profiles.name onto ledger rows (payee + host for TL). */
async function hydrateLedgerUserNames(
  client: SupabaseClient,
  rows: EarningsLedgerRow[]
): Promise<EarningsLedgerRow[]> {
  const withHosts = await hydrateHostIdsFromCallLogs(client, rows);
  const userIds = withHosts.map((r) => r.userId).filter((id): id is string => Boolean(id));
  const hostIds = withHosts.map((r) => r.hostId).filter((id): id is string => Boolean(id));
  const nameById = await loadProfileNames(client, [...userIds, ...hostIds]);

  return withHosts.map((r) => ({
    ...r,
    userName: r.userId ? nameById.get(r.userId) || r.userName || null : null,
    hostName: r.hostId ? nameById.get(r.hostId) || r.hostName || null : r.hostName || null,
  }));
}

function addRowToSplit(split: EarningsComponentSplit, row: EarningsLedgerRow): void {
  split.callCoins += row.callCoins;
  split.callUsd += row.callUsd;
  split.giftCoins += row.giftCoins;
  split.giftUsd += row.giftUsd;
  split.trueUpCoins += row.trueUpCoins;
  split.trueUpUsd += row.trueUpUsd;
  split.tierBonusCoins += row.tierBonusCoins;
  split.tierBonusUsd += row.tierBonusUsd;
  split.rewardCoins += row.rewardCoins;
  split.rewardUsd += row.rewardUsd;
}

export type ResolveEarningsScopeInput = {
  scope: EarningsScope;
  actorId: string;
  actorRole: string;
  /** Admin/TL optional filters — never trusted for host self. */
  userId?: string | null;
  teamLeaderId?: string | null;
};

export type ResolveEarningsScopeResult =
  | {
      ok: true;
      scope: EarningsScope;
      /** null = all users in scope (admin platform / admin all hosts / admin all TL). */
      userIds: string[] | null;
      /** When TL scope is pinned to one TL. */
      teamLeaderId: string | null;
    }
  | { ok: false; status: number; message: string; code: string };

function isAdminRole(role: string): boolean {
  return role === 'admin';
}

function isTeamLeaderRole(role: string): boolean {
  return role === 'team_leader' || role === 'agency_manager' || role === 'admin';
}

function calendarWeekBounds(at: Date = new Date()): { start: Date; end: Date } {
  const start = startOfUtcWeekMonday(at);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  return { start, end };
}

function calendarMonthBounds(at: Date = new Date()): { start: Date; end: Date } {
  const start = startOfUtcMonth(at);
  const end = addUtcMonths(start, 1);
  return { start, end };
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function weekKey(d: Date): string {
  return `w:${dayKey(startOfUtcWeekMonday(d))}`;
}

function monthKey(d: Date): string {
  const m = startOfUtcMonth(d);
  return `m:${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, '0')}`;
}

function parsePeriodKey(
  periodKey: string,
  groupBy: EarningsGroupBy
): { start: Date; end: Date } | null {
  const raw = String(periodKey || '').trim();
  if (!raw) return null;
  if (groupBy === 'week' || raw.startsWith('w:')) {
    const iso = raw.startsWith('w:') ? raw.slice(2) : raw;
    const start = startOfUtcWeekMonday(new Date(`${iso}T00:00:00.000Z`));
    if (Number.isNaN(start.getTime())) return null;
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 7);
    return { start, end };
  }
  const iso = raw.startsWith('m:') ? raw.slice(2) + '-01' : raw;
  const start = startOfUtcMonth(new Date(`${iso}T00:00:00.000Z`));
  if (Number.isNaN(start.getTime())) return null;
  return { start, end: addUtcMonths(start, 1) };
}

function groupLabel(groupBy: EarningsGroupBy, start: Date, end: Date): string {
  if (groupBy === 'week') {
    return `Week ${dayKey(start)} → ${dayKey(new Date(end.getTime() - 1))}`;
  }
  return start.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function emptyKpi(start: Date, end: Date): EarningsKpiBucket {
  return {
    coins: 0,
    usd: 0,
    entryCount: 0,
    periodStart: toIso(start),
    periodEnd: toIso(end),
  };
}

function scopeCoinsFromAccrual(
  scope: EarningsScope,
  totals: {
    platformRetainedCoins: number;
    hostEarnCoins: number;
    targetShareTrueUpCoins: number;
    tlEarnCoins: number;
  }
): number {
  if (scope === 'platform') return Math.max(0, totals.platformRetainedCoins);
  if (scope === 'tl') return Math.max(0, totals.tlEarnCoins);
  return Math.max(0, totals.hostEarnCoins + totals.targetShareTrueUpCoins);
}

function finEntryTypes(scope: EarningsScope): string[] {
  if (scope === 'platform') return [...PLATFORM_FIN_TYPES];
  if (scope === 'tl') return [...TL_FIN_TYPES];
  return [...HOST_FIN_TYPES];
}

function walletEntryTypes(scope: EarningsScope): string[] {
  if (scope === 'platform') return [...PLATFORM_WALLET_TYPES];
  if (scope === 'tl') return [...TL_WALLET_TYPES];
  return [...HOST_WALLET_TYPES];
}

async function listManagedHostIds(
  client: SupabaseClient,
  teamLeaderId: string
): Promise<string[]> {
  const { data, error } = await client
    .from('profiles')
    .select('id')
    .or(`team_leader_id.eq.${teamLeaderId},created_by_id.eq.${teamLeaderId}`);
  if (error) throw new Error(error.message);
  return (data || []).map((r: any) => String(r.id)).filter(Boolean);
}

/**
 * Resolve which user IDs the actor may query for a given earnings scope.
 */
export async function resolveEarningsScopeAccess(
  input: ResolveEarningsScopeInput,
  client?: SupabaseClient | null
): Promise<ResolveEarningsScopeResult> {
  const scope = input.scope;
  const actorId = String(input.actorId || '').trim();
  const role = String(input.actorRole || '').trim();
  if (!actorId) {
    return { ok: false, status: 401, message: 'Unauthorized', code: 'UNAUTHORIZED' };
  }
  if (scope !== 'platform' && scope !== 'tl' && scope !== 'host') {
    return { ok: false, status: 400, message: 'Invalid scope', code: 'INVALID_SCOPE' };
  }

  const db =
    client ?? (isSupabaseAdminConfigured() ? getSupabaseAdmin() : null);
  if (!db) {
    return { ok: false, status: 503, message: 'Finance backend unavailable', code: 'NO_ADMIN' };
  }

  if (scope === 'platform') {
    if (!isAdminRole(role)) {
      return { ok: false, status: 403, message: 'Platform earnings are admin-only', code: 'FORBIDDEN' };
    }
    return { ok: true, scope, userIds: null, teamLeaderId: null };
  }

  if (scope === 'tl') {
    if (isAdminRole(role)) {
      const tlFilter = String(input.teamLeaderId || '').trim();
      if (tlFilter) {
        return { ok: true, scope, userIds: [tlFilter], teamLeaderId: tlFilter };
      }
      return { ok: true, scope, userIds: null, teamLeaderId: null };
    }
    if (!isTeamLeaderRole(role)) {
      return { ok: false, status: 403, message: 'Team leader earnings forbidden', code: 'FORBIDDEN' };
    }
    return { ok: true, scope, userIds: [actorId], teamLeaderId: actorId };
  }

  // host
  if (isAdminRole(role)) {
    const hostId = String(input.userId || '').trim();
    const tlFilter = String(input.teamLeaderId || '').trim();
    if (hostId) {
      return { ok: true, scope, userIds: [hostId], teamLeaderId: tlFilter || null };
    }
    if (tlFilter) {
      const ids = await listManagedHostIds(db, tlFilter);
      return { ok: true, scope, userIds: ids.length ? ids : [], teamLeaderId: tlFilter };
    }
    return { ok: true, scope, userIds: null, teamLeaderId: null };
  }

  if (isTeamLeaderRole(role) && role !== 'admin') {
    const managed = await listManagedHostIds(db, actorId);
    const hostId = String(input.userId || '').trim();
    if (hostId) {
      if (!managed.includes(hostId)) {
        return {
          ok: false,
          status: 403,
          message: 'Host is not managed by this team leader',
          code: 'FORBIDDEN',
        };
      }
      return { ok: true, scope, userIds: [hostId], teamLeaderId: actorId };
    }
    return {
      ok: true,
      scope,
      userIds: managed.length ? managed : [],
      teamLeaderId: actorId,
    };
  }

  // Host / other authenticated: own only
  return { ok: true, scope, userIds: [actorId], teamLeaderId: null };
}

async function sumFinancialLedger(
  client: SupabaseClient,
  opts: {
    scope: EarningsScope;
    userIds: string[] | null;
    teamLeaderId?: string | null;
    periodStart?: Date;
    periodEnd?: Date;
  }
): Promise<{ coins: number; usd: number; entryCount: number }> {
  const types = finEntryTypes(opts.scope);
  let coins = 0;
  let usd = 0;
  let entryCount = 0;
  const pageSize = 1000;
  let offset = 0;

  for (;;) {
    let q = client
      .from('financial_ledger')
      .select('amount_coins, amount_usd, user_id, team_leader_id, entry_type, created_at')
      .in('entry_type', types)
      .order('created_at', { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (opts.periodStart) q = q.gte('created_at', toIso(opts.periodStart));
    if (opts.periodEnd) q = q.lt('created_at', toIso(opts.periodEnd));

    if (opts.scope === 'tl' && opts.userIds && opts.userIds.length === 1) {
      q = q.or(
        `user_id.eq.${opts.userIds[0]},team_leader_id.eq.${opts.userIds[0]}`
      );
    } else if (opts.userIds) {
      if (opts.userIds.length === 0) {
        return { coins: 0, usd: 0, entryCount: 0 };
      }
      q = q.in('user_id', opts.userIds);
    }

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const rows = data || [];
    for (const row of rows) {
      coins += Number(row.amount_coins) || 0;
      usd += Number(row.amount_usd) || 0;
      entryCount += 1;
    }
    if (rows.length < pageSize) break;
    offset += pageSize;
  }

  return { coins, usd, entryCount };
}

async function buildDailySeriesFromWallet(
  client: SupabaseClient,
  opts: {
    scope: EarningsScope;
    userIds: string[] | null;
    start: Date;
    end: Date;
    peg: number;
  }
): Promise<{ series: EarningsSeriesPoint[]; entryCount: number }> {
  const types = walletEntryTypes(opts.scope);
  const byDay = new Map<string, { coins: number; count: number }>();
  // Pre-seed days so sparklines have continuous points
  for (let t = opts.start.getTime(); t < opts.end.getTime(); t += 86400000) {
    const key = dayKey(new Date(t));
    byDay.set(key, { coins: 0, count: 0 });
  }

  let entryCount = 0;
  const pageSize = 1000;
  let offset = 0;

  // Platform retained needs full accrual math — use per-day aggregateWalletLedgerEarnings for series.
  if (opts.scope === 'platform') {
    for (let t = opts.start.getTime(); t < Math.min(opts.end.getTime(), Date.now() + 86400000); t += 86400000) {
      const dayStart = startOfUtcDay(new Date(t));
      const dayEnd = new Date(dayStart);
      dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
      if (dayStart.getTime() >= opts.end.getTime()) break;
      const endBound = dayEnd.getTime() > opts.end.getTime() ? opts.end : dayEnd;
      const accrual = await aggregateWalletLedgerEarnings({
        periodStart: dayStart,
        periodEnd: endBound,
        client,
      });
      const coins = accrual.success ? scopeCoinsFromAccrual('platform', accrual.totals) : 0;
      const key = dayKey(dayStart);
      byDay.set(key, { coins, count: coins > 0 ? 1 : 0 });
      if (coins > 0) entryCount += 1;
    }
  } else {
    if (opts.userIds && opts.userIds.length === 0) {
      return {
        series: [...byDay.entries()].map(([date, v]) => ({
          date,
          label: date.slice(5),
          coins: v.coins,
          usd: coinsToUsd(v.coins, opts.peg),
        })),
        entryCount: 0,
      };
    }

    for (;;) {
      let q = client
        .from('wallet_ledger')
        .select('amount, transaction_type, created_at, user_id')
        .in('transaction_type', types)
        .gte('created_at', toIso(opts.start))
        .lt('created_at', toIso(opts.end))
        .order('created_at', { ascending: true })
        .range(offset, offset + pageSize - 1);

      if (opts.userIds) q = q.in('user_id', opts.userIds);

      const { data, error } = await q;
      if (error) throw new Error(error.message);
      const rows = data || [];
      for (const row of rows) {
        const amount = Number(row.amount) || 0;
        if (amount === 0) continue;
        const coins = Math.abs(amount);
        const created = new Date(row.created_at);
        const key = dayKey(created);
        const prev = byDay.get(key) || { coins: 0, count: 0 };
        prev.coins += coins;
        prev.count += 1;
        byDay.set(key, prev);
        entryCount += 1;
      }
      if (rows.length < pageSize) break;
      offset += pageSize;
    }
  }

  const series: EarningsSeriesPoint[] = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      date,
      label: date.slice(5),
      coins: v.coins,
      usd: coinsToUsd(v.coins, opts.peg),
    }));

  return { series, entryCount };
}

async function loadWalletLedgerRows(
  client: SupabaseClient,
  opts: {
    scope: EarningsScope;
    userIds: string[] | null;
    start: Date;
    end: Date;
    peg: number;
    limit: number;
  }
): Promise<EarningsLedgerRow[]> {
  if (opts.userIds && opts.userIds.length === 0) return [];

  // Platform: per-event CALL_DEBIT / GIFT_DEBIT (spender named) — not nameless daily synthetics
  const types =
    opts.scope === 'platform'
      ? ([...PLATFORM_WALLET_TYPES] as string[])
      : walletEntryTypes(opts.scope);

  // Fetch raw per-minute rows until call-grouped count reaches limit (group-on-read).
  type RawInput = Parameters<typeof groupWalletLedgerByCall>[0][number];
  const raw: RawInput[] = [];
  const pageSize = 1000;
  let offset = 0;
  const maxRaw = Math.min(Math.max(opts.limit * 40, 500), 10000);

  while (raw.length < maxRaw) {
    let q = client
      .from('wallet_ledger')
      .select(
        'id, user_id, transaction_type, amount, created_at, metadata, call_id, billing_minute'
      )
      .in('transaction_type', types)
      .gte('created_at', toIso(opts.start))
      .lt('created_at', toIso(opts.end))
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (opts.userIds) q = q.in('user_id', opts.userIds);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const rows = data || [];
    for (const row of rows) {
      const amount = Number(row.amount) || 0;
      if (amount === 0) continue;
      const mapped = mapWalletRowToLedger(row, opts.peg);
      raw.push({ ...mapped, metadata: row.metadata });
    }
    if (rows.length < pageSize) break;
    offset += pageSize;
    if (groupWalletLedgerByCall(raw).length >= opts.limit) break;
  }

  let grouped = groupWalletLedgerByCall(raw).slice(0, opts.limit);
  if (opts.scope === 'platform') {
    grouped = await hydratePlatformCallEconomics(client, grouped, opts.peg, opts.start, opts.end);
  }
  return hydrateLedgerUserNames(client, grouped);
}

/**
 * For platform call-composite rows: attach host/TL earns for the same session call
 * and compute platform retained = burn − host − TL.
 */
async function hydratePlatformCallEconomics(
  client: SupabaseClient,
  rows: EarningsLedgerRow[],
  peg: number,
  start: Date,
  end: Date
): Promise<EarningsLedgerRow[]> {
  const callIds = Array.from(
    new Set(rows.map((r) => String(r.callId || '').trim()).filter(Boolean))
  );
  if (!callIds.length) {
    return rows.map((r) => ({
      ...r,
      hostEarnCoins: 0,
      hostEarnUsd: 0,
      tlEarnCoins: 0,
      tlEarnUsd: 0,
      platformRetainedCoins: Math.max(0, Number(r.amountCoins) || 0),
      platformRetainedUsd: coinsToUsd(Math.max(0, Number(r.amountCoins) || 0), peg),
    }));
  }

  const callIdSet = new Set(callIds);
  const byCall = new Map<string, { host: number; tl: number }>();
  const pageSize = 1000;
  let offset = 0;

  for (;;) {
    const { data, error } = await client
      .from('wallet_ledger')
      .select('call_id, transaction_type, amount, billing_minute, metadata')
      .in('transaction_type', ['HOST_EARN', 'TL_EARN'])
      .gte('created_at', toIso(start))
      .lt('created_at', toIso(end))
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = data || [];
    for (const row of page) {
      const sessionId = resolveSessionCallId({
        callId: row.call_id,
        billingMinute: row.billing_minute,
        metadata: row.metadata,
      });
      if (!sessionId || !callIdSet.has(sessionId)) continue;
      const coins = Math.abs(Number(row.amount) || 0);
      if (coins === 0) continue;
      const prev = byCall.get(sessionId) || { host: 0, tl: 0 };
      if (String(row.transaction_type) === 'HOST_EARN') prev.host += coins;
      else if (String(row.transaction_type) === 'TL_EARN') prev.tl += coins;
      byCall.set(sessionId, prev);
    }
    if (page.length < pageSize) break;
    offset += pageSize;
    // Safety cap
    if (offset >= 20000) break;
  }

  return rows.map((r) => {
    const callId = String(r.callId || '').trim();
    const split = callId ? byCall.get(callId) : null;
    const host = split?.host || 0;
    const tl = split?.tl || 0;
    const burn = Math.max(0, Number(r.amountCoins) || 0);
    const platform = Math.max(0, burn - host - tl);
    return {
      ...r,
      hostEarnCoins: host,
      hostEarnUsd: coinsToUsd(host, peg),
      tlEarnCoins: tl,
      tlEarnUsd: coinsToUsd(tl, peg),
      platformRetainedCoins: platform,
      platformRetainedUsd: coinsToUsd(platform, peg),
    };
  });
}

async function loadFinancialLedgerRows(
  client: SupabaseClient,
  opts: {
    scope: EarningsScope;
    userIds: string[] | null;
    start: Date;
    end: Date;
    limit: number;
  }
): Promise<EarningsLedgerRow[]> {
  if (opts.userIds && opts.userIds.length === 0) return [];
  const types = finEntryTypes(opts.scope);
  const out: EarningsLedgerRow[] = [];
  const pageSize = Math.min(opts.limit, 1000);
  let offset = 0;

  while (out.length < opts.limit) {
    let q = client
      .from('financial_ledger')
      .select(
        'id, created_at, entry_type, user_id, team_leader_id, amount_coins, amount_usd, fx_ratio, metadata'
      )
      .in('entry_type', types)
      .gte('created_at', toIso(opts.start))
      .lt('created_at', toIso(opts.end))
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (opts.scope === 'tl' && opts.userIds && opts.userIds.length === 1) {
      q = q.or(`user_id.eq.${opts.userIds[0]},team_leader_id.eq.${opts.userIds[0]}`);
    } else if (opts.userIds) {
      q = q.in('user_id', opts.userIds);
    }

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const rows = data || [];
    for (const row of rows) {
      out.push(mapFinancialRowToLedger(row));
      if (out.length >= opts.limit) break;
    }
    if (rows.length < pageSize) break;
    offset += pageSize;
  }

  return hydrateLedgerUserNames(client, out);
}

/** Aggregate component split from wallet (+ optional closed financial bonus) for a window. */
async function computeComponentSplit(
  client: SupabaseClient,
  opts: {
    scope: EarningsScope;
    userIds: string[] | null;
    start: Date;
    end: Date;
    peg: number;
    /** Include TARGET_BONUS from financial_ledger in this window. */
    includeClosedBonus?: boolean;
  }
): Promise<EarningsComponentSplit> {
  const split = emptyComponentSplit();
  if (opts.scope !== 'host' && opts.scope !== 'tl') {
    // Platform: use retained total only
    const accrual = await aggregateWalletLedgerEarnings({
      periodStart: opts.start,
      periodEnd: opts.end,
      client,
    });
    if (accrual.success) {
      const coins = scopeCoinsFromAccrual(opts.scope, accrual.totals);
      split.callCoins = coins;
      split.callUsd = coinsToUsd(coins, opts.peg);
    }
    return finalizeSplit(split);
  }

  if (opts.userIds && opts.userIds.length === 0) return finalizeSplit(split);

  const types =
    opts.scope === 'tl'
      ? [...TL_WALLET_TYPES]
      : [...HOST_WALLET_TYPES];
  const pageSize = 1000;
  let offset = 0;
  for (;;) {
    let q = client
      .from('wallet_ledger')
      .select('id, user_id, transaction_type, amount, created_at, metadata')
      .in('transaction_type', types)
      .gte('created_at', toIso(opts.start))
      .lt('created_at', toIso(opts.end))
      .order('created_at', { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (opts.userIds) q = q.in('user_id', opts.userIds);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const rows = data || [];
    for (const row of rows) {
      if (!(Number(row.amount) || 0)) continue;
      addRowToSplit(split, mapWalletRowToLedger(row, opts.peg));
    }
    if (rows.length < pageSize) break;
    offset += pageSize;
  }

  if (opts.includeClosedBonus && opts.scope === 'host') {
    let offsetFin = 0;
    for (;;) {
      let q = client
        .from('financial_ledger')
        .select(
          'id, created_at, entry_type, user_id, team_leader_id, amount_coins, amount_usd, fx_ratio, metadata'
        )
        .eq('entry_type', 'TARGET_BONUS')
        .gte('created_at', toIso(opts.start))
        .lt('created_at', toIso(opts.end))
        .order('created_at', { ascending: true })
        .range(offsetFin, offsetFin + pageSize - 1);
      if (opts.userIds) q = q.in('user_id', opts.userIds);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      const rows = data || [];
      for (const row of rows) {
        addRowToSplit(split, mapFinancialRowToLedger(row));
      }
      if (rows.length < pageSize) break;
      offsetFin += pageSize;
    }
  }

  return finalizeSplit(split);
}

async function loadLifetimeGroups(
  client: SupabaseClient,
  opts: {
    scope: EarningsScope;
    userIds: string[] | null;
    groupBy: EarningsGroupBy;
    peg: number;
    limit: number;
  }
): Promise<EarningsLifetimeGroup[]> {
  if (opts.userIds && opts.userIds.length === 0) return [];

  const types = finEntryTypes(opts.scope);
  const groups = new Map<
    string,
    { start: Date; end: Date; coins: number; usd: number; entryCount: number }
  >();

  const pageSize = 1000;
  let offset = 0;
  for (;;) {
    let q = client
      .from('financial_ledger')
      .select('amount_coins, amount_usd, created_at, user_id, team_leader_id, entry_type')
      .in('entry_type', types)
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (opts.scope === 'tl' && opts.userIds && opts.userIds.length === 1) {
      q = q.or(`user_id.eq.${opts.userIds[0]},team_leader_id.eq.${opts.userIds[0]}`);
    } else if (opts.userIds) {
      q = q.in('user_id', opts.userIds);
    }

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const rows = data || [];
    for (const row of rows) {
      const created = new Date(row.created_at);
      if (Number.isNaN(created.getTime())) continue;
      const key = opts.groupBy === 'week' ? weekKey(created) : monthKey(created);
      let start: Date;
      let end: Date;
      if (opts.groupBy === 'week') {
        start = startOfUtcWeekMonday(created);
        end = new Date(start);
        end.setUTCDate(end.getUTCDate() + 7);
      } else {
        start = startOfUtcMonth(created);
        end = addUtcMonths(start, 1);
      }
      const prev = groups.get(key) || {
        start,
        end,
        coins: 0,
        usd: 0,
        entryCount: 0,
      };
      prev.coins += Number(row.amount_coins) || 0;
      prev.usd += Number(row.amount_usd) || 0;
      prev.entryCount += 1;
      groups.set(key, prev);
    }
    if (rows.length < pageSize) break;
    offset += pageSize;
  }

  // Include current open calendar bucket from wallet so “now” appears even before close
  const now = new Date();
  const currentBounds =
    opts.groupBy === 'week' ? calendarWeekBounds(now) : calendarMonthBounds(now);
  const currentKey =
    opts.groupBy === 'week' ? weekKey(now) : monthKey(now);
  if (!groups.has(currentKey)) {
    const accrual = await aggregateWalletLedgerEarnings({
      periodStart: currentBounds.start,
      periodEnd: now < currentBounds.end ? now : currentBounds.end,
      userIds:
        opts.scope === 'platform'
          ? undefined
          : opts.userIds === null
            ? undefined
            : opts.userIds,
      client,
    });
    const coins = accrual.success ? scopeCoinsFromAccrual(opts.scope, accrual.totals) : 0;
    if (coins > 0) {
      groups.set(currentKey, {
        start: currentBounds.start,
        end: currentBounds.end,
        coins,
        usd: coinsToUsd(coins, opts.peg),
        entryCount: 0,
      });
    }
  }

  return [...groups.entries()]
    .map(([periodKey, g]) => ({
      periodKey,
      label: groupLabel(opts.groupBy, g.start, g.end),
      periodStart: toIso(g.start),
      periodEnd: toIso(g.end),
      totalCoins: g.coins,
      totalUsd: g.usd,
      entryCount: g.entryCount,
    }))
    .sort((a, b) => b.periodStart.localeCompare(a.periodStart))
    .slice(0, opts.limit);
}

export async function buildEarningsOverview(opts: {
  scope: EarningsScope;
  userIds: string[] | null;
  teamLeaderId?: string | null;
  config?: FinanceSystemConfig;
  client?: SupabaseClient | null;
  at?: Date;
}): Promise<EarningsOverviewResponse> {
  const client = opts.client ?? getSupabaseAdmin();
  if (!client) throw new Error('Supabase admin client unavailable');

  const at = opts.at ?? new Date();
  const config = opts.config ?? (await loadFinanceSystemConfig());
  const peg = getCoinUsdPeg(config);
  const week = calendarWeekBounds(at);
  const month = calendarMonthBounds(at);

  const weekEndLive = at < week.end ? at : week.end;
  const monthEndLive = at < month.end ? at : month.end;

  const userIdsForAccrual =
    opts.scope === 'platform'
      ? undefined
      : opts.userIds === null
        ? undefined
        : opts.userIds;

  const [weekAccrual, monthAccrual, lifetimeFin, weekSeriesPack, monthSeriesPack] =
    await Promise.all([
      aggregateWalletLedgerEarnings({
        periodStart: week.start,
        periodEnd: weekEndLive,
        userIds: userIdsForAccrual,
        client,
      }),
      aggregateWalletLedgerEarnings({
        periodStart: month.start,
        periodEnd: monthEndLive,
        userIds: userIdsForAccrual,
        client,
      }),
      sumFinancialLedger(client, {
        scope: opts.scope,
        userIds: opts.userIds,
        teamLeaderId: opts.teamLeaderId,
      }),
      buildDailySeriesFromWallet(client, {
        scope: opts.scope,
        userIds: opts.userIds,
        start: week.start,
        end: week.end,
        peg,
      }),
      buildDailySeriesFromWallet(client, {
        scope: opts.scope,
        userIds: opts.userIds,
        start: month.start,
        end: month.end,
        peg,
      }),
    ]);

  const weekCoins = weekAccrual.success
    ? scopeCoinsFromAccrual(opts.scope, weekAccrual.totals)
    : 0;
  const monthCoins = monthAccrual.success
    ? scopeCoinsFromAccrual(opts.scope, monthAccrual.totals)
    : 0;

  // Lifetime = closed books + current open settlement window wallet (avoid double-count closed)
  const settlementBounds = getCurrentPeriodBounds(config.creatorTargetCycle, at);
  const openAccrual = await aggregateWalletLedgerEarnings({
    periodStart: settlementBounds.periodStart,
    periodEnd: at < settlementBounds.periodEnd ? at : settlementBounds.periodEnd,
    userIds: userIdsForAccrual,
    client,
  });
  const openCoins = openAccrual.success
    ? scopeCoinsFromAccrual(opts.scope, openAccrual.totals)
    : 0;
  const lifetimeCoins = lifetimeFin.coins + openCoins;
  const lifetimeUsd = lifetimeFin.usd + coinsToUsd(openCoins, peg);

  const ensured = await ensureOpenPeriod({ at, config });
  const nextCloseAtDate = await getNextCloseAt({ at, config });
  const remainingMs = Math.max(0, nextCloseAtDate.getTime() - at.getTime());
  const totalMs = Math.max(
    1,
    nextCloseAtDate.getTime() - settlementBounds.periodStart.getTime()
  );

  const daysElapsedWeek = Math.max(
    1,
    Math.ceil((weekEndLive.getTime() - week.start.getTime()) / 86400000)
  );

  const weekKpi: EarningsKpiBucket = {
    ...emptyKpi(week.start, week.end),
    coins: weekCoins,
    usd: coinsToUsd(weekCoins, peg),
    entryCount: weekSeriesPack.entryCount,
  };
  const monthKpi: EarningsKpiBucket = {
    ...emptyKpi(month.start, month.end),
    coins: monthCoins,
    usd: coinsToUsd(monthCoins, peg),
    entryCount: monthSeriesPack.entryCount,
  };

  const [weekSplit, monthSplit, lifetimeSplit] = await Promise.all([
    computeComponentSplit(client, {
      scope: opts.scope,
      userIds: opts.userIds,
      start: week.start,
      end: weekEndLive,
      peg,
      includeClosedBonus: true,
    }),
    computeComponentSplit(client, {
      scope: opts.scope,
      userIds: opts.userIds,
      start: month.start,
      end: monthEndLive,
      peg,
      includeClosedBonus: true,
    }),
    (async () => {
      // Lifetime split: all financial salary books + open settlement wallet (no double-count rewards on fin)
      const split = emptyComponentSplit();
      const pageSize = 1000;
      let offset = 0;
      const types = finEntryTypes(opts.scope);
      for (;;) {
        let q = client
          .from('financial_ledger')
          .select(
            'id, created_at, entry_type, user_id, team_leader_id, amount_coins, amount_usd, fx_ratio, metadata'
          )
          .in('entry_type', types)
          .order('created_at', { ascending: true })
          .range(offset, offset + pageSize - 1);
        if (opts.scope === 'tl' && opts.userIds && opts.userIds.length === 1) {
          q = q.or(`user_id.eq.${opts.userIds[0]},team_leader_id.eq.${opts.userIds[0]}`);
        } else if (opts.userIds) {
          if (opts.userIds.length === 0) break;
          q = q.in('user_id', opts.userIds);
        }
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        const rows = data || [];
        for (const row of rows) addRowToSplit(split, mapFinancialRowToLedger(row));
        if (rows.length < pageSize) break;
        offset += pageSize;
      }
      const openSplit = await computeComponentSplit(client, {
        scope: opts.scope,
        userIds: opts.userIds,
        start: settlementBounds.periodStart,
        end: at < settlementBounds.periodEnd ? at : settlementBounds.periodEnd,
        peg,
        includeClosedBonus: false,
      });
      split.callCoins += openSplit.callCoins;
      split.callUsd += openSplit.callUsd;
      split.giftCoins += openSplit.giftCoins;
      split.giftUsd += openSplit.giftUsd;
      split.trueUpCoins += openSplit.trueUpCoins;
      split.trueUpUsd += openSplit.trueUpUsd;
      split.rewardCoins += openSplit.rewardCoins;
      split.rewardUsd += openSplit.rewardUsd;
      // tier bonus already in financial books for closed periods
      return finalizeSplit(split);
    })(),
  ]);

  return {
    scope: opts.scope,
    coinUsdPeg: peg,
    week: weekKpi,
    month: monthKpi,
    lifetime: {
      coins: lifetimeCoins,
      usd: lifetimeUsd,
      entryCount: lifetimeFin.entryCount,
      periodStart: null,
      periodEnd: null,
    },
    periodClock: {
      cycleType: config.creatorTargetCycle,
      periodCloseUtcTime: config.periodCloseUtcTime,
      settlementEnabled: config.settlementEnabled,
      periodStart: toIso(settlementBounds.periodStart),
      periodEnd: toIso(settlementBounds.periodEnd),
      nextCloseAt: nextCloseAtDate.toISOString(),
      remainingMs,
      elapsedRatio: Math.min(1, Math.max(0, 1 - remainingMs / totalMs)),
      periodId: ensured.period?.id ?? null,
      periodStatus: ensured.period?.status ?? null,
    },
    extras: {
      entriesThisWeek: weekSeriesPack.entryCount,
      avgDailyUsdThisWeek: coinsToUsd(weekCoins, peg) / daysElapsedWeek,
      settlementCycleLabel: String(config.creatorTargetCycle || 'weekly'),
    },
    series: {
      week: weekSeriesPack.series,
      month: monthSeriesPack.series,
    },
    componentSplit: {
      week: weekSplit,
      month: monthSplit,
      lifetime: lifetimeSplit,
    },
  };
}

export async function buildEarningsLedger(opts: {
  scope: EarningsScope;
  userIds: string[] | null;
  mode: EarningsLedgerMode;
  groupBy?: EarningsGroupBy;
  periodKey?: string | null;
  limit?: number;
  config?: FinanceSystemConfig;
  client?: SupabaseClient | null;
  at?: Date;
}): Promise<EarningsLedgerResponse> {
  const client = opts.client ?? getSupabaseAdmin();
  if (!client) throw new Error('Supabase admin client unavailable');

  const at = opts.at ?? new Date();
  const config = opts.config ?? (await loadFinanceSystemConfig());
  const peg = getCoinUsdPeg(config);
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const groupBy: EarningsGroupBy = opts.groupBy === 'month' ? 'month' : 'week';
  const mode = opts.mode;

  if (mode === 'lifetime' && !opts.periodKey) {
    const groups = await loadLifetimeGroups(client, {
      scope: opts.scope,
      userIds: opts.userIds,
      groupBy,
      peg,
      limit,
    });
    return {
      scope: opts.scope,
      mode,
      groupBy,
      rows: [],
      groups,
      periodStart: null,
      periodEnd: null,
    };
  }

  if (mode === 'lifetime' && opts.periodKey) {
    const bounds = parsePeriodKey(String(opts.periodKey), groupBy);
    if (!bounds) {
      throw Object.assign(new Error('Invalid periodKey'), { code: 'INVALID_PERIOD_KEY' });
    }
    const finRows = await loadFinancialLedgerRows(client, {
      scope: opts.scope,
      userIds: opts.userIds,
      start: bounds.start,
      end: bounds.end,
      limit,
    });
    // If this is the current open bucket, also append live wallet rows not yet closed
    const now = at;
    const isCurrent =
      now >= bounds.start && now < bounds.end;
    let rows = finRows;
    if (isCurrent) {
      const walletRows = await loadWalletLedgerRows(client, {
        scope: opts.scope,
        userIds: opts.userIds,
        start: bounds.start,
        end: now < bounds.end ? now : bounds.end,
        peg,
        limit,
      });
      const seen = new Set(finRows.map((r) => r.id));
      rows = [...finRows, ...walletRows.filter((r) => !seen.has(r.id))].slice(0, limit);
    }
    return {
      scope: opts.scope,
      mode,
      groupBy,
      periodKey: opts.periodKey,
      rows,
      groups: [],
      periodStart: toIso(bounds.start),
      periodEnd: toIso(bounds.end),
    };
  }

  const bounds = mode === 'month' ? calendarMonthBounds(at) : calendarWeekBounds(at);
  const endLive = at < bounds.end ? at : bounds.end;
  const rows = await loadWalletLedgerRows(client, {
    scope: opts.scope,
    userIds: opts.userIds,
    start: bounds.start,
    end: endLive,
    peg,
    limit,
  });

  return {
    scope: opts.scope,
    mode,
    groupBy: null,
    rows,
    groups: [],
    periodStart: toIso(bounds.start),
    periodEnd: toIso(bounds.end),
  };
}
