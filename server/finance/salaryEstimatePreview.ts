/**
 * Read-only estimated salary preview for the current open period [periodStart, now).
 * Reuses close-period accrual / true-up / tier-bonus / batch grouping — never persists.
 */

import { getSupabaseAdmin, isSupabaseAdminConfigured } from '../supabaseAdmin';
import { coinsToUsd, usdToCoins } from '../../shared/finance/fx';
import {
  computePerformanceTier,
  targetBonusUsdForTier,
  type TargetTierThresholds,
} from '../../shared/finance/targetBonus';
import type { CreatorPerformanceTier } from '../../shared/finance/types';
import { toIso } from '../../shared/finance/periodBounds';
import { resolveEconomyBurnRates } from '../../shared/finance/economyBurn';
import { aggregateWalletLedgerEarnings } from './accrualQuery';
import { loadFinanceSystemConfig } from './config';
import { freezeFinanceConfigSnapshot } from './configSnapshot';
import { ensureOpenPeriod } from './period';
import {
  buildSettlementBatches,
  type BuiltSettlementBatch,
  type SettlementPayeeAccrual,
} from './settlement';
import {
  aggregateHostCallBurnForTrueUp,
  planHostShareTrueUps,
} from './hostShareTrueUp';
import {
  attachPayoutToPayee,
  loadSalaryPayoutDetailsByUserIds,
  type SalaryPayoutDetails,
} from './salaryPayoutAttach';

export type SalaryEstimatePayeeRow = {
  userId: string;
  name: string | null;
  email: string | null;
  role: 'host' | 'team_leader';
  amountCoins: number;
  amountUsd: number;
  ackStatus: 'pending';
  batchId: string;
  components: Array<{
    component: string;
    amountCoins: number;
    amountUsd: number;
  }>;
  payout?: SalaryPayoutDetails | null;
};

export type SalaryEstimateTlSection = {
  teamLeaderId: string;
  teamLeader: SalaryEstimatePayeeRow | null;
  hosts: SalaryEstimatePayeeRow[];
  totalHostSalaryUsd: number;
  totalTlCommissionUsd: number;
  totalDueUsd: number;
  batchId: string;
  batchStatus: string;
  ackProgress: { acknowledged: number; total: number };
};

export type SalaryEstimatePreview = {
  isEstimate: true;
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
  tlSections: SalaryEstimateTlSection[];
  directHosts: SalaryEstimatePayeeRow[];
  totals: {
    totalDueUsd: number;
    totalHostSalaryUsd: number;
    totalTlCommissionUsd: number;
    outstandingDueUsd: number;
    batchCount: number;
    pendingAdminPayCount: number;
    adminPaidCount: number;
    fullyAckedBatchCount: number;
  };
  disclaimer: string;
};

export type SalaryEstimateScope = 'admin' | 'team_leader' | 'host';

function computeHostTargetBonus(opts: {
  hours: number;
  totalCoins: number;
  thresholds: TargetTierThresholds;
  fxRatio: number;
}): {
  tier: CreatorPerformanceTier;
  bonusUsd: number;
  bonusCoins: number;
} {
  const tier = computePerformanceTier(opts.hours, opts.totalCoins, opts.thresholds);
  const metBronze =
    opts.hours >= opts.thresholds.bronzeHours && opts.totalCoins >= opts.thresholds.bronzeCoins;
  let bonusUsd = 0;
  if (tier === 'gold' || tier === 'silver') {
    bonusUsd = targetBonusUsdForTier(tier, opts.thresholds);
  } else if (metBronze) {
    bonusUsd = targetBonusUsdForTier('bronze', opts.thresholds);
  }
  return {
    tier,
    bonusUsd,
    bonusCoins: bonusUsd > 0 ? usdToCoins(bonusUsd, opts.fxRatio) : 0,
  };
}

function linesToPayeeRow(
  batchId: string,
  payeeUserId: string,
  role: 'host' | 'team_leader',
  lines: BuiltSettlementBatch['lineItems'],
  profile: { name?: string | null; email?: string | null } | undefined
): SalaryEstimatePayeeRow {
  const mine = lines.filter((l) => l.payeeUserId === payeeUserId && l.payeeRole === role);
  const components = mine.map((l) => ({
    component: l.component,
    amountCoins: l.amountCoins,
    amountUsd: l.amountUsd,
  }));
  return {
    userId: payeeUserId,
    name: profile?.name ?? null,
    email: profile?.email ?? null,
    role,
    amountCoins: components.reduce((s, c) => s + c.amountCoins, 0),
    amountUsd: components.reduce((s, c) => s + c.amountUsd, 0),
    ackStatus: 'pending',
    batchId,
    components,
  };
}

