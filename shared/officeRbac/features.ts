/**
 * Office-staff feature catalog for RBAC.
 * Applies only to Minglecall office users (profiles.role = admin + office_role_id).
 * Marketplace roles (male/female/host/TL) are unchanged and never use this matrix.
 */

export type OfficeFeatureKind = 'tab' | 'action' | 'meta';

export interface OfficeFeatureChild {
  key: string;
  label: string;
}

export interface OfficeFeatureDef {
  /** Permission key stored in office_role_permissions.permission_key */
  key: string;
  label: string;
  group: string;
  kind: OfficeFeatureKind;
  children?: OfficeFeatureChild[];
}

/** Full admin Control Center feature list (L1 + optional L2). */
export const OFFICE_FEATURES: OfficeFeatureDef[] = [
  {
    key: 'analytics',
    label: 'Analytics Hub',
    group: 'Overview',
    kind: 'tab',
    children: [
      { key: 'analytics:overview', label: 'Overview' },
      { key: 'analytics:users', label: 'Users & Cohorts' },
      { key: 'analytics:finance', label: 'Money map' },
      { key: 'analytics:creators', label: 'Creators & Supply' },
      { key: 'analytics:agencies', label: 'Agencies' },
      { key: 'analytics:risk', label: 'Risk & Quality' },
    ],
  },
  { key: 'monitoring', label: 'Live Call Surveillance', group: 'Overview', kind: 'tab' },
  {
    key: 'financials',
    label: 'Coin Burn & Economy',
    group: 'Economy',
    kind: 'tab',
    children: [
      { key: 'financials:A', label: 'Coin burn rates' },
      { key: 'financials:B', label: 'Call revenue shares' },
      { key: 'financials:C', label: 'Gift / tip shares' },
      { key: 'financials:D', label: 'Peg & payout thresholds' },
      { key: 'financials:E', label: 'Package / peg preview' },
      { key: 'financials:F', label: 'Legacy knobs' },
    ],
  },
  { key: 'skus', label: 'SKU Bundles', group: 'Economy', kind: 'tab' },
  { key: 'gifts', label: 'Virtual Gifts', group: 'Economy', kind: 'tab' },
  {
    key: 'finance-module',
    label: 'Financial Module',
    group: 'Economy',
    kind: 'tab',
    children: [
      { key: 'finance-module:overview', label: 'Overview' },
      { key: 'finance-module:salary_batches', label: 'Salary batches' },
      { key: 'finance-module:live_ledger', label: 'Live ledger' },
      { key: 'finance-module:platform', label: 'Platform earnings' },
      { key: 'finance-module:team_leaders', label: 'Agency earnings' },
      { key: 'finance-module:hosts', label: 'Host earnings' },
      { key: 'finance-module:funding', label: 'Funding / Purchases' },
      { key: 'finance-module:batches', label: 'Payout / settlement requests' },
      { key: 'finance-module:settlement', label: 'Payment settlement' },
      { key: 'finance-module:period', label: 'Period & close settings' },
    ],
  },
  { key: 'payouts', label: 'Legacy Payout History', group: 'Economy', kind: 'tab' },
  { key: 'users', label: 'User Directory', group: 'People', kind: 'tab' },
  { key: 'leaders', label: 'Agencies', group: 'People', kind: 'tab' },
  {
    key: 'creator-ops',
    label: 'Creator Ops',
    group: 'People',
    kind: 'tab',
    children: [
      { key: 'creator-ops:targets', label: 'Female host target' },
      { key: 'creator-ops:analytics', label: 'Performance & Intelligence' },
      { key: 'creator-ops:matrix', label: 'Rotational Priority Matrix' },
    ],
  },
  {
    key: 'countries',
    label: 'Taxonomies & Attributes',
    group: 'People',
    kind: 'tab',
    children: [
      { key: 'countries:countries', label: 'Countries & Flags' },
      { key: 'countries:flag_sizes', label: 'SVG Flag Sizing' },
      { key: 'countries:languages', label: 'Spoken Languages' },
      { key: 'countries:zodiac', label: 'Zodiac Signs' },
      { key: 'countries:interests', label: 'Categorized Interests' },
      { key: 'countries:currencies', label: 'Currencies' },
    ],
  },
  {
    key: 'office-rbac',
    label: 'Roles & Permissions',
    group: 'Control Center',
    kind: 'meta',
  },
  { key: 'livekit', label: 'LiveKit API Keys', group: 'Platform', kind: 'tab' },
  {
    key: 'infra',
    label: 'Settings',
    group: 'Platform',
    kind: 'tab',
    children: [
      { key: 'infra:db_pool', label: 'Database & Pooling' },
      { key: 'infra:r2_storage', label: 'Cloudflare R2 Storage' },
      { key: 'infra:moderation', label: 'Content Moderation' },
      { key: 'infra:features', label: 'Global Feature Toggles' },
      { key: 'infra:sql_schema', label: 'SQL Schema & RLS' },
    ],
  },
  { key: 'api-health', label: 'API Health', group: 'Platform', kind: 'tab' },
  { key: 'system-testing', label: 'System Testing', group: 'Platform', kind: 'tab' },
  { key: 'k6-load', label: 'K6 Load Testing', group: 'Platform', kind: 'tab' },
  { key: 'email', label: 'Email', group: 'Platform', kind: 'tab' },
  {
    key: 'cms',
    label: 'Home CMS & Policies',
    group: 'CMS',
    kind: 'tab',
    children: [
      { key: 'cms:banners', label: 'Hero Banners' },
      { key: 'cms:policies', label: 'Policies & Terms' },
      { key: 'cms:shortcuts', label: 'Quick Shortcuts' },
      { key: 'cms:discovery_card', label: 'Discovery Card' },
    ],
  },
  { key: 'cms-navigation', label: 'Navigation Editor', group: 'CMS', kind: 'tab' },
  { key: 'cms-payout-cards', label: 'Payout / Bank Cards', group: 'CMS', kind: 'tab' },
  { key: 'cms-toasts', label: 'Toasts & messages', group: 'CMS', kind: 'tab' },
  { key: 'setup-wizard', label: 'Setup Wizard GUI', group: 'Actions', kind: 'action' },
  { key: 'reset-data', label: 'Reset Data', group: 'Actions', kind: 'action' },
];

