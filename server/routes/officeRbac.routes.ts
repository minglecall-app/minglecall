/**
 * Express: /api/admin/office-rbac/*
 * Control Center — roles, permissions, create office users.
 */
import { Router } from 'express';
import { requireAdmin } from '../middleware/auth';
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '../supabaseAdmin';
import { getPasswordPolicyError } from '../../shared/passwordPolicy';
import { allOfficePermissionKeys } from '../../shared/officeRbac/features';
import {
  OFFICE_FEATURES,
  actorCanManageRbac,
  ensureOfficeRolesSeeded,
  mapRoleRow,
  resolveActorAccess,
  sanitizePermissionKeys,
  slugKey,
} from '../officeRbac';

function schemaMissingResponse(res: import('express').Response, detail?: string) {
  return res.status(503).json({
    success: false,
    error: {
      message:
        detail ||
        'Office RBAC tables are missing. In Supabase SQL Editor, run the OFFICE RBAC block at the end of supabase_schema.sql, then refresh.',
      code: 'OFFICE_RBAC_SCHEMA_MISSING',
    },
  });
}

async function loadAccess(req: import('express').Request) {
  const admin = getSupabaseAdmin();
  if (!admin) return { admin: null as any, access: null as any };
  const profile = (req as any).adminProfile || (req as any).profile;
  const profileId = String(profile?.id || '').trim();
  const access = await resolveActorAccess(admin, profileId);
  return { admin, access };
}