function batchToSections(
  batches: BuiltSettlementBatch[],
  profiles: Map<string, { name: string | null; email: string | null }>
): { tlSections: SalaryEstimateTlSection[]; directHosts: SalaryEstimatePayeeRow[] } {
  const tlSections: SalaryEstimateTlSection[] = [];
  const directHosts: SalaryEstimatePayeeRow[] = [];

  batches.forEach((batch, idx) => {
    const batchId = `estimate-${idx + 1}`;
    if (batch.batchKind === 'team_leader_bundle' && batch.teamLeaderId) {
      const hostIds = [
        ...new Set(
          batch.lineItems.filter((l) => l.payeeRole === 'host').map((l) => l.payeeUserId)
        ),
      ];
      const hosts = hostIds
        .map((id) =>
          linesToPayeeRow(batchId, id, 'host', batch.lineItems, profiles.get(id))
        )
        .filter((h) => h.amountUsd > 0 || h.amountCoins > 0 || h.components.length > 0)
        .sort((a, b) => b.amountUsd - a.amountUsd);
      const teamLeader = linesToPayeeRow(
        batchId,
        batch.teamLeaderId,
        'team_leader',
        batch.lineItems,
        profiles.get(batch.teamLeaderId)
      );
      tlSections.push({
        teamLeaderId: batch.teamLeaderId,
        teamLeader:
          teamLeader.amountUsd > 0 || teamLeader.components.length > 0 ? teamLeader : null,
        hosts,
        totalHostSalaryUsd: batch.totalHostSalaryUsd,
        totalTlCommissionUsd: batch.totalTlCommissionUsd,
        totalDueUsd: batch.totalDueUsd,
        batchId,
        batchStatus: 'estimate',
        ackProgress: { acknowledged: 0, total: hosts.length + (teamLeader.components.length ? 1 : 0) },
      });
    } else {
      const hostId = batch.payeeUserId;
      const row = linesToPayeeRow(batchId, hostId, 'host', batch.lineItems, profiles.get(hostId));
      if (row.amountUsd > 0 || row.components.length > 0) directHosts.push(row);
    }
  });

  tlSections.sort((a, b) => b.totalDueUsd - a.totalDueUsd);
  directHosts.sort((a, b) => b.amountUsd - a.amountUsd);
  return { tlSections, directHosts };
}

