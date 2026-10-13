import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import type { ServerRuntime } from '../runtimeTypes';
import type { UserProfile } from '../../src/types';
import { loadAdminSchemaPayload } from '../schemaLoader';
import {
  getRawSmtpConfigForAdmin,
  updateSmtpRuntimeConfig,
} from '../emailService';
import {
  isSupabaseAdminConfigured,
  granularResetSupabaseAdmin,
  isSupabaseServiceRoleConfigured,
  backfillMissingAuthIdsAdmin,
  authenticateUserWithPasswordAdmin,
  updateSupabaseRuntimeConfig,
  updateUserPasswordAdmin,
  upsertProfileAdmin,
  getSupabaseAdmin,
} from '../supabaseAdmin';
import { hardDeleteUserCompletely, cleanupOrphanAuthUsersAdmin } from '../userHardDelete';
import { isR2Configured, updateR2RuntimeConfig } from '../r2Storage';
import { requireAdmin, requireAuth } from '../middleware/auth';
import {
  collectInfraStatus,
  listServerDiagnosticModules,
  runServerDiagnostic,
} from '../../lib/systemDiagnostics';
import { listK6SmokeScenarios, runK6Smoke } from '../../lib/k6Smoke';
import { getPasswordPolicyError } from '../../shared/passwordPolicy';
import {
  DEFAULT_EMAIL_TEMPLATES,
  parseEmailTemplatesJson,
} from '../../shared/emailTemplates';
import { createOfficeRbacRouter } from './officeRbac.routes';

/** Read ALLOW_FACTORY_RESET from live .env (so edits apply without full restart) + process.env. */
function getAllowFactoryResetRaw(): string {
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const parsed = dotenv.parse(fs.readFileSync(envPath));
      if (Object.prototype.hasOwnProperty.call(parsed, 'ALLOW_FACTORY_RESET')) {
        const fromFile = String(parsed.ALLOW_FACTORY_RESET ?? '').trim();
        process.env.ALLOW_FACTORY_RESET = fromFile;
        return fromFile;
      }
    }
  } catch {
    // fall through to process.env
  }
  return String(process.env.ALLOW_FACTORY_RESET ?? '').trim();
}

