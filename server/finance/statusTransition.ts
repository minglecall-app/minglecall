/**
 * Settlement status transitions + append-only settlement_events.
 *
 * Product (reconcile → remit → Agency host pay → ack):
 * - After close: batch pending_admin_pay + unreconciled, lines pending
 * - Reconcile (Admin any / TL own bundle): reconcile_status = reconciled
 * - Admin remittance: batch admin_paid; TL-bundle → only TL commission lines admin_paid;
 *   direct_host → host lines admin_paid
 * - Agency marks host paid on remitted TL bundle → host lines admin_paid
 * - Host/TL Acknowledge → acknowledged; all lines acked → batch tl_confirmed (Complete)
 */

import { getSupabaseAdmin, isSupabaseAdminConfigured } from '../supabaseAdmin';
import type {
  SettlementBatchStatus,
  SettlementEventType,
  SettlementReconciledByRole,
  SettlementReconcileStatus,
} from '../../shared/finance/types';

export const SETTLEMENT_STATUS_TRANSITIONS: Record<
  SettlementBatchStatus,
  readonly SettlementBatchStatus[]
> = {
  pending_admin_pay: ['admin_paid', 'cancelled'],
  admin_paid: ['tl_confirmed', 'cancelled'],
  tl_confirmed: [],
  cancelled: [],
};

export function canTransitionSettlementStatus(
  from: SettlementBatchStatus,
  to: SettlementBatchStatus
): boolean {
  return (SETTLEMENT_STATUS_TRANSITIONS[from] || []).includes(to);
}

export interface TransitionResult {
  success: boolean;
  error?: string;
  code?:
    | 'INVALID_TRANSITION'
    | 'NOT_FOUND'
    | 'DB_ERROR'
    | 'NOT_CONFIGURED'
    | 'FORBIDDEN'
    | 'RECONCILE_REQUIRED'
    | 'ALREADY_RECONCILED';
  batchesUpdated?: number;
  alreadyPaid?: boolean;
  alreadyReconciled?: boolean;
  skippedUnreconciled?: number;
}

/** Normalize legacy `paid` to `acknowledged` for reads. */
export function normalizePayeeSalaryStatus(
  raw: string | null | undefined
): 'pending' | 'admin_paid' | 'acknowledged' {
  const s = String(raw || 'pending').trim();
  if (s === 'acknowledged' || s === 'paid') return 'acknowledged';
  if (s === 'admin_paid') return 'admin_paid';
  return 'pending';
}