async function buildOpenPeriodEstimate(at: Date = new Date()): Promise<{
  success: boolean;
  data?: SalaryEstimatePreview;
  error?: string;
}> {
  if (!isSupabaseAdminConfigured()) {
    return { success: false, error: 'Supabase admin not configured' };
  }
  const client = getSupabaseAdmin();
  if (!client) return { success: false, error: 'Supabase admin client unavailable' };

  const config = await loadFinanceSystemConfig();
  const ensured = await ensureOpenPeriod({ at, config });
  if (!ensured.success || !ensured.period) {
    return { success: false, error: ensured.error || 'No open settlement period' };
  }

  const period = ensured.period;
  const periodStart = period.periodStart;
  const periodEndExclusive = toIso(at);
  const periodId = period.id;
  const snapshot = freezeFinanceConfigSnapshot(config, { includeFrozenAt: false });
  const fxRatio = Number(snapshot.coin_usd_peg) || config.coinUsdPeg;
  const thresholds = config.thresholds;

  const accrual = await aggregateWalletLedgerEarnings({
    periodStart,
    periodEnd: periodEndExclusive,
    client,
  });
  if (!accrual.success) {
    return { success: false, error: accrual.error || 'Accrual query failed' };
  }

  const { data: metricsRows, error: metricsError } = await client
    .from('creator_metrics')
    .select('*');
  if (metricsError) return { success: false, error: metricsError.message };
  const metricsList = metricsRows || [];

  const userIds = Array.from(accrual.byUser.keys());
  for (const m of metricsList) {
    if (m.creator_id && !accrual.byUser.has(m.creator_id)) {
      userIds.push(String(m.creator_id));
    }
  }

  const profileById = new Map<
    string,
    {
      teamLeaderId: string | null;
      role: string;
      coinEarnOverrideRate: number | null;
      name: string | null;
      email: string | null;
    }
  >();
  if (userIds.length) {
    const chunkSize = 200;
    for (let i = 0; i < userIds.length; i += chunkSize) {
      const chunk = userIds.slice(i, i + chunkSize);
      const { data: profiles, error: profileError } = await client
        .from('profiles')
        .select('id, team_leader_id, created_by_id, role, coin_earn_override_rate, name, email')
        .in('id', chunk);
      if (profileError) return { success: false, error: profileError.message };
      for (const p of profiles || []) {
        profileById.set(String(p.id), {
          teamLeaderId: p.team_leader_id || p.created_by_id || null,
          role: String(p.role || ''),
          coinEarnOverrideRate:
            p.coin_earn_override_rate != null ? Number(p.coin_earn_override_rate) : null,
          name: p.name != null ? String(p.name) : null,
          email: p.email != null ? String(p.email) : null,
        });
      }
    }
  }

  const metricsByCreator = new Map<string, any>();
  const metricsHoursCoins = new Map<string, { hours: number; coins: number }>();
  for (const m of metricsList) {
    const cid = String(m.creator_id);
    metricsByCreator.set(cid, m);
    metricsHoursCoins.set(cid, {
      hours: Number(m.active_online_hours || 0),
      coins:
        Number(m.total_target_coins) ||
        Number(m.coins_earned_from_calls || 0) + Number(m.coins_earned_from_gifts || 0),
    });
  }

  const burnRates = resolveEconomyBurnRates(snapshot);
  const trueUpAgg = await aggregateHostCallBurnForTrueUp({
    periodStart,
    periodEnd: periodEndExclusive,
    periodId,
    client,
  });
  if (!trueUpAgg.success) {
    return { success: false, error: trueUpAgg.error || 'True-up accrual failed' };
  }

  const creatorHostIds = Array.from(
    new Set([
      ...Array.from(trueUpAgg.byHost.keys()),
      ...Array.from(metricsByCreator.keys()).filter((id) => {
        const role = profileById.get(id)?.role || '';
        return role === 'female_creator' || role === 'female_host';
      }),
    ])
  ).filter((id) => {
    const role = profileById.get(id)?.role || '';
    if (!role) return true;
    return role === 'female_creator' || role === 'female_host';
  });

  const overrideByHost = new Map<string, number | null | undefined>();
  for (const id of creatorHostIds) {
    overrideByHost.set(id, profileById.get(id)?.coinEarnOverrideRate);
  }

  const trueUpPlans = planHostShareTrueUps({
    hostIds: creatorHostIds,
    aggByHost: trueUpAgg.byHost,
    metricsByCreator: metricsHoursCoins,
    overrideByHost,
    thresholds,
    targetSharePercent: burnRates.femaleHostTargetSharePercent,
    burnConfig: snapshot,
  });

  const hostTrueUpByUser = new Map<string, number>();
  for (const plan of trueUpPlans) {
    if (plan.skippedAlreadyPosted) {
      const already = trueUpAgg.byHost.get(plan.hostId)?.alreadyTrueUpCoins || 0;
      if (already > 0) hostTrueUpByUser.set(plan.hostId, already);
      continue;
    }
    if (plan.trueUpCoins > 0) hostTrueUpByUser.set(plan.hostId, plan.trueUpCoins);
  }

  const hostIds = new Set<string>();
  const tlCommission = new Map<string, number>();
  const hostBonusByUser = new Map<
    string,
    {
      tier: CreatorPerformanceTier;
      bonusUsd: number;
      bonusCoins: number;
      hours: number;
      coins: number;
    }
  >();

  for (const [userId, totals] of accrual.byUser.entries()) {
    if (totals.hostEarnCoins > 0 || totals.giftHostEarnCoins > 0) {
      hostIds.add(userId);
    }
    if (totals.tlEarnCoins > 0) {
      tlCommission.set(userId, (tlCommission.get(userId) || 0) + totals.tlEarnCoins);
    }
  }
  for (const id of hostTrueUpByUser.keys()) hostIds.add(id);

  for (const m of metricsList) {
    const cid = String(m.creator_id);
    const hours = Number(m.active_online_hours || 0);
    const coins =
      Number(m.total_target_coins) ||
      Number(m.coins_earned_from_calls || 0) + Number(m.coins_earned_from_gifts || 0);
    const bonus = computeHostTargetBonus({
      hours,
      totalCoins: coins,
      thresholds,
      fxRatio,
    });
    if (bonus.bonusUsd > 0) {
      hostIds.add(cid);
      hostBonusByUser.set(cid, { ...bonus, hours, coins });
    } else if (hours > 0 || coins > 0) {
      hostBonusByUser.set(cid, { ...bonus, hours, coins });
    }
  }

  const builtAccruals: SettlementPayeeAccrual[] = [];

  for (const hostId of hostIds) {
    const totals = accrual.byUser.get(hostId);
    const profile = profileById.get(hostId);
    const metrics = metricsByCreator.get(hostId);
    const teamLeaderId = metrics?.agency_leader_id || profile?.teamLeaderId || null;

    let bonus = hostBonusByUser.get(hostId);
    if (!bonus && metrics) {
      const hours = Number(metrics.active_online_hours || 0);
      const coins =
        Number(metrics.total_target_coins) ||
        Number(metrics.coins_earned_from_calls || 0) +
          Number(metrics.coins_earned_from_gifts || 0);
      bonus = {
        ...computeHostTargetBonus({
          hours,
          totalCoins: coins,
          thresholds,
          fxRatio,
        }),
        hours,
        coins,
      };
      hostBonusByUser.set(hostId, bonus);
    }

    builtAccruals.push({
      userId: hostId,
      teamLeaderId,
      role: 'host',
      callEarningsCoins: totals?.callHostEarnCoins || 0,
      giftEarningsCoins: totals?.giftHostEarnCoins || 0,
      targetShareTrueUpCoins: hostTrueUpByUser.get(hostId) || 0,
      targetBonusCoins: bonus?.bonusCoins || 0,
      targetBonusUsd: bonus?.bonusUsd || 0,
      breakdown: {
        performanceTier: bonus?.tier || 'bronze',
        activeOnlineHours: bonus?.hours ?? Number(metrics?.active_online_hours || 0),
        totalTargetCoins: bonus?.coins ?? 0,
      },
    });
  }

  for (const [tlId, coins] of tlCommission.entries()) {
    builtAccruals.push({
      userId: tlId,
      role: 'team_leader',
      tlCommissionCoins: coins,
      breakdown: { source: 'wallet_ledger.TL_EARN' },
    });
  }

  for (const a of builtAccruals) {
    if (a.role === 'host' && a.teamLeaderId && !tlCommission.has(a.teamLeaderId)) {
      if (!builtAccruals.some((x) => x.role === 'team_leader' && x.userId === a.teamLeaderId)) {
        builtAccruals.push({
          userId: a.teamLeaderId,
          role: 'team_leader',
          tlCommissionCoins: 0,
        });
      }
    }
  }

  const built = buildSettlementBatches({
    accruals: builtAccruals,
    fxRatio,
  }).filter((b) => b.totalDueUsd > 0 || b.lineItems.length > 0);

  // Ensure TL / host profile names for payees not in hostIds (e.g. TL-only)
  const payeeIds = new Set<string>();
  for (const b of built) {
    payeeIds.add(b.payeeUserId);
    if (b.teamLeaderId) payeeIds.add(b.teamLeaderId);
    for (const li of b.lineItems) payeeIds.add(li.payeeUserId);
  }
  const missing = [...payeeIds].filter((id) => !profileById.has(id));
  if (missing.length) {
    const { data: extra } = await client
      .from('profiles')
      .select('id, name, email, team_leader_id, created_by_id, role, coin_earn_override_rate')
      .in('id', missing);
    for (const p of extra || []) {
      profileById.set(String(p.id), {
        teamLeaderId: p.team_leader_id || p.created_by_id || null,
        role: String(p.role || ''),
        coinEarnOverrideRate:
          p.coin_earn_override_rate != null ? Number(p.coin_earn_override_rate) : null,
        name: p.name != null ? String(p.name) : null,
        email: p.email != null ? String(p.email) : null,
      });
    }
  }

  const profileMap = new Map(
    [...profileById.entries()].map(([id, p]) => [id, { name: p.name, email: p.email }])
  );
  const { tlSections, directHosts } = batchToSections(built, profileMap);

  const allPayeeIds = Array.from(
    new Set([
      ...tlSections.flatMap((s) => [
        s.teamLeaderId,
        ...(s.teamLeader ? [s.teamLeader.userId] : []),
        ...s.hosts.map((h) => h.userId),
      ]),
      ...directHosts.map((h) => h.userId),
    ])
  );
  // Full payout details for estimate remittance preview (scoped later for TL/host)
  const payoutMap = await loadSalaryPayoutDetailsByUserIds(allPayeeIds, { mask: false });
  for (const section of tlSections) {
    if (section.teamLeader) {
      section.teamLeader = attachPayoutToPayee(section.teamLeader, payoutMap);
    }
    section.hosts = section.hosts.map((h) => attachPayoutToPayee(h, payoutMap));
  }
  for (let i = 0; i < directHosts.length; i++) {
    directHosts[i] = attachPayoutToPayee(directHosts[i], payoutMap);
  }

  const totalHostSalaryUsd = built.reduce((s, b) => s + b.totalHostSalaryUsd, 0);
  const totalTlCommissionUsd = built.reduce((s, b) => s + b.totalTlCommissionUsd, 0);
  const totalDueUsd = built.reduce((s, b) => s + b.totalDueUsd, 0);

  return {
    success: true,
    data: {
      isEstimate: true,
      asOf: periodEndExclusive,
      periodClock: {
        periodId,
        cycleType: period.cycleType,
        periodStart: String(period.periodStart),
        periodEnd: String(period.periodEnd),
        closeScheduledAt: period.closeScheduledAt ? String(period.closeScheduledAt) : null,
        periodStatus: period.status,
        accrualEnd: periodEndExclusive,
      },
      tlSections,
      directHosts,
      totals: {
        totalDueUsd: Math.round(totalDueUsd * 1e4) / 1e4,
        totalHostSalaryUsd: Math.round(totalHostSalaryUsd * 1e4) / 1e4,
        totalTlCommissionUsd: Math.round(totalTlCommissionUsd * 1e4) / 1e4,
        outstandingDueUsd: Math.round(totalDueUsd * 1e4) / 1e4,
        batchCount: built.length,
        pendingAdminPayCount: built.length,
        adminPaidCount: 0,
        fullyAckedBatchCount: 0,
      },
      disclaimer:
        'Estimate only — accrued from period start until now. Not payable until period close creates settlement batches.',
    },
  };
}