/** Destructive factory/mock reset is refused unless explicitly allowlisted. */
function isFactoryResetAllowed(): boolean {
  const raw = getAllowFactoryResetRaw().replace(/^['"]|['"]$/g, '').trim();
  return /^(1|true|yes|on)$/i.test(raw);
}

function refuseFactoryReset(res: import('express').Response) {
  return res.status(403).json({
    success: false,
    error: {
      message:
        'Factory / destructive data reset is disabled. Set ALLOW_FACTORY_RESET=true in the server .env (then retry — no full restart required for this flag), run the wipe, and set it back to false.',
      code: 'FACTORY_RESET_DISABLED',
    },
  });
}

export function createAdminRouter(ctx: ServerRuntime): Router {
  const router = Router();
  const {
    serverUsers,
    presenceMap,
    userLastSeen,
    activeCalls,
    infraConfig,
    getFormattedUsers,
    getFormattedActiveCalls,
    broadcastAll,
    broadcastPresence,
    broadcastUsers,
    broadcastActiveCalls,
    purgeUserRuntimeState,
    resetVolatileRuntimeState,
    broadcastCreatorMetrics,
  } = ctx;

  // Control Center — office roles / permissions / create office users
  router.use('/office-rbac', createOfficeRbacRouter());

  // Status probe so admin UI can disable Factory Wipe before submit
  router.get('/factory-reset-status', requireAdmin, (_req, res) => {
    const raw = getAllowFactoryResetRaw();
    const allowed = isFactoryResetAllowed();
    return res.json({
      success: true,
      data: {
        allowed,
        envValue: raw,
        hint: allowed
          ? 'Factory reset is enabled. Type DELETE below to unlock Factory Wipe, then set ALLOW_FACTORY_RESET=false after the wipe.'
          : 'Set ALLOW_FACTORY_RESET=true in the server .env file (not .env.example), reopen this modal, run the wipe, then set it back to false.',
      },
    });
  });

  // Master PostgreSQL / Supabase Schema Fetch Endpoint
  // Single source of truth: /supabase_schema.sql (loaded from disk — no embedded SQL)
  router.get('/schema', requireAdmin, (req, res) => {
    try {
      const payload = loadAdminSchemaPayload();
      return res.json(payload);
    } catch (err: any) {
      console.error('Error reading canonical schema file:', err);
      return res.status(404).json({
        success: false,
        error: err.message || 'Canonical schema file not found on server',
      });
    }
  });

  // POST Admin Reset Data (destructive — require allowlist)
  router.post('/reset-mock-data', requireAdmin, (req, res) => {
    try {
      if (!isFactoryResetAllowed()) {
        return refuseFactoryReset(res);
      }

      const { mockIds } = req.body;
      const idsToRemove: string[] = Array.isArray(mockIds) ? mockIds : [];

      let count = 0;
      for (const id of idsToRemove) {
        if (serverUsers.has(id)) {
          serverUsers.delete(id);
          presenceMap.delete(id);
          userLastSeen.delete(id);
          count++;
        }
      }

      broadcastAll({
        type: 'users:all',
        users: getFormattedUsers(),
      });
      broadcastPresence();

      return res.json({
        success: true,
        removedCount: count,
        remainingCount: serverUsers.size,
        message: `Purged ${count} accounts. Server now holds ${serverUsers.size} live users.`,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Master Granular / Full Reset Endpoint (bypasses RLS via Supabase Admin service-role)
  router.post('/granular-reset', requireAdmin, async (req, res) => {
    try {
      if (!isFactoryResetAllowed()) {
        return refuseFactoryReset(res);
      }

      const options = req.body || {};

      // 1. Reset volatile in-memory state (calls, presence, metrics, quick-match, users)
      const shouldClearUsers = Boolean(options.clearAllUsers);
      const adminUser =
        Array.from(serverUsers.values()).find((u) => u.role === 'admin') ||
        ({
          id: 'admin_user',
          name: 'Super Admin',
          email: 'admin@livecall.app',
          gender: 'male',
          role: 'admin',
          coinBalance: 0,
          isVerified: true,
          onlineStatus: 'online',
        } as UserProfile);

      resetVolatileRuntimeState({
        clearUsers: shouldClearUsers,
        adminUser: shouldClearUsers ? adminUser : null,
        clearActiveCalls: Boolean(options.clearActiveCalls || options.callLogs || options.clearAllUsers),
        clearPresence: options.clearPresence !== false,
      });

      if (!shouldClearUsers && options.mockIds && Array.isArray(options.mockIds)) {
        for (const id of options.mockIds) {
          purgeUserRuntimeState(String(id));
        }
      }

      broadcastActiveCalls();
      broadcastPresence();
      broadcastUsers();
      broadcastCreatorMetrics();

      // 2. If Supabase Admin is configured, perform complete cascading database purge
      let supabaseResult: any = { success: true, clearedTables: [], warnings: [] };
      if (isSupabaseAdminConfigured()) {
        if (!isSupabaseServiceRoleConfigured()) {
          return res.status(503).json({
            success: false,
            error: {
              message:
                'Database reset requires SUPABASE_SERVICE_ROLE_KEY. The anon key cannot bypass RLS, so tables would not actually be purged.',
              code: 'SERVICE_ROLE_REQUIRED',
            },
          });
        }
        supabaseResult = await granularResetSupabaseAdmin({
          mockIds: options.mockIds,
          clearAllUsers: Boolean(options.clearAllUsers),
          clearMockUsers: Boolean(options.clearMockUsers),
          clearAdmin: Boolean(options.clearAdmin),
          chatMessages: Boolean(options.chatMessages),
          callLogs: Boolean(options.callLogs),
          friendRequests: Boolean(options.friendRequests),
          payoutRequests: Boolean(options.payoutRequests),
          moderationReports: Boolean(options.moderationReports),
          creatorAnalytics: Boolean(options.creatorAnalytics),
          creatorReviews: Boolean(options.creatorReviews),
          dailyRewardsAndQuests: Boolean(options.dailyRewardsAndQuests),
          taxonomiesAndFlags: Boolean(options.taxonomiesAndFlags),
          purgeR2MediaStorage: Boolean(options.purgeR2MediaStorage),
          purgeAllR2Uploads: Boolean(options.purgeAllR2Uploads),
          homeBanners: Boolean(options.homeBanners),
          homeQuickLinks: Boolean(options.homeQuickLinks),
          cmsPolicies: Boolean(options.cmsPolicies),
          systemSettings: Boolean(options.systemSettings),
          coinPackages: Boolean(options.coinPackages),
          virtualGiftsCatalog: Boolean(options.virtualGiftsCatalog),
          feedPosts: Boolean(options.feedPosts),
          favorites: Boolean(options.favorites),
          blockedUsers: Boolean(options.blockedUsers),
          creatorGoals: Boolean(options.creatorGoals),
          walletLedger: Boolean(options.walletLedger),
          resetBalances: options.resetBalances,
        });
        if (!supabaseResult?.success) {
          return res.status(500).json({
            success: false,
            error: supabaseResult?.error || 'Database reset failed.',
            clearedTables: supabaseResult?.clearedTables || [],
            warnings: supabaseResult?.warnings || [],
          });
        }
      }

      return res.json({
        success: true,
        message: 'Server and database state reset successfully.',
        clearedTables: supabaseResult.clearedTables || [],
        warnings: supabaseResult.warnings || [],
      });
    } catch (err: any) {
      console.error('[API Reset] Error during granular reset:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/delete-user', requireAdmin, async (req, res) => {
    try {
      const { userId } = req.body;
      if (!userId) {
        return res.status(400).json({ success: false, error: 'User ID is required' });
      }

      const existing = serverUsers.get(userId);
      if (existing?.role === 'admin') {
        return res.status(403).json({
          success: false,
          error: 'Admin accounts cannot be deleted.',
          data: { authDeleted: false, profileDeleted: false },
        });
      }

      const userName = existing?.name || userId;

      let deleteResult = {
        userId: String(userId),
        authDeleted: false,
        profileDeleted: false,
        r2DeletedCount: 0,
        warnings: [] as string[],
      };

      if (isSupabaseAdminConfigured()) {
        const hard = await hardDeleteUserCompletely(String(userId));
        deleteResult = {
          userId: hard.userId,
          authDeleted: hard.authDeleted,
          profileDeleted: hard.profileDeleted,
          r2DeletedCount: hard.r2DeletedCount,
          warnings: hard.warnings,
        };
        if (!hard.success || !hard.profileDeleted || !hard.authDeleted) {
          return res.status(500).json({
            success: false,
            error:
              hard.error ||
              (!hard.authDeleted
                ? 'Auth user was not deleted — account may still be able to sign in. Retry delete.'
                : 'Failed to delete profile'),
            data: deleteResult,
          });
        }
      } else {
        deleteResult.warnings.push('Supabase admin not configured; deleted from server memory only.');
        deleteResult.profileDeleted = true;
        deleteResult.authDeleted = false;
        return res.status(503).json({
          success: false,
          error: 'Supabase admin is not configured; cannot safely delete Auth + profile.',
          data: deleteResult,
        });
      }

      purgeUserRuntimeState(String(userId));
      if (deleteResult.userId && deleteResult.userId !== String(userId)) {
        purgeUserRuntimeState(String(deleteResult.userId));
      }

      broadcastAll({
        type: 'users:deleted',
        userId,
        users: getFormattedUsers(),
      });
      broadcastPresence();
      broadcastUsers();

      return res.json({
        success: true,
        message: `User ${userName} was permanently deleted from database and system.`,
        data: deleteResult,
      });
    } catch (err: any) {
      console.error('Error in POST /api/admin/delete-user:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * Create Team Leader — Auth user + profiles row (role=team_leader).
   * Must succeed in Supabase before the admin UI treats the account as created.
   */
  router.post('/create-team-leader', requireAdmin, async (req, res) => {
    try {
      if (!isSupabaseAdminConfigured()) {
        return res.status(503).json({
          success: false,
          error: {
            message: 'Supabase admin is not configured',
            code: 'SUPABASE_NOT_CONFIGURED',
          },
        });
      }

      const body = req.body || {};
      const name = String(body.name || '').trim();
      const email = String(body.email || '')
        .trim()
        .toLowerCase();
      const password = typeof body.password === 'string' ? body.password : '';
      const agencyName = String(body.agencyName || body.agency_name || 'Talent Agency').trim();
      const commissionPercent = Number(body.commissionPercent ?? body.commission_percent ?? 15);
      const nationality = String(body.nationality || 'United States').trim();
      const countryCode = String(body.countryCode || body.country_code || 'US')
        .trim()
        .toUpperCase() || 'US';
      const bio = String(body.bio || 'Talent Management & Creator Agency Director').trim();
      const avatarUrl =
        String(body.avatarUrl || body.avatar_url || '').trim() ||
        'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=400';
      const spokenLanguages = Array.isArray(body.spokenLanguages)
        ? body.spokenLanguages.map((s: any) => String(s).trim()).filter(Boolean)
        : String(body.spokenLanguages || 'English')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);

      if (!name) {
        return res.status(400).json({
          success: false,
          error: { message: 'Name is required.', code: 'NAME_REQUIRED' },
        });
      }
      if (!email || !email.includes('@')) {
        return res.status(400).json({
          success: false,
          error: { message: 'A valid login email is required.', code: 'EMAIL_REQUIRED' },
        });
      }
      const pwError = getPasswordPolicyError(password);
      if (pwError) {
        return res.status(400).json({
          success: false,
          error: { message: pwError, code: 'PASSWORD_POLICY' },
        });
      }

      const admin = getSupabaseAdmin();
      if (!admin) {
        return res.status(503).json({
          success: false,
          error: { message: 'Supabase admin client unavailable', code: 'SUPABASE_NOT_CONFIGURED' },
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
            message: `A profile already exists for ${email}. Use a different email.`,
            code: 'EMAIL_EXISTS',
          },
        });
      }

      const { data: createdAuth, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          role: 'team_leader',
          gender: 'female',
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
      const profilePayload: Partial<UserProfile> & Record<string, any> = {
        id: authUserId,
        authId: authUserId,
        name,
        email,
        gender: 'female',
        genderLocked: true,
        role: 'team_leader',
        age: 28,
        nationality,
        countryCode,
        bio,
        interests: ['Talent Growth', 'Creator Mentorship'],
        tags: ['Team Leader', 'VIP Agency'],
        spokenLanguages: spokenLanguages.length ? spokenLanguages : ['English'],
        avatarUrl,
        gallery: [avatarUrl],
        isVerified: true,
        isOnboarded: true,
        agreedToTerms: true,
        onlineStatus: 'offline',
        coinBalance: 0,
        hourlyCoinRate: 10,
        earningsCoins: 0,
        agencyName,
        commissionPercent: Number.isFinite(commissionPercent) ? commissionPercent : 15,
        hasPasswordSet: true,
        password,
        createdAt: now,
      };

      const upsert = await upsertProfileAdmin(profilePayload);
      if (!upsert.success) {
        try {
          await admin.auth.admin.deleteUser(authUserId);
        } catch {
          // ignore
        }
        return res.status(500).json({
          success: false,
          error: {
            message: upsert.error || 'Failed to create team leader profile',
            code: 'PROFILE_UPSERT_FAILED',
          },
        });
      }

      await updateUserPasswordAdmin(authUserId, password, email, {
        role: 'team_leader',
        gender: 'female',
        name,
      });

      await admin
        .from('profiles')
        .update({
          role: 'team_leader',
          gender: 'female',
          gender_locked: true,
          auth_id: authUserId,
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', authUserId);

      const normalized = {
        id: authUserId,
        authId: authUserId,
        name,
        email,
        role: 'team_leader' as const,
        gender: 'female' as const,
        genderLocked: true,
        agencyName,
        commissionPercent: Number.isFinite(commissionPercent) ? commissionPercent : 15,
        avatarUrl,
        gallery: [avatarUrl],
        spokenLanguages: spokenLanguages.length ? spokenLanguages : ['English'],
        nationality,
        countryCode,
        bio,
        isVerified: true,
        isOnboarded: true,
        hasPasswordSet: true,
        coinBalance: 0,
        hourlyCoinRate: 10,
        earningsCoins: 0,
        onlineStatus: 'offline' as const,
        createdAt: now,
      };

      serverUsers.set(authUserId, { ...(serverUsers.get(authUserId) || {}), ...normalized } as UserProfile);
      broadcastUsers();
      broadcastAll({
        type: 'users:updated',
        user: normalized,
        users: getFormattedUsers(),
      });

      return res.json({
        success: true,
        user: normalized,
        message: `Team leader ${name} created in Supabase Auth + profiles. They can sign in with ${email}.`,
      });
    } catch (err: any) {
      console.error('Error in POST /api/admin/create-team-leader:', err);
      return res.status(500).json({
        success: false,
        error: { message: err?.message || 'Failed to create team leader', code: 'INTERNAL' },
      });
    }
  });

  /**
   * Backfill profiles.auth_id from auth.users by email where auth_id IS NULL.
   * Admin-only; does not delete/recreate users.
   */
  router.post('/users/backfill-auth-ids', requireAdmin, async (_req, res) => {
    try {
      if (!isSupabaseAdminConfigured()) {
        return res.status(503).json({
          success: false,
          error: { message: 'Supabase admin is not configured', code: 'SUPABASE_NOT_CONFIGURED' },
        });
      }
      const result = await backfillMissingAuthIdsAdmin();
      if (!result.success) {
        return res.status(500).json({
          success: false,
          error: { message: result.error || 'Backfill failed', code: 'BACKFILL_FAILED' },
          data: { linked: result.linked, skipped: result.skipped },
        });
      }

      try {
        const { fetchProfilesAdmin } = await import('../supabaseAdmin');
        const refreshed = await fetchProfilesAdmin();
        if (refreshed.success && refreshed.profiles) {
          for (const p of refreshed.profiles) {
            if (p?.id && p.auth_id) {
              const existing = serverUsers.get(p.id);
              if (existing) {
                serverUsers.set(p.id, { ...existing, authId: p.auth_id });
              }
            }
          }
          broadcastUsers();
        }
      } catch {
        // memory refresh is best-effort
      }

      return res.json({
        success: true,
        data: {
          linked: result.linked,
          skipped: result.skipped,
          skippedCount: result.skipped.length,
        },
        message: `Linked ${result.linked} profile(s); skipped ${result.skipped.length}.`,
      });
    } catch (err: any) {
      console.error('Error in POST /api/admin/users/backfill-auth-ids:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * Delete orphan auth.users with no matching profiles (by auth_id / id / email).
   * Does not delete any profile rows. Never deletes Auth marked admin in metadata.
   */
  router.post('/users/cleanup-orphan-auth', requireAdmin, async (_req, res) => {
    try {
      if (!isSupabaseAdminConfigured()) {
        return res.status(503).json({
          success: false,
          error: { message: 'Supabase admin is not configured', code: 'SUPABASE_NOT_CONFIGURED' },
        });
      }
      const result = await cleanupOrphanAuthUsersAdmin();
      if (!result.success) {
        return res.status(500).json({
          success: false,
          error: { message: result.error || 'Cleanup failed', code: 'ORPHAN_CLEANUP_FAILED' },
          data: { deleted: result.deleted, skipped: result.skipped },
        });
      }
      return res.json({
        success: true,
        data: {
          deleted: result.deleted,
          skipped: result.skipped,
          skippedCount: result.skipped.length,
        },
        message: `Deleted ${result.deleted} orphan Auth user(s); skipped ${result.skipped.length}.`,
      });
    } catch (err: any) {
      console.error('Error in POST /api/admin/users/cleanup-orphan-auth:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET SMTP/Resend status from environment (secrets never returned in full)
  router.get('/email-config', requireAdmin, (req, res) => {
    const rawConfig = getRawSmtpConfigForAdmin();
    res.json({
      success: true,
      config: {
        ...rawConfig,
        pass: rawConfig.pass ? '••••••••' : '',
        resendApiKey: rawConfig.resendApiKey ? `${String(rawConfig.resendApiKey).slice(0, 5)}…` : '',
        source: 'environment',
        message:
          'Email credentials are loaded from server environment variables. Set RESEND_API_KEY / SMTP_* in Vercel or .env.',
      },
    });
  });

  // POST: policy toggles only — do not accept SMTP/Resend secrets from the browser
  router.post('/email-config', requireAdmin, async (req, res) => {
    try {
      const { showOtpInForm } = req.body || {};
      if (typeof showOtpInForm === 'boolean') {
        updateSmtpRuntimeConfig({ showOtpInForm });
      }
      const client = getSupabaseAdmin();
      if (client && req.body) {
        const payload: Record<string, unknown> = {
          id: 'default',
          updated_at: new Date().toISOString(),
        };
        if (typeof req.body.emailRegisterEnabled === 'boolean') {
          payload.email_register_enabled = req.body.emailRegisterEnabled;
        }
        if (typeof req.body.emailAccountCreateEnabled === 'boolean') {
          payload.email_account_create_enabled = req.body.emailAccountCreateEnabled;
        }
        if (typeof req.body.emailAccountDeleteEnabled === 'boolean') {
          payload.email_account_delete_enabled = req.body.emailAccountDeleteEnabled;
        }
        if (typeof req.body.allowCreateWithoutOtp === 'boolean') {
          payload.allow_create_without_otp = req.body.allowCreateWithoutOtp;
        }
        if (typeof req.body.emailShowOtpFallback === 'boolean' || typeof showOtpInForm === 'boolean') {
          const v =
            typeof req.body.emailShowOtpFallback === 'boolean'
              ? req.body.emailShowOtpFallback
              : showOtpInForm;
          payload.email_show_otp_fallback = v;
          payload.smtp_show_otp = v;
        }
        if (Object.keys(payload).length > 2) {
          await client.from('system_configs').upsert(payload as any, { onConflict: 'id' });
        }
      }
      const updatedRaw = getRawSmtpConfigForAdmin();
      return res.json({
        success: true,
        message:
          'Email policy updated. SMTP/Resend API keys are read from environment variables only — not saved from this UI.',
        config: {
          ...updatedRaw,
          pass: updatedRaw.pass ? '••••••••' : '',
          resendApiKey: updatedRaw.resendApiKey ? `${String(updatedRaw.resendApiKey).slice(0, 5)}…` : '',
          source: 'environment',
        },
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to update email policy' });
    }
  });

  router.get('/email', requireAdmin, async (_req, res) => {
    try {
      const raw = getRawSmtpConfigForAdmin();
      const client = getSupabaseAdmin();
      let policy = {
        emailRegisterEnabled: true,
        emailAccountCreateEnabled: true,
        emailAccountDeleteEnabled: false,
        allowCreateWithoutOtp: false,
        emailShowOtpFallback: Boolean(raw.showOtpInForm),
      };
      let logs: any[] = [];
      let templates = parseEmailTemplatesJson('');
      if (client) {
        const { data: cfg } = await client
          .from('system_configs')
          .select(
            'email_register_enabled, email_account_create_enabled, email_account_delete_enabled, allow_create_without_otp, email_show_otp_fallback, smtp_show_otp, email_templates_json'
          )
          .eq('id', 'default')
          .maybeSingle();
        if (cfg) {
          policy = {
            emailRegisterEnabled: cfg.email_register_enabled ?? true,
            emailAccountCreateEnabled: cfg.email_account_create_enabled ?? true,
            emailAccountDeleteEnabled: cfg.email_account_delete_enabled ?? false,
            allowCreateWithoutOtp: cfg.allow_create_without_otp ?? false,
            emailShowOtpFallback: cfg.email_show_otp_fallback ?? cfg.smtp_show_otp ?? false,
          };
          templates = parseEmailTemplatesJson((cfg as any).email_templates_json || '');
        }
        const { data: logRows } = await client
          .from('email_dispatch_log')
          .select(
            'id, purpose, recipient_email, recipient_name, subject, provider, status, error_message, meta, created_at'
          )
          .order('created_at', { ascending: false })
          .limit(100);
        logs = logRows || [];
      }
      return res.json({
        success: true,
        data: {
          env: {
            source: 'environment',
            resendConfigured: Boolean(raw.resendApiKey || process.env.RESEND_API_KEY),
            resendApiKeyPreview: raw.resendApiKey
              ? `${String(raw.resendApiKey).slice(0, 5)}…`
              : process.env.RESEND_API_KEY
                ? `${String(process.env.RESEND_API_KEY).slice(0, 5)}…`
                : '',
            smtpConfigured: Boolean(raw.host && raw.user && raw.pass),
            smtpHost: raw.host || '',
            smtpPort: String(raw.port || ''),
            smtpUser: raw.user ? String(raw.user).replace(/(.{2})(.*)(@.*)/, '$1***$3') : '',
            smtpFrom: raw.from || '',
            smtpPassConfigured: Boolean(raw.pass),
            configured: Boolean(raw.configured),
            vercel: Boolean(process.env.VERCEL),
            message:
              'Email credentials are loaded from environment variables (RESEND_API_KEY / SMTP_*).',
          },
          policy,
          templates,
          defaults: DEFAULT_EMAIL_TEMPLATES,
          logs,
          configured: Boolean(raw.configured),
        },
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/email/templates', requireAdmin, async (req, res) => {
    try {
      const client = getSupabaseAdmin();
      if (!client) {
        return res.status(503).json({ success: false, error: 'Supabase not configured' });
      }
      const incoming = req.body?.templates || req.body || {};
      const templates = parseEmailTemplatesJson(JSON.stringify(incoming));
      const { error } = await client.from('system_configs').upsert(
        {
          id: 'default',
          email_templates_json: JSON.stringify(templates),
          updated_at: new Date().toISOString(),
        } as any,
        { onConflict: 'id' }
      );
      if (error) {
        return res.status(500).json({ success: false, error: error.message });
      }
      return res.json({
        success: true,
        data: { templates },
        message: 'Email templates saved. OTP and transactional emails will use these.',
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/email/settings', requireAdmin, async (req, res) => {
    try {
      const body = req.body || {};
      if (body.resendApiKey || body.pass || body.smtpPass) {
        return res.status(400).json({
          success: false,
          error: {
            message:
              'Email secrets cannot be saved from the Admin UI. Set them in Vercel / .env.',
            code: 'ENV_ONLY',
          },
        });
      }
      const client = getSupabaseAdmin();
      if (!client) {
        return res.status(503).json({ success: false, error: 'Supabase not configured' });
      }
      const payload = {
        id: 'default',
        email_register_enabled: Boolean(body.emailRegisterEnabled),
        email_account_create_enabled: Boolean(body.emailAccountCreateEnabled),
        email_account_delete_enabled: Boolean(body.emailAccountDeleteEnabled),
        allow_create_without_otp: Boolean(body.allowCreateWithoutOtp),
        email_show_otp_fallback: Boolean(body.emailShowOtpFallback),
        smtp_show_otp: Boolean(body.emailShowOtpFallback),
        updated_at: new Date().toISOString(),
      };
      if (typeof body.emailShowOtpFallback === 'boolean') {
        updateSmtpRuntimeConfig({ showOtpInForm: body.emailShowOtpFallback });
      }
      const { error } = await client.from('system_configs').upsert(payload as any, { onConflict: 'id' });
      if (error) throw new Error(error.message);
      return res.json({
        success: true,
        data: {
          policy: {
            emailRegisterEnabled: payload.email_register_enabled,
            emailAccountCreateEnabled: payload.email_account_create_enabled,
            emailAccountDeleteEnabled: payload.email_account_delete_enabled,
            allowCreateWithoutOtp: payload.allow_create_without_otp,
            emailShowOtpFallback: payload.email_show_otp_fallback,
          },
        },
        message: 'Email notification policy saved.',
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/email/test', requireAdmin, async (req, res) => {
    try {
      const { generateSixDigitOtp, sendOtpEmail, isSmtpConfigured } = await import('../emailService');
      if (!isSmtpConfigured()) {
        return res.status(502).json({
          success: true,
          data: {
            ok: false,
            message: 'Set RESEND_API_KEY or SMTP_* in environment variables first.',
          },
        });
      }
      const to = String(req.body?.to || '').trim().toLowerCase();
      if (!to || !to.includes('@')) {
        return res.json({
          success: true,
          data: {
            ok: true,
            message: 'Email provider env looks configured. Provide a recipient to send a live test.',
          },
        });
      }
      const otp = generateSixDigitOtp();
      const result = await sendOtpEmail({
        to,
        name: String(req.body?.name || 'Admin'),
        otpCode: otp,
      });
      return res.status(result.delivered ? 200 : 502).json({
        success: true,
        data: {
          ok: Boolean(result.delivered),
          delivered: result.delivered,
          message: result.message,
          recipient: to,
          provider: process.env.RESEND_API_KEY ? 'resend' : 'smtp',
        },
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/email/logs', requireAdmin, async (_req, res) => {
    try {
      const client = getSupabaseAdmin();
      if (!client) {
        return res.json({ success: true, data: { logs: [] } });
      }
      const { data, error } = await client
        .from('email_dispatch_log')
        .select(
          'id, purpose, recipient_email, recipient_name, subject, provider, status, error_message, meta, created_at'
        )
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw new Error(error.message);
      return res.json({ success: true, data: { logs: data || [] } });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Real-time Active Calls for Admin Surveillance
  router.get('/active-calls', requireAdmin, (req, res) => {
    res.json({
      success: true,
      activeCalls: getFormattedActiveCalls(),
      timestamp: Date.now(),
    });
  });

  // GET Infrastructure & Storage Parameters
  router.get('/infra-config', requireAdmin, (req, res) => {
    const mask = (v?: string) => (v ? '••••••••' : '');
    res.json({
      success: true,
      config: {
        supabaseUrl: infraConfig.supabaseUrl,
        supabaseAnonKey: mask(infraConfig.supabaseAnonKey),
        r2AccountId: infraConfig.r2AccountId,
        r2AccessKeyId: infraConfig.r2AccessKeyId ? `${String(infraConfig.r2AccessKeyId).slice(0, 4)}…` : '',
        r2SecretAccessKey: mask(infraConfig.r2SecretAccessKey),
        r2BucketName: infraConfig.r2BucketName,
        r2PublicUrl: infraConfig.r2PublicUrl,
        supabaseConfigured: Boolean(
          infraConfig.supabaseUrl &&
          !infraConfig.supabaseUrl.includes('placeholder') &&
          !infraConfig.supabaseUrl.includes('your-project-ref')
        ),
        r2Configured: isR2Configured(),
      },
    });
  });

  // POST Update Infrastructure & Performance Parameters
  router.post('/infra-config', requireAdmin, (req, res) => {
    try {
      const updates = req.body || {};
      Object.assign(infraConfig, updates);

      const nextUrl =
        updates.supabaseUrl !== undefined ? String(updates.supabaseUrl).trim() : undefined;
      const nextAnon =
        updates.supabaseAnonKey !== undefined &&
        !String(updates.supabaseAnonKey).startsWith('••••')
          ? String(updates.supabaseAnonKey).trim()
          : undefined;

      if (nextUrl !== undefined) {
        process.env.SUPABASE_URL = nextUrl;
        infraConfig.supabaseUrl = nextUrl;
      }
      if (nextAnon !== undefined) {
        process.env.SUPABASE_ANON_KEY = nextAnon;
        infraConfig.supabaseAnonKey = nextAnon;
      }
      if (updates.r2AccountId !== undefined) process.env.R2_ACCOUNT_ID = updates.r2AccountId;
      if (updates.r2AccessKeyId !== undefined) process.env.R2_ACCESS_KEY_ID = updates.r2AccessKeyId;
      if (
        updates.r2SecretAccessKey !== undefined &&
        !String(updates.r2SecretAccessKey).startsWith('••••')
      ) {
        process.env.R2_SECRET_ACCESS_KEY = updates.r2SecretAccessKey;
      }
      if (updates.r2BucketName !== undefined) process.env.R2_BUCKET_NAME = updates.r2BucketName;
      if (updates.r2PublicUrl !== undefined) process.env.R2_PUBLIC_URL = updates.r2PublicUrl;

      // Keep admin Supabase client pointed at the URL the admin just saved.
      // Service role key stays from env (never accept service_role from the browser).
      if (nextUrl !== undefined) {
        updateSupabaseRuntimeConfig(nextUrl, undefined);
      }

      // Dynamically update R2 active runtime config
      updateR2RuntimeConfig({
        accountId: infraConfig.r2AccountId,
        accessKeyId: infraConfig.r2AccessKeyId,
        secretAccessKey: infraConfig.r2SecretAccessKey,
        bucketName: infraConfig.r2BucketName,
        publicUrl: infraConfig.r2PublicUrl,
      });

      return res.json({
        success: true,
        message:
          'Infrastructure parameters updated for this server instance. On Vercel, also set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY in Project Settings → Environment Variables and redeploy for a permanent client build.',
        config: {
          r2Configured: isR2Configured(),
          supabaseConfigured: Boolean(infraConfig.supabaseUrl),
          vercel: Boolean(process.env.VERCEL),
        },
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to update infrastructure parameters' });
    }
  });

  router.get('/infra-status', requireAdmin, async (req, res) => {
    const profileId = String((req as any).profileId || (req as any).user?.id || '').trim();
    try {
      const data = await collectInfraStatus({ profileId });
      return res.json({ success: true, data });
    } catch (err: any) {
      console.error('[infra-status]', err?.message || err);
      return res.status(500).json({
        success: false,
        error: { message: 'Infra status probe failed', code: 'INFRA_STATUS_FAILED' },
      });
    }
  });

  router.post('/system-diagnostics', requireAdmin, async (req, res) => {
    const moduleId = String(req.body?.moduleId || '').trim();
    const profileId = String((req as any).profileId || (req as any).user?.id || '').trim();
    try {
      const result = await runServerDiagnostic(moduleId, {
        profileId,
        channel: req.body?.channel,
        nonce: req.body?.nonce,
        token: req.body?.token,
      });
      if (!result) {
        return res.status(400).json({
          success: false,
          error: {
            message: `Unknown diagnostic module. Known: ${listServerDiagnosticModules().join(', ')}`,
            code: 'UNKNOWN_MODULE',
          },
        });
      }
      return res.json({ success: true, data: result });
    } catch (err: any) {
      console.error('[system-diagnostics]', moduleId, err?.message || err);
      return res.status(500).json({
        success: false,
        error: { message: 'Diagnostic failed', code: 'DIAGNOSTIC_FAILED' },
      });
    }
  });

  router.post('/k6-smoke', requireAdmin, async (req, res) => {
    const scenarioId = String(req.body?.scenarioId || '').trim();
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '');
    const proto = String(req.headers['x-forwarded-proto'] || 'http');
    const authorization = String(req.headers.authorization || '');
    try {
      const result = await runK6Smoke(scenarioId, {
        authorization,
        concurrency: req.body?.concurrency,
        baseUrl: req.body?.baseUrl,
        host,
        proto,
      });
      if (!result) {
        return res.status(400).json({
          success: false,
          error: {
            message: `Unknown k6 smoke scenario. Known: ${listK6SmokeScenarios().join(', ')}`,
            code: 'UNKNOWN_SCENARIO',
          },
        });
      }
      return res.json({ success: true, data: result });
    } catch (err: any) {
      console.error('[k6-smoke]', scenarioId, err?.message || err);
      return res.status(500).json({
        success: false,
        error: { message: 'k6 smoke failed', code: 'K6_SMOKE_FAILED' },
      });
    }
  });

  return router;
}

export function createUsersAdminRouter(ctx: ServerRuntime): Router {
  const router = Router();
  const {
    serverUsers,
    presenceMap,
    normalizeUserProfile,
    getFormattedUsers,
    broadcastAll,
    broadcastPresence,
    broadcastUsers,
    purgeUserRuntimeState,
    isUserHardDeleted,
  } = ctx;

  /**
   * Self-delete account (non-admin only). Target always from JWT/session profileId.
   */
  router.post('/me/delete', requireAuth, async (req, res) => {
    try {
      const profile = (req as any).profile;
      const profileId = String((req as any).profileId || profile?.id || '').trim();
      const role = String(profile?.role || '').toLowerCase();

      if (!profileId) {
        return res.status(401).json({
          success: false,
          error: { message: 'Not authenticated', code: 'UNAUTHORIZED' },
        });
      }
      if (role === 'admin') {
        return res.status(403).json({
          success: false,
          error: { message: 'Admin accounts cannot be self-deleted.', code: 'ADMIN_DELETE_FORBIDDEN' },
        });
      }

      const confirmPhrase = String(req.body?.confirmPhrase || req.body?.confirmation || '')
        .trim()
        .toUpperCase();
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      const email = String(profile?.email || '').trim().toLowerCase();

      if (confirmPhrase !== 'DELETE' && confirmPhrase !== email.toUpperCase()) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Type DELETE (or your email) to confirm permanent account deletion.',
            code: 'CONFIRMATION_REQUIRED',
          },
        });
      }

      if (!password || password.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: { message: 'Password is required to delete your account.', code: 'PASSWORD_REQUIRED' },
        });
      }

      if (!email) {
        return res.status(400).json({
          success: false,
          error: { message: 'Account email is missing; cannot verify password.', code: 'EMAIL_REQUIRED' },
        });
      }

      const authCheck = await authenticateUserWithPasswordAdmin(email, password);
      if (!authCheck.success) {
        return res.status(401).json({
          success: false,
          error: {
            message: authCheck.error || 'Password verification failed.',
            code: 'PASSWORD_INVALID',
          },
        });
      }

      if (!isSupabaseAdminConfigured()) {
        return res.status(503).json({
          success: false,
          error: { message: 'Account deletion is temporarily unavailable.', code: 'SUPABASE_NOT_CONFIGURED' },
        });
      }

      const hard = await hardDeleteUserCompletely(profileId);
      if (!hard.success || !hard.profileDeleted || !hard.authDeleted) {
        return res.status(500).json({
          success: false,
          error: {
            message:
              hard.error ||
              'Could not fully delete your account (Auth or profile). Please contact support.',
            code: 'DELETE_INCOMPLETE',
          },
          data: {
            authDeleted: hard.authDeleted,
            profileDeleted: hard.profileDeleted,
            warnings: hard.warnings,
          },
        });
      }

      purgeUserRuntimeState(profileId);
      if (hard.userId && hard.userId !== profileId) {
        purgeUserRuntimeState(hard.userId);
      }

      broadcastAll({
        type: 'users:deleted',
        userId: profileId,
        users: getFormattedUsers(),
      });
      broadcastPresence();
      broadcastUsers();

      return res.json({
        success: true,
        message: 'Your account has been permanently deleted.',
        data: {
          userId: hard.userId,
          authDeleted: hard.authDeleted,
          profileDeleted: hard.profileDeleted,
          r2DeletedCount: hard.r2DeletedCount,
        },
      });
    } catch (err: any) {
      console.error('Error in POST /api/users/me/delete:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Server-side Bulk Users Sync Endpoint
  router.post('/sync-all', requireAdmin, async (req, res) => {
    try {
      const { users: incomingUsers, overwrite } = req.body || {};
      if (Array.isArray(incomingUsers)) {
        if (overwrite) {
          serverUsers.clear();
        }
        for (const u of incomingUsers) {
          if (u && u.id && !isUserHardDeleted(u.id)) {
            serverUsers.set(u.id, normalizeUserProfile(u));
          }
        }
        broadcastUsers();
        return res.json({ success: true, count: serverUsers.size });
      }
      return res.status(400).json({ success: false, error: 'Invalid users array' });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  router.delete('/:id', requireAdmin, async (req, res) => {
    try {
      const userId = req.params.id;
      if (!userId) {
        return res.status(400).json({ success: false, error: 'User ID is required' });
      }

      const existing = serverUsers.get(userId);
      if (existing?.role === 'admin') {
        return res.status(403).json({
          success: false,
          error: 'Admin accounts cannot be deleted.',
          data: { authDeleted: false, profileDeleted: false },
        });
      }

      const userName = existing?.name || userId;

      let deleteResult = {
        userId: String(userId),
        authDeleted: false,
        profileDeleted: false,
        r2DeletedCount: 0,
        warnings: [] as string[],
      };

      if (isSupabaseAdminConfigured()) {
        const hard = await hardDeleteUserCompletely(String(userId));
        deleteResult = {
          userId: hard.userId,
          authDeleted: hard.authDeleted,
          profileDeleted: hard.profileDeleted,
          r2DeletedCount: hard.r2DeletedCount,
          warnings: hard.warnings,
        };
        if (!hard.success || !hard.profileDeleted || !hard.authDeleted) {
          return res.status(500).json({
            success: false,
            error:
              hard.error ||
              (!hard.authDeleted
                ? 'Auth user was not deleted — account may still be able to sign in. Retry delete.'
                : 'Failed to delete profile'),
            data: deleteResult,
          });
        }
      } else {
        return res.status(503).json({
          success: false,
          error: 'Supabase admin is not configured; cannot safely delete Auth + profile.',
          data: deleteResult,
        });
      }

      purgeUserRuntimeState(String(userId));
      if (deleteResult.userId && deleteResult.userId !== String(userId)) {
        purgeUserRuntimeState(String(deleteResult.userId));
      }

      broadcastAll({
        type: 'users:deleted',
        userId,
        users: getFormattedUsers(),
      });
      broadcastPresence();
      broadcastUsers();

      return res.json({
        success: true,
        message: `User ${userName} (${userId}) was permanently deleted from database and system.`,
        data: deleteResult,
      });
    } catch (err: any) {
      console.error('Error in DELETE /api/users/:id:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
