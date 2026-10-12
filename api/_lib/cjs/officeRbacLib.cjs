/**
 * Office RBAC helpers for Admin Control Center (CommonJS).
 * Mirrors shared/officeRbac/features.ts catalog keys.
 */

const OFFICE_FEATURES = [
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
  { key: 'office-rbac', label: 'Roles & Permissions', group: 'Control Center', kind: 'meta' },
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
  { key: 'cms-seo', label: 'SEO & branding', group: 'CMS', kind: 'tab' },
  { key: 'setup-wizard', label: 'Setup Wizard GUI', group: 'Actions', kind: 'action' },
  { key: 'reset-data', label: 'Reset Data', group: 'Actions', kind: 'action' },
];

function allPermissionKeys() {
  const keys = [];
  for (const f of OFFICE_FEATURES) {
    keys.push(f.key);
    for (const c of f.children || []) keys.push(c.key);
  }
  return keys;
}

const KNOWN = new Set(allPermissionKeys());

function isKnownPermissionKey(key) {
  return KNOWN.has(String(key || ''));
}

function sanitizePermissionKeys(list) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(list) ? list : []) {
    const k = String(raw || '').trim();
    if (!k || !KNOWN.has(k) || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

function mapRoleRow(row, permissions) {
  return {
    id: String(row.id),
    key: String(row.key),
    label: String(row.label),
    description: String(row.description || ''),
    isSuper: row.is_super === true,
    isSystem: row.is_system === true,
    permissions: Array.isArray(permissions) ? permissions : [],
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function isSchemaMissingError(err) {
  const msg = String((err && err.message) || err || '');
  return /office_roles|office_role_permissions|office_role_id|does not exist|schema cache|42P01|PGRST204/i.test(
    msg
  );
}

async function resolveActorAccess(client, auth) {
  const profileId = String(auth.profileId || auth.profile?.id || '').trim();
  if (!profileId) {
    return { isSuper: false, permissions: [], officeRoleId: null, role: null };
  }
  const { data: profile, error: profileErr } = await client
    .from('profiles')
    .select('id, role, office_role_id')
    .eq('id', profileId)
    .maybeSingle();
  if (profileErr) {
    // Column/tables not applied yet → legacy full admin so console stays usable
    if (isSchemaMissingError(profileErr)) {
      return {
        isSuper: true,
        permissions: allPermissionKeys(),
        officeRoleId: null,
        role: null,
        schemaMissing: true,
        schemaError: profileErr.message,
      };
    }
    return { isSuper: false, permissions: [], officeRoleId: null, role: null };
  }
  if (!profile || String(profile.role) !== 'admin') {
    return { isSuper: false, permissions: [], officeRoleId: null, role: null };
  }
  // Legacy full admin
  if (!profile.office_role_id) {
    return {
      isSuper: true,
      permissions: allPermissionKeys(),
      officeRoleId: null,
      role: null,
    };
  }
  const { data: role, error: roleErr } = await client
    .from('office_roles')
    .select('*')
    .eq('id', profile.office_role_id)
    .maybeSingle();
  if (roleErr && isSchemaMissingError(roleErr)) {
    return {
      isSuper: true,
      permissions: allPermissionKeys(),
      officeRoleId: null,
      role: null,
      schemaMissing: true,
      schemaError: roleErr.message,
    };
  }
  if (!role) {
    // Orphan office_role_id — keep full access
    return {
      isSuper: true,
      permissions: allPermissionKeys(),
      officeRoleId: null,
      role: null,
    };
  }
  if (role.is_super === true) {
    return {
      isSuper: true,
      permissions: allPermissionKeys(),
      officeRoleId: String(role.id),
      role: mapRoleRow(role, allPermissionKeys()),
    };
  }
  const { data: perms } = await client
    .from('office_role_permissions')
    .select('permission_key')
    .eq('role_id', role.id);
  const permissions = (perms || []).map((p) => String(p.permission_key));
  return {
    isSuper: false,
    permissions,
    officeRoleId: String(role.id),
    role: mapRoleRow(role, permissions),
  };
}

function actorHasPermission(access, featureKey) {
  if (!access) return false;
  if (access.isSuper) return true;
  const key = String(featureKey || '').trim();
  if (!key) return false;
  const granted = access.permissions || [];
  if (granted.includes(key)) return true;
  if (key.includes(':')) {
    const parent = key.split(':')[0];
    if (granted.includes(parent)) return true;
  }
  return false;
}

function actorCanManageRbac(access) {
  return actorHasPermission(access, 'office-rbac');
}

/** Map admin API path → office permission key (null = any authenticated admin). */
function permissionForAdminPath(path) {
  const p = String(path || '');
  if (p === 'admin/office-rbac/me' || p === 'admin/office-rbac/features') return null;
  if (p.startsWith('admin/office-rbac/')) return 'office-rbac';
  if (p.startsWith('admin/email') || p === 'admin/email-config') return 'email';
  if (p === 'admin/infra-config') return 'infra';
  if (p === 'admin/schema') return 'infra';
  if (p === 'admin/system-diagnostics') return 'system-testing';
  if (p === 'admin/k6-smoke') return 'k6-load';
  if (p === 'admin/api-health') return 'api-health';
  if (p === 'admin/delete-user') return 'users';
  if (p === 'admin/override-earning-rate') return 'financials';
  if (
    p === 'admin/active-calls' ||
    p === 'admin/terminate-call' ||
    p === 'admin/issue-warning' ||
    p === 'admin/livekit/spectator-token'
  ) {
    return 'monitoring';
  }
  if (p === 'admin/cms/nav-items/batch') return 'cms-navigation';
  if (p.startsWith('admin/cms/feedback')) return 'cms-toasts';
  if (p.startsWith('admin/cms/seo-branding')) return 'cms-seo';
  if (p.startsWith('admin/cms/')) return 'cms';
  if (p === 'admin/factory-reset-status' || p === 'admin/granular-reset') return 'reset-data';
  return null;
}

function slugKey(label) {
  return String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
}

module.exports = {
  OFFICE_FEATURES,
  allPermissionKeys,
  isKnownPermissionKey,
  sanitizePermissionKeys,
  mapRoleRow,
  resolveActorAccess,
  actorHasPermission,
  actorCanManageRbac,
  permissionForAdminPath,
  slugKey,
};