export function createOfficeRbacRouter(): Router {
  const router = Router();

  router.get('/features', requireAdmin, (_req, res) => {
    return res.json({ success: true, data: { features: OFFICE_FEATURES } });
  });

  router.get('/me', requireAdmin, async (req, res) => {
    try {
      if (!isSupabaseAdminConfigured()) {
        return res.status(503).json({
          success: false,
          error: { message: 'Supabase not configured', code: 'SUPABASE_NOT_CONFIGURED' },
        });
      }
      const { access } = await loadAccess(req);
      if (!access) {
        return res.status(503).json({
          success: false,
          error: { message: 'Supabase admin client unavailable', code: 'SUPABASE_NOT_CONFIGURED' },
        });
      }
      return res.json({
        success: true,
        data: {
          isSuper: access.isSuper,
          permissions: access.permissions,
          officeRoleId: access.officeRoleId,
          role: access.role,
          features: OFFICE_FEATURES,
          schemaMissing: access.schemaMissing === true,
        },
      });
    } catch (err: any) {
      console.error('[office-rbac/me]', err);
      return res.status(500).json({
        success: false,
        error: { message: err?.message || 'Failed to load permissions', code: 'OFFICE_RBAC_ERROR' },
      });
    }
  });

  router.get('/roles', requireAdmin, async (req, res) => {
    try {
      if (!isSupabaseAdminConfigured()) {
        return res.status(503).json({
          success: false,
          error: { message: 'Supabase not configured', code: 'SUPABASE_NOT_CONFIGURED' },
        });
      }
      const { admin, access } = await loadAccess(req);
      if (!admin || !access) {
        return res.status(503).json({
          success: false,
          error: { message: 'Supabase admin client unavailable', code: 'SUPABASE_NOT_CONFIGURED' },
        });
      }
      if (access.schemaMissing) {
        return schemaMissingResponse(res, access.schemaError);
      }
      if (!actorCanManageRbac(access)) {
        return res.status(403).json({
          success: false,
          error: { message: 'Roles & Permissions access required.', code: 'FORBIDDEN' },
        });
      }

      const seeded = await ensureOfficeRolesSeeded(admin);
      if (seeded.schemaMissing) {
        return schemaMissingResponse(res, seeded.error);
      }
      if (!seeded.ok) {
        return res.status(500).json({
          success: false,
          error: { message: seeded.error || 'Failed to seed roles', code: 'ROLES_SEED_FAILED' },
        });
      }

      const { data: roles, error } = await admin
        .from('office_roles')
        .select('*')
        .order('label', { ascending: true });
      if (error) {
        if (/does not exist|schema cache|42P01/i.test(error.message)) {
          return schemaMissingResponse(res, error.message);
        }
        return res.status(500).json({
          success: false,
          error: { message: error.message, code: 'ROLES_LOAD_FAILED' },
        });
      }

      const ids = (roles || []).map((r: any) => r.id);
      const { data: perms } = ids.length
        ? await admin.from('office_role_permissions').select('role_id, permission_key').in('role_id', ids)
        : { data: [] as any[] };
      const byRole = new Map<string, string[]>();
      for (const p of perms || []) {
        const list = byRole.get(String(p.role_id)) || [];
        list.push(String(p.permission_key));
        byRole.set(String(p.role_id), list);
      }

      return res.json({
        success: true,
        data: {
          roles: (roles || []).map((r: any) =>
            mapRoleRow(r, r.is_super ? allOfficePermissionKeys() : byRole.get(String(r.id)) || [])
          ),
          features: OFFICE_FEATURES,
        },
      });
    } catch (err: any) {
      console.error('[office-rbac/roles GET]', err);
      return res.status(500).json({
        success: false,
        error: { message: err?.message || 'Failed to load roles', code: 'ROLES_LOAD_FAILED' },
      });
    }
  });

  router.post('/roles', requireAdmin, async (req, res) => {
    try {
      const { admin, access } = await loadAccess(req);
      if (!admin || !access) {
        return res.status(503).json({
          success: false,
          error: { message: 'Supabase not configured', code: 'SUPABASE_NOT_CONFIGURED' },
        });
      }
      if (access.schemaMissing) return schemaMissingResponse(res, access.schemaError);
      if (!actorCanManageRbac(access)) {
        return res.status(403).json({
          success: false,
          error: { message: 'Roles & Permissions access required.', code: 'FORBIDDEN' },
        });
      }

      const body = req.body || {};
      const label = String(body.label || '').trim();
      let key = String(body.key || '')
        .trim()
        .toLowerCase() || slugKey(label);
      const description = String(body.description || '').trim();
      if (!label || !key) {
        return res.status(400).json({
          success: false,
          error: { message: 'Label (and key) required.', code: 'INVALID' },
        });
      }
      if (!/^[a-z][a-z0-9_]{1,47}$/.test(key)) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Key must be snake_case starting with a letter.',
            code: 'INVALID_KEY',
          },
        });
      }

      const permissions = sanitizePermissionKeys(body.permissions);
      const { data: created, error } = await admin
        .from('office_roles')
        .insert({
          key,
          label,
          description,
          is_super: false,
          is_system: false,
        })
        .select('*')
        .single();
      if (error || !created) {
        return res.status(500).json({
          success: false,
          error: { message: error?.message || 'Create failed', code: 'ROLE_CREATE_FAILED' },
        });
      }
      if (permissions.length) {
        await admin.from('office_role_permissions').insert(
          permissions.map((permission_key) => ({
            role_id: created.id,
            permission_key,
          }))
        );
      }
      return res.json({
        success: true,
        data: { role: mapRoleRow(created, permissions) },
      });
    } catch (err: any) {
      console.error('[office-rbac/roles POST]', err);
      return res.status(500).json({
        success: false,
        error: { message: err?.message || 'Create failed', code: 'ROLE_CREATE_FAILED' },
      });
    }
  });

  router.put('/roles/:roleId', requireAdmin, async (req, res) => {
    try {
      const { admin, access } = await loadAccess(req);
      if (!admin || !access) {
        return res.status(503).json({
          success: false,
          error: { message: 'Supabase not configured', code: 'SUPABASE_NOT_CONFIGURED' },
        });
      }
      if (access.schemaMissing) return schemaMissingResponse(res, access.schemaError);
      if (!actorCanManageRbac(access)) {
        return res.status(403).json({
          success: false,
          error: { message: 'Roles & Permissions access required.', code: 'FORBIDDEN' },
        });
      }

      const roleId = String(req.params.roleId || '').trim();
      const { data: existing, error: findErr } = await admin
        .from('office_roles')
        .select('*')
        .eq('id', roleId)
        .maybeSingle();
      if (findErr || !existing) {
        return res.status(404).json({
          success: false,
          error: { message: 'Role not found.', code: 'NOT_FOUND' },
        });
      }

      const body = req.body || {};
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (typeof body.label === 'string' && body.label.trim() && !existing.is_super) {
        patch.label = body.label.trim();
      }
      if (typeof body.description === 'string') {
        patch.description = body.description.trim();
      }

      const { data: updated, error: updErr } = await admin
        .from('office_roles')
        .update(patch)
        .eq('id', roleId)
        .select('*')
        .single();
      if (updErr || !updated) {
        return res.status(500).json({
          success: false,
          error: { message: updErr?.message || 'Update failed', code: 'ROLE_UPDATE_FAILED' },
        });
      }

      let permissions = allOfficePermissionKeys();
      if (!existing.is_super && Array.isArray(body.permissions)) {
        permissions = sanitizePermissionKeys(body.permissions);
        await admin.from('office_role_permissions').delete().eq('role_id', roleId);
        if (permissions.length) {
          await admin.from('office_role_permissions').insert(
            permissions.map((permission_key) => ({ role_id: roleId, permission_key }))
          );
        }
      } else if (!existing.is_super) {
        const { data: perms } = await admin
          .from('office_role_permissions')
          .select('permission_key')
          .eq('role_id', roleId);
        permissions = (perms || []).map((p: any) => String(p.permission_key));
      }

      return res.json({
        success: true,
        data: { role: mapRoleRow(updated, permissions) },
      });
    } catch (err: any) {
      console.error('[office-rbac/roles PUT]', err);
      return res.status(500).json({
        success: false,
        error: { message: err?.message || 'Update failed', code: 'ROLE_UPDATE_FAILED' },
      });
    }
  });

  router.delete('/roles/:roleId', requireAdmin, async (req, res) => {
    try {
      const { admin, access } = await loadAccess(req);
      if (!admin || !access) {
        return res.status(503).json({
          success: false,
          error: { message: 'Supabase not configured', code: 'SUPABASE_NOT_CONFIGURED' },
        });
      }
      if (!actorCanManageRbac(access)) {
        return res.status(403).json({
          success: false,
          error: { message: 'Roles & Permissions access required.', code: 'FORBIDDEN' },
        });
      }
      const roleId = String(req.params.roleId || '').trim();
      const { data: existing } = await admin
        .from('office_roles')
        .select('id, is_system, is_super')
        .eq('id', roleId)
        .maybeSingle();
      if (!existing) {
        return res.status(404).json({
          success: false,
          error: { message: 'Role not found.', code: 'NOT_FOUND' },
        });
      }
      if (existing.is_system || existing.is_super) {
        return res.status(400).json({
          success: false,
          error: { message: 'System / Super roles cannot be deleted.', code: 'SYSTEM_ROLE' },
        });
      }
      const { error } = await admin.from('office_roles').delete().eq('id', roleId);
      if (error) {
        return res.status(500).json({
          success: false,
          error: { message: error.message, code: 'ROLE_DELETE_FAILED' },
        });
      }
      return res.json({ success: true, data: { deleted: true } });
    } catch (err: any) {
      console.error('[office-rbac/roles DELETE]', err);
      return res.status(500).json({
        success: false,
        error: { message: err?.message || 'Delete failed', code: 'ROLE_DELETE_FAILED' },
      });
    }
  });

  router.get('/users', requireAdmin, async (req, res) => {
    try {
      const { admin, access } = await loadAccess(req);
      if (!admin || !access) {
        return res.status(503).json({
          success: false,
          error: { message: 'Supabase not configured', code: 'SUPABASE_NOT_CONFIGURED' },
        });
      }
      if (access.schemaMissing) return schemaMissingResponse(res, access.schemaError);
      if (!actorCanManageRbac(access)) {
        return res.status(403).json({
          success: false,
          error: { message: 'Roles & Permissions access required.', code: 'FORBIDDEN' },
        });
      }

      const { data: users, error } = await admin
        .from('profiles')
        .select('id, name, email, role, office_role_id, created_at, updated_at, is_banned')
        .eq('role', 'admin')
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) {
        if (/office_role_id|schema cache|does not exist/i.test(error.message)) {
          // Column missing — list admins without office role field
          const { data: fallback, error: fbErr } = await admin
            .from('profiles')
            .select('id, name, email, role, created_at, updated_at, is_banned')
            .eq('role', 'admin')
            .order('created_at', { ascending: false })
            .limit(200);
          if (fbErr) {
            return schemaMissingResponse(res, error.message);
          }
          return res.json({
            success: true,
            data: {
              users: (fallback || []).map((u: any) => ({
                id: String(u.id),
                name: u.name || null,
                email: u.email || null,
                role: 'admin',
                officeRoleId: null,
                officeRoleKey: null,
                officeRoleLabel: 'Legacy Super Admin',
                isSuper: true,
                isBanned: u.is_banned === true,
                createdAt: u.created_at || null,
                updatedAt: u.updated_at || null,
              })),
              schemaMissing: true,
            },
          });
        }
        return res.status(500).json({
          success: false,
          error: { message: error.message, code: 'USERS_LOAD_FAILED' },
        });
      }

      const { data: roles } = await admin.from('office_roles').select('id, key, label, is_super');
      const roleById = new Map<
        string,
        { id: string; key: string; label: string; is_super: boolean }
      >();
      for (const r of roles || []) {
        roleById.set(String((r as any).id), {
          id: String((r as any).id),
          key: String((r as any).key),
          label: String((r as any).label),
          is_super: (r as any).is_super === true,
        });
      }

      return res.json({
        success: true,
        data: {
          users: (users || []).map((u: any) => {
            const or = u.office_role_id ? roleById.get(String(u.office_role_id)) : null;
            return {
              id: String(u.id),
              name: u.name || null,
              email: u.email || null,
              role: 'admin',
              officeRoleId: u.office_role_id ? String(u.office_role_id) : null,
              officeRoleKey: or?.key || null,
              officeRoleLabel: or
                ? or.label
                : u.office_role_id
                  ? 'Unknown role'
                  : 'Legacy Super Admin',
              isSuper: !u.office_role_id || or?.is_super === true,
              isBanned: u.is_banned === true,
              createdAt: u.created_at || null,
              updatedAt: u.updated_at || null,
            };
          }),
        },
      });
    } catch (err: any) {
      console.error('[office-rbac/users GET]', err);
      return res.status(500).json({
        success: false,
        error: { message: err?.message || 'Failed to load users', code: 'USERS_LOAD_FAILED' },
      });
    }
  });

  router.post('/users', requireAdmin, async (req, res) => {
    try {
      const { admin, access } = await loadAccess(req);
      if (!admin || !access) {
        return res.status(503).json({
          success: false,
          error: { message: 'Supabase not configured', code: 'SUPABASE_NOT_CONFIGURED' },
        });
      }
      if (access.schemaMissing) return schemaMissingResponse(res, access.schemaError);
      if (!actorCanManageRbac(access)) {
        return res.status(403).json({
          success: false,
          error: { message: 'Roles & Permissions access required.', code: 'FORBIDDEN' },
        });
      }

      const body = req.body || {};
      const name = String(body.name || '').trim();
      const email = String(body.email || '')
        .trim()
        .toLowerCase();
      const password = typeof body.password === 'string' ? body.password : '';
      const officeRoleId = String(body.officeRoleId || body.office_role_id || '').trim();

      if (!name || !email || !email.includes('@')) {
        return res.status(400).json({
          success: false,
          error: { message: 'Name and valid email required.', code: 'INVALID' },
        });
      }
      const pwError = getPasswordPolicyError(password);
      if (pwError) {
        return res.status(400).json({
          success: false,
          error: { message: pwError, code: 'PASSWORD_POLICY' },
        });
      }
      if (!officeRoleId) {
        return res.status(400).json({
          success: false,
          error: { message: 'Office role is required.', code: 'ROLE_REQUIRED' },
        });
      }

      const { data: officeRole } = await admin
        .from('office_roles')
        .select('id, key, label, is_super')
        .eq('id', officeRoleId)
        .maybeSingle();
      if (!officeRole) {
        return res.status(400).json({
          success: false,
          error: { message: 'Office role not found.', code: 'ROLE_NOT_FOUND' },
        });
      }

      const { data: existingProfile } = await admin
        .from('profiles')
        .select('id, email')
        .ilike('email', email)
        .maybeSingle();
      if (existingProfile?.id) {
        return res.status(409).json({
          success: false,
          error: {
            message: `A profile already exists for ${email}.`,
            code: 'EMAIL_EXISTS',
          },
        });
      }

      const { data: createdAuth, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          role: 'admin',
          gender: 'other',
          name,
          full_name: name,
        },
      });
      if (createErr || !createdAuth?.user?.id) {
        const msg = createErr?.message || 'Failed to create Auth user';
        const code = /already/i.test(msg) ? 'EMAIL_EXISTS' : 'AUTH_CREATE_FAILED';
        return res.status(code === 'EMAIL_EXISTS' ? 409 : 500).json({
          success: false,
          error: { message: msg, code },
        });
      }

      const authUserId = createdAuth.user.id;
      const now = new Date().toISOString();
      const profileRow = {
        id: authUserId,
        auth_id: authUserId,
        name,
        email,
        gender: 'other',
        gender_locked: true,
        role: 'admin',
        office_role_id: officeRole.id,
        age: 30,
        nationality: 'United States',
        country_code: 'US',
        bio: `Office staff — ${officeRole.label}`,
        interests: [],
        tags: ['Office', officeRole.label],
        spoken_languages: ['English'],
        avatar_url:
          'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&q=80&w=400',
        gallery: [],
        is_verified: true,
        is_onboarded: true,
        agreed_to_terms: true,
        online_status: 'offline',
        coin_balance: 0,
        hourly_coin_rate: 0,
        earnings_coins: 0,
        has_password_set: true,
        created_at: now,
        updated_at: now,
      };

      const { error: upsertErr } = await admin.from('profiles').upsert(profileRow, {
        onConflict: 'id',
      });
      if (upsertErr) {
        try {
          await admin.auth.admin.deleteUser(authUserId);
        } catch {
          /* ignore */
        }
        if (/office_role_id|schema cache|does not exist/i.test(upsertErr.message)) {
          return schemaMissingResponse(res, upsertErr.message);
        }
        return res.status(500).json({
          success: false,
          error: {
            message: upsertErr.message || 'Failed to create office user profile',
            code: 'PROFILE_UPSERT_FAILED',
          },
        });
      }

      await admin
        .from('profiles')
        .update({
          role: 'admin',
          office_role_id: officeRole.id,
          auth_id: authUserId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', authUserId);

      return res.json({
        success: true,
        data: {
          user: {
            id: authUserId,
            name,
            email,
            role: 'admin',
            officeRoleId: String(officeRole.id),
            officeRoleKey: officeRole.key,
            officeRoleLabel: officeRole.label,
            isSuper: officeRole.is_super === true,
          },
        },
        message: `Office user ${name} created. They can sign in with ${email}.`,
      });
    } catch (err: any) {
      console.error('[office-rbac/users POST]', err);
      return res.status(500).json({
        success: false,
        error: { message: err?.message || 'Create user failed', code: 'USER_CREATE_FAILED' },
      });
    }
  });

  router.patch('/users/:userId', requireAdmin, async (req, res) => {
    try {
      const { admin, access } = await loadAccess(req);
      if (!admin || !access) {
        return res.status(503).json({
          success: false,
          error: { message: 'Supabase not configured', code: 'SUPABASE_NOT_CONFIGURED' },
        });
      }
      if (access.schemaMissing) return schemaMissingResponse(res, access.schemaError);
      if (!actorCanManageRbac(access)) {
        return res.status(403).json({
          success: false,
          error: { message: 'Roles & Permissions access required.', code: 'FORBIDDEN' },
        });
      }

      const userId = String(req.params.userId || '').trim();
      const body = req.body || {};
      const officeRoleIdRaw = body.officeRoleId ?? body.office_role_id;
      const officeRoleId =
        officeRoleIdRaw === null || officeRoleIdRaw === ''
          ? null
          : String(officeRoleIdRaw || '').trim() || null;

      if (officeRoleId) {
        const { data: role } = await admin
          .from('office_roles')
          .select('id')
          .eq('id', officeRoleId)
          .maybeSingle();
        if (!role) {
          return res.status(400).json({
            success: false,
            error: { message: 'Office role not found.', code: 'ROLE_NOT_FOUND' },
          });
        }
      }

      const { data: target } = await admin
        .from('profiles')
        .select('id, role')
        .eq('id', userId)
        .maybeSingle();
      if (!target || String(target.role) !== 'admin') {
        return res.status(404).json({
          success: false,
          error: { message: 'Office admin user not found.', code: 'NOT_FOUND' },
        });
      }

      const { error } = await admin
        .from('profiles')
        .update({
          office_role_id: officeRoleId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

      if (error) {
        if (/office_role_id|schema cache|does not exist/i.test(error.message)) {
          return schemaMissingResponse(res, error.message);
        }
        return res.status(500).json({
          success: false,
          error: { message: error.message, code: 'ASSIGN_FAILED' },
        });
      }

      return res.json({
        success: true,
        data: { userId, officeRoleId },
      });
    } catch (err: any) {
      console.error('[office-rbac/users PATCH]', err);
      return res.status(500).json({
        success: false,
        error: { message: err?.message || 'Assign failed', code: 'ASSIGN_FAILED' },
      });
    }
  });

  return router;
}
