/**
 * Express dual-run: payout templates + user cards (mirrors api/_lib/cjs/payoutRoutes.js).
 */
import { Router } from 'express';
import type { ServerRuntime } from '../runtimeTypes';
import { requireAuth, requireAdmin, requireTeamLeader } from '../middleware/auth';
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '../supabaseAdmin';
import {
  mapTemplateRow,
  templateToRow,
  templateAvailableInCountry,
  validateCardValues,
  maskCardValues,
  assertPayoutRole,
  isPayoutMethodKey,
} from '../../shared/payout/validate';
import type { PayoutMethodTemplate } from '../../shared/payout/types';

function requireDb(res: any): boolean {
  if (!isSupabaseAdminConfigured()) {
    res.status(503).json({ success: false, error: { message: 'Database not configured' } });
    return false;
  }
  return true;
}

function profileId(req: any): string {
  return String(req.profile?.id || req.user?.id || '');
}

function roleOf(req: any): string {
  return String(req.profile?.role || '').toLowerCase();
}

function isAdminReq(req: any): boolean {
  return roleOf(req) === 'admin' || Boolean(req.isAdmin);
}

async function loadTemplates(): Promise<PayoutMethodTemplate[]> {
  const client = getSupabaseAdmin();
  const { data, error } = await client
    .from('payout_method_templates')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map(mapTemplateRow);
}

function mapCard(row: any, extra?: Record<string, unknown>) {
  const values =
    row?.values_json && typeof row.values_json === 'object' && !Array.isArray(row.values_json)
      ? row.values_json
      : {};
  return {
    id: row.id,
    userId: row.user_id,
    methodKey: row.method_key,
    countryCode: row.country_code,
    values,
    isPrimary: Boolean(row.is_primary),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...extra,
  };
}

