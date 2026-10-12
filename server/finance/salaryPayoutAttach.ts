/**
 * Attach user payout-card remittance details onto salary payee rows.
 */

import { getSupabaseAdmin, isSupabaseAdminConfigured } from '../supabaseAdmin';
import { isPayoutMethodKey } from '../../shared/payout/types';
import {
  formatMaskedDetailsLine,
  isPhoneMetaKey,
} from '../../shared/payout/phoneUi';
import { maskCardValues, mapTemplateRow } from '../../shared/payout/validate';
import type { PayoutFieldDef, PayoutMethodKey } from '../../shared/payout/types';

export type SalaryPayoutDetails = {
  methodKey: PayoutMethodKey;
  methodLabel: string;
  countryCode: string;
  isPrimary: boolean;
  /** Remittance field map (full or masked). */
  details: Record<string, string>;
  /** One-line summary for tables. */
  summary: string;
};

const METHOD_LABEL: Record<PayoutMethodKey, string> = {
  paypal: 'PayPal',
  bank_account: 'Bank',
  wallet: 'Wallet',
};

function detailsLine(details: Record<string, string>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(details || {})) {
    if (isPhoneMetaKey(k)) continue;
    if (!String(v || '').trim()) continue;
    parts.push(`${k}: ${v}`);
  }
  return parts.join(' · ') || '—';
}

function pickPrimaryCard<T extends { is_primary?: boolean; updated_at?: string }>(
  cards: T[]
): T | null {
  if (!cards.length) return null;
  const primary = cards.find((c) => c.is_primary === true);
  if (primary) return primary;
  return [...cards].sort((a, b) =>
    String(b.updated_at || '').localeCompare(String(a.updated_at || ''))
  )[0];
}

/**
 * Load primary (or latest) payout card per user.
 * @param mask when true, sensitive values are masked (TL roster-style).
 */
export async function loadSalaryPayoutDetailsByUserIds(
  userIds: string[],
  opts?: { mask?: boolean }
): Promise<Map<string, SalaryPayoutDetails>> {
  const out = new Map<string, SalaryPayoutDetails>();
  const ids = Array.from(new Set((userIds || []).map((id) => String(id || '').trim()).filter(Boolean)));
  if (!ids.length || !isSupabaseAdminConfigured()) return out;

  const client = getSupabaseAdmin();
  if (!client) return out;

  const fieldMap = new Map<string, PayoutFieldDef[]>();
  const { data: templates } = await client.from('payout_method_templates').select('*');
  for (const row of templates || []) {
    const t = mapTemplateRow(row);
    if (t) fieldMap.set(t.methodKey, t.fields);
  }

  const cardsByUser = new Map<string, any[]>();
  const chunkSize = 200;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { data, error } = await client
      .from('user_payout_cards')
      .select('id, user_id, method_key, country_code, values_json, is_primary, updated_at')
      .in('user_id', chunk);
    if (error) {
      console.warn('[finance/salaryPayoutAttach] load cards:', error.message);
      continue;
    }
    for (const row of data || []) {
      const uid = String(row.user_id);
      const list = cardsByUser.get(uid) || [];
      list.push(row);
      cardsByUser.set(uid, list);
    }
  }

  const mask = opts?.mask === true;
  for (const uid of ids) {
    const card = pickPrimaryCard(cardsByUser.get(uid) || []);
    if (!card) continue;
    if (!isPayoutMethodKey(card.method_key)) continue;
    const methodKey = card.method_key as PayoutMethodKey;
    const values =
      card.values_json && typeof card.values_json === 'object' && !Array.isArray(card.values_json)
        ? (card.values_json as Record<string, string>)
        : {};
    const fields = fieldMap.get(methodKey) || [];
    const details = mask
      ? maskCardValues(
          Object.fromEntries(
            Object.entries(values).map(([k, v]) => [k, v == null ? '' : String(v)])
          ),
          fields
        )
      : Object.fromEntries(
          Object.entries(values)
            .filter(([k]) => !isPhoneMetaKey(k))
            .map(([k, v]) => [k, v == null ? '' : String(v)])
            .filter(([, v]) => String(v).trim())
        );
    const countryCode = String(card.country_code || '').toUpperCase();
    const methodLabel = METHOD_LABEL[methodKey];
    const summaryCore = mask
      ? formatMaskedDetailsLine(details)
      : detailsLine(details);
    out.set(uid, {
      methodKey,
      methodLabel,
      countryCode,
      isPrimary: card.is_primary === true,
      details,
      summary: `${methodLabel} (${countryCode || '—'}): ${summaryCore}`,
    });
  }

  return out;
}

export function attachPayoutToPayee<T extends { userId: string }>(
  payee: T,
  map: Map<string, SalaryPayoutDetails>
): T & { payout: SalaryPayoutDetails | null } {
  return {
    ...payee,
    payout: map.get(payee.userId) || null,
  };
}
