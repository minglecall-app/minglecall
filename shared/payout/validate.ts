import {
  isPayoutFieldType,
  isPayoutMethodKey,
  type PayoutFieldDef,
  type PayoutMethodKey,
  type PayoutMethodTemplate,
} from './types';
import { combinePhone, dialSuffixes, isPhoneMetaKey } from './phoneUi';

function cleanStr(v: unknown, max = 240): string {
  return String(v ?? '')
    .trim()
    .slice(0, max);
}

export function normalizeFieldDef(raw: any): PayoutFieldDef | null {
  const id = cleanStr(raw?.id || raw?.key, 64);
  const key = cleanStr(raw?.key, 64)
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_');
  const label = cleanStr(raw?.label, 120);
  const type = isPayoutFieldType(raw?.type) ? raw.type : 'text';
  if (!id || !key || !label) return null;
  const options = Array.isArray(raw?.options)
    ? raw.options.map((o: unknown) => cleanStr(o, 80)).filter(Boolean).slice(0, 40)
    : undefined;
  return {
    id,
    key,
    label,
    type,
    required: Boolean(raw?.required),
    placeholder: cleanStr(raw?.placeholder, 160) || undefined,
    options: type === 'select' ? options && options.length ? options : ['Other'] : undefined,
  };
}

export function mapTemplateRow(row: any): PayoutMethodTemplate {
  const fieldsRaw = Array.isArray(row?.fields_json)
    ? row.fields_json
    : typeof row?.fields_json === 'string'
      ? (() => {
          try {
            return JSON.parse(row.fields_json);
          } catch {
            return [];
          }
        })()
      : Array.isArray(row?.fields)
        ? row.fields
        : [];
  const fields = (fieldsRaw as any[])
    .map(normalizeFieldDef)
    .filter(Boolean) as PayoutFieldDef[];
  const methodKey = isPayoutMethodKey(row?.method_key || row?.methodKey)
    ? (row.method_key || row.methodKey)
    : 'paypal';
  return {
    methodKey,
    label: cleanStr(row?.label, 80) || methodKey,
    icon: cleanStr(row?.icon, 40) || 'Wallet',
    description: cleanStr(row?.description, 400),
    isEnabled: row?.is_enabled !== false && row?.isEnabled !== false,
    countriesMode: row?.countries_mode === 'selected' || row?.countriesMode === 'selected' ? 'selected' : 'all',
    countryCodes: Array.isArray(row?.country_codes)
      ? row.country_codes.map((c: unknown) => cleanStr(c, 8).toUpperCase()).filter(Boolean)
      : Array.isArray(row?.countryCodes)
        ? row.countryCodes.map((c: unknown) => cleanStr(c, 8).toUpperCase()).filter(Boolean)
        : [],
    fields,
    sortOrder: Number(row?.sort_order ?? row?.sortOrder ?? 0) || 0,
    updatedAt: row?.updated_at || row?.updatedAt || undefined,
  };
}

export function templateToRow(t: PayoutMethodTemplate) {
  const fields = (t.fields || []).map(normalizeFieldDef).filter(Boolean) as PayoutFieldDef[];
  return {
    method_key: t.methodKey,
    label: cleanStr(t.label, 80) || t.methodKey,
    icon: cleanStr(t.icon, 40) || 'Wallet',
    description: cleanStr(t.description, 400),
    is_enabled: Boolean(t.isEnabled),
    countries_mode: t.countriesMode === 'selected' ? 'selected' : 'all',
    country_codes:
      t.countriesMode === 'selected'
        ? (t.countryCodes || []).map((c) => cleanStr(c, 8).toUpperCase()).filter(Boolean)
        : [],
    fields_json: fields,
    sort_order: Number(t.sortOrder) || 0,
    updated_at: new Date().toISOString(),
  };
}

export function templateAvailableInCountry(
  t: PayoutMethodTemplate,
  countryCode?: string | null
): boolean {
  if (!t.isEnabled) return false;
  if (t.countriesMode !== 'selected') return true;
  const code = cleanStr(countryCode, 8).toUpperCase();
  if (!code) return true;
  return (t.countryCodes || []).map((c) => c.toUpperCase()).includes(code);
}