function filterForTeamLeader(
  data: SalaryEstimatePreview,
  tlId: string
): SalaryEstimatePreview {
  const section = data.tlSections.find((s) => s.teamLeaderId === tlId);
  const tlSections = section ? [section] : [];
  const totals = {
    totalDueUsd: section?.totalDueUsd || 0,
    totalHostSalaryUsd: section?.totalHostSalaryUsd || 0,
    totalTlCommissionUsd: section?.totalTlCommissionUsd || 0,
    outstandingDueUsd: section?.totalDueUsd || 0,
    batchCount: section ? 1 : 0,
    pendingAdminPayCount: section ? 1 : 0,
    adminPaidCount: 0,
    fullyAckedBatchCount: 0,
  };
  return {
    ...data,
    tlSections,
    directHosts: [],
    totals,
  };
}

function filterForHost(data: SalaryEstimatePreview, hostId: string): SalaryEstimatePreview {
  const hosts: SalaryEstimatePayeeRow[] = [];
  for (const s of data.tlSections) {
    const hit = s.hosts.find((h) => h.userId === hostId);
    if (hit) hosts.push(hit);
  }
  const direct = data.directHosts.filter((h) => h.userId === hostId);
  const all = [...hosts, ...direct];
  const totalUsd = all.reduce((s, h) => s + h.amountUsd, 0);
  return {
    ...data,
    tlSections: [],
    directHosts: all,
    totals: {
      totalDueUsd: Math.round(totalUsd * 1e4) / 1e4,
      totalHostSalaryUsd: Math.round(totalUsd * 1e4) / 1e4,
      totalTlCommissionUsd: 0,
      outstandingDueUsd: Math.round(totalUsd * 1e4) / 1e4,
      batchCount: all.length ? 1 : 0,
      pendingAdminPayCount: all.length ? 1 : 0,
      adminPaidCount: 0,
      fullyAckedBatchCount: 0,
    },
  };
}