export function createPayoutRouter(_ctx: ServerRuntime): Router {
  const router = Router();

  router.get('/admin/payout/templates', requireAdmin, async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const templates = await loadTemplates();
      return res.json({ success: true, data: { templates } });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: { message: err?.message || 'Failed' } });
    }
  });

  router.put('/admin/payout/templates', requireAdmin, async (req, res) => {
    if (!requireDb(res)) return;
    const list = Array.isArray(req.body?.templates)
      ? req.body.templates
      : req.body?.template
        ? [req.body.template]
        : [];
    if (!list.length) {
      return res.status(400).json({ success: false, error: { message: 'templates array required' } });
    }
    try {
      const client = getSupabaseAdmin();
      const saved: PayoutMethodTemplate[] = [];
      for (const raw of list) {
        if (!isPayoutMethodKey(raw.methodKey || raw.method_key)) {
          return res.status(400).json({
            success: false,
            error: { message: `Invalid method_key: ${raw.methodKey || raw.method_key}` },
          });
        }
        const row = templateToRow({
          ...raw,
          methodKey: raw.methodKey || raw.method_key,
        } as PayoutMethodTemplate);
        const { data, error } = await client
          .from('payout_method_templates')
          .upsert(row, { onConflict: 'method_key' })
          .select('*')
          .maybeSingle();
        if (error) throw new Error(error.message);
        saved.push(mapTemplateRow(data));
      }
      return res.json({ success: true, data: { templates: saved } });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: { message: err?.message || 'Failed' } });
    }
  });

  router.get('/payout/templates', requireAuth, async (req, res) => {
    if (!requireDb(res)) return;
    if (!assertPayoutRole(roleOf(req)) && !isAdminReq(req)) {
      return res.status(403).json({ success: false, error: { message: 'Not allowed', code: 'FORBIDDEN' } });
    }
    const country = String(req.query.country || req.query.countryCode || '')
      .trim()
      .toUpperCase();
    try {
      let templates = await loadTemplates();
      templates = templates.filter((t) => templateAvailableInCountry(t, country || null));
      return res.json({ success: true, data: { templates } });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: { message: err?.message || 'Failed' } });
    }
  });

  router.get('/payout/cards/me', requireAuth, async (req, res) => {
    if (!requireDb(res)) return;
    if (!assertPayoutRole(roleOf(req))) {
      return res.status(403).json({ success: false, error: { message: 'Forbidden' } });
    }
    try {
      const client = getSupabaseAdmin();
      const { data, error } = await client
        .from('user_payout_cards')
        .select('*')
        .eq('user_id', profileId(req))
        .order('updated_at', { ascending: false });
      if (error) throw new Error(error.message);
      return res.json({ success: true, data: { cards: (data || []).map((r) => mapCard(r)) } });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: { message: err?.message || 'Failed' } });
    }
  });

  router.put('/payout/cards/me', requireAuth, async (req, res) => {
    if (!requireDb(res)) return;
    if (!assertPayoutRole(roleOf(req))) {
      return res.status(403).json({ success: false, error: { message: 'Forbidden' } });
    }
    const methodKey = req.body?.methodKey || req.body?.method_key;
    const countryCode = String(req.body?.countryCode || req.body?.country_code || '')
      .trim()
      .toUpperCase();
    if (!isPayoutMethodKey(methodKey)) {
      return res.status(400).json({ success: false, error: { message: 'Invalid methodKey' } });
    }
    if (!countryCode || countryCode.length < 2) {
      return res.status(400).json({ success: false, error: { message: 'countryCode is required' } });
    }
    try {
      const client = getSupabaseAdmin();
      const templates = await loadTemplates();
      const template = templates.find((t) => t.methodKey === methodKey);
      if (!template || !template.isEnabled) {
        return res.status(400).json({ success: false, error: { message: 'Method not available' } });
      }
      if (!templateAvailableInCountry(template, countryCode)) {
        return res.status(400).json({
          success: false,
          error: { message: 'This method is not available in the selected country' },
        });
      }
      const userId = profileId(req);
      const { data: existingCard } = await client
        .from('user_payout_cards')
        .select('id')
        .eq('user_id', userId)
        .eq('method_key', methodKey)
        .maybeSingle();
      if (existingCard) {
        return res.status(409).json({
          success: false,
          error: {
            message:
              'Payout card is locked after save and cannot be edited. Remove it first or contact admin.',
            code: 'CARD_LOCKED',
          },
        });
      }
      const validated = validateCardValues(template, req.body?.values || {});
      if (validated.ok === false) {
        return res.status(400).json({ success: false, error: { message: validated.message } });
      }
      const isPrimary = req.body?.isPrimary === true;
      if (isPrimary) {
        await client
          .from('user_payout_cards')
          .update({ is_primary: false, updated_at: new Date().toISOString() })
          .eq('user_id', userId);
      }
      const { data, error } = await client
        .from('user_payout_cards')
        .insert({
          user_id: userId,
          method_key: methodKey,
          country_code: countryCode,
          values_json: validated.values,
          is_primary: isPrimary,
          updated_at: new Date().toISOString(),
        })
        .select('*')
        .maybeSingle();
      if (error) throw new Error(error.message);
      return res.json({ success: true, data: { card: mapCard(data) } });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: { message: err?.message || 'Failed' } });
    }
  });

  router.delete('/payout/cards/me', requireAuth, async (req, res) => {
    if (!requireDb(res)) return;
    if (!assertPayoutRole(roleOf(req))) {
      return res.status(403).json({ success: false, error: { message: 'Forbidden' } });
    }
    const methodKey = req.body?.methodKey || req.query.methodKey;
    const id = req.body?.id || req.query.id;
    try {
      const client = getSupabaseAdmin();
      let q = client.from('user_payout_cards').delete().eq('user_id', profileId(req));
      if (id) q = q.eq('id', String(id));
      else if (isPayoutMethodKey(methodKey)) q = q.eq('method_key', methodKey);
      else {
        return res.status(400).json({ success: false, error: { message: 'id or methodKey required' } });
      }
      const { error } = await q;
      if (error) throw new Error(error.message);
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: { message: err?.message || 'Failed' } });
    }
  });

  router.get('/payout/cards/roster', requireTeamLeader, async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const client = getSupabaseAdmin();
      const templates = await loadTemplates();
      const fieldMap = Object.fromEntries(templates.map((t) => [t.methodKey, t.fields]));
      const admin = isAdminReq(req);
      const tlId = profileId(req);
      let userIds: string[] | null = null;
      if (!admin) {
        const { data: hosts, error: hErr } = await client
          .from('profiles')
          .select('id')
          .or(`team_leader_id.eq.${tlId},created_by_id.eq.${tlId}`);
        if (hErr) throw new Error(hErr.message);
        userIds = [tlId, ...(hosts || []).map((h) => h.id)];
      }
      let q = client.from('user_payout_cards').select('*').order('updated_at', { ascending: false }).limit(500);
      if (userIds) q = q.in('user_id', userIds);
      const { data: cards, error } = await q;
      if (error) throw new Error(error.message);
      const ids = [...new Set((cards || []).map((c) => c.user_id))];
      let profileMap: Record<string, any> = {};
      if (ids.length) {
        const { data: profiles } = await client.from('profiles').select('id, name, role').in('id', ids);
        profileMap = Object.fromEntries((profiles || []).map((p) => [p.id, p]));
      }
      const mapped = (cards || []).map((row) => {
        const values =
          row.values_json && typeof row.values_json === 'object' ? row.values_json : {};
        return {
          ...mapCard(row, {
            values: {},
            userName: profileMap[row.user_id]?.name || row.user_id,
            userRole: profileMap[row.user_id]?.role || '',
            maskedValues: maskCardValues(values, fieldMap[row.method_key] || []),
          }),
        };
      });
      return res.json({ success: true, data: { cards: mapped } });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: { message: err?.message || 'Failed' } });
    }
  });

  router.get('/payout/cards', requireTeamLeader, async (req, res) => {
    if (!requireDb(res)) return;
    const userId = String(req.query.userId || req.query.user_id || '').trim();
    if (!userId) {
      return res.status(400).json({ success: false, error: { message: 'userId required' } });
    }
    try {
      const client = getSupabaseAdmin();
      const admin = isAdminReq(req);
      const tlId = profileId(req);
      if (!admin && userId !== tlId) {
        const { data: host } = await client
          .from('profiles')
          .select('id, team_leader_id, created_by_id, name, role')
          .eq('id', userId)
          .maybeSingle();
        const managed =
          String(host?.team_leader_id || '') === tlId || String(host?.created_by_id || '') === tlId;
        if (!managed) {
          return res.status(403).json({ success: false, error: { message: 'Not a managed host' } });
        }
      }
      const templates = await loadTemplates();
      const { data, error } = await client.from('user_payout_cards').select('*').eq('user_id', userId);
      if (error) throw new Error(error.message);
      const { data: profile } = await client
        .from('profiles')
        .select('id, name, role')
        .eq('id', userId)
        .maybeSingle();
      return res.json({
        success: true,
        data: {
          cards: (data || []).map((r) =>
            mapCard(r, { userName: profile?.name, userRole: profile?.role })
          ),
          templates: templates.map((t) => ({
            methodKey: t.methodKey,
            label: t.label,
            fields: t.fields,
          })),
        },
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: { message: err?.message || 'Failed' } });
    }
  });

  return router;
}
