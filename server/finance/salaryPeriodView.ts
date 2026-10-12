/**
 * Admin salary-period aggregation — group closed-period batches into TL+host sections.
 *
 * Grain is period × payee × salary component (from settlement_line_items), not per call minute.
 * Call-level drill-down for a closed period would be a separate wallet_ledger group-on-read
 * (e.g. earnings-ledger?mode=period&periodId=…) if product asks — not needed for salary UI.
 */

import { getSupabaseAdmin, isSupabaseAdminConfigured } from '../supabaseAdmin';
import { normalizePayeeSalaryStatus } from './statusTransition';
import {
  attachPayoutToPayee,
  loadSalaryPayoutDetailsByUserIds,
  type SalaryPayoutDetails,
} from './salaryPayoutAttach';

export type PayeeAckStatus = 'pending' | 'admin_paid' | 'acknowledged';
export type { SalaryPayoutDetails };

export interface SalaryPayeeRow {
  userId: string;
  name: string | null;
  email: string | null;
  role: 'host' | 'team_leader';
  amountCoins: number;
  amountUsd: number;
  ackStatus: PayeeAckStatus;
  batchId: string;
  components: Array<{
    component: string;
    amountCoins: number;
    amountUsd: number;
  }>;
  /** Primary payout card for remittance (full values for admin salary views). */
  payout?: SalaryPayoutDetails | null;
}

export interface SalaryTlSection {
  teamLeaderId: string;
  teamLeader: SalaryPayeeRow | null;
  hosts: SalaryPayeeRow[];
  totalHostSalaryUsd: number;
  totalTlCommissionUsd: number;
  totalDueUsd: number;
  batchId: string;
  batchStatus: string;
  reconcileStatus: 'unreconciled' | 'reconciled';
  reconciledAt: string | null;
  reconciledByRole: 'admin' | 'team_leader' | null;
  hostsPaidCount: number;
  hostsAckedCount: number;
  hostsTotal: number;
  ackProgress: { acknowledged: number; total: number };
}

export interface SalaryPeriodDetail {
  period: {
    id: string;
    cycleType: string;
    periodStart: string;
    periodEnd: string;
    status: string;
    closedAt: string | null;
    configSnapshot: Record<string, unknown>;
  };
  tlSections: SalaryTlSection[];
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
    unreconciledCount: number;
    reconciledCount: number;
  };
  ackProgress: { acknowledged: number; total: number };
  /** True when at least one reconciled batch still awaits Admin remittance. */
  canMarkPaid: boolean;
  paymentReferences: string[];
}

function worstAck(statuses: PayeeAckStatus[]): PayeeAckStatus {
  if (statuses.some((s) => s === 'pending')) return 'pending';
  if (statuses.some((s) => s === 'admin_paid')) return 'admin_paid';
  return 'acknowledged';
}

function aggregatePayeeLines(
  lines: any[],
  profile: { id?: string; name?: string; email?: string } | null | undefined
): SalaryPayeeRow | null {
  if (!lines.length) return null;
  const userId = String(lines[0].payee_user_id);
  const role = String(lines[0].payee_role) === 'team_leader' ? 'team_leader' : 'host';
  const components = lines.map((l) => ({
    component: String(l.component || 'other'),
    amountCoins: Number(l.amount_coins) || 0,
    amountUsd: Number(l.amount_usd) || 0,
  }));
  const amountCoins = components.reduce((s, c) => s + c.amountCoins, 0);
  const amountUsd = components.reduce((s, c) => s + c.amountUsd, 0);
  const ackStatus = worstAck(
    lines.map((l) => normalizePayeeSalaryStatus(l.host_salary_status))
  );
  return {
    userId,
    name: profile?.name ?? null,
    email: profile?.email ?? null,
    role,
    amountCoins,
    amountUsd,
    ackStatus,
    batchId: String(lines[0].batch_id),
    components,
  };
}

