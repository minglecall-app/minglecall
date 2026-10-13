/**
 * Virtual gift / tip economy helpers — share % from system_configs (no magic in send path).
 * Defaults match supabase_schema.sql / appDefaults.
 */

import { normalizeSharePercent } from './economyBurn';

export const DEFAULT_GIFT_FEMALE_HOST_SHARE_PERCENT = 70;
export const DEFAULT_GIFT_TEAM_LEADER_SHARE_PERCENT = 10;

/** Fixed tip catalog (server-authoritative; client may only pick these amounts). */
export const TIP_CATALOG_COINS = [20, 50, 100, 200] as const;
export const DEFAULT_TIP_COINS = 20;

/**
 * Host credit for gifts/tips is limited to verified host roles.
 * Team-leader linkage alone must not unlock earnings.
 */
export function isGiftEligibleHostRole(role?: string | null): boolean {
  const r = String(role || '').trim();
  return r === 'female_creator' || r === 'female_host';
}

export interface EconomyGiftShares {
  giftFemaleHostSharePercent: number;
  giftTeamLeaderSharePercent: number;
}

export function resolveEconomyGiftShares(source?: unknown): EconomyGiftShares {
  const s =
    source && typeof source === 'object' ? (source as Record<string, unknown>) : {};
  return {
    giftFemaleHostSharePercent: normalizeSharePercent(
      s.gift_female_host_share_percent ?? s.giftFemaleHostSharePercent,
      DEFAULT_GIFT_FEMALE_HOST_SHARE_PERCENT
    ),
    giftTeamLeaderSharePercent: normalizeSharePercent(
      s.gift_team_leader_share_percent ?? s.giftTeamLeaderSharePercent,
      DEFAULT_GIFT_TEAM_LEADER_SHARE_PERCENT
    ),
  };
}

export interface GiftCoinSplit {
  giftCost: number;
  hostCoins: number;
  tlCoins: number;
  platformCoins: number;
  hostSharePercent: number;
  tlSharePercent: number;
}

/**
 * Split gift/tip coins: host % + TL % (when linked), remainder platform.
 * Clamps host+TL ≤ giftCost (prefer TL, reduce host).
 */
export function computeGiftCoinSplit(opts: {
  giftCost: number;
  hostSharePercent: number;
  tlSharePercent: number;
  hasTeamLeader: boolean;
  /** When false, host/TL get 0 (platform retains full gift). */
  hostEligible?: boolean;
}): GiftCoinSplit {
  const cost = Math.max(0, Math.round(Number(opts.giftCost) || 0));
  const eligible = opts.hostEligible !== false;
  const hostPct = eligible
    ? normalizeSharePercent(opts.hostSharePercent, DEFAULT_GIFT_FEMALE_HOST_SHARE_PERCENT)
    : 0;
  const tlPct =
    eligible && opts.hasTeamLeader
      ? normalizeSharePercent(opts.tlSharePercent, DEFAULT_GIFT_TEAM_LEADER_SHARE_PERCENT)
      : 0;

  let hostCoins = 0;
  let tlCoins = 0;
  if (cost > 0 && eligible) {
    hostCoins = Math.round(cost * (hostPct / 100));
    if (hostPct > 0 && hostCoins < 1) hostCoins = 1;
    if (tlPct > 0) {
      tlCoins = Math.round(cost * (tlPct / 100));
    }
  }

  if (hostCoins + tlCoins > cost) {
    if (tlCoins > cost) {
      tlCoins = cost;
      hostCoins = 0;
    } else {
      hostCoins = cost - tlCoins;
    }
  }

  return {
    giftCost: cost,
    hostCoins,
    tlCoins,
    platformCoins: Math.max(0, cost - hostCoins - tlCoins),
    hostSharePercent: hostPct,
    tlSharePercent: tlPct,
  };
}