/** Strict email: local@domain.tld with reasonable length. */
export function isValidEmail(value: string): boolean {
  const v = cleanStr(value, 254);
  if (!v || v.length > 254) return false;
  return /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/.test(
    v
  );
}

/**
 * International phone: must include country code (+…) and a complete national number.
 * Accepts spaces / dashes / parentheses after the leading +.
 */
export function isValidIntlPhone(value: string): boolean {
  const v = cleanStr(value, 32);
  if (!v.startsWith('+')) return false;
  if (!/^\+[1-9][\d\s().-]{6,22}$/.test(v)) return false;
  const digits = v.replace(/\D/g, '');
  // country code (1–3) + national number (≥7) → typically 8–15 digits total (E.164)
  return digits.length >= 8 && digits.length <= 15;
}

export function isValidIbanOrAccount(value: string): boolean {
  const v = cleanStr(value, 64).replace(/\s+/g, '').toUpperCase();
  if (/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(v)) return true; // IBAN-ish
  if (/^[A-Z0-9]{6,34}$/.test(v)) return true; // generic account
  return false;
}

export function validateFieldValue(
  field: PayoutFieldDef,
  raw: unknown
): { ok: true; value: string } | { ok: false; message: string } {
  const v = cleanStr(raw, 320);
  if (field.required && !v) {
    return { ok: false, message: `${field.label} is required.` };
  }
  if (!v) return { ok: true, value: '' };

  const key = field.key.toLowerCase();
  const type = field.type;
  const asEmail = type === 'email' || key.includes('email');
  const asPhone = type === 'phone' || key.includes('phone') || key.includes('mobile') || key.includes('whatsapp');
  const asIban =
    key.includes('iban') ||
    key.includes('account_number') ||
    key === 'iban_or_account' ||
    key.includes('account_no');

  if (asEmail && !isValidEmail(v)) {
    return { ok: false, message: `${field.label} must be a valid email address.` };
  }
  if (asPhone && !isValidIntlPhone(v)) {
    return {
      ok: false,
      message: `${field.label} needs a valid country code and complete number.`,
    };
  }
  if (type === 'number' && !/^-?\d+(\.\d+)?$/.test(v)) {
    return { ok: false, message: `${field.label} must be a number.` };
  }
  if (type === 'select' && field.options?.length && !field.options.includes(v)) {
    return { ok: false, message: `${field.label} has an invalid option.` };
  }
  if (asIban && !isValidIbanOrAccount(v)) {
    return { ok: false, message: `${field.label} looks incomplete. Enter a full IBAN or account number.` };
  }
  if ((key.includes('swift') || key.includes('bic')) && v && !/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/i.test(v.replace(/\s/g, ''))) {
    return { ok: false, message: `${field.label} must be a valid SWIFT/BIC (8 or 11 characters).` };
  }
  if (
    (key.includes('name') || key.includes('holder')) &&
    type === 'text' &&
    v.length < 2
  ) {
    return { ok: false, message: `${field.label} is too short.` };
  }
  if (
    (key.includes('address') || key.includes('wallet')) &&
    type === 'text' &&
    v.length < 6
  ) {
    return { ok: false, message: `${field.label} looks incomplete.` };
  }

  return { ok: true, value: asEmail ? v.toLowerCase() : asIban ? v.replace(/\s+/g, '').toUpperCase() : v };
}

function isPhoneField(field: PayoutFieldDef): boolean {
  return (
    field.type === 'phone' ||
    /phone|mobile|whatsapp/i.test(field.key)
  );
}

/** Normalize phone split fields into canonical values. */
export function hydratePhoneValues(
  template: PayoutMethodTemplate,
  values: Record<string, unknown>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(values || {})) {
    if (v == null) continue;
    // Drop legacy chat-app meta if present
    if (/_(has_chat|chat_apps)$/.test(k)) continue;
    out[k] = String(v);
  }
  for (const field of template.fields) {
    if (!isPhoneField(field)) continue;
    const s = dialSuffixes(field.key);
    const dial = cleanStr(out[s.dial], 8);
    const national = cleanStr(out[s.national], 20).replace(/\D/g, '');
    const combined = combinePhone(dial, national) || cleanStr(out[field.key], 32);
    if (combined) out[field.key] = combined;
    if (dial) out[s.dial] = dial.startsWith('+') ? dial : `+${dial}`;
    if (national) out[s.national] = national;
  }
  return out;
}