export function allOfficePermissionKeys(): string[] {
  const keys: string[] = [];
  for (const f of OFFICE_FEATURES) {
    keys.push(f.key);
    for (const c of f.children || []) keys.push(c.key);
  }
  return keys;
}

export function isKnownOfficePermissionKey(key: string): boolean {
  return allOfficePermissionKeys().includes(key);
}

/** True if user may access a nav L1 / action / meta feature. */
export function hasOfficePermission(
  opts: { isSuper: boolean; permissions: string[] },
  featureKey: string
): boolean {
  if (opts.isSuper) return true;
  const granted = new Set(opts.permissions || []);
  if (granted.has(featureKey)) return true;
  // L2 key: allow if parent L1 granted
  if (featureKey.includes(':')) {
    const parent = featureKey.split(':')[0];
    if (granted.has(parent)) return true;
  }
  return false;
}

/** Filter children: if any child keys granted, show only those; else if L1 granted show all. */
export function filterOfficeFeatureChildren(
  feature: OfficeFeatureDef,
  opts: { isSuper: boolean; permissions: string[] }
): OfficeFeatureChild[] {
  const children = feature.children || [];
  if (!children.length) return [];
  if (opts.isSuper || hasOfficePermission(opts, feature.key)) {
    const grantedKids = children.filter((c) => hasOfficePermission(opts, c.key));
    // If specific L2 grants exist without blanket L1, show those; else all
    const hasAnyL2Grant = children.some((c) => (opts.permissions || []).includes(c.key));
    if (hasAnyL2Grant && !opts.isSuper && !(opts.permissions || []).includes(feature.key)) {
      return grantedKids;
    }
    return children;
  }
  return children.filter((c) => hasOfficePermission(opts, c.key));
}
