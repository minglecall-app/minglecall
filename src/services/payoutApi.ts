import { authFetch } from '../utils/apiClient';
import type { PayoutMethodTemplate, UserPayoutCard } from '../../shared/payout/types';

async function parseJson(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) {
    const msg =
      data?.error?.message || data?.error || data?.message || `Request failed (${res.status})`;
    throw new Error(typeof msg === 'string' ? msg : 'Request failed');
  }
  return data;
}

export async function fetchAdminPayoutTemplates(): Promise<PayoutMethodTemplate[]> {
  const res = await authFetch('/api/admin/payout/templates');
  const data = await parseJson(res);
  return data?.data?.templates || [];
}

export async function saveAdminPayoutTemplates(
  templates: PayoutMethodTemplate[]
): Promise<PayoutMethodTemplate[]> {
  const res = await authFetch('/api/admin/payout/templates', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ templates }),
  });
  const data = await parseJson(res);
  return data?.data?.templates || [];
}

export async function fetchPayoutTemplates(country?: string): Promise<PayoutMethodTemplate[]> {
  const q = country ? `?country=${encodeURIComponent(country)}` : '';
  const res = await authFetch(`/api/payout/templates${q}`);
  const data = await parseJson(res);
  return data?.data?.templates || [];
}

export async function fetchMyPayoutCards(): Promise<UserPayoutCard[]> {
  const res = await authFetch('/api/payout/cards/me');
  const data = await parseJson(res);
  return data?.data?.cards || [];
}

export async function saveMyPayoutCard(payload: {
  methodKey: string;
  countryCode: string;
  values: Record<string, string>;
  isPrimary?: boolean;
}): Promise<UserPayoutCard> {
  const res = await authFetch('/api/payout/cards/me', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await parseJson(res);
  return data?.data?.card;
}

export async function deleteMyPayoutCard(opts: {
  id?: string;
  methodKey?: string;
}): Promise<void> {
  const res = await authFetch('/api/payout/cards/me', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts),
  });
  await parseJson(res);
}

export async function fetchPayoutCardsRoster(): Promise<UserPayoutCard[]> {
  const res = await authFetch('/api/payout/cards/roster');
  const data = await parseJson(res);
  return data?.data?.cards || [];
}

export async function fetchUserPayoutCards(userId: string): Promise<{
  cards: UserPayoutCard[];
  templates: Array<{ methodKey: string; label: string; fields: any[] }>;
}> {
  const res = await authFetch(`/api/payout/cards?userId=${encodeURIComponent(userId)}`);
  const data = await parseJson(res);
  return {
    cards: data?.data?.cards || [],
    templates: data?.data?.templates || [],
  };
}
