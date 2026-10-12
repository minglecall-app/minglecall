/**
 * Payout method templates (admin CMS) + user payout cards (host/TL).
 * Paths: admin/payout/templates, payout/templates, payout/cards/*
 */
const {
  send,
  readJsonBody,
  requireAuth,
  isAdminRole,
  isTeamLeaderRole,
} = require('./helpers');

const METHOD_KEYS = ['paypal', 'bank_account', 'wallet'];

function cleanStr(v, max = 240) {
  return String(v ?? '')
    .trim()
    .slice(0, max);
}

function isFieldType(v) {
  return v === 'text' || v === 'phone' || v === 'email' || v === 'number' || v === 'select';
}

function normalizeField(raw) {
  const id = cleanStr(raw && (raw.id || raw.key), 64);
  const key = cleanStr(raw && raw.key, 64)
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_');
  const label = cleanStr(raw && raw.label, 120);
  const type = isFieldType(raw && raw.type) ? raw.type : 'text';
  if (!id || !key || !label) return null;
  let options;
  if (type === 'select') {
    options = Array.isArray(raw.options)
      ? raw.options.map((o) => cleanStr(o, 80)).filter(Boolean).slice(0, 40)
      : ['Other'];
    if (!options.length) options = ['Other'];
  }
  return {
    id,
    key,
    label,
    type,
    required: Boolean(raw && raw.required),
    placeholder: cleanStr(raw && raw.placeholder, 160) || undefined,
    options,
  };
}

function mapTemplateRow(row) {
  let fieldsRaw = row && row.fields_json;
  if (typeof fieldsRaw === 'string') {
    try {
      fieldsRaw = JSON.parse(fieldsRaw);
    } catch {
      fieldsRaw = [];
    }
  }
  if (!Array.isArray(fieldsRaw)) fieldsRaw = [];
  const fields = fieldsRaw.map(normalizeField).filter(Boolean);
  const methodKey = METHOD_KEYS.includes(row && row.method_key) ? row.method_key : 'paypal';
  return {
    methodKey,
    label: cleanStr(row && row.label, 80) || methodKey,
    icon: cleanStr(row && row.icon, 40) || 'Wallet',
    description: cleanStr(row && row.description, 400),
    isEnabled: row && row.is_enabled !== false,
    countriesMode: row && row.countries_mode === 'selected' ? 'selected' : 'all',
    countryCodes: Array.isArray(row && row.country_codes)
      ? row.country_codes.map((c) => cleanStr(c, 8).toUpperCase()).filter(Boolean)
      : [],
    fields,
    sortOrder: Number(row && row.sort_order) || 0,
    updatedAt: (row && row.updated_at) || undefined,
  };
}

function templateToRow(t) {
  const fields = (Array.isArray(t.fields) ? t.fields : []).map(normalizeField).filter(Boolean);
  const countriesMode = t.countriesMode === 'selected' || t.countries_mode === 'selected' ? 'selected' : 'all';
  const countryCodes = countriesMode === 'selected'
    ? (Array.isArray(t.countryCodes) ? t.countryCodes : t.country_codes || [])
        .map((c) => cleanStr(c, 8).toUpperCase())
        .filter(Boolean)
    : [];
  return {
    method_key: t.methodKey || t.method_key,
    label: cleanStr(t.label, 80) || t.methodKey || t.method_key,
    icon: cleanStr(t.icon, 40) || 'Wallet',
    description: cleanStr(t.description, 400),
    is_enabled: t.isEnabled !== false && t.is_enabled !== false,
    countries_mode: countriesMode,
    country_codes: countryCodes,
    fields_json: fields,
    sort_order: Number(t.sortOrder != null ? t.sortOrder : t.sort_order) || 0,
    updated_at: new Date().toISOString(),
  };
}

function availableInCountry(t, countryCode) {
  if (!t.isEnabled) return false;
  if (t.countriesMode !== 'selected') return true;
  const code = cleanStr(countryCode, 8).toUpperCase();
  if (!code) return true;
  return (t.countryCodes || []).includes(code);
}

function isValidEmail(v) {
  const s = cleanStr(v, 254);
  if (!s) return false;
  return /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/.test(
    s
  );
}

function isValidIntlPhone(v) {
  const s = cleanStr(v, 32);
  if (!s.startsWith('+')) return false;
  if (!/^\+[1-9][\d\s().-]{6,22}$/.test(s)) return false;
  const digits = s.replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15;
}