export async function loadSalaryPeriodDetail(
  periodId: string
): Promise<{ success: boolean; data?: SalaryPeriodDetail; error?: string }> {
  if (!isSupabaseAdminConfigured()) {
    return { success: false, error: 'Supabase admin not configured' };
  }
  const client = getSupabaseAdmin();
  if (!client) return { success: false, error: 'Supabase admin client unavailable' };

  const id = String(periodId || '').trim();
  if (!id) return { success: false, error: 'Period id required' };

  const { data: period, error: periodErr } = await client
    .from('settlement_periods')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (periodErr) return { success: false, error: periodErr.message };
  if (!period) return { success: false, error: 'Period not found' };

  const { data: batches, error: batchErr } = await client
    .from('settlement_batches')
    .select('*')
    .eq('period_id', id)
    .order('created_at', { ascending: true });
  if (batchErr) return { success: false, error: batchErr.message };

  const batchList = (batches || []).filter((b) => b.status !== 'cancelled');
  const batchIds = batchList.map((b) => String(b.id));

  const { data: lines, error: lineErr } = batchIds.length
    ? await client
        .from('settlement_line_items')
        .select('*')
        .in('batch_id', batchIds)
        .order('created_at', { ascending: true })
    : { data: [] as any[], error: null };
  if (lineErr) return { success: false, error: lineErr.message };

  const lineList = lines || [];
  const userIds = Array.from(
    new Set(lineList.map((l) => String(l.payee_user_id)).filter(Boolean))
  );
  const { data: profiles } = userIds.length
    ? await client.from('profiles').select('id, name, email').in('id', userIds)
    : { data: [] as any[] };
  const profileById = new Map(
    (profiles || []).map((p: any) => [String(p.id), p])
  );

  const linesByBatch = new Map<string, any[]>();
  for (const l of lineList) {
    const bid = String(l.batch_id);
    const list = linesByBatch.get(bid) || [];
    list.push(l);
    linesByBatch.set(bid, list);
  }

  const tlSections: SalaryTlSection[] = [];
  const directHosts: SalaryPayeeRow[] = [];

  for (const batch of batchList) {
    const bid = String(batch.id);
    const batchLines = linesByBatch.get(bid) || [];

    if (batch.batch_kind === 'team_leader_bundle') {
      const tlId = String(batch.team_leader_id || batch.payee_user_id);
      const byPayee = new Map<string, any[]>();
      for (const l of batchLines) {
        const uid = String(l.payee_user_id);
        const list = byPayee.get(uid) || [];
        list.push(l);
        byPayee.set(uid, list);
      }

      const tlLines = (byPayee.get(tlId) || []).filter(
        (l) => l.payee_role === 'team_leader'
      );
      const tlHostLines = (byPayee.get(tlId) || []).filter(
        (l) => l.payee_role === 'host'
      );
      const teamLeader = aggregatePayeeLines(
        tlLines.length ? tlLines : [],
        profileById.get(tlId)
      );
      // If TL has no commission lines but is payee, still show a zero TL row for section header
      const tlRow: SalaryPayeeRow =
        teamLeader ||
        ({
          userId: tlId,
          name: profileById.get(tlId)?.name ?? null,
          email: profileById.get(tlId)?.email ?? null,
          role: 'team_leader',
          amountCoins: 0,
          amountUsd: 0,
          ackStatus: 'pending',
          batchId: bid,
          components: [],
        } as SalaryPayeeRow);

      const hosts: SalaryPayeeRow[] = [];
      for (const [uid, pls] of byPayee.entries()) {
        if (uid === tlId) {
          if (tlHostLines.length) {
            const hostSelf = aggregatePayeeLines(tlHostLines, profileById.get(uid));
            if (hostSelf) hosts.push(hostSelf);
          }
          continue;
        }
        const hostLines = pls.filter((l) => l.payee_role === 'host');
        const row = aggregatePayeeLines(hostLines, profileById.get(uid));
        if (row) hosts.push(row);
      }
      hosts.sort((a, b) => b.amountUsd - a.amountUsd);

      const payeesForAck = [tlRow, ...hosts].filter(
        (p) => p.components.length > 0 || p.role === 'team_leader'
      );
      // Ack progress: unique payees with at least one line
      const uniquePayees = new Map<string, PayeeAckStatus>();
      for (const l of batchLines) {
        const uid = String(l.payee_user_id);
        const st = normalizePayeeSalaryStatus(l.host_salary_status);
        const prev = uniquePayees.get(uid);
        if (!prev) uniquePayees.set(uid, st);
        else uniquePayees.set(uid, worstAck([prev, st]));
      }
      const ackTotal = uniquePayees.size;
      const ackDone = Array.from(uniquePayees.values()).filter(
        (s) => s === 'acknowledged'
      ).length;
      const hostsPaidCount = hosts.filter((h) => h.ackStatus !== 'pending').length;
      const hostsAckedCount = hosts.filter((h) => h.ackStatus === 'acknowledged').length;

      tlSections.push({
        teamLeaderId: tlId,
        teamLeader: tlRow,
        hosts,
        totalHostSalaryUsd: Number(batch.total_host_salary_usd) || 0,
        totalTlCommissionUsd: Number(batch.total_tl_commission_usd) || 0,
        totalDueUsd: Number(batch.total_due_usd) || 0,
        batchId: bid,
        batchStatus: String(batch.status),
        reconcileStatus:
          batch.reconcile_status === 'reconciled' ? 'reconciled' : 'unreconciled',
        reconciledAt: batch.reconciled_at ?? null,
        reconciledByRole:
          batch.reconciled_by_role === 'admin' || batch.reconciled_by_role === 'team_leader'
            ? batch.reconciled_by_role
            : null,
        hostsPaidCount,
        hostsAckedCount,
        hostsTotal: hosts.length,
        ackProgress: { acknowledged: ackDone, total: ackTotal },
      });
      void payeesForAck;
    } else {
      const byPayee = new Map<string, any[]>();
      for (const l of batchLines) {
        const uid = String(l.payee_user_id);
        const list = byPayee.get(uid) || [];
        list.push(l);
        byPayee.set(uid, list);
      }
      for (const [uid, pls] of byPayee.entries()) {
        const row = aggregatePayeeLines(pls, profileById.get(uid));
        if (row) directHosts.push(row);
      }
    }
  }

  directHosts.sort((a, b) => b.amountUsd - a.amountUsd);

  // Attach primary payout cards (full details — admin remittance)
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

  let ackAcknowledged = 0;
  let ackTotal = 0;
  const payeeAck = new Map<string, PayeeAckStatus>();
  for (const l of lineList) {
    const key = `${l.batch_id}:${l.payee_user_id}`;
    const st = normalizePayeeSalaryStatus(l.host_salary_status);
    const prev = payeeAck.get(key);
    if (!prev) payeeAck.set(key, st);
    else payeeAck.set(key, worstAck([prev, st]));
  }
  ackTotal = payeeAck.size;
  ackAcknowledged = Array.from(payeeAck.values()).filter((s) => s === 'acknowledged').length;

  const totals = {
    totalDueUsd: batchList.reduce((s, b) => s + (Number(b.total_due_usd) || 0), 0),
    totalHostSalaryUsd: batchList.reduce(
      (s, b) => s + (Number(b.total_host_salary_usd) || 0),
      0
    ),
    totalTlCommissionUsd: batchList.reduce(
      (s, b) => s + (Number(b.total_tl_commission_usd) || 0),
      0
    ),
    outstandingDueUsd: batchList
      .filter((b) => b.status === 'pending_admin_pay')
      .reduce((s, b) => s + (Number(b.total_due_usd) || 0), 0),
    batchCount: batchList.length,
    pendingAdminPayCount: batchList.filter((b) => b.status === 'pending_admin_pay').length,
    adminPaidCount: batchList.filter(
      (b) => b.status === 'admin_paid' || b.status === 'tl_confirmed'
    ).length,
    fullyAckedBatchCount: batchList.filter((b) => b.status === 'tl_confirmed').length,
    unreconciledCount: batchList.filter(
      (b) => b.status !== 'cancelled' && b.reconcile_status !== 'reconciled'
    ).length,
    reconciledCount: batchList.filter(
      (b) => b.status !== 'cancelled' && b.reconcile_status === 'reconciled'
    ).length,
  };

  const canMarkPaid = batchList.some(
    (b) =>
      b.status === 'pending_admin_pay' && b.reconcile_status === 'reconciled'
  );

  const paymentReferences = Array.from(
    new Set(
      batchList
        .map((b) => (b.payment_reference ? String(b.payment_reference) : ''))
        .filter(Boolean)
    )
  );

  return {
    success: true,
    data: {
      period: {
        id: period.id,
        cycleType: period.cycle_type,
        periodStart: period.period_start,
        periodEnd: period.period_end,
        status: period.status,
        closedAt: period.closed_at ?? null,
        configSnapshot: period.config_snapshot || {},
      },
      tlSections,
      directHosts,
      totals,
      ackProgress: { acknowledged: ackAcknowledged, total: ackTotal },
      canMarkPaid,
      paymentReferences,
    },
  };
}