export function validateCardValues(
  template: PayoutMethodTemplate,
  values: Record<string, unknown>
): { ok: true; values: Record<string, string> } | { ok: false; message: string; fieldKey?: string } {
  const hydrated = hydratePhoneValues(template, values);
  const out: Record<string, string> = { ...hydrated };
  for (const field of template.fields) {
    if (isPhoneField(field)) {
      const s = dialSuffixes(field.key);
      const dial = cleanStr(hydrated[s.dial], 8);
      const national = cleanStr(hydrated[s.national], 20);
      if (field.required || dial || national || hydrated[field.key]) {
        if (!dial) {
          return { ok: false, message: `${field.label}: select a country code.`, fieldKey: field.key };
        }
        if (!national || national.length < 6) {
          return {
            ok: false,
            message: `${field.label}: enter a complete local number (digits only).`,
            fieldKey: field.key,
          };
        }
      }
      const result = validateFieldValue(field, hydrated[field.key]);
      if (result.ok === false) {
        return { ok: false, message: result.message, fieldKey: field.key };
      }
      if (result.value) out[field.key] = result.value;
      continue;
    }
    const result = validateFieldValue(field, hydrated[field.key]);
    if (result.ok === false) {
      return { ok: false, message: result.message, fieldKey: field.key };
    }
    if (result.value) out[field.key] = result.value;
  }
  return { ok: true, values: out };
}

/** Per-field errors for live form UI. */
export function validateCardValuesMap(
  template: PayoutMethodTemplate,
  values: Record<string, unknown>
): Record<string, string> {
  const errors: Record<string, string> = {};
  const hydrated = hydratePhoneValues(template, values);
  for (const field of template.fields) {
    if (isPhoneField(field)) {
      const s = dialSuffixes(field.key);
      const dial = cleanStr(hydrated[s.dial], 8);
      const national = cleanStr(hydrated[s.national], 20);
      if (field.required || dial || national || hydrated[field.key]) {
        if (!dial) errors[field.key] = `${field.label}: select a country code.`;
        else if (!national || national.length < 6) {
          errors[field.key] = `${field.label}: enter a complete local number.`;
        } else {
          const result = validateFieldValue(field, hydrated[field.key]);
          if (result.ok === false) errors[field.key] = result.message;
        }
      }
      continue;
    }
    const result = validateFieldValue(field, hydrated[field.key]);
    if (result.ok === false) errors[field.key] = result.message;
  }
  return errors;
}

/** Mask sensitive field values for roster lists. */
export function maskValue(key: string, value: string): string {
  const v = String(value || '');
  if (!v) return '';
  const k = key.toLowerCase();
  if (k.includes('email') || v.includes('@')) {
    const [user, domain] = v.split('@');
    if (!domain) return '•••';
    const u = user.length <= 2 ? `${user[0] || '•'}•` : `${user.slice(0, 2)}•••`;
    return `${u}@${domain}`;
  }
  if (v.length <= 4) return '••••';
  return `••••${v.slice(-4)}`;
}

export function maskCardValues(
  values: Record<string, string>,
  fields: PayoutFieldDef[]
): Record<string, string> {
  const out: Record<string, string> = {};
  const vals = values || {};
  for (const f of fields) {
    const v = vals[f.key];
    if (v == null || v === '') continue;
    if (isPhoneMetaKey(f.key)) continue;
    const sensitive =
      f.type === 'email' ||
      f.type === 'phone' ||
      /iban|account|address|routing|swift|email|phone|wallet/i.test(f.key);
    out[f.key] = sensitive ? maskValue(f.key, v) : v;
  }
  return out;
}

export function assertPayoutRole(role: string): boolean {
  const r = String(role || '').toLowerCase();
  return (
    r === 'female_creator' ||
    r === 'female_host' ||
    r === 'team_leader' ||
    r === 'agency_manager' ||
    r === 'admin'
  );
}

export type { PayoutMethodKey };
export { isPayoutMethodKey, isPayoutFieldType } from './types';