function isValidIbanOrAccount(v) {
  const s = cleanStr(v, 64).replace(/\s+/g, '').toUpperCase();
  if (/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return true;
  if (/^[A-Z0-9]{6,34}$/.test(s)) return true;
  return false;
}

function isPhoneField(field) {
  const key = String(field.key || '').toLowerCase();
  return field.type === 'phone' || key.includes('phone') || key.includes('mobile') || key.includes('whatsapp');
}

function validateValues(template, values) {
  const src = values && typeof values === 'object' ? { ...values } : {};
  const out = {};
  // Preserve dial/national meta keys (drop legacy chat-app keys)
  for (const [k, val] of Object.entries(src)) {
    if (val == null || val === '') continue;
    if (/_(has_chat|chat_apps)$/.test(k)) continue;
    out[k] = String(val);
  }

  for (const field of template.fields || []) {
    const key = String(field.key || '').toLowerCase();
    if (isPhoneField(field)) {
      const dialKey = `${field.key}_dial`;
      const natKey = `${field.key}_national`;
      let dial = cleanStr(src[dialKey], 8).replace(/\s+/g, '');
      let national = cleanStr(src[natKey], 20).replace(/\D/g, '');
      if (dial && !dial.startsWith('+')) dial = `+${dial}`;
      let v = dial && national ? `${dial}${national}` : cleanStr(src[field.key], 32);
      if (field.required || dial || national || v) {
        if (!dial) return { ok: false, message: `${field.label}: select a country code.` };
        if (!national || national.length < 6) {
          return { ok: false, message: `${field.label}: enter a complete local number.` };
        }
        if (!isValidIntlPhone(v)) {
          return {
            ok: false,
            message: `${field.label} needs a valid country code and complete number.`,
          };
        }
      }
      if (v) {
        out[field.key] = v;
        out[dialKey] = dial;
        out[natKey] = national;
      }
      delete out[`${field.key}_has_chat`];
      delete out[`${field.key}_chat_apps`];
      continue;
    }

    let v = cleanStr(src[field.key], 320);
    if (field.required && !v) return { ok: false, message: `${field.label} is required.` };
    if (!v) continue;
    const asEmail = field.type === 'email' || key.includes('email');
    const asIban =
      key.includes('iban') ||
      key.includes('account_number') ||
      key === 'iban_or_account' ||
      key.includes('account_no');
    if (asEmail && !isValidEmail(v)) {
      return { ok: false, message: `${field.label} must be a valid email address.` };
    }
    if (field.type === 'number' && !/^-?\d+(\.\d+)?$/.test(v)) {
      return { ok: false, message: `${field.label} must be a number.` };
    }
    if (field.type === 'select' && field.options && field.options.length && !field.options.includes(v)) {
      return { ok: false, message: `${field.label} has an invalid option.` };
    }
    if (asIban && !isValidIbanOrAccount(v)) {
      return {
        ok: false,
        message: `${field.label} looks incomplete. Enter a full IBAN or account number.`,
      };
    }
    if (
      (key.includes('swift') || key.includes('bic')) &&
      !/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/i.test(v.replace(/\s/g, ''))
    ) {
      return { ok: false, message: `${field.label} must be a valid SWIFT/BIC (8 or 11 characters).` };
    }
    if (asEmail) v = v.toLowerCase();
    if (asIban) v = v.replace(/\s+/g, '').toUpperCase();
    out[field.key] = v;
  }
  return { ok: true, values: out };
}

function maskValue(key, value) {
  const v = String(value || '');
  if (!v) return '';
  const k = String(key || '').toLowerCase();
  if (k.includes('email') || v.includes('@')) {
    const parts = v.split('@');
    if (parts.length < 2) return '•••';
    const user = parts[0];
    const domain = parts[1];
    const u = user.length <= 2 ? `${user[0] || '•'}•` : `${user.slice(0, 2)}•••`;
    return `${u}@${domain}`;
  }
  if (v.length <= 4) return '••••';
  return `••••${v.slice(-4)}`;
}

function maskValues(values, fields) {
  const out = {};
  const vals = values && typeof values === 'object' ? values : {};
  for (const f of fields || []) {
    const v = vals[f.key];
    if (v == null || v === '') continue;
    const sensitive =
      f.type === 'email' ||
      f.type === 'phone' ||
      /iban|account|address|routing|swift|email|phone|wallet/i.test(f.key);
    out[f.key] = sensitive ? maskValue(f.key, v) : String(v);
  }
  return out;
}

function mapCardRow(row, opts) {
  const values =
    row && typeof row.values_json === 'object' && row.values_json && !Array.isArray(row.values_json)
      ? row.values_json
      : {};
  const card = {
    id: row.id,
    userId: row.user_id,
    methodKey: row.method_key,
    countryCode: row.country_code,
    values: opts && opts.mask ? {} : values,
    isPrimary: Boolean(row.is_primary),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (opts && opts.mask && opts.fields) {
    card.maskedValues = maskValues(values, opts.fields);
  }
  if (opts && opts.userName) card.userName = opts.userName;
  if (opts && opts.userRole) card.userRole = opts.userRole;
  return card;
}

function canFillPayout(role) {
  const r = String(role || '').toLowerCase();
  return (
    r === 'female_creator' ||
    r === 'female_host' ||
    r === 'team_leader' ||
    r === 'agency_manager' ||
    r === 'admin'
  );
}

function qstr(req, key) {
  try {
    const u = new URL(req.url || '', 'http://localhost');
    return u.searchParams.get(key) || '';
  } catch {
    return '';
  }
}

async function loadTemplates(client) {
  const { data, error } = await client
    .from('payout_method_templates')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map(mapTemplateRow);
}

async function ensureManagedHost(client, tlProfileId, hostUserId) {
  const { data: host, error } = await client
    .from('profiles')
    .select('id, role, team_leader_id, created_by_id, name')
    .eq('id', hostUserId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!host) return { ok: false, status: 404, error: { message: 'User not found', code: 'NOT_FOUND' } };
  const managed =
    String(host.team_leader_id || '') === tlProfileId ||
    String(host.created_by_id || '') === tlProfileId;
  if (!managed) {
    return { ok: false, status: 403, error: { message: 'Not a managed host', code: 'FORBIDDEN' } };
  }
  return { ok: true, host };
}

async function handlePayout(path, req, res) {
  const p = String(path || '');

  // ---- Admin templates ----
  if (p === 'admin/payout/templates') {
    if (req.method === 'GET') {
      const auth = await requireAuth(req);
      if (auth.ok === false) return send(res, auth.status, { success: false, error: auth.error });
      if (!isAdminRole(auth.role, auth.email)) {
        return send(res, 403, { success: false, error: { message: 'Admin role required.', code: 'FORBIDDEN' } });
      }
      try {
        const templates = await loadTemplates(auth.client);
        return send(res, 200, { success: true, data: { templates } });
      } catch (err) {
        return send(res, 500, { success: false, error: { message: err.message || 'Failed to load templates' } });
      }
    }
    if (req.method === 'PUT') {
      const auth = await requireAuth(req);
      if (auth.ok === false) return send(res, auth.status, { success: false, error: auth.error });
      if (!isAdminRole(auth.role, auth.email)) {
        return send(res, 403, { success: false, error: { message: 'Admin role required.', code: 'FORBIDDEN' } });
      }
      const body = (await readJsonBody(req)) || {};
      const list = Array.isArray(body.templates) ? body.templates : body.template ? [body.template] : [];
      if (!list.length) {
        return send(res, 400, { success: false, error: { message: 'templates array required' } });
      }
      try {
        const saved = [];
        for (const raw of list) {
          const methodKey = raw.methodKey || raw.method_key;
          if (!METHOD_KEYS.includes(methodKey)) {
            return send(res, 400, {
              success: false,
              error: { message: `Invalid method_key: ${methodKey}` },
            });
          }
          const row = templateToRow({ ...raw, methodKey });
          const { data, error } = await auth.client
            .from('payout_method_templates')
            .upsert(row, { onConflict: 'method_key' })
            .select('*')
            .maybeSingle();
          if (error) throw new Error(error.message);
          saved.push(mapTemplateRow(data));
        }
        return send(res, 200, { success: true, data: { templates: saved } });
      } catch (err) {
        return send(res, 500, { success: false, error: { message: err.message || 'Failed to save templates' } });
      }
    }
    return send(res, 405, { success: false, error: { message: 'Method not allowed' } });
  }

  // ---- Public (auth) templates for fill UI ----
  if (p === 'payout/templates' || p.startsWith('payout/templates?')) {
    if (req.method !== 'GET') {
      return send(res, 405, { success: false, error: { message: 'Method not allowed' } });
    }
    const auth = await requireAuth(req);
    if (auth.ok === false) return send(res, auth.status, { success: false, error: auth.error });
    if (!canFillPayout(auth.role) && !isAdminRole(auth.role, auth.email)) {
      return send(res, 403, { success: false, error: { message: 'Not allowed', code: 'FORBIDDEN' } });
    }
    const country = cleanStr(qstr(req, 'country') || qstr(req, 'countryCode'), 8).toUpperCase();
    try {
      let templates = await loadTemplates(auth.client);
      templates = templates.filter((t) => availableInCountry(t, country || null));
      return send(res, 200, { success: true, data: { templates } });
    } catch (err) {
      return send(res, 500, { success: false, error: { message: err.message || 'Failed to load templates' } });
    }
  }

  // ---- Own cards ----
  if (p === 'payout/cards/me' || p.startsWith('payout/cards/me?')) {
    const auth = await requireAuth(req);
    if (auth.ok === false) return send(res, auth.status, { success: false, error: auth.error });
    if (!canFillPayout(auth.role)) {
      return send(res, 403, { success: false, error: { message: 'Hosts and team leaders only', code: 'FORBIDDEN' } });
    }
    const userId = auth.profileId;

    if (req.method === 'GET') {
      try {
        const { data, error } = await auth.client
          .from('user_payout_cards')
          .select('*')
          .eq('user_id', userId)
          .order('updated_at', { ascending: false });
        if (error) throw new Error(error.message);
        return send(res, 200, {
          success: true,
          data: { cards: (data || []).map((r) => mapCardRow(r)) },
        });
      } catch (err) {
        return send(res, 500, { success: false, error: { message: err.message || 'Failed to load cards' } });
      }
    }

    if (req.method === 'PUT') {
      const body = (await readJsonBody(req)) || {};
      const methodKey = body.methodKey || body.method_key;
      if (!METHOD_KEYS.includes(methodKey)) {
        return send(res, 400, { success: false, error: { message: 'Invalid methodKey' } });
      }
      const countryCode = cleanStr(body.countryCode || body.country_code, 8).toUpperCase();
      if (!countryCode || countryCode.length < 2) {
        return send(res, 400, { success: false, error: { message: 'countryCode is required' } });
      }
      try {
        const templates = await loadTemplates(auth.client);
        const template = templates.find((t) => t.methodKey === methodKey);
        if (!template || !template.isEnabled) {
          return send(res, 400, { success: false, error: { message: 'Method not available' } });
        }
        if (!availableInCountry(template, countryCode)) {
          return send(res, 400, {
            success: false,
            error: { message: 'This method is not available in the selected country' },
          });
        }
        // Cards are immutable after first save (host/TL) so admin remittance stays consistent.
        const { data: existingCard } = await auth.client
          .from('user_payout_cards')
          .select('id')
          .eq('user_id', userId)
          .eq('method_key', methodKey)
          .maybeSingle();
        if (existingCard) {
          return send(res, 409, {
            success: false,
            error: {
              message:
                'Payout card is locked after save and cannot be edited. Remove it first or contact admin.',
              code: 'CARD_LOCKED',
            },
          });
        }
        const validated = validateValues(template, body.values || body.values_json || {});
        if (!validated.ok) {
          return send(res, 400, { success: false, error: { message: validated.message } });
        }
        const isPrimary = body.isPrimary === true || body.is_primary === true;
        if (isPrimary) {
          await auth.client
            .from('user_payout_cards')
            .update({ is_primary: false, updated_at: new Date().toISOString() })
            .eq('user_id', userId);
        }
        const row = {
          user_id: userId,
          method_key: methodKey,
          country_code: countryCode,
          values_json: validated.values,
          is_primary: isPrimary,
          updated_at: new Date().toISOString(),
        };
        const { data, error } = await auth.client
          .from('user_payout_cards')
          .insert(row)
          .select('*')
          .maybeSingle();
        if (error) throw new Error(error.message);
        // If this is the only card, mark primary
        if (!isPrimary) {
          const { count } = await auth.client
            .from('user_payout_cards')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId);
          if (count === 1) {
            await auth.client
              .from('user_payout_cards')
              .update({ is_primary: true })
              .eq('id', data.id);
            data.is_primary = true;
          }
        }
        return send(res, 200, { success: true, data: { card: mapCardRow(data) } });
      } catch (err) {
        return send(res, 500, { success: false, error: { message: err.message || 'Failed to save card' } });
      }
    }

    if (req.method === 'DELETE') {
      const body = (await readJsonBody(req)) || {};
      const methodKey = body.methodKey || body.method_key || qstr(req, 'methodKey') || qstr(req, 'method_key');
      const id = body.id || qstr(req, 'id');
      try {
        let q = auth.client.from('user_payout_cards').delete().eq('user_id', userId);
        if (id) q = q.eq('id', id);
        else if (METHOD_KEYS.includes(methodKey)) q = q.eq('method_key', methodKey);
        else {
          return send(res, 400, { success: false, error: { message: 'id or methodKey required' } });
        }
        const { error } = await q;
        if (error) throw new Error(error.message);
        return send(res, 200, { success: true });
      } catch (err) {
        return send(res, 500, { success: false, error: { message: err.message || 'Failed to delete card' } });
      }
    }

    return send(res, 405, { success: false, error: { message: 'Method not allowed' } });
  }

  // ---- Roster (admin / TL) ----
  if (p === 'payout/cards/roster' || p.startsWith('payout/cards/roster?')) {
    if (req.method !== 'GET') {
      return send(res, 405, { success: false, error: { message: 'Method not allowed' } });
    }
    const auth = await requireAuth(req);
    if (auth.ok === false) return send(res, auth.status, { success: false, error: auth.error });
    if (!isTeamLeaderRole(auth.role, auth.email)) {
      return send(res, 403, { success: false, error: { message: 'Forbidden', code: 'FORBIDDEN' } });
    }
    try {
      const templates = await loadTemplates(auth.client);
      const fieldMap = Object.fromEntries(templates.map((t) => [t.methodKey, t.fields]));
      const isAdmin = isAdminRole(auth.role, auth.email);
      let userIds = null;
      if (!isAdmin) {
        const { data: hosts, error: hErr } = await auth.client
          .from('profiles')
          .select('id, name, role')
          .or(`team_leader_id.eq.${auth.profileId},created_by_id.eq.${auth.profileId}`);
        if (hErr) throw new Error(hErr.message);
        userIds = [auth.profileId, ...(hosts || []).map((h) => h.id)];
      }
      let q = auth.client.from('user_payout_cards').select('*').order('updated_at', { ascending: false }).limit(500);
      if (userIds) q = q.in('user_id', userIds);
      const { data: cards, error } = await q;
      if (error) throw new Error(error.message);
      const ids = [...new Set((cards || []).map((c) => c.user_id))];
      let profileMap = {};
      if (ids.length) {
        const { data: profiles } = await auth.client
          .from('profiles')
          .select('id, name, role')
          .in('id', ids);
        profileMap = Object.fromEntries((profiles || []).map((p) => [p.id, p]));
      }
      const mapped = (cards || []).map((row) =>
        mapCardRow(row, {
          mask: true,
          fields: fieldMap[row.method_key] || [],
          userName: profileMap[row.user_id]?.name || row.user_id,
          userRole: profileMap[row.user_id]?.role || '',
        })
      );
      return send(res, 200, { success: true, data: { cards: mapped } });
    } catch (err) {
      return send(res, 500, { success: false, error: { message: err.message || 'Failed to load roster' } });
    }
  }

  // ---- Single user cards (admin / managing TL) ----
  if (p === 'payout/cards' || p.startsWith('payout/cards?')) {
    if (req.method !== 'GET') {
      return send(res, 405, { success: false, error: { message: 'Method not allowed' } });
    }
    const auth = await requireAuth(req);
    if (auth.ok === false) return send(res, auth.status, { success: false, error: auth.error });
    const userId = cleanStr(qstr(req, 'userId') || qstr(req, 'user_id'), 80);
    if (!userId) {
      return send(res, 400, { success: false, error: { message: 'userId required' } });
    }
    const isAdmin = isAdminRole(auth.role, auth.email);
    if (!isAdmin && !isTeamLeaderRole(auth.role, auth.email)) {
      return send(res, 403, { success: false, error: { message: 'Forbidden', code: 'FORBIDDEN' } });
    }
    try {
      if (!isAdmin && userId !== auth.profileId) {
        const check = await ensureManagedHost(auth.client, auth.profileId, userId);
        if (check.ok === false) return send(res, check.status, { success: false, error: check.error });
      }
      const templates = await loadTemplates(auth.client);
      const fieldMap = Object.fromEntries(templates.map((t) => [t.methodKey, t.fields]));
      const { data, error } = await auth.client
        .from('user_payout_cards')
        .select('*')
        .eq('user_id', userId);
      if (error) throw new Error(error.message);
      const { data: profile } = await auth.client
        .from('profiles')
        .select('id, name, role')
        .eq('id', userId)
        .maybeSingle();
      // Full values for admin/TL payment ops (authorized viewers)
      const cards = (data || []).map((row) =>
        mapCardRow(row, {
          userName: profile?.name,
          userRole: profile?.role,
        })
      );
      return send(res, 200, {
        success: true,
        data: {
          cards,
          templates: templates.map((t) => ({
            methodKey: t.methodKey,
            label: t.label,
            fields: fieldMap[t.methodKey] || t.fields,
          })),
        },
      });
    } catch (err) {
      return send(res, 500, { success: false, error: { message: err.message || 'Failed to load cards' } });
    }
  }

  return null;
}

module.exports = { handlePayout };