export async function listSalaryPeriods(opts?: {
  limit?: number;
}): Promise<{
  success: boolean;
  periods?: Array<{
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
    unreconciledCount: number;
    reconciledCount: number;
    ackProgress: { acknowledged: number; total: number };
    canMarkPaid: boolean;
  }>;
  error?: string;
}> {
  if (!isSupabaseAdminConfigured()) {
    return { success: false, error: 'Supabase admin not configured' };
  }
  const client = getSupabaseAdmin();
  if (!client) return { success: false, error: 'Supabase admin client unavailable' };

  const limit = Math.min(Math.max(opts?.limit ?? 40, 1), 100);
  const { data: periods, error } = await client
    .from('settlement_periods')
    .select('id, cycle_type, period_start, period_end, status, closed_at')
    .eq('status', 'closed')
    .order('period_end', { ascending: false })
    .limit(limit);
  if (error) return { success: false, error: error.message };

  const out = [];
  for (const p of periods || []) {
    const detail = await loadSalaryPeriodDetail(p.id);
    if (!detail.success || !detail.data) continue;
    const d = detail.data;
    out.push({
      periodId: d.period.id,
      cycleType: d.period.cycleType,
      periodStart: d.period.periodStart,
      periodEnd: d.period.periodEnd,
      status: d.period.status,
      closedAt: d.period.closedAt,
      totalDueUsd: d.totals.totalDueUsd,
      outstandingDueUsd: d.totals.outstandingDueUsd,
      batchCount: d.totals.batchCount,
      pendingAdminPayCount: d.totals.pendingAdminPayCount,
      adminPaidCount: d.totals.adminPaidCount,
      unreconciledCount: d.totals.unreconciledCount,
      reconciledCount: d.totals.reconciledCount,
      ackProgress: d.ackProgress,
      canMarkPaid: d.canMarkPaid,
    });
  }

  return { success: true, periods: out };
}