async function appendEvent(opts: {
  batchId: string;
  periodId?: string | null;
  eventType: SettlementEventType;
  actorUserId: string;
  note?: string | null;
  payload?: Record<string, unknown>;
}): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseAdmin();
  if (!client) return { success: false, error: 'Supabase admin client unavailable' };
  const { error } = await client.from('settlement_events').insert({
    batch_id: opts.batchId,
    period_id: opts.periodId ?? null,
    event_type: opts.eventType,
    actor_user_id: opts.actorUserId,
    note: opts.note ?? null,
    payload: opts.payload ?? {},
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** Direct-host: all payee lines → admin_paid. TL-bundle remit: only team_leader lines. */
async function setPayeeLinesAdminPaidForRemit(
  batchId: string,
  batchKind: string
): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseAdmin();
  if (!client) return { success: false, error: 'Supabase admin client unavailable' };
  let q = client
    .from('settlement_line_items')
    .update({ host_salary_status: 'admin_paid' })
    .eq('batch_id', batchId)
    .in('host_salary_status', ['pending', 'paid']);
  const remitRole = adminRemitLinePayeeRoleFilter(batchKind);
  if (remitRole) {
    q = q.eq('payee_role', remitRole);
  }
  const { error } = await q;
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export function normalizeReconcileStatus(
  raw: string | null | undefined
): SettlementReconcileStatus {
  return String(raw || 'unreconciled') === 'reconciled' ? 'reconciled' : 'unreconciled';
}

/** TL bundle Admin remit touches only Agency commission lines; direct_host touches all. */
export function adminRemitLinePayeeRoleFilter(
  batchKind: string
): 'team_leader' | null {
  return batchKind === 'team_leader_bundle' ? 'team_leader' : null;
}

export function reconcileGateOk(
  reconcileStatus: string | null | undefined
): boolean {
  return normalizeReconcileStatus(reconcileStatus) === 'reconciled';
}

/** Pure preconditions for Agency host mark-paid (DB checks omitted). */
export function evaluateAgencyMarkHostPaidGate(opts: {
  batchKind: string;
  teamLeaderId: string | null | undefined;
  actorUserId: string;
  reconcileStatus: string | null | undefined;
  batchStatus: string;
  hostUserId: string;
}): { ok: true } | { ok: false; code: TransitionResult['code']; error: string } {
  if (opts.batchKind !== 'team_leader_bundle') {
    return {
      ok: false,
      code: 'INVALID_TRANSITION',
      error: 'Only Agency bundles support Agency host mark-paid',
    };
  }
  if (String(opts.teamLeaderId || '') !== opts.actorUserId) {
    return { ok: false, code: 'FORBIDDEN', error: 'Not your Agency settlement batch' };
  }
  if (!reconcileGateOk(opts.reconcileStatus)) {
    return {
      ok: false,
      code: 'RECONCILE_REQUIRED',
      error: 'Reconcile this batch before marking host salaries paid',
    };
  }
  if (opts.batchStatus !== 'admin_paid' && opts.batchStatus !== 'tl_confirmed') {
    return {
      ok: false,
      code: 'INVALID_TRANSITION',
      error: 'Admin must remit the Agency bundle before marking hosts paid',
    };
  }
  if (opts.hostUserId === opts.actorUserId) {
    return {
      ok: false,
      code: 'INVALID_TRANSITION',
      error: 'Use acknowledge for your Agency commission, not host mark-paid',
    };
  }
  return { ok: true };
}

/** Batch Complete (tl_confirmed) when every line is acknowledged. */
export function allPayeeLinesAcknowledged(
  lineStatuses: Array<string | null | undefined>
): boolean {
  if (!lineStatuses.length) return false;
  return lineStatuses.every((s) => normalizePayeeSalaryStatus(s) === 'acknowledged');
}

/**
 * Admin (any batch) or Agency/TL (own team_leader_bundle) confirms amounts.
 * Required before Admin remittance / Agency host mark-paid.
 */
export async function reconcileBatch(opts: {
  batchId: string;
  actorUserId: string;
  actorRole: SettlementReconciledByRole;
  note?: string;
}): Promise<TransitionResult> {
  if (!isSupabaseAdminConfigured()) {
    return { success: false, code: 'NOT_CONFIGURED', error: 'Supabase admin not configured' };
  }
  const client = getSupabaseAdmin();
  if (!client) {
    return { success: false, code: 'NOT_CONFIGURED', error: 'Supabase admin client unavailable' };
  }

  const batchId = String(opts.batchId || '').trim();
  const actorUserId = String(opts.actorUserId || '').trim();
  if (!batchId) return { success: false, code: 'NOT_FOUND', error: 'Batch id required' };
  if (!actorUserId) return { success: false, code: 'FORBIDDEN', error: 'Unauthorized' };

  const { data: batch, error } = await client
    .from('settlement_batches')
    .select(
      'id, status, batch_kind, team_leader_id, period_id, reconcile_status, reconciled_at, reconciled_by, reconciled_by_role'
    )
    .eq('id', batchId)
    .maybeSingle();

  if (error) return { success: false, code: 'DB_ERROR', error: error.message };
  if (!batch) return { success: false, code: 'NOT_FOUND', error: 'Batch not found' };
  if (batch.status === 'cancelled') {
    return { success: false, code: 'INVALID_TRANSITION', error: 'Cancelled batch cannot be reconciled' };
  }

  if (opts.actorRole === 'team_leader') {
    if (batch.batch_kind !== 'team_leader_bundle') {
      return {
        success: false,
        code: 'FORBIDDEN',
        error: 'Agency can only reconcile their own bundle batches',
      };
    }
    if (String(batch.team_leader_id || '') !== actorUserId) {
      return { success: false, code: 'FORBIDDEN', error: 'Not your Agency settlement batch' };
    }
  } else if (opts.actorRole !== 'admin') {
    return { success: false, code: 'FORBIDDEN', error: 'Unauthorized' };
  }

  if (normalizeReconcileStatus(batch.reconcile_status) === 'reconciled') {
    return { success: true, alreadyReconciled: true };
  }

  const now = new Date().toISOString();
  const { error: updateError } = await client
    .from('settlement_batches')
    .update({
      reconcile_status: 'reconciled',
      reconciled_at: now,
      reconciled_by: actorUserId,
      reconciled_by_role: opts.actorRole,
      updated_at: now,
    })
    .eq('id', batchId)
    .eq('reconcile_status', 'unreconciled');

  if (updateError) return { success: false, code: 'DB_ERROR', error: updateError.message };

  const ev = await appendEvent({
    batchId,
    periodId: batch.period_id,
    eventType: 'reconciled',
    actorUserId,
    note: opts.note ?? null,
    payload: { reconciledByRole: opts.actorRole },
  });
  if (!ev.success) {
    await client
      .from('settlement_batches')
      .update({
        reconcile_status: 'unreconciled',
        reconciled_at: null,
        reconciled_by: null,
        reconciled_by_role: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', batchId);
    return { success: false, code: 'DB_ERROR', error: ev.error };
  }

  return { success: true };
}

/**
 * Agency marks one managed host's salary lines paid (after Admin remitted the bundle).
 */
export async function agencyMarkHostPaid(opts: {
  batchId: string;
  hostUserId: string;
  actorUserId: string;
  note?: string;
}): Promise<TransitionResult> {
  if (!isSupabaseAdminConfigured()) {
    return { success: false, code: 'NOT_CONFIGURED', error: 'Supabase admin not configured' };
  }
  const client = getSupabaseAdmin();
  if (!client) {
    return { success: false, code: 'NOT_CONFIGURED', error: 'Supabase admin client unavailable' };
  }

  const batchId = String(opts.batchId || '').trim();
  const hostUserId = String(opts.hostUserId || '').trim();
  const actorUserId = String(opts.actorUserId || '').trim();
  if (!batchId || !hostUserId) {
    return { success: false, code: 'NOT_FOUND', error: 'Batch and host id required' };
  }
  if (!actorUserId) return { success: false, code: 'FORBIDDEN', error: 'Unauthorized' };

  const { data: batch, error } = await client
    .from('settlement_batches')
    .select('id, status, batch_kind, team_leader_id, period_id, reconcile_status')
    .eq('id', batchId)
    .maybeSingle();

  if (error) return { success: false, code: 'DB_ERROR', error: error.message };
  if (!batch) return { success: false, code: 'NOT_FOUND', error: 'Batch not found' };
  const gate = evaluateAgencyMarkHostPaidGate({
    batchKind: String(batch.batch_kind || ''),
    teamLeaderId: batch.team_leader_id,
    actorUserId,
    reconcileStatus: batch.reconcile_status,
    batchStatus: String(batch.status || ''),
    hostUserId,
  });
  if (!gate.ok) {
    return { success: false, code: gate.code, error: gate.error };
  }

  const { data: hostLines, error: linesErr } = await client
    .from('settlement_line_items')
    .select('id, host_salary_status')
    .eq('batch_id', batchId)
    .eq('payee_user_id', hostUserId)
    .eq('payee_role', 'host');
  if (linesErr) return { success: false, code: 'DB_ERROR', error: linesErr.message };
  if (!hostLines?.length) {
    return { success: false, code: 'NOT_FOUND', error: 'No host salary lines for this user on the batch' };
  }

  const already = hostLines.every(
    (l) => normalizePayeeSalaryStatus(l.host_salary_status) !== 'pending'
  );
  if (already) return { success: true, alreadyPaid: true };

  const { error: updateErr } = await client
    .from('settlement_line_items')
    .update({ host_salary_status: 'admin_paid' })
    .eq('batch_id', batchId)
    .eq('payee_user_id', hostUserId)
    .eq('payee_role', 'host')
    .in('host_salary_status', ['pending', 'paid']);
  if (updateErr) return { success: false, code: 'DB_ERROR', error: updateErr.message };

  const ev = await appendEvent({
    batchId,
    periodId: batch.period_id,
    eventType: 'agency_marked_host_paid',
    actorUserId,
    note: opts.note ?? null,
    payload: { hostUserId },
  });
  if (!ev.success) return { success: false, code: 'DB_ERROR', error: ev.error };

  return { success: true };
}

async function tryPromoteBatchWhenFullyAcknowledged(
  batchId: string,
  actorUserId: string,
  periodId: string | null
): Promise<{ success: boolean; error?: string; promoted?: boolean }> {
  const client = getSupabaseAdmin();
  if (!client) return { success: false, error: 'Supabase admin client unavailable' };

  const { data: lines, error } = await client
    .from('settlement_line_items')
    .select('id, host_salary_status')
    .eq('batch_id', batchId);
  if (error) return { success: false, error: error.message };

  const list = lines || [];
  if (!list.length) return { success: true, promoted: false };

  const allAcked = allPayeeLinesAcknowledged(list.map((l) => l.host_salary_status));
  if (!allAcked) return { success: true, promoted: false };

  const { data: batch, error: batchErr } = await client
    .from('settlement_batches')
    .select('id, status')
    .eq('id', batchId)
    .maybeSingle();
  if (batchErr) return { success: false, error: batchErr.message };
  if (!batch) return { success: false, error: 'Batch not found' };
  if (batch.status === 'tl_confirmed') return { success: true, promoted: false };
  if (batch.status !== 'admin_paid') return { success: true, promoted: false };

  const { error: updateError } = await client
    .from('settlement_batches')
    .update({
      status: 'tl_confirmed',
      updated_at: new Date().toISOString(),
    })
    .eq('id', batchId)
    .eq('status', 'admin_paid');
  if (updateError) return { success: false, error: updateError.message };

  const ev = await appendEvent({
    batchId,
    periodId,
    eventType: 'tl_confirmed',
    actorUserId,
    note: 'All payees acknowledged',
    payload: { reason: 'all_payees_acknowledged' },
  });
  if (!ev.success) {
    await client
      .from('settlement_batches')
      .update({ status: 'admin_paid', updated_at: new Date().toISOString() })
      .eq('id', batchId)
      .eq('status', 'tl_confirmed');
    return { success: false, error: ev.error };
  }

  return { success: true, promoted: true };
}

/**
 * Admin remittance: batch → admin_paid.
 * TL bundle: only TL commission lines → admin_paid (hosts paid later by Agency).
 * Direct host: host lines → admin_paid.
 * Requires reconcile_status = reconciled.
 */
export async function markBatchAdminPaid(opts: {
  batchId: string;
  actorUserId: string;
  note?: string;
  paymentReference?: string;
  /** @deprecated Ignored — ack model never auto-acks hosts. */
  markHostsPaidNow?: boolean;
}): Promise<TransitionResult> {
  if (!isSupabaseAdminConfigured()) {
    return { success: false, code: 'NOT_CONFIGURED', error: 'Supabase admin not configured' };
  }
  const client = getSupabaseAdmin();
  if (!client) {
    return { success: false, code: 'NOT_CONFIGURED', error: 'Supabase admin client unavailable' };
  }

  const { data: batch, error } = await client
    .from('settlement_batches')
    .select('id, status, batch_kind, period_id, reconcile_status')
    .eq('id', opts.batchId)
    .maybeSingle();

  if (error) return { success: false, code: 'DB_ERROR', error: error.message };
  if (!batch) return { success: false, code: 'NOT_FOUND', error: 'Batch not found' };

  const from = batch.status as SettlementBatchStatus;
  if (from === 'admin_paid' || from === 'tl_confirmed') {
    return { success: true, alreadyPaid: true };
  }
  if (!canTransitionSettlementStatus(from, 'admin_paid')) {
    return {
      success: false,
      code: 'INVALID_TRANSITION',
      error: `Cannot transition ${from} → admin_paid`,
    };
  }
  if (!reconcileGateOk(batch.reconcile_status)) {
    return {
      success: false,
      code: 'RECONCILE_REQUIRED',
      error: 'Reconcile this batch before Admin remittance / Salary Paid',
    };
  }

  const { error: updateError } = await client
    .from('settlement_batches')
    .update({
      status: 'admin_paid',
      payment_reference: opts.paymentReference ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', opts.batchId)
    .eq('status', from);

  if (updateError) return { success: false, code: 'DB_ERROR', error: updateError.message };

  const ev = await appendEvent({
    batchId: opts.batchId,
    periodId: batch.period_id,
    eventType: 'admin_marked_paid',
    actorUserId: opts.actorUserId,
    note: opts.note ?? null,
    payload: {
      paymentReference: opts.paymentReference ?? null,
      batchKind: batch.batch_kind,
      remitScope: adminRemitLinePayeeRoleFilter(String(batch.batch_kind))
        ? 'tl_commission_only'
        : 'all_payee_lines',
    },
  });
  if (!ev.success) {
    await client
      .from('settlement_batches')
      .update({
        status: from,
        payment_reference: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', opts.batchId)
      .eq('status', 'admin_paid');
    return { success: false, code: 'DB_ERROR', error: ev.error };
  }

  const lines = await setPayeeLinesAdminPaidForRemit(opts.batchId, String(batch.batch_kind));
  if (!lines.success) return { success: false, code: 'DB_ERROR', error: lines.error };

  return { success: true };
}

/**
 * Admin remits all reconciled, non-cancelled batches in a period.
 * Unreconciled batches are skipped (counted in skippedUnreconciled).
 */
export async function markPeriodAdminPaid(opts: {
  periodId: string;
  actorUserId: string;
  note?: string;
  paymentReference?: string;
}): Promise<TransitionResult> {
  if (!isSupabaseAdminConfigured()) {
    return { success: false, code: 'NOT_CONFIGURED', error: 'Supabase admin not configured' };
  }
  const client = getSupabaseAdmin();
  if (!client) {
    return { success: false, code: 'NOT_CONFIGURED', error: 'Supabase admin client unavailable' };
  }

  const periodId = String(opts.periodId || '').trim();
  if (!periodId) return { success: false, code: 'NOT_FOUND', error: 'Period id required' };

  const { data: period, error: periodErr } = await client
    .from('settlement_periods')
    .select('id, status')
    .eq('id', periodId)
    .maybeSingle();
  if (periodErr) return { success: false, code: 'DB_ERROR', error: periodErr.message };
  if (!period) return { success: false, code: 'NOT_FOUND', error: 'Period not found' };

  const { data: batches, error: batchErr } = await client
    .from('settlement_batches')
    .select('id, status, reconcile_status')
    .eq('period_id', periodId)
    .neq('status', 'cancelled');
  if (batchErr) return { success: false, code: 'DB_ERROR', error: batchErr.message };

  const list = batches || [];
  if (!list.length) {
    return { success: false, code: 'NOT_FOUND', error: 'No settlement batches for this period' };
  }

  let updated = 0;
  let skippedUnreconciled = 0;
  for (const b of list) {
    if (b.status === 'admin_paid' || b.status === 'tl_confirmed') continue;
    if (normalizeReconcileStatus(b.reconcile_status) !== 'reconciled') {
      skippedUnreconciled += 1;
      continue;
    }
    const result = await markBatchAdminPaid({
      batchId: b.id,
      actorUserId: opts.actorUserId,
      note: opts.note,
      paymentReference: opts.paymentReference,
    });
    if (!result.success) {
      return { ...result, batchesUpdated: updated, skippedUnreconciled };
    }
    if (!result.alreadyPaid) updated += 1;
  }

  if (updated === 0 && skippedUnreconciled > 0) {
    return {
      success: false,
      code: 'RECONCILE_REQUIRED',
      error: `${skippedUnreconciled} batch(es) still need reconcile before remittance`,
      skippedUnreconciled,
      batchesUpdated: 0,
    };
  }

  return {
    success: true,
    batchesUpdated: updated,
    alreadyPaid: updated === 0,
    skippedUnreconciled,
  };
}

/**
 * Authenticated payee acknowledges receipt for their lines on a batch.
 * Hosts: payee_role=host. TL: payee_role=team_leader on TL bundle.
 */
export async function acknowledgePayeeSalary(opts: {
  batchId: string;
  actorUserId: string;
  note?: string;
}): Promise<TransitionResult> {
  if (!isSupabaseAdminConfigured()) {
    return { success: false, code: 'NOT_CONFIGURED', error: 'Supabase admin not configured' };
  }
  const client = getSupabaseAdmin();
  if (!client) {
    return { success: false, code: 'NOT_CONFIGURED', error: 'Supabase admin client unavailable' };
  }

  const batchId = String(opts.batchId || '').trim();
  const actorUserId = String(opts.actorUserId || '').trim();
  if (!batchId) return { success: false, code: 'NOT_FOUND', error: 'Batch id required' };
  if (!actorUserId) return { success: false, code: 'FORBIDDEN', error: 'Unauthorized' };

  const { data: batch, error } = await client
    .from('settlement_batches')
    .select('id, status, batch_kind, team_leader_id, payee_user_id, period_id')
    .eq('id', batchId)
    .maybeSingle();

  if (error) return { success: false, code: 'DB_ERROR', error: error.message };
  if (!batch) return { success: false, code: 'NOT_FOUND', error: 'Batch not found' };

  if (batch.status !== 'admin_paid' && batch.status !== 'tl_confirmed') {
    return {
      success: false,
      code: 'INVALID_TRANSITION',
      error:
        'Salary can only be acknowledged after Admin remittance (and Agency host pay for managed hosts)',
    };
  }

  const { data: myLines, error: linesErr } = await client
    .from('settlement_line_items')
    .select('id, payee_role, host_salary_status')
    .eq('batch_id', batchId)
    .eq('payee_user_id', actorUserId);
  if (linesErr) return { success: false, code: 'DB_ERROR', error: linesErr.message };
  if (!myLines?.length) {
    return {
      success: false,
      code: 'FORBIDDEN',
      error: 'You are not a payee on this settlement batch',
    };
  }

  const already = myLines.every(
    (l) => normalizePayeeSalaryStatus(l.host_salary_status) === 'acknowledged'
  );
  if (already) return { success: true, alreadyPaid: true };

  const roles = new Set(myLines.map((l) => String(l.payee_role)));
  const isTl = roles.has('team_leader');
  const isHost = roles.has('host');

  // Only lines already marked paid (admin remit or Agency host pay) may be acknowledged
  const pendingOnly = myLines.every(
    (l) => normalizePayeeSalaryStatus(l.host_salary_status) === 'pending'
  );
  if (pendingOnly) {
    return {
      success: false,
      code: 'INVALID_TRANSITION',
      error: 'Salary is not marked paid yet — wait for remittance / Agency payout',
    };
  }

  const { error: updateErr } = await client
    .from('settlement_line_items')
    .update({ host_salary_status: 'acknowledged' })
    .eq('batch_id', batchId)
    .eq('payee_user_id', actorUserId)
    .eq('host_salary_status', 'admin_paid');
  if (updateErr) return { success: false, code: 'DB_ERROR', error: updateErr.message };

  const eventType: SettlementEventType = isTl && !isHost ? 'tl_acknowledged' : 'host_acknowledged';
  // If TL also has host lines (rare), record both via payload; primary event by role priority TL
  const primaryEvent: SettlementEventType = isTl ? 'tl_acknowledged' : 'host_acknowledged';

  const ev = await appendEvent({
    batchId,
    periodId: batch.period_id,
    eventType: primaryEvent,
    actorUserId,
    note: opts.note ?? null,
    payload: {
      payeeRoles: Array.from(roles),
      alsoHostAck: isTl && isHost ? true : undefined,
      eventAlias: eventType,
    },
  });
  if (!ev.success) return { success: false, code: 'DB_ERROR', error: ev.error };

  if (isTl && isHost) {
    await appendEvent({
      batchId,
      periodId: batch.period_id,
      eventType: 'host_acknowledged',
      actorUserId,
      note: opts.note ?? null,
      payload: { reason: 'tl_also_host_payee' },
    });
  }

  const promoted = await tryPromoteBatchWhenFullyAcknowledged(
    batchId,
    actorUserId,
    batch.period_id
  );
  if (!promoted.success) return { success: false, code: 'DB_ERROR', error: promoted.error };

  return { success: true };
}

/**
 * @deprecated Prefer acknowledgePayeeSalary. Kept for TL confirm-received route compatibility.
 * TL-only ack — does not mark host lines.
 */
export async function markBatchTlConfirmed(opts: {
  batchId: string;
  actorUserId: string;
  note?: string;
}): Promise<TransitionResult> {
  return acknowledgePayeeSalary({
    batchId: opts.batchId,
    actorUserId: opts.actorUserId,
    note: opts.note,
  });
}

/**
 * Admin cancel stub — status via settlement_events only (amounts immutable).
 * Does not reverse ledger amounts; use appendReversalEntry for money corrections.
 */
export async function cancelSettlementBatch(opts: {
  batchId: string;
  actorUserId: string;
  note?: string;
}): Promise<TransitionResult> {
  if (!isSupabaseAdminConfigured()) {
    return { success: false, code: 'NOT_CONFIGURED', error: 'Supabase admin not configured' };
  }
  const client = getSupabaseAdmin();
  if (!client) {
    return { success: false, code: 'NOT_CONFIGURED', error: 'Supabase admin client unavailable' };
  }

  const { data: batch, error } = await client
    .from('settlement_batches')
    .select('id, status, period_id')
    .eq('id', opts.batchId)
    .maybeSingle();

  if (error) return { success: false, code: 'DB_ERROR', error: error.message };
  if (!batch) return { success: false, code: 'NOT_FOUND', error: 'Batch not found' };

  const from = batch.status as SettlementBatchStatus;
  if (!canTransitionSettlementStatus(from, 'cancelled')) {
    return {
      success: false,
      code: 'INVALID_TRANSITION',
      error: `Cannot transition ${from} → cancelled`,
    };
  }

  const { error: updateError } = await client
    .from('settlement_batches')
    .update({
      status: 'cancelled',
      updated_at: new Date().toISOString(),
    })
    .eq('id', opts.batchId)
    .eq('status', from);

  if (updateError) return { success: false, code: 'DB_ERROR', error: updateError.message };

  const ev = await appendEvent({
    batchId: opts.batchId,
    periodId: batch.period_id,
    eventType: 'cancelled',
    actorUserId: opts.actorUserId,
    note: opts.note ?? 'Cancelled by admin',
  });
  if (!ev.success) {
    await client
      .from('settlement_batches')
      .update({ status: from, updated_at: new Date().toISOString() })
      .eq('id', opts.batchId)
      .eq('status', 'cancelled');
    return { success: false, code: 'DB_ERROR', error: ev.error };
  }

  return { success: true };
}

/** Append a free-form note event without changing status. */
export async function appendSettlementNote(opts: {
  batchId: string;
  actorUserId: string;
  note: string;
  periodId?: string | null;
}): Promise<TransitionResult> {
  if (!isSupabaseAdminConfigured()) {
    return { success: false, code: 'NOT_CONFIGURED', error: 'Supabase admin not configured' };
  }
  const ev = await appendEvent({
    batchId: opts.batchId,
    periodId: opts.periodId ?? null,
    eventType: 'note',
    actorUserId: opts.actorUserId,
    note: opts.note,
  });
  if (!ev.success) return { success: false, code: 'DB_ERROR', error: ev.error };
  return { success: true };
}

/** Record batch creation event (Phase 3 close will call after insert). */
export async function recordBatchCreatedEvent(opts: {
  batchId: string;
  periodId: string;
  actorUserId: string;
  payload?: Record<string, unknown>;
}): Promise<TransitionResult> {
  if (!isSupabaseAdminConfigured()) {
    return { success: false, code: 'NOT_CONFIGURED', error: 'Supabase admin not configured' };
  }
  const ev = await appendEvent({
    batchId: opts.batchId,
    periodId: opts.periodId,
    eventType: 'created',
    actorUserId: opts.actorUserId,
    payload: opts.payload ?? {},
  });
  if (!ev.success) return { success: false, code: 'DB_ERROR', error: ev.error };
  return { success: true };
}