export async function buildSalaryEstimatePreview(opts: {
  scope: SalaryEstimateScope;
  actorUserId: string;
  at?: Date;
}): Promise<{ success: boolean; data?: SalaryEstimatePreview; error?: string }> {
  const built = await buildOpenPeriodEstimate(opts.at ?? new Date());
  if (!built.success || !built.data) return built;

  if (opts.scope === 'admin') return built;

  const actorId = String(opts.actorUserId || '').trim();
  if (!actorId) return { success: false, error: 'Unauthorized' };

  if (opts.scope === 'team_leader') {
    const scoped = filterForTeamLeader(built.data, actorId);
    // Mask managed-host remittance fields for TL; keep TL's own card full.
    const hostIds = scoped.tlSections.flatMap((s) => s.hosts.map((h) => h.userId));
    if (hostIds.length) {
      const masked = await loadSalaryPayoutDetailsByUserIds(hostIds, { mask: true });
      for (const section of scoped.tlSections) {
        section.hosts = section.hosts.map((h) => attachPayoutToPayee(h, masked));
      }
    }
    return { success: true, data: scoped };
  }

  return { success: true, data: filterForHost(built.data, actorId) };
}

/** Tiny helper for tests / debug — USD from coins at current peg. */
export function estimateCoinsToUsd(coins: number, peg: number): number {
  return coinsToUsd(coins, peg);
}
