/**
 * Office RBAC helpers for Express admin (mirrors api/_lib/cjs/officeRbacLib.cjs).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  OFFICE_FEATURES,
  allOfficePermissionKeys,
  hasOfficePermission,
  isKnownOfficePermissionKey,
} from '../shared/officeRbac/features';

export { OFFICE_FEATURES };

export type OfficeAccess = {
  isSuper: boolean;
  permissions: string[];
  officeRoleId: string | null;
  role: {
    id: string;
    key: string;
    label: string;
    description: string;
    isSuper: boolean;
    isSystem: boolean;
    permissions: string[];
    createdAt?: string | null;
    updatedAt?: string | null;
  } | null;
  schemaMissing?: boolean;
  schemaError?: string;
};

function isSchemaMissingError(err: unknown): boolean {
  const msg = String((err as any)?.message || err || '');
  return /office_roles|office_role_permissions|office_role_id|does not exist|schema cache|42P01|PGRST204/i.test(
    msg
  );
}

export function mapRoleRow(row: any, permissions: string[]) {
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

export function sanitizePermissionKeys(list: unknown): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of Array.isArray(list) ? list : []) {
    const k = String(raw || '').trim();
    if (!k || !isKnownOfficePermissionKey(k) || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

export function slugKey(label: string): string {
  return String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
}

/** Legacy admin (null office_role_id) or Super Admin role = full access. */
export async function resolveActorAccess(
  client: SupabaseClient,
  profileId: string
): Promise<OfficeAccess> {
  const id = String(profileId || '').trim();
  if (!id) {
    return { isSuper: false, permissions: [], officeRoleId: null, role: null };
  }

  const { data: profile, error: profileErr } = await client
    .from('profiles')
    .select('id, role, office_role_id')
    .eq('id', id)
    .maybeSingle();

  if (profileErr) {
    if (isSchemaMissingError(profileErr)) {
      return {
        isSuper: true,
        permissions: allOfficePermissionKeys(),
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

  if (!profile.office_role_id) {
    return {
      isSuper: true,
      permissions: allOfficePermissionKeys(),
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
      permissions: allOfficePermissionKeys(),
      officeRoleId: null,
      role: null,
      schemaMissing: true,
      schemaError: roleErr.message,
    };
  }

  if (!role) {
    // Assigned role row missing — treat as full admin so console stays usable
    return {
      isSuper: true,
      permissions: allOfficePermissionKeys(),
      officeRoleId: null,
      role: null,
    };
  }

  if (role.is_super === true) {
    return {
      isSuper: true,
      permissions: allOfficePermissionKeys(),
      officeRoleId: String(role.id),
      role: mapRoleRow(role, allOfficePermissionKeys()),
    };
  }

  const { data: perms } = await client
    .from('office_role_permissions')
    .select('permission_key')
    .eq('role_id', role.id);
  const permissions = (perms || []).map((p: any) => String(p.permission_key));
  return {
    isSuper: false,
    permissions,
    officeRoleId: String(role.id),
    role: mapRoleRow(role, permissions),
  };
}

export function actorCanManageRbac(access: OfficeAccess): boolean {
  return hasOfficePermission(
    { isSuper: access.isSuper, permissions: access.permissions },
    'office-rbac'
  );
}

/** Seed Super Admin / Accounts / Manager if tables exist but are empty. */
export async function ensureOfficeRolesSeeded(client: SupabaseClient): Promise<{
  ok: boolean;
  schemaMissing?: boolean;
  error?: string;
}> {
  const { data: existing, error } = await client.from('office_roles').select('id').limit(1);
  if (error) {
    if (isSchemaMissingError(error)) {
      return { ok: false, schemaMissing: true, error: error.message };
    }
    return { ok: false, error: error.message };
  }
  if (existing?.length) return { ok: true };

  const seeds = [
    {
      key: 'super_admin',
      label: 'Super Admin',
      description: 'Full Admin Control Center access. Cannot be deleted.',
      is_super: true,
      is_system: true,
    },
    {
      key: 'accounts',
      label: 'Accounts',
      description: 'Finance, salary batches, funding, and payout operations.',
      is_super: false,
      is_system: true,
    },
    {
      key: 'manager',
      label: 'Manager',
      description: 'People ops, analytics, creator ops, and CMS — no infra destructive actions.',
      is_super: false,
      is_system: true,
    },
  ];

  const { error: insErr } = await client.from('office_roles').upsert(seeds, {
    onConflict: 'key',
    ignoreDuplicates: true,
  });
  if (insErr) {
    return { ok: false, error: insErr.message };
  }

  const { data: roles } = await client.from('office_roles').select('id, key');
  const byKey = new Map((roles || []).map((r: any) => [String(r.key), String(r.id)]));

  const accountsPerms = [
    'finance-module',
    'finance-module:overview',
    'finance-module:salary_batches',
    'finance-module:live_ledger',
    'finance-module:platform',
    'finance-module:team_leaders',
    'finance-module:hosts',
    'finance-module:funding',
    'finance-module:batches',
    'finance-module:settlement',
    'finance-module:period',
    'financials',
    'payouts',
    'cms-payout-cards',
    'analytics',
    'analytics:finance',
  ];
  const managerPerms = [
    'analytics',
    'monitoring',
    'users',
    'leaders',
    'creator-ops',
    'countries',
    'gifts',
    'skus',
    'cms',
    'cms-navigation',
    'email',
    'api-health',
  ];

  const rows: { role_id: string; permission_key: string }[] = [];
  const accountsId = byKey.get('accounts');
  const managerId = byKey.get('manager');
  if (accountsId) {
    for (const permission_key of accountsPerms) rows.push({ role_id: accountsId, permission_key });
  }
  if (managerId) {
    for (const permission_key of managerPerms) rows.push({ role_id: managerId, permission_key });
  }
  if (rows.length) {
    await client.from('office_role_permissions').upsert(rows, {
      onConflict: 'role_id,permission_key',
      ignoreDuplicates: true,
    });
  }
  return { ok: true };
}
