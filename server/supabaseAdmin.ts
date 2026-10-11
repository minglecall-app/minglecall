import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { purgeR2MediaUploads, clearLocalMediaCache } from './r2Storage';
import { VIRTUAL_GIFTS } from '../src/constants/appDefaults';

dotenv.config();

const AUTH_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DEFAULT_R2_PURGE_PREFIXES = [
  'uploads/avatar/',
  'uploads/gallery/',
  'uploads/gallery_video/',
  'uploads/chat_media/',
  'uploads/moment/',
  'uploads/verification/',
  'uploads/intro_video/',
  'uploads/media/',
];

/** Fallback when profiles.gallery_videos column is not migrated yet (Vercel + local Express). */
export const GALLERY_VIDEOS_SENTINEL_PREFIX = '__mc_gv1__:';

export function encodeGalleryVideosSentinel(videos: unknown): string {
  return `${GALLERY_VIDEOS_SENTINEL_PREFIX}${JSON.stringify(Array.isArray(videos) ? videos : [])}`;
}

export function splitGalleryPhotosAndVideos(gallery: unknown): {
  photos: string[];
  videos: any[] | null;
} {
  const photos: string[] = [];
  let videos: any[] | null = null;
  if (!Array.isArray(gallery)) return { photos, videos };
  for (const item of gallery) {
    const s = String(item || '');
    if (s.startsWith(GALLERY_VIDEOS_SENTINEL_PREFIX)) {
      try {
        const parsed = JSON.parse(s.slice(GALLERY_VIDEOS_SENTINEL_PREFIX.length));
        videos = Array.isArray(parsed) ? parsed : [];
      } catch {
        videos = [];
      }
    } else if (s) {
      photos.push(s);
    }
  }
  return { photos, videos };
}

export function mergeGalleryWithVideoSentinel(photos: unknown, videos: unknown): string[] {
  const cleanPhotos = (Array.isArray(photos) ? photos : [])
    .map((u) => String(u || ''))
    .filter((u) => u && !u.startsWith(GALLERY_VIDEOS_SENTINEL_PREFIX));
  return [...cleanPhotos, encodeGalleryVideosSentinel(videos || [])];
}

function isMissingGalleryVideosColumnError(err: unknown): boolean {
  const msg = String((err as any)?.message || err || '');
  return /gallery_videos/i.test(msg) && (/column/i.test(msg) || /schema cache/i.test(msg));
}

let supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
// Never fall back to anon/public key — that would silently lose service-role privileges
// and break RLS-bypass admin mutations (or worse, look "configured" while failing writes).
let supabaseServiceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

let supabaseAdmin: SupabaseClient | null = null;

export function updateSupabaseRuntimeConfig(url?: string, key?: string) {
  if (url !== undefined) {
    supabaseUrl = String(url).trim();
    process.env.VITE_SUPABASE_URL = supabaseUrl;
  }
  if (key !== undefined) {
    supabaseServiceKey = String(key).trim();
    process.env.SUPABASE_SERVICE_ROLE_KEY = supabaseServiceKey;
  }
  // Re-create client on next getSupabaseAdmin call
  supabaseAdmin = null;
  if (isSupabaseAdminConfigured()) {
    getSupabaseAdmin();
  }
}

function decodeJwtRole(token: string): string | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    return typeof payload?.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

export function isSupabaseAdminConfigured(): boolean {
  return Boolean(
    supabaseUrl &&
    supabaseServiceKey &&
    !supabaseUrl.includes('placeholder-project') &&
    !supabaseUrl.includes('your-project-ref')
  );
}

/** True only when the server key is a service_role JWT (anon keys cannot bypass RLS). */
export function isSupabaseServiceRoleConfigured(): boolean {
  return isSupabaseAdminConfigured() && decodeJwtRole(supabaseServiceKey) === 'service_role';
}

export function getSupabaseAdmin(): SupabaseClient | null {
  if (!isSupabaseAdminConfigured()) return null;
  // Prefer service_role; warn loudly if a non-service JWT was configured
  if (!isSupabaseServiceRoleConfigured()) {
    console.error(
      '[supabaseAdmin] SUPABASE_SERVICE_ROLE_KEY is missing or not a service_role JWT. Admin mutations will fail under RLS.'
    );
  }
  if (!supabaseAdmin) {
    try {
      // PostgREST HTTPS client (server-pooled). Raw SQL must use DATABASE_URL on :6543.
      supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
        db: { schema: 'public' },
        global: { headers: { 'X-Client-Info': 'minglecall-express-admin' } },
      });
      console.log('[Supabase Admin] Initialized server-side Supabase client connected to:', supabaseUrl);
    } catch (err) {
      console.error('[Supabase Admin] Failed to initialize Supabase client:', err);
    }
  }
  return supabaseAdmin;
}

export async function testSupabaseConnectivity(testUrl?: string, testKey?: string): Promise<{ success: boolean; message: string; tableCount?: number }> {
  const url = (testUrl || supabaseUrl || '').trim();
  const key = (testKey || supabaseServiceKey || '').trim();

  if (!url || !key || url.includes('your-project-ref')) {
    return { success: false, message: 'Supabase URL and Service Key are required.' };
  }

  try {
    const client = createClient(url, key, {
      auth: { persistSession: false },
    });

    const { data, error, count } = await client
      .from('profiles')
      .select('id', { count: 'exact', head: true });

    if (error) {
      // If table does not exist, connection is valid but schema migration needed
      if (error.code === '42P01' || error.message.includes('relation "public.profiles" does not exist')) {
        return {
          success: true,
          message: 'Supabase PostgreSQL connected successfully! (Tables not yet migrated; auto-schema ready).',
          tableCount: 0,
        };
      }
      return { success: false, message: `Database error: ${error.message}` };
    }

    return {
      success: true,
      message: `Supabase PostgreSQL connected and authenticated! (${count ?? 0} profiles found in database).`,
      tableCount: count ?? 0,
    };
  } catch (err: any) {
    return { success: false, message: `Connection failed: ${err.message || 'Unknown network error'}` };
  }
}

/**
 * Securely hashes a plain-text password using bcrypt with random 10-round salt
 */
export async function hashPassword(plainText: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plainText, salt);
}

/**
 * Securely compares a candidate password against a bcrypt hash only.
 * Plain-text equality is never accepted (prevents weak / non-hash storage bypasses).
 */
export async function comparePassword(plainText: string, hashedOrPlain: string): Promise<boolean> {
  if (typeof plainText !== 'string' || typeof hashedOrPlain !== 'string') return false;
  if (!hashedOrPlain || !plainText) return false;
  // Reject accidental whitespace-only or padded candidates used to probe auth
  if (plainText.trim().length === 0) return false;
  if (!(hashedOrPlain.startsWith('$2a$') || hashedOrPlain.startsWith('$2b$') || hashedOrPlain.startsWith('$2y$'))) {
    return false;
  }
  try {
    return await bcrypt.compare(plainText, hashedOrPlain);
  } catch {
    return false;
  }
}

export function ensureValidUuid(id: string): string {
  if (id && String(id).trim().length > 0) {
    return String(id).trim();
  }
  // Generate valid UUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function isWritableAuthUuid(id: unknown): id is string {
  if (typeof id !== 'string' || !AUTH_UUID_RE.test(id)) return false;
  return !id.startsWith('user_') && !id.startsWith('admin_');
}

/**
 * Resolve a candidate auth_id for writes. Prefer explicit authId/auth_id, else profile id.
 * Does not verify auth.users — callers should verify or rely on FK omit/retry.
 */
export function resolveAuthIdCandidate(profile: {
  id?: string;
  authId?: string | null;
  auth_id?: string | null;
}): string | undefined {
  if (isWritableAuthUuid(profile.authId)) return profile.authId;
  if (isWritableAuthUuid(profile.auth_id)) return profile.auth_id;
  if (isWritableAuthUuid(profile.id)) return profile.id;
  return undefined;
}

/** Confirm candidate exists in auth.users before writing (FK-safe). */
async function authUserExistsAdmin(
  client: SupabaseClient,
  authUserId: string
): Promise<boolean> {
  try {
    const { data, error } = await client.auth.admin.getUserById(authUserId);
    return !error && Boolean(data?.user?.id);
  } catch {
    return false;
  }
}

/**
 * Link profiles.auth_id to a real auth.users id (by profile id and/or email).
 * Does not rewrite profiles.id. Safe no-op if auth user missing.
 */
export async function linkProfileAuthIdAdmin(opts: {
  authUserId: string;
  profileId?: string | null;
  email?: string | null;
}): Promise<{ success: boolean; linked: boolean; error?: string }> {
  const client = getSupabaseAdmin();
  if (!client) {
    return { success: false, linked: false, error: 'Supabase not configured' };
  }

  const authUserId = String(opts.authUserId || '').trim();
  if (!isWritableAuthUuid(authUserId)) {
    return { success: false, linked: false, error: 'Invalid auth user id' };
  }

  const exists = await authUserExistsAdmin(client, authUserId);
  if (!exists) {
    return { success: false, linked: false, error: 'Auth user does not exist' };
  }

  const payload = {
    auth_id: authUserId,
    updated_at: new Date().toISOString(),
  };
  const profileId = opts.profileId ? String(opts.profileId).trim() : '';
  const cleanEmail = opts.email ? String(opts.email).toLowerCase().trim() : '';

  try {
    if (profileId) {
      const { data, error } = await client
        .from('profiles')
        .update(payload as any)
        .eq('id', profileId)
        .select('id')
        .maybeSingle();
      if (!error && data?.id) {
        return { success: true, linked: true };
      }
    }

    if (cleanEmail) {
      const { data, error } = await client
        .from('profiles')
        .update(payload as any)
        .ilike('email', cleanEmail)
        .select('id')
        .maybeSingle();
      if (!error && data?.id) {
        return { success: true, linked: true };
      }
      if (error) {
        return { success: false, linked: false, error: error.message };
      }
    }

    return { success: true, linked: false, error: 'No matching profile to link' };
  } catch (err: any) {
    return { success: false, linked: false, error: err?.message || 'link failed' };
  }
}

/**
 * Server-side profile upsert that bypasses RLS using Service Role Key or direct server client
 * Automatically hashes any plain-text password with bcrypt and ensures raw passwords are NEVER stored.
 */
export async function upsertProfileAdmin(profile: any): Promise<{ success: boolean; data?: any; error?: string }> {
  const client = getSupabaseAdmin();
  if (!client) {
    return { success: false, error: 'Supabase URL or Key not configured on server' };
  }

  try {
    let validId = profile.id || ensureValidUuid('');
    
    // Check if password needs bcrypt hashing
    let passwordHash: string | null = null;
    let hasPassword = Boolean(profile.hasPasswordSet);

    if (profile.password_hash) {
      passwordHash = profile.password_hash;
      hasPassword = true;
    } else if (profile.password) {
      if (profile.password.startsWith('$2a$') || profile.password.startsWith('$2b$')) {
        passwordHash = profile.password;
      } else {
        passwordHash = await hashPassword(profile.password);
      }
      hasPassword = true;
    }

    // Check if a profile with this email already exists in Supabase to reuse its ID & preserve existing password_hash
    let existingAuthId: string | null = null;
    if (profile.email) {
      const cleanEmail = String(profile.email).toLowerCase().trim();
      try {
        const { data: existingUser } = await client
          .from('profiles')
          .select('id, password_hash, has_password_set, auth_id')
          .eq('email', cleanEmail)
          .limit(1)
          .maybeSingle();

        if (existingUser && existingUser.id) {
          console.log(`[Supabase Admin] Reusing existing profile ID ${existingUser.id} for email ${cleanEmail}`);
          validId = existingUser.id;
          existingAuthId = existingUser.auth_id || null;
          if (!passwordHash && existingUser.password_hash) {
            passwordHash = existingUser.password_hash;
            hasPassword = true;
          }
        }
      } catch (err) {
        // Continue if query fails
      }
    }

    if (!existingAuthId && validId) {
      try {
        const { data: byId } = await client
          .from('profiles')
          .select('auth_id')
          .eq('id', validId)
          .maybeSingle();
        if (byId?.auth_id) existingAuthId = byId.auth_id;
      } catch {
        // continue
      }
    }

    // Prefer explicit / candidate auth_id only when it exists in auth.users.
    // NEVER write auth_id: null — omit so upsert preserves existing linkage.
    let authIdForDb: string | undefined;
    const candidate = resolveAuthIdCandidate({ ...profile, id: validId });
    if (candidate) {
      if (await authUserExistsAdmin(client, candidate)) {
        authIdForDb = candidate;
      } else if (existingAuthId && isWritableAuthUuid(existingAuthId)) {
        // Incoming candidate invalid; keep existing DB value by omitting (or re-assert existing)
        authIdForDb = undefined;
      }
    }

    // Core standardized profile record (Raw password completely stripped!)
    const payload: Record<string, any> = {
      id: validId,
      name: profile.name || 'New Member',
      email: profile.email || null,
      phone: profile.phone || null,
      gender: profile.gender || 'male',
      gender_locked: profile.genderLocked ?? true,
      age: Number(profile.age) || 24,
      nationality: profile.nationality || 'United States',
      country_code: (profile.countryCode || profile.country_code || 'US').toUpperCase(),
      bio: profile.bio || '',
      extended_bio: profile.extendedBio || profile.extended_bio || null,
      location_city: profile.locationCity || profile.location_city || null,
      zodiac: profile.zodiac || null,
      interests: Array.isArray(profile.interests) ? profile.interests : [],
      interested_in: Array.isArray(profile.interestedIn) ? profile.interestedIn : [],
      tags: Array.isArray(profile.tags) ? profile.tags : [],
      spoken_languages: Array.isArray(profile.spokenLanguages) ? profile.spokenLanguages : ['English'],
      avatar_url: profile.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=400',
      gallery: (() => {
        const split = splitGalleryPhotosAndVideos(
          Array.isArray(profile.gallery) ? profile.gallery : []
        );
        const videos = Array.isArray(profile.galleryVideos)
          ? profile.galleryVideos
          : split.videos;
        // Always keep sentinel when we know about videos (incl. from existing gallery).
        if (Array.isArray(videos)) {
          return mergeGalleryWithVideoSentinel(split.photos, videos);
        }
        return split.photos;
      })(),
      // Omit from upsert when undefined so missing-column DBs don't fail before prune.
      ...(Array.isArray(profile.galleryVideos)
        ? { gallery_videos: profile.galleryVideos }
        : {}),
      intro_video_url: profile.introVideoUrl || null,
      verification_video_url: profile.verificationVideoUrl || null,
      is_verified: Boolean(profile.isVerified),
      is_onboarded: profile.isOnboarded !== undefined ? Boolean(profile.isOnboarded) : true,
      agreed_to_terms: profile.agreedToTerms !== undefined ? Boolean(profile.agreedToTerms) : true,
      agreed_to_adult_terms: Boolean(profile.agreedToAdultTerms),
      agreed_to_host_terms: Boolean(profile.agreedToHostTerms),
      kyc_status: profile.kycStatus || 'unsubmitted',
      online_status: profile.onlineStatus || 'online',
      role: profile.role || 'male_user',
      coin_balance: Number(profile.coinBalance) || 0,
      hourly_coin_rate: Number(profile.hourlyCoinRate) || 0,
      earnings_coins: Number(profile.earningsCoins) || 0,
      total_lifetime_earned_usd: Number(profile.totalLifetimeEarnedUSD) || 0,
      is_banned: Boolean(profile.isBanned ?? profile.is_banned),
      ban_reason: profile.banReason || profile.ban_reason || null,
      banned_until: profile.bannedUntil || profile.banned_until || null,
      banned_by_id: profile.bannedById || profile.banned_by_id || null,
      banned_by_role: profile.bannedByRole || profile.banned_by_role || null,
      team_leader_id: profile.teamLeaderId || profile.createdById || profile.team_leader_id || profile.created_by_id || null,
      created_by_id: profile.createdById || profile.teamLeaderId || profile.created_by_id || profile.team_leader_id || null,
      agency_name: profile.agencyName || profile.agency_name || null,
      coin_earn_override_rate: profile.coinEarnOverrideRate !== undefined && profile.coinEarnOverrideRate !== null ? Number(profile.coinEarnOverrideRate) : (profile.coin_earn_override_rate !== undefined && profile.coin_earn_override_rate !== null ? Number(profile.coin_earn_override_rate) : null),
      commission_percent: profile.commissionPercent !== undefined && profile.commissionPercent !== null ? Number(profile.commissionPercent) : (profile.commission_percent !== undefined && profile.commission_percent !== null ? Number(profile.commission_percent) : null),
      team_leader_note: profile.teamLeaderNote || profile.team_leader_note || null,
      has_password_set: hasPassword,
    };
    if (authIdForDb) {
      payload.auth_id = authIdForDb;
    }
    // Only write password_hash when explicitly provided — never null-out an existing hash
    if (passwordHash) {
      payload.password_hash = passwordHash;
      payload.has_password_set = true;
    }

    console.log(`[Supabase Admin] Upserting profile for user ${payload.name} (${validId}) into Supabase...`);

    let currentPayload = { ...payload };

    let lastError: string | null = null;
    let maxRetries = 10;

    while (maxRetries > 0) {
      const { data, error } = await client
        .from('profiles')
        .upsert(currentPayload, { onConflict: 'id' })
        .select()
        .single();

      if (!error) {
        console.log(`[Supabase Admin] Profile successfully saved to Supabase (${payload.name})!`);
        return { success: true, data };
      }

      lastError = error.message;
      console.warn(`[Supabase Admin] Upsert attempt failed (${maxRetries} retries left):`, error.message);

      // Check if error is due to email unique constraint violation
      if (
        error.message.includes('unique constraint') ||
        error.message.includes('profiles_email_key') ||
        error.message.includes('duplicate key')
      ) {
        console.log(`[Supabase Admin] Duplicate email constraint detected (${currentPayload.email}). Resolving...`);
        if (currentPayload.email) {
          try {
            const { data: existingUser } = await client
              .from('profiles')
              .select('id')
              .eq('email', currentPayload.email)
              .limit(1)
              .maybeSingle();

            if (existingUser && existingUser.id) {
              currentPayload.id = existingUser.id;
              // Never clobber auth_id with null on email-recovery update
              if (currentPayload.auth_id == null) {
                delete currentPayload.auth_id;
              }
              const updateRes = await client
                .from('profiles')
                .update(currentPayload)
                .eq('id', existingUser.id)
                .select()
                .maybeSingle();

              if (!updateRes.error && updateRes.data) {
                console.log(`[Supabase Admin] Profile updated via email match (${existingUser.id})!`);
                return { success: true, data: updateRes.data };
              }
            }
          } catch (e: any) {
            console.warn('[Supabase Admin] Email recovery exception:', e.message);
          }
          // If still failing, strip email from this upsert attempt
          delete currentPayload.email;
        }
        maxRetries--;
        continue;
      }

      // Check if error is due to auth_id foreign key constraint violation
      if (
        error.message.includes('foreign key constraint') ||
        error.message.includes('auth_id_fkey') ||
        error.message.includes('profiles_auth_id_fkey')
      ) {
        console.log('[Supabase Admin] Omitting invalid auth_id to resolve foreign key constraint and retrying...');
        // Omit field — do NOT set null (would clear a valid existing auth_id)
        delete currentPayload.auth_id;
        maxRetries--;
        continue;
      }

      // Check if the error is due to a missing column in the user's remote table schema cache
      const colMatch =
        error.message.match(/Could not find the '([^']+)' column/i) ||
        error.message.match(/column ["']?([a-zA-Z0-9_]+)["']? of/i) ||
        error.message.match(/column ["']?([a-zA-Z0-9_]+)["']? does not exist/i);

      if (colMatch && colMatch[1]) {
        const missingCol = colMatch[1];
        console.log(`[Supabase Admin] Pruning missing column '${missingCol}' from payload and retrying...`);
        delete currentPayload[missingCol];
        maxRetries--;
        continue;
      }

      // If not a specific column regex match, try falling back to bare minimum fields
      if (maxRetries > 1) {
        console.log('[Supabase Admin] Retrying with core essential fields only...');
        currentPayload = {
          id: validId,
          name: payload.name,
          gender: payload.gender,
          role: payload.role,
          nationality: payload.nationality,
          country_code: payload.country_code,
          location_city: payload.location_city,
          bio: payload.bio,
          coin_balance: payload.coin_balance,
          avatar_url: payload.avatar_url,
          online_status: payload.online_status,
        };
        if (payload.auth_id) {
          currentPayload.auth_id = payload.auth_id;
        }
        maxRetries = 1;
        continue;
      }

      break;
    }

    console.error('[Supabase Admin] All upsert retries failed:', lastError);
    return { success: false, error: lastError || 'Unknown Supabase error' };
  } catch (err: any) {
    console.error('[Supabase Admin] Upsert profile exception:', err);
    return { success: false, error: err.message || 'Supabase exception' };
  }
}

/**
 * Bulk upsert profiles in Supabase server-side with automatic error handling & fallback
 */
export async function bulkUpsertProfilesAdmin(profiles: any[]): Promise<{ success: boolean; count: number; error?: string }> {
  if (!profiles || profiles.length === 0) {
    return { success: true, count: 0 };
  }

  let successCount = 0;
  let lastError: string | undefined;

  for (const p of profiles) {
    const res = await upsertProfileAdmin(p);
    if (res.success) {
      successCount++;
    } else {
      lastError = res.error;
    }
  }

  if (successCount > 0) {
    return { success: true, count: successCount };
  }

  return { success: false, count: 0, error: lastError || 'Failed to sync profiles' };
}

/**
 * Fetch all profiles from Supabase server-side
 */
export async function fetchProfilesAdmin(opts?: {
  cursor?: string | null;
  limit?: number;
}): Promise<{ success: boolean; profiles?: any[]; nextCursor?: string | null; error?: string }> {
  const client = getSupabaseAdmin();
  if (!client) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    const pageSize = 50;
    const singlePage = opts?.cursor !== undefined || opts?.limit !== undefined;

    if (singlePage) {
      let limit = Number(opts?.limit) || pageSize;
      if (!Number.isFinite(limit) || limit <= 0) limit = pageSize;
      limit = Math.min(Math.floor(limit), pageSize);

      let q = client
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (opts?.cursor) {
        q = q.lt('created_at', opts.cursor);
      }

      const { data, error } = await q;
      if (error) {
        return { success: false, error: error.message };
      }
      const profiles = data || [];
      const nextCursor =
        profiles.length === limit ? profiles[profiles.length - 1]?.created_at || null : null;
      return { success: true, profiles, nextCursor };
    }

    // Legacy callers: walk cursor pages (never one unbounded select *)
    const all: any[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 40; page++) {
      let q = client
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(pageSize);
      if (cursor) q = q.lt('created_at', cursor);
      const { data, error } = await q;
      if (error) {
        return { success: false, error: error.message };
      }
      const batch = data || [];
      all.push(...batch);
      if (batch.length < pageSize) break;
      cursor = batch[batch.length - 1]?.created_at || null;
      if (!cursor) break;
    }
    return { success: true, profiles: all, nextCursor: null };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Check if a profile is currently suspended/banned with expiration support
 */
export function isProfileBanned(profile: any): { isBanned: boolean; message?: string; bannedUntil?: string } {
  if (!profile || (!profile.is_banned && !profile.isBanned)) {
    return { isBanned: false };
  }

  const bannedUntil = profile.banned_until || profile.bannedUntil;
  if (bannedUntil) {
    const expiryTime = new Date(bannedUntil).getTime();
    if (Date.now() > expiryTime) {
      // Ban has expired! Return unbanned
      return { isBanned: false };
    }

    const expiryDateStr = new Date(bannedUntil).toLocaleString();
    const reason = profile.ban_reason || profile.banReason || 'Host rule or agency violation';
    const banner = (profile.banned_by_role || profile.bannedByRole) === 'team_leader' ? 'your Team Leader' : 'Administration';
    return {
      isBanned: true,
      bannedUntil,
      message: `Your account has been suspended by ${banner} until ${expiryDateStr}.\nReason: "${reason}".\nPlease contact your agency management.`,
    };
  }

  const reason = profile.ban_reason || profile.banReason || 'Administrative suspension';
  return {
    isBanned: true,
    message: `Your account has been permanently suspended.\nReason: "${reason}".\nPlease contact support.`,
  };
}

/**
 * Delete profile from Supabase server-side (DB, Auth, R2 media).
 * Prefer hardDeleteUserCompletely for structured results; this wrapper remains for callers.
 */
export async function deleteProfileAdmin(userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { hardDeleteUserCompletely } = await import('./userHardDelete');
    const result = await hardDeleteUserCompletely(userId);
    if (!result.success) {
      return { success: false, error: result.error || result.warnings.join('; ') || 'Hard delete failed' };
    }
    if (result.warnings.length) {
      console.warn('[Supabase Admin] Hard delete warnings:', result.warnings);
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Update or create user password in Supabase Auth & profiles table server-side
 * Hashes password using bcrypt before persisting.
 * Always links profiles.auth_id to the Auth user id when Auth create/update succeeds.
 * Always passes role + gender in Auth user_metadata (TL/agency_manager → gender female).
 */
export async function updateUserPasswordAdmin(
  userId: string,
  newPassword: string,
  email?: string,
  meta?: { role?: string; gender?: string; name?: string }
): Promise<{ success: boolean; authUserId?: string; error?: string }> {
  const client = getSupabaseAdmin();
  if (!client) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    const passwordHash = await hashPassword(newPassword);
    const cleanEmail = email ? email.toLowerCase().trim() : null;

    // 1. Update password_hash in profiles table
    if (userId) {
      await client
        .from('profiles')
        .update({
          password_hash: passwordHash,
          has_password_set: true,
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', userId);
    } else if (cleanEmail) {
      await client
        .from('profiles')
        .update({
          password_hash: passwordHash,
          has_password_set: true,
          updated_at: new Date().toISOString(),
        } as any)
        .eq('email', cleanEmail);
    }

    // 2. Also sync to Supabase Auth so native Supabase tokens and client sessions work
    let authUpdated = false;
    let resolvedAuthUserId: string | undefined;

    const metaRole = String(meta?.role || '').trim() || 'male_user';
    const isTeamLeaderRole = metaRole === 'team_leader' || metaRole === 'agency_manager';
    const metaGender = isTeamLeaderRole
      ? 'female'
      : String(meta?.gender || '').trim() || 'male';

    const userMetadata: Record<string, any> = {
      id: userId,
      role: metaRole,
      gender: metaGender,
    };
    if (meta?.name) {
      userMetadata.name = meta.name;
      userMetadata.full_name = meta.name;
    }

    if (userId && AUTH_UUID_RE.test(userId)) {
      try {
        const { data, error } = await client.auth.admin.updateUserById(userId, {
          password: newPassword,
          email_confirm: true,
          user_metadata: userMetadata,
        });
        if (!error && data?.user) {
          authUpdated = true;
          resolvedAuthUserId = data.user.id;
          console.log(`[Supabase Admin] Updated password & confirmed email for auth user ID ${userId}`);
        }
      } catch (e: any) {
        console.warn(`[Supabase Admin] Auth updateUserById notice:`, e.message);
      }
    }

    if (!authUpdated && cleanEmail) {
      try {
        const { data: userList, error: listErr } = await client.auth.admin.listUsers({
          perPage: 1000,
        });
        if (!listErr && userList?.users) {
          const matched = (userList.users as any[]).find(
            (u: any) => u.email?.toLowerCase().trim() === cleanEmail
          );
          if (matched) {
            const { error: updErr } = await client.auth.admin.updateUserById(matched.id, {
              password: newPassword,
              email_confirm: true,
              user_metadata: userMetadata,
            });
            if (!updErr) {
              authUpdated = true;
              resolvedAuthUserId = matched.id;
              console.log(`[Supabase Admin] Updated password & confirmed email for auth user matching email ${cleanEmail}`);
            }
          } else {
            // User does not exist in Supabase Auth yet; create auth record with confirmed email
            const { data: createdAuth, error: createErr } = await client.auth.admin.createUser({
              email: cleanEmail,
              password: newPassword,
              email_confirm: true,
              user_metadata: userMetadata,
            });
            if (!createErr && createdAuth?.user) {
              authUpdated = true;
              resolvedAuthUserId = createdAuth.user.id;
              console.log(`[Supabase Admin] Created auth record in Supabase Auth for email ${cleanEmail}`);
            } else if (createErr) {
              console.warn(`[Supabase Admin] Create auth user notice:`, createErr.message);
            }
          }
        }
      } catch (e: any) {
        console.warn(`[Supabase Admin] Auth email lookup updateUser notice:`, e.message);
      }
    }

    // 3. Always link profiles.auth_id after Auth create/update (id may differ from auth user id for TL hosts)
    if (resolvedAuthUserId) {
      const linkRes = await linkProfileAuthIdAdmin({
        authUserId: resolvedAuthUserId,
        profileId: userId || undefined,
        email: cleanEmail || undefined,
      });
      if (linkRes.linked) {
        console.log(
          `[Supabase Admin] Linked profiles.auth_id=${resolvedAuthUserId} (profileId=${userId || 'n/a'}, email=${cleanEmail || 'n/a'})`
        );
      } else if (linkRes.error) {
        console.warn(`[Supabase Admin] auth_id link notice:`, linkRes.error);
      }
    }

    // 4. Re-assert privileged role/gender on the linked profile (Auth trigger must not leave male_user)
    if (isTeamLeaderRole || metaRole === 'admin') {
      const assertPayload: Record<string, any> = {
        role: metaRole,
        updated_at: new Date().toISOString(),
      };
      if (isTeamLeaderRole) {
        assertPayload.gender = 'female';
        assertPayload.gender_locked = true;
      } else if (meta?.gender) {
        assertPayload.gender = metaGender;
      }
      try {
        if (userId) {
          await client.from('profiles').update(assertPayload as any).eq('id', userId);
        }
        if (cleanEmail) {
          await client.from('profiles').update(assertPayload as any).ilike('email', cleanEmail);
        }
        if (resolvedAuthUserId) {
          await client.from('profiles').update(assertPayload as any).eq('auth_id', resolvedAuthUserId);
        }
      } catch (e: any) {
        console.warn('[Supabase Admin] privileged role re-assert notice:', e?.message || e);
      }
    }

    return { success: true, authUserId: resolvedAuthUserId };
  } catch (err: any) {
    console.error('[Supabase Admin] updateUserPasswordAdmin exception:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Confirm an Auth user's email after custom OTP verification so password
 * sign-in works when Supabase "Confirm email" is enabled.
 */
export async function confirmUserEmailAdmin(
  email: string,
  userId?: string
): Promise<{ success: boolean; authUserId?: string; error?: string }> {
  const client = getSupabaseAdmin();
  if (!client) {
    return { success: false, error: 'Supabase not configured' };
  }

  const cleanEmail = email.trim().toLowerCase();
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  try {
    if (userId && uuidRegex.test(userId)) {
      const { error } = await client.auth.admin.updateUserById(userId, {
        email_confirm: true,
      });
      if (!error) {
        return { success: true, authUserId: userId };
      }
      console.warn('[Supabase Admin] confirmUserEmailAdmin by id notice:', error.message);
    }

    if (!cleanEmail) {
      return { success: false, error: 'Email is required to confirm account' };
    }

    const { data: userList, error: listErr } = await client.auth.admin.listUsers({
      perPage: 1000,
    });
    if (listErr || !userList?.users) {
      return { success: false, error: listErr?.message || 'Could not look up auth user' };
    }

    const matched = (userList.users as any[]).find(
      (u: any) => u.email?.toLowerCase().trim() === cleanEmail
    );
    if (!matched) {
      return { success: false, error: 'No auth user found for this email' };
    }

    const { error: updErr } = await client.auth.admin.updateUserById(matched.id, {
      email_confirm: true,
    });
    if (updErr) {
      return { success: false, error: updErr.message };
    }
    return { success: true, authUserId: matched.id };
  } catch (err: any) {
    console.error('[Supabase Admin] confirmUserEmailAdmin exception:', err);
    return { success: false, error: err?.message || 'Failed to confirm email' };
  }
}

/**
 * One-shot / admin utility: backfill profiles.auth_id from auth.users by email
 * where auth_id IS NULL. Does not delete or recreate users.
 */
export async function backfillMissingAuthIdsAdmin(): Promise<{
  success: boolean;
  linked: number;
  skipped: Array<{ id: string; email: string; reason: string }>;
  error?: string;
}> {
  const client = getSupabaseAdmin();
  if (!client) {
    return { success: false, linked: 0, skipped: [], error: 'Supabase not configured' };
  }

  const skipped: Array<{ id: string; email: string; reason: string }> = [];
  let linked = 0;

  try {
    const { data: nullAuthRows, error: listErr } = await client
      .from('profiles')
      .select('id, email, auth_id')
      .is('auth_id', null)
      .not('email', 'is', null);

    if (listErr) {
      return { success: false, linked: 0, skipped: [], error: listErr.message };
    }

    const rows = (nullAuthRows || []).filter(
      (r: any) => r.email && String(r.email).trim().length > 0
    ) as Array<{ id: string; email: string }>;

    if (rows.length === 0) {
      return { success: true, linked: 0, skipped: [] };
    }

    // Build email → auth user id map (paginated listUsers)
    const emailToAuthId = new Map<string, string[]>();
    let page = 1;
    const perPage = 1000;
    for (;;) {
      const { data: userList, error: authListErr } = await client.auth.admin.listUsers({
        page,
        perPage,
      });
      if (authListErr) {
        return {
          success: false,
          linked,
          skipped,
          error: authListErr.message,
        };
      }
      const users = userList?.users || [];
      for (const u of users) {
        const em = u.email?.toLowerCase().trim();
        if (!em) continue;
        const list = emailToAuthId.get(em) || [];
        list.push(u.id);
        emailToAuthId.set(em, list);
      }
      if (users.length < perPage) break;
      page += 1;
      if (page > 50) break; // safety cap
    }

    for (const row of rows) {
      const email = String(row.email).toLowerCase().trim();
      const matches = emailToAuthId.get(email) || [];
      if (matches.length === 0) {
        skipped.push({ id: row.id, email, reason: 'no_auth_user' });
        continue;
      }
      if (matches.length > 1) {
        skipped.push({ id: row.id, email, reason: 'ambiguous_multiple_auth_users' });
        continue;
      }
      const authUserId = matches[0];
      const { error: updErr } = await client
        .from('profiles')
        .update({
          auth_id: authUserId,
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', row.id)
        .is('auth_id', null);

      if (updErr) {
        skipped.push({ id: row.id, email, reason: updErr.message });
        continue;
      }
      linked += 1;
      console.log(`[Supabase Admin] Backfilled auth_id=${authUserId} for profile ${row.id} (${email})`);
    }

    return { success: true, linked, skipped };
  } catch (err: any) {
    return {
      success: false,
      linked,
      skipped,
      error: err?.message || 'backfill failed',
    };
  }
}

/**
 * Authenticate with Supabase Auth ONLY.
 * Never accepts profiles.password_hash as a login authority, and never
 * overwrites Auth passwords during verification (that allowed forged passwords).
 */
export async function authenticateUserWithPasswordAdmin(
  email: string,
  passwordCandidate: string
): Promise<{ success: boolean; user?: any; session?: any; error?: string }> {
  const client = getSupabaseAdmin();
  if (!client) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    const cleanEmail = email.trim().toLowerCase();
    const password = typeof passwordCandidate === 'string' ? passwordCandidate : '';
    if (!cleanEmail || !password || password.trim().length === 0) {
      return { success: false, error: 'Invalid email or password. Please check your credentials.' };
    }

    const { data: authData, error: authError } = await client.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (authError || !authData?.user) {
      return { success: false, error: 'Invalid email or password. Please check your credentials.' };
    }

    // Prefer email, then auth_id / id — never invent a profile when Auth has no row
    let profile: any = null;
    {
      const { data: byEmail } = await client
        .from('profiles')
        .select('*')
        .ilike('email', cleanEmail)
        .limit(1)
        .maybeSingle();
      profile = byEmail;
    }
    if (!profile) {
      const { data: byAuth } = await client
        .from('profiles')
        .select('*')
        .eq('auth_id', authData.user.id)
        .limit(1)
        .maybeSingle();
      profile = byAuth;
    }
    if (!profile) {
      const { data: byId } = await client
        .from('profiles')
        .select('*')
        .eq('id', authData.user.id)
        .limit(1)
        .maybeSingle();
      profile = byId;
    }

    if (!profile) {
      // Sign out the service-side session created by signInWithPassword
      try {
        await client.auth.signOut();
      } catch {
        /* ignore */
      }
      return {
        success: false,
        error: 'Account not found or was deleted. Please register again.',
      };
    }

    const banCheck = isProfileBanned(profile);
    if (banCheck.isBanned) {
      try {
        await client.auth.signOut();
      } catch {
        /* ignore */
      }
      return { success: false, error: banCheck.message };
    }

    const sanitized = { ...profile };
    delete (sanitized as any).password;
    delete (sanitized as any).password_hash;
    sanitized.hasPasswordSet = true;
    if (authData.user.id) {
      sanitized.auth_id = authData.user.id;
      sanitized.authId = authData.user.id;
      if (!profile.auth_id) {
        linkProfileAuthIdAdmin({
          authUserId: authData.user.id,
          profileId: profile.id,
          email: cleanEmail,
        }).catch((e) =>
          console.warn('[Supabase Admin] login auth_id link notice:', e?.message || e)
        );
      }
    }

    return { success: true, user: sanitized, session: authData.session };
  } catch (err: any) {
    console.error('[Supabase Admin] authenticateUserWithPasswordAdmin exception:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Server-side user status updater bypassing RLS using service role client.
 * Matches both profiles.id and profiles.auth_id (TL-created hosts often differ).
 */
export async function updateUserStatusAdmin(
  userId: string,
  status: string,
  options?: { touchLastSeen?: boolean }
): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseAdmin();
  if (!client) {
    return { success: false, error: 'Supabase not configured' };
  }

  if (!userId || !status) {
    return { success: false, error: 'userId and status required' };
  }

  try {
    const payload: Record<string, any> = {
      online_status: status,
      updated_at: new Date().toISOString(),
    };
    if (options?.touchLastSeen !== false) {
      payload.last_seen_at = new Date().toISOString();
    }

    const { error: byIdError } = await client
      .from('profiles')
      .update(payload as any)
      .eq('id', userId);

    // Also match auth_id — login identity may differ from profiles.id
    const { error: byAuthError } = await client
      .from('profiles')
      .update(payload as any)
      .eq('auth_id', userId);

    if (byIdError && byAuthError) {
      console.warn(
        '[Supabase Admin] updateUserStatusAdmin error:',
        byIdError.message || byAuthError.message
      );
      return { success: false, error: byIdError.message || byAuthError.message };
    }

    return { success: true };
  } catch (err: any) {
    console.warn('[Supabase Admin] updateUserStatusAdmin exception:', err);
    return { success: false, error: err.message };
  }
}

/** Throttled last-seen touch without changing online_status. */
export async function touchLastSeenAdmin(userId: string): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseAdmin();
  if (!client || !userId) {
    return { success: false, error: 'Supabase not configured' };
  }
  try {
    const payload = { last_seen_at: new Date().toISOString() };
    const { error: byIdError } = await client.from('profiles').update(payload as any).eq('id', userId);
    const { error: byAuthError } = await client.from('profiles').update(payload as any).eq('auth_id', userId);
    if (byIdError && byAuthError) {
      return { success: false, error: byIdError.message || byAuthError.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'touch failed' };
  }
}

/**
 * Server-side fetch all user statuses
 */
export async function fetchUserStatusesAdmin(): Promise<{
  success: boolean;
  statuses?: Array<{ id: string; online_status: string }>;
  error?: string;
}> {
  const client = getSupabaseAdmin();
  if (!client) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    const { data, error } = await client
      .from('profiles')
      .select('id, online_status');

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, statuses: data || [] };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Comprehensive Server-Side Supabase Database Reset Engine
 * Bypasses RLS using the Service Role client and safely deletes/resets tables in cascade order.
 */
export async function granularResetSupabaseAdmin(options: {
  mockIds?: string[];
  clearAllUsers?: boolean;
  clearMockUsers?: boolean;
  clearAdmin?: boolean;
  purgeR2MediaStorage?: boolean;
  purgeAllR2Uploads?: boolean;
  chatMessages?: boolean;
  callLogs?: boolean;
  friendRequests?: boolean;
  payoutRequests?: boolean;
  moderationReports?: boolean;
  feedPosts?: boolean;
  favorites?: boolean;
  blockedUsers?: boolean;
  creatorAnalytics?: boolean;
  creatorReviews?: boolean;
  dailyRewardsAndQuests?: boolean;
  taxonomiesAndFlags?: boolean;
  creatorGoals?: boolean;
  homeBanners?: boolean;
  homeQuickLinks?: boolean;
  cmsPolicies?: boolean;
  systemSettings?: boolean;
  coinPackages?: boolean;
  virtualGiftsCatalog?: boolean;
  /** Explicit wallet_ledger wipe; also implied by callLogs / balance reset / clearAllUsers. */
  walletLedger?: boolean;
  resetBalances?: {
    callerCoins?: boolean;
    creatorEarnings?: boolean;
  };
}): Promise<{ success: boolean; clearedTables: string[]; error?: string; warnings?: string[] }> {
  const client = getSupabaseAdmin();
  if (!client) {
    return { success: false, clearedTables: [], error: 'Supabase service role admin is not configured.' };
  }
  if (!isSupabaseServiceRoleConfigured()) {
    return {
      success: false,
      clearedTables: [],
      error:
        'Database reset requires SUPABASE_SERVICE_ROLE_KEY. The anon key cannot bypass RLS, so tables would not actually be purged.',
    };
  }

  const clearedTables: string[] = [];
  const failedOps: string[] = [];
  const warnings: string[] = [];

  try {
    const recordDelete = (table: string, error: { message: string } | null | undefined) => {
      if (!error) {
        clearedTables.push(table);
        return;
      }
      failedOps.push(`${table}: ${error.message}`);
      console.warn(`[Supabase Admin Reset] ${table} purge warning:`, error.message);
    };

    const purgeWalletLedger =
      Boolean(options.walletLedger) ||
      Boolean(options.callLogs) ||
      Boolean(options.clearAllUsers) ||
      Boolean(options.resetBalances?.callerCoins) ||
      Boolean(options.resetBalances?.creatorEarnings);

    // Optional: purge Cloudflare R2 uploads before DB deletion
    if (options.purgeR2MediaStorage) {
      clearLocalMediaCache();
      const purgeRes = await purgeR2MediaUploads({
        purgeAllUploads: Boolean(options.purgeAllR2Uploads),
        prefixes: Boolean(options.purgeAllR2Uploads) ? undefined : DEFAULT_R2_PURGE_PREFIXES,
      });
      clearedTables.push(`r2_media_uploads (${purgeRes.deletedCount} objects)`);
    }

    // Virtual Gifts Catalog purge:
    // - reset system_configs.virtual_gifts_json to defaults
    // - remove "gift" messages from the chats (gift transaction logs)
    if (options.virtualGiftsCatalog) {
      try {
        const { error: giftMsgErr } = await (client as any)
          .from('messages')
          .delete()
          .eq('type', 'gift');
        recordDelete('gift_messages', giftMsgErr);
      } catch (err: any) {
        console.warn('[Supabase Admin Reset] gift message purge exception:', err?.message || err);
      }

      try {
        const { error: sysErr } = await (client as any)
          .from('system_configs')
          .update({
            enable_virtual_gifts: true,
            virtual_gifts_json: JSON.stringify(VIRTUAL_GIFTS),
          })
          .eq('id', 'default');
        recordDelete('system_configs.virtual_gifts_json', sysErr);
      } catch (err: any) {
        console.warn('[Supabase Admin Reset] system virtual gifts update exception:', err?.message || err);
      }
    }

    // PostgREST requires a filter on DELETE/UPDATE. PK columns are NOT NULL,
    // so `col IS NOT NULL` matches every row without fake UUID/text sentinels.
    const deleteAllRows = (table: string, notNullColumn: string) =>
      (client.from(table) as any).delete().not(notNullColumn, 'is', null);

    // 1. Delete Messages + conversation clears
    if (options.chatMessages || options.clearAllUsers) {
      const { error } = await deleteAllRows('messages', 'id');
      recordDelete('messages', error);
      const { error: clearsErr } = await deleteAllRows('message_conversation_clears', 'user_id');
      recordDelete('message_conversation_clears', clearsErr);
    }

    // 1b. Wallet ledger (before call_logs / profiles)
    if (purgeWalletLedger) {
      const { error } = await deleteAllRows('wallet_ledger', 'id');
      recordDelete('wallet_ledger', error);
    }

    // 2. Delete Call Logs Table
    if (options.callLogs || options.clearAllUsers) {
      const { error } = await deleteAllRows('call_logs', 'id');
      recordDelete('call_logs', error);
    }

    // 3. Delete Matches Table
    if (options.callLogs || options.chatMessages || options.clearAllUsers) {
      const { error } = await deleteAllRows('matches', 'id');
      recordDelete('matches', error);
    }

    // 4. Delete Friend Requests Table
    if (options.friendRequests || options.clearAllUsers) {
      const { error } = await deleteAllRows('friend_requests', 'id');
      recordDelete('friend_requests', error);
    }

    // 5. Delete Payout Requests Table
    if (options.payoutRequests || options.clearAllUsers) {
      const { error } = await deleteAllRows('payout_requests', 'id');
      recordDelete('payout_requests', error);
    }

    // 6. Delete Moderation Reports Table
    if (options.moderationReports || options.clearAllUsers) {
      const { error } = await deleteAllRows('moderation_reports', 'id');
      recordDelete('moderation_reports', error);
    }

    // 7. Delete Feed Posts Table
    if (options.feedPosts || options.clearAllUsers) {
      const { error: likesErr } = await deleteAllRows('feed_post_likes', 'post_id');
      recordDelete('feed_post_likes', likesErr);
      const { error } = await deleteAllRows('feed_posts', 'id');
      recordDelete('feed_posts', error);
    }

    // 7a. Delete CMS / System Admin Tables
    if (options.homeBanners) {
      const { error } = await deleteAllRows('home_banners', 'id');
      recordDelete('home_banners', error);
    }

    if (options.homeQuickLinks) {
      const { error } = await deleteAllRows('home_quick_links', 'id');
      recordDelete('home_quick_links', error);
    }

    if (options.cmsPolicies) {
      const { error } = await deleteAllRows('cms_policies', 'id');
      recordDelete('cms_policies', error);
    }

    if (options.systemSettings) {
      const { error } = await deleteAllRows('system_configs', 'id');
      recordDelete('system_configs', error);
    }

    if (options.coinPackages) {
      const { error } = await deleteAllRows('coin_packages', 'id');
      recordDelete('coin_packages', error);
    }

    // 8. Delete Favorites Table
    if (options.favorites || options.clearAllUsers) {
      const { error } = await deleteAllRows('favorites', 'user_id');
      recordDelete('favorites', error);
    }

    // 9. Delete Blocked Users Table
    if (options.blockedUsers || options.clearAllUsers) {
      const { error } = await deleteAllRows('blocked_users', 'user_id');
      recordDelete('blocked_users', error);
    }

    // 10. Delete Creator Goals Table
    if (options.creatorGoals || options.clearAllUsers) {
      const { error } = await deleteAllRows('creator_goals', 'creator_id');
      recordDelete('creator_goals', error);
    }

    // 10a. Delete Creator Analytics / Metrics Table
    if (options.creatorAnalytics || options.clearAllUsers) {
      try {
        const { error } = await deleteAllRows('creator_metrics', 'creator_id');
        recordDelete('creator_metrics', error);
      } catch (err: any) {
        failedOps.push(`creator_metrics: ${err?.message || err}`);
        console.warn('[Supabase Admin Reset] creator_metrics purge exception:', err?.message || err);
      }
    }

    // 10a2. Delete Creator Reviews
    if (options.creatorReviews || options.clearAllUsers) {
      try {
        const { error } = await deleteAllRows('creator_reviews', 'id');
        recordDelete('creator_reviews', error);
      } catch (err: any) {
        failedOps.push(`creator_reviews: ${err?.message || err}`);
        console.warn('[Supabase Admin Reset] creator_reviews purge exception:', err?.message || err);
      }
    }

    // 10b. Delete Taxonomies, Tags & Moderation Flags
    if (options.taxonomiesAndFlags) {
      try {
        const blocks: Array<{ table: string; filter: string }> = [
          { table: 'country_configs', filter: 'code' },
          { table: 'language_configs', filter: 'code' },
          { table: 'zodiac_configs', filter: 'key' },
          { table: 'interest_configs', filter: 'id' },
          { table: 'currency_configs', filter: 'code' },
        ];

        for (const b of blocks) {
          const { error } = await deleteAllRows(b.table, b.filter);
          recordDelete(b.table, error);
        }
        if (!options.moderationReports && !options.clearAllUsers) {
          const { error } = await deleteAllRows('moderation_reports', 'id');
          recordDelete('moderation_reports', error);
        }
      } catch (err: any) {
        console.warn('[Supabase Admin Reset] taxonomiesAndFlags purge exception:', err?.message || err);
      }
    }

    // 10c. Delete User Daily Rewards Table
    if (options.clearAllUsers || options.creatorGoals || options.dailyRewardsAndQuests) {
      const { error } = await deleteAllRows('user_daily_rewards', 'user_id');
      recordDelete('user_daily_rewards', error);
    }

    // 11. Reset Financial Balances on Profiles Table (skip when wiping users)
    if (options.resetBalances && !options.clearAllUsers) {
      const updates: any = {};
      if (options.resetBalances.callerCoins) updates.coin_balance = 0;
      if (options.resetBalances.creatorEarnings) {
        updates.earnings_coins = 0;
        updates.total_lifetime_earned_usd = 0;
        updates.total_calls_hosted = 0;
        updates.total_call_minutes = 0;
      }

      if (Object.keys(updates).length > 0) {
        const { error } = await (client.from('profiles') as any)
          .update(updates)
          .not('id', 'is', null);
        recordDelete('balances_reset', error);
      }
    }

    // 12. Delete Auth users then profiles (Auth first so triggers cannot recreate rows)
    const profileIdsToDelete: string[] =
      options.mockIds && options.mockIds.length > 0 ? options.mockIds.map(String) : [];

    if (options.clearAllUsers || profileIdsToDelete.length > 0) {
      let targets: Array<{ id: string; auth_id: string | null }> = [];

      if (options.clearAllUsers) {
        const { data: nonAdmins, error: listErr } = await client
          .from('profiles')
          .select('id, auth_id')
          .neq('role', 'admin');
        if (listErr) {
          failedOps.push(`profiles_list_for_auth_purge: ${listErr.message}`);
        } else {
          targets = (nonAdmins || []) as Array<{ id: string; auth_id: string | null }>;
        }
      } else {
        const { data: listed, error: listErr } = await client
          .from('profiles')
          .select('id, auth_id')
          .in('id', profileIdsToDelete);
        if (listErr) {
          failedOps.push(`profiles_list_for_auth_purge: ${listErr.message}`);
          targets = profileIdsToDelete.map((id) => ({ id, auth_id: null }));
        } else {
          targets = (listed || []) as Array<{ id: string; auth_id: string | null }>;
          for (const id of profileIdsToDelete) {
            if (!targets.some((t) => t.id === id)) targets.push({ id, auth_id: null });
          }
        }
      }

      let authDeleted = 0;
      for (const row of targets) {
        const candidates = Array.from(
          new Set(
            [row.auth_id, AUTH_UUID_RE.test(row.id) ? row.id : null]
              .filter(Boolean)
              .map(String)
          )
        );
        for (const aid of candidates) {
          try {
            const { error: authErr } = await client.auth.admin.deleteUser(aid);
            if (authErr) {
              const msg = authErr.message || String(authErr);
              if (/not found|user not found|does not exist/i.test(msg)) {
                authDeleted++;
              } else {
                warnings.push(`Auth delete ${aid}: ${msg}`);
                console.warn(`[Supabase Admin Reset] Auth delete failed for ${aid}:`, msg);
              }
            } else {
              authDeleted++;
            }
          } catch (err: any) {
            warnings.push(`Auth delete ${aid}: ${err?.message || String(err)}`);
          }
        }
      }
      if (targets.length > 0) {
        clearedTables.push(
          `auth.users (~${authDeleted} deletes for ${targets.length} non-admin profiles)`
        );
      }

      if (options.clearAllUsers) {
        const { error } = await client.from('profiles').delete().neq('role', 'admin');
        recordDelete('profiles (all non-admin users)', error);
      } else if (profileIdsToDelete.length > 0) {
        const { error } = await client.from('profiles').delete().in('id', profileIdsToDelete);
        recordDelete(`profiles (${profileIdsToDelete.length} users)`, error);
      }
    }

    // 13. Admin profile field reset (non-secret only)
    // Never restore a known weak password or inflate coin_balance.
    // Password changes must go through authenticated update-password / Supabase Auth.
    if (options.clearAdmin) {
      const { data: admins, error: adminLookupErr } = await client
        .from('profiles')
        .select('id')
        .eq('role', 'admin');
      if (adminLookupErr) {
        failedOps.push(`admin_profile_reset: ${adminLookupErr.message}`);
      } else if (admins && admins.length > 0) {
        for (const admin of admins as { id: string }[]) {
          const { error: adminUpdateErr } = await (client.from('profiles') as any)
            .update({
              name: 'Super Admin',
              is_verified: true,
              online_status: 'online',
              updated_at: new Date().toISOString(),
            })
            .eq('id', admin.id);
          if (adminUpdateErr) {
            failedOps.push(`admin_profile_reset(${admin.id}): ${adminUpdateErr.message}`);
          }
        }
        clearedTables.push('admin_profile_fields_reset');
      } else {
        clearedTables.push('admin_profile_reset_skipped_no_admin');
      }
    }

    if (failedOps.length > 0) {
      return {
        success: false,
        clearedTables,
        warnings,
        error: `Some reset operations failed: ${failedOps.join('; ')}`,
      };
    }

    return { success: true, clearedTables, warnings };
  } catch (err: any) {
    console.error('[Supabase Admin Reset] Exception during database reset:', err);
    return { success: false, clearedTables, warnings, error: err.message };
  }
}

/**
 * Partial profile update in Supabase PostgreSQL (by ID or matching email)
 */
export async function updateUserProfileAdmin(
  userId: string,
  updates: Record<string, any>
): Promise<{ success: boolean; data?: any; error?: string }> {
  const client = getSupabaseAdmin();
  if (!client) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    const payload: Record<string, any> = {};
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.email !== undefined) payload.email = updates.email || null;
    if (updates.phone !== undefined) payload.phone = updates.phone || null;
    if (updates.gender !== undefined) payload.gender = updates.gender;
    if (updates.genderLocked !== undefined || updates.gender_locked !== undefined) {
      payload.gender_locked = updates.genderLocked ?? updates.gender_locked;
    }
    if (updates.age !== undefined) payload.age = Number(updates.age);
    if (updates.dob !== undefined) payload.dob = updates.dob;
    if (updates.nationality !== undefined) payload.nationality = updates.nationality;
    if (updates.countryCode !== undefined || updates.country_code !== undefined) {
      const code = updates.countryCode !== undefined ? updates.countryCode : updates.country_code;
      payload.country_code = String(code).toUpperCase();
    }
    if (updates.bio !== undefined) payload.bio = updates.bio;
    if (updates.extendedBio !== undefined || updates.extended_bio !== undefined) {
      const extended = updates.extendedBio !== undefined ? updates.extendedBio : updates.extended_bio;
      payload.extended_bio = extended ?? null;
    }
    if (updates.locationCity !== undefined || updates.location_city !== undefined) {
      const city = updates.locationCity !== undefined ? updates.locationCity : updates.location_city;
      payload.location_city = city ?? null;
    }
    if (updates.zodiac !== undefined) payload.zodiac = updates.zodiac ?? null;
    if (updates.spokenLanguages !== undefined || updates.spoken_languages !== undefined) {
      const langs = updates.spokenLanguages !== undefined ? updates.spokenLanguages : updates.spoken_languages;
      payload.spoken_languages = Array.isArray(langs) ? langs : [];
    }
    if (updates.interests !== undefined) payload.interests = updates.interests;
    if (updates.interestedIn !== undefined || updates.interested_in !== undefined) {
      const interested = updates.interestedIn !== undefined ? updates.interestedIn : updates.interested_in;
      payload.interested_in = Array.isArray(interested) ? interested : [];
    }
    if (updates.tags !== undefined) payload.tags = updates.tags;
    if (updates.avatarUrl !== undefined || updates.avatar_url !== undefined) {
      payload.avatar_url = updates.avatarUrl !== undefined ? updates.avatarUrl : updates.avatar_url;
    }
    if (updates.gallery !== undefined) payload.gallery = updates.gallery;
    if (updates.galleryVideos !== undefined || updates.gallery_videos !== undefined) {
      payload.gallery_videos = updates.galleryVideos ?? updates.gallery_videos ?? [];
    }

    // Dual-write videos into gallery sentinel so production works without gallery_videos column.
    const writingVideos = payload.gallery_videos !== undefined;
    const writingGallery = payload.gallery !== undefined;
    if (writingGallery || writingVideos) {
      const { data: curGalleryRow } = await client
        .from('profiles')
        .select('gallery')
        .eq('id', userId)
        .maybeSingle();
      const existingSplit = splitGalleryPhotosAndVideos(curGalleryRow?.gallery);
      if (writingVideos) {
        const photos = writingGallery
          ? splitGalleryPhotosAndVideos(payload.gallery).photos
          : existingSplit.photos;
        const videos = Array.isArray(payload.gallery_videos) ? payload.gallery_videos : [];
        // Avoid empty `__mc_gv1__:[]` sentinel — it renders as a blank photo via raw gallery APIs.
        payload.gallery =
          videos.length > 0 ? mergeGalleryWithVideoSentinel(photos, videos) : photos;
      } else if (writingGallery) {
        const photos = splitGalleryPhotosAndVideos(payload.gallery).photos;
        const keepVideos = Array.isArray(existingSplit.videos) ? existingSplit.videos : [];
        payload.gallery =
          keepVideos.length > 0 ? mergeGalleryWithVideoSentinel(photos, keepVideos) : photos;
      }
    }

    if (updates.introVideoUrl !== undefined || updates.intro_video_url !== undefined) {
      payload.intro_video_url = updates.introVideoUrl ?? updates.intro_video_url ?? null;
    }
    if (updates.verificationVideoUrl !== undefined || updates.verification_video_url !== undefined) {
      payload.verification_video_url = updates.verificationVideoUrl ?? updates.verification_video_url ?? null;
    }
    if (updates.isVerified !== undefined || updates.is_verified !== undefined) {
      payload.is_verified = Boolean(updates.isVerified ?? updates.is_verified);
    }
    if (updates.isOnboarded !== undefined || updates.is_onboarded !== undefined) {
      payload.is_onboarded = Boolean(updates.isOnboarded ?? updates.is_onboarded);
    }
    if (updates.agreedToTerms !== undefined || updates.agreed_to_terms !== undefined) {
      payload.agreed_to_terms = Boolean(updates.agreedToTerms ?? updates.agreed_to_terms);
    }
    if (updates.agreedToAdultTerms !== undefined || updates.agreed_to_adult_terms !== undefined) {
      payload.agreed_to_adult_terms = Boolean(updates.agreedToAdultTerms ?? updates.agreed_to_adult_terms);
    }
    if (updates.agreedToHostTerms !== undefined || updates.agreed_to_host_terms !== undefined) {
      payload.agreed_to_host_terms = Boolean(updates.agreedToHostTerms ?? updates.agreed_to_host_terms);
    }
    if (updates.role !== undefined) {
      payload.role = updates.role === 'female_host' ? 'female_creator' : updates.role;
    }
    if (updates.coinBalance !== undefined || updates.coin_balance !== undefined) {
      payload.coin_balance = Number(updates.coinBalance ?? updates.coin_balance);
    }
    if (updates.hourlyCoinRate !== undefined || updates.hourly_coin_rate !== undefined) {
      payload.hourly_coin_rate = Number(updates.hourlyCoinRate ?? updates.hourly_coin_rate);
    }
    if (updates.earningsCoins !== undefined || updates.earnings_coins !== undefined) {
      payload.earnings_coins = Number(updates.earningsCoins ?? updates.earnings_coins);
    }
    if (updates.totalLifetimeEarnedUSD !== undefined || updates.total_lifetime_earned_usd !== undefined) {
      payload.total_lifetime_earned_usd = Number(updates.totalLifetimeEarnedUSD ?? updates.total_lifetime_earned_usd);
    }
    if (updates.onlineStatus !== undefined || updates.online_status !== undefined) {
      payload.online_status = updates.onlineStatus || updates.online_status;
    }
    if (updates.teamLeaderId !== undefined || updates.team_leader_id !== undefined) {
      payload.team_leader_id = updates.teamLeaderId ?? updates.team_leader_id ?? null;
    }
    if (updates.createdById !== undefined || updates.created_by_id !== undefined) {
      payload.created_by_id = updates.createdById ?? updates.created_by_id ?? null;
    }
    if (updates.agencyName !== undefined || updates.agency_name !== undefined) {
      payload.agency_name = updates.agencyName ?? updates.agency_name ?? null;
    }
    if (updates.coinEarnOverrideRate !== undefined || updates.coin_earn_override_rate !== undefined) {
      payload.coin_earn_override_rate = updates.coinEarnOverrideRate ?? updates.coin_earn_override_rate ?? null;
    }
    if (updates.commissionPercent !== undefined || updates.commission_percent !== undefined) {
      payload.commission_percent = updates.commissionPercent ?? updates.commission_percent ?? null;
    }
    if (updates.isBanned !== undefined || updates.is_banned !== undefined) {
      payload.is_banned = Boolean(updates.isBanned ?? updates.is_banned);
    }
    if (updates.banReason !== undefined || updates.ban_reason !== undefined) {
      payload.ban_reason = updates.banReason ?? updates.ban_reason ?? null;
    }
    if (updates.isUsingMockLocation !== undefined || updates.is_using_mock_location !== undefined) {
      payload.is_using_mock_location = Boolean(updates.isUsingMockLocation ?? updates.is_using_mock_location);
    }
    if (updates.mockLocationCountry !== undefined || updates.mock_location_country !== undefined) {
      payload.mock_location_country = updates.mockLocationCountry ?? updates.mock_location_country ?? null;
    }
    if (updates.mockLocationCity !== undefined || updates.mock_location_city !== undefined) {
      payload.mock_location_city = updates.mockLocationCity ?? updates.mock_location_city ?? null;
    }
    if (updates.allowMockLocation !== undefined || updates.allow_mock_location !== undefined) {
      payload.allow_mock_location = Boolean(updates.allowMockLocation ?? updates.allow_mock_location);
    }
    if (updates.exactLocation?.latitude !== undefined || updates.latitude !== undefined) {
      payload.latitude = updates.exactLocation?.latitude ?? updates.latitude;
    }
    if (updates.exactLocation?.longitude !== undefined || updates.longitude !== undefined) {
      payload.longitude = updates.exactLocation?.longitude ?? updates.longitude;
    }
    payload.updated_at = new Date().toISOString();

    console.log(`[Supabase Admin] Updating profile columns for ${userId}:`, Object.keys(payload));

    const runUpdate = async (body: Record<string, any>) => {
      let res = await client.from('profiles').update(body).eq('id', userId).select().maybeSingle();
      if (!res.data && !res.error) {
        res = await client.from('profiles').update(body).eq('auth_id', userId).select().maybeSingle();
      }
      const cleanEmail = (updates.email || body.email)
        ? String(updates.email || body.email).toLowerCase().trim()
        : null;
      if (!res.data && !res.error && cleanEmail) {
        res = await client.from('profiles').update(body).ilike('email', cleanEmail).select().maybeSingle();
      }
      return res;
    };

    let res = await runUpdate(payload);

    // Column missing: drop gallery_videos and retry — gallery sentinel already set.
    if (res.error && isMissingGalleryVideosColumnError(res.error) && writingVideos) {
      const fallback = { ...payload };
      delete fallback.gallery_videos;
      console.warn(
        '[Supabase Admin] gallery_videos column missing — saving via gallery sentinel'
      );
      res = await runUpdate(fallback);
    }

    if (res.error) {
      console.warn('[Supabase Admin] updateUserProfileAdmin error:', res.error.message);
      return { success: false, error: res.error.message };
    }
    if (!res.data) {
      return { success: false, error: 'Profile was not updated' };
    }

    return { success: true, data: res.data };
  } catch (err: any) {
    console.warn('[Supabase Admin] updateUserProfileAdmin exception:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Server-Side Admin: Fetch User Daily Rewards State
 */
export async function fetchUserDailyRewardsAdmin(userId: string): Promise<{ success: boolean; data?: any; error?: string }> {
  const client = getSupabaseAdmin();
  if (!client || !userId) return { success: false, error: 'Admin client not available' };
  try {
    const { data, error } = await client
      .from('user_daily_rewards')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) return { success: false, error: error.message };
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export function mapDailyRewardsRowToRecord(db: any) {
  if (!db) return null;
  return {
    userId: db.user_id,
    lastLoginDate: db.last_login_date,
    streakCount: Number(db.streak_count || 1),
    streakClaimedDate: db.streak_claimed_date ?? null,
    tasksDate: db.tasks_date,
    taskChatFriends: Array.isArray(db.task_chat_friends) ? db.task_chat_friends : [],
    taskChatClaimed: Boolean(db.task_chat_claimed),
    taskQuickMatches: Number(db.task_quick_matches || 0),
    taskQuickMatchClaimed: Boolean(db.task_quick_match_claimed),
    taskVideoCallSeconds: Number(db.task_video_call_seconds || 0),
    taskVideoCallClaimed: Boolean(db.task_video_call_claimed),
    taskMomentInteractions: Number(db.task_moment_interactions || 0),
    taskMomentClaimed: Boolean(db.task_moment_claimed),
    taskGiftCount: Number(db.task_gift_count || 0),
    taskGiftClaimed: Boolean(db.task_gift_claimed),
    masterChestClaimed: Boolean(db.master_chest_claimed),
    totalCoinsEarned: Number(db.total_coins_earned || 0),
    createdAt: db.created_at,
    updatedAt: db.updated_at,
  };
}

function blankDailyRewardsRow(userId: string, rewardDay: string) {
  return {
    user_id: userId,
    last_login_date: rewardDay,
    streak_count: 1,
    streak_claimed_date: null,
    tasks_date: rewardDay,
    task_chat_friends: [],
    task_chat_claimed: false,
    task_quick_matches: 0,
    task_quick_match_claimed: false,
    task_video_call_seconds: 0,
    task_video_call_claimed: false,
    task_moment_interactions: 0,
    task_moment_claimed: false,
    task_gift_count: 0,
    task_gift_claimed: false,
    master_chest_claimed: false,
    total_coins_earned: 0,
    updated_at: new Date().toISOString(),
  };
}

function shiftRewardDay(day: string, deltaDays: number): string {
  const d = new Date(`${day}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

/**
 * Ensure reward row exists and apply day rollover for tasks/streak using resolved rewardDay.
 */
export async function ensureUserDailyRewardsRolloverAdmin(
  userId: string,
  rewardDay: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  const client = getSupabaseAdmin();
  if (!client || !userId) return { success: false, error: 'Admin client not available' };
  try {
    const existing = await fetchUserDailyRewardsAdmin(userId);
    if (!existing.success) return existing;

    let row = existing.data;
    if (!row) {
      const payload = blankDailyRewardsRow(userId, rewardDay);
      const { data, error } = await client
        .from('user_daily_rewards')
        .upsert(payload, { onConflict: 'user_id' })
        .select('*')
        .maybeSingle();
      if (error) return { success: false, error: error.message };
      return { success: true, data };
    }

    const yesterday = shiftRewardDay(rewardDay, -1);
    let changed = false;
    const next = { ...row };

    if (next.tasks_date !== rewardDay) {
      next.tasks_date = rewardDay;
      next.task_chat_friends = [];
      next.task_chat_claimed = false;
      next.task_quick_matches = 0;
      next.task_quick_match_claimed = false;
      next.task_video_call_seconds = 0;
      next.task_video_call_claimed = false;
      next.task_moment_interactions = 0;
      next.task_moment_claimed = false;
      next.task_gift_count = 0;
      next.task_gift_claimed = false;
      next.master_chest_claimed = false;
      changed = true;
    }

    if (next.last_login_date === yesterday) {
      if (next.streak_claimed_date === yesterday) {
        next.streak_count = Number(next.streak_count || 1) >= 7 ? 1 : Number(next.streak_count || 1) + 1;
      }
      next.last_login_date = rewardDay;
      changed = true;
    } else if (next.last_login_date !== rewardDay) {
      next.streak_count = 1;
      next.last_login_date = rewardDay;
      changed = true;
    }

    if (!changed) return { success: true, data: row };

    next.updated_at = new Date().toISOString();
    const { data, error } = await client
      .from('user_daily_rewards')
      .upsert(next, { onConflict: 'user_id' })
      .select('*')
      .maybeSingle();
    if (error) return { success: false, error: error.message };
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

const MISSION_BILLING: Record<string, number> = {
  streak: 1,
  chat_friends: 2,
  quick_matches: 3,
  video_call: 4,
  moment_interact: 5,
  send_gift: 6,
  master_chest: 7,
};

/**
 * Atomic claim via SQL RPC when available; falls back to conditional update + ledger uniqueness.
 */
export async function claimDailyRewardAdmin(params: {
  userId: string;
  claimKind: 'streak' | 'mission' | 'master_chest';
  missionKey: string | null;
  rewardDay: string;
  coins: number;
}): Promise<{
  success: boolean;
  coinsAwarded?: number;
  coinBalance?: number;
  record?: any;
  duplicate?: boolean;
  error?: string;
  code?: string;
}> {
  const client = getSupabaseAdmin();
  if (!client) return { success: false, error: 'Admin client not available', code: 'NO_ADMIN' };

  const billingKey =
    params.claimKind === 'streak'
      ? 'streak'
      : params.claimKind === 'master_chest'
      ? 'master_chest'
      : String(params.missionKey || '');
  const billingMinute = MISSION_BILLING[billingKey] || 0;
  const ledgerType =
    params.claimKind === 'streak'
      ? 'REWARD_STREAK'
      : params.claimKind === 'master_chest'
      ? 'REWARD_MASTER_CHEST'
      : 'REWARD_MISSION';

  try {
    const rpc = await client.rpc('claim_daily_reward_atomic', {
      p_user_id: params.userId,
      p_claim_kind: params.claimKind,
      p_mission_key: params.missionKey,
      p_reward_day: params.rewardDay,
      p_coins: Math.max(0, Math.floor(params.coins)),
      p_ledger_type: ledgerType,
      p_billing_minute: billingMinute,
      p_metadata: {
        missionKey: params.missionKey,
        rewardDay: params.rewardDay,
        claimKind: params.claimKind,
      },
    });

    if (!rpc.error && rpc.data) {
      const result = typeof rpc.data === 'string' ? JSON.parse(rpc.data) : rpc.data;
      if (result?.success) {
        const refreshed = await fetchUserDailyRewardsAdmin(params.userId);
        return {
          success: true,
          coinsAwarded: Number(result.coins_awarded || 0),
          coinBalance: Number(result.coin_balance || 0),
          record: refreshed.data,
          duplicate: Boolean(result.duplicate),
        };
      }
      return {
        success: false,
        error: result?.error_message || 'Claim rejected',
        code: result?.error_code || 'CLAIM_FAILED',
        coinBalance: result?.coin_balance != null ? Number(result.coin_balance) : undefined,
        record: (await fetchUserDailyRewardsAdmin(params.userId)).data,
      };
    }
  } catch {
    // fall through to conditional update path
  }

  // Fallback path (RPC missing): conditional flag update + ledger unique insert
  return claimDailyRewardAdminFallback(params, ledgerType, billingMinute);
}

async function claimDailyRewardAdminFallback(
  params: {
    userId: string;
    claimKind: 'streak' | 'mission' | 'master_chest';
    missionKey: string | null;
    rewardDay: string;
    coins: number;
  },
  ledgerType: string,
  billingMinute: number
): Promise<{
  success: boolean;
  coinsAwarded?: number;
  coinBalance?: number;
  record?: any;
  duplicate?: boolean;
  error?: string;
  code?: string;
}> {
  const client = getSupabaseAdmin();
  if (!client) return { success: false, error: 'Admin client not available', code: 'NO_ADMIN' };

  const callId = `daily_reward:${params.rewardDay}`;
  const coins = Math.max(0, Math.floor(params.coins));

  try {
    // Idempotency: existing ledger row
    const { data: existingLedger } = await client
      .from('wallet_ledger')
      .select('id, balance_after')
      .eq('user_id', params.userId)
      .eq('call_id', callId)
      .eq('billing_minute', billingMinute)
      .eq('transaction_type', ledgerType)
      .maybeSingle();

    if (existingLedger) {
      const refreshed = await fetchUserDailyRewardsAdmin(params.userId);
      const { data: profile } = await client.from('profiles').select('coin_balance').eq('id', params.userId).maybeSingle();
      return {
        success: false,
        code: 'ALREADY_CLAIMED',
        error: 'Already claimed',
        coinsAwarded: 0,
        coinBalance: Number(profile?.coin_balance ?? existingLedger.balance_after ?? 0),
        record: refreshed.data,
        duplicate: true,
      };
    }

    const ensured = await ensureUserDailyRewardsRolloverAdmin(params.userId, params.rewardDay);
    if (!ensured.success || !ensured.data) {
      return { success: false, error: ensured.error || 'Load failed', code: 'LOAD_FAILED' };
    }
    const row = ensured.data;

    const patch: Record<string, any> = {
      updated_at: new Date().toISOString(),
      total_coins_earned: Number(row.total_coins_earned || 0) + coins,
    };
    let filterCol = '';
    let filterVal: any = false;

    if (params.claimKind === 'streak') {
      if (row.streak_claimed_date === params.rewardDay) {
        return { success: false, code: 'ALREADY_CLAIMED', error: 'Already claimed', record: row, duplicate: true };
      }
      patch.streak_claimed_date = params.rewardDay;
      filterCol = 'streak_claimed_date';
      // only claim if not already today — use neq via or null
    } else if (params.claimKind === 'master_chest') {
      if (row.master_chest_claimed) {
        return { success: false, code: 'ALREADY_CLAIMED', error: 'Already claimed', record: row, duplicate: true };
      }
      patch.master_chest_claimed = true;
      filterCol = 'master_chest_claimed';
      filterVal = false;
    } else {
      const key = params.missionKey;
      const map: Record<string, { col: string; flag: string }> = {
        chat_friends: { col: 'task_chat_claimed', flag: 'task_chat_claimed' },
        quick_matches: { col: 'task_quick_match_claimed', flag: 'task_quick_match_claimed' },
        video_call: { col: 'task_video_call_claimed', flag: 'task_video_call_claimed' },
        moment_interact: { col: 'task_moment_claimed', flag: 'task_moment_claimed' },
        send_gift: { col: 'task_gift_claimed', flag: 'task_gift_claimed' },
      };
      const m = key ? map[key] : null;
      if (!m) return { success: false, error: 'Invalid mission', code: 'INVALID_MISSION' };
      if (row[m.flag]) {
        return { success: false, code: 'ALREADY_CLAIMED', error: 'Already claimed', record: row, duplicate: true };
      }
      patch[m.col] = true;
      filterCol = m.col;
      filterVal = false;
    }

    let updateQuery = client.from('user_daily_rewards').update(patch).eq('user_id', params.userId);
    if (params.claimKind === 'streak') {
      updateQuery = updateQuery.or(`streak_claimed_date.is.null,streak_claimed_date.neq.${params.rewardDay}`);
    } else {
      updateQuery = updateQuery.eq(filterCol, filterVal);
    }

    const { data: updatedRows, error: updErr } = await updateQuery.select('*');
    if (updErr) return { success: false, error: updErr.message, code: 'UPDATE_FAILED' };
    if (!updatedRows || updatedRows.length === 0) {
      const refreshed = await fetchUserDailyRewardsAdmin(params.userId);
      return {
        success: false,
        code: 'ALREADY_CLAIMED',
        error: 'Already claimed',
        record: refreshed.data,
        duplicate: true,
      };
    }

    const { data: profile } = await client
      .from('profiles')
      .select('coin_balance')
      .eq('id', params.userId)
      .maybeSingle();
    const newBalance = Number(profile?.coin_balance || 0) + coins;
    const { error: balErr } = await client
      .from('profiles')
      .update({ coin_balance: newBalance })
      .eq('id', params.userId);
    if (balErr) return { success: false, error: balErr.message, code: 'BALANCE_FAILED' };

    const { error: ledErr } = await client.from('wallet_ledger').insert({
      user_id: params.userId,
      call_id: callId,
      transaction_type: ledgerType,
      amount: coins,
      balance_after: newBalance,
      billing_minute: billingMinute,
      metadata: {
        claimKind: params.claimKind,
        missionKey: params.missionKey,
        rewardDay: params.rewardDay,
      },
    });

    if (ledErr) {
      // Unique violation → treat as already claimed (another request won the race)
      if (String(ledErr.message || '').toLowerCase().includes('duplicate') || ledErr.code === '23505') {
        const refreshed = await fetchUserDailyRewardsAdmin(params.userId);
        const { data: p2 } = await client.from('profiles').select('coin_balance').eq('id', params.userId).maybeSingle();
        return {
          success: false,
          code: 'ALREADY_CLAIMED',
          error: 'Already claimed',
          coinsAwarded: 0,
          coinBalance: Number(p2?.coin_balance || 0),
          record: refreshed.data,
          duplicate: true,
        };
      }
      return { success: false, error: ledErr.message, code: 'LEDGER_FAILED' };
    }

    return {
      success: true,
      coinsAwarded: coins,
      coinBalance: newBalance,
      record: updatedRows[0],
      duplicate: false,
    };
  } catch (err: any) {
    return { success: false, error: err.message, code: 'CLAIM_FAILED' };
  }
}

/**
 * Server-validated progress increments (capped). Never sets claim flags or coin totals from client.
 */
export async function applyDailyRewardProgressAdmin(params: {
  userId: string;
  rewardDay: string;
  type: string;
  receiverId?: string;
  seconds?: number;
  missions: Record<string, any>;
}): Promise<{ success: boolean; data?: any; error?: string; code?: string }> {
  const client = getSupabaseAdmin();
  if (!client) return { success: false, error: 'Admin client not available', code: 'NO_ADMIN' };

  try {
    const ensured = await ensureUserDailyRewardsRolloverAdmin(params.userId, params.rewardDay);
    if (!ensured.success || !ensured.data) {
      return { success: false, error: ensured.error || 'Load failed', code: 'LOAD_FAILED' };
    }
    const row = { ...ensured.data };
    const type = params.type;

    if (type === 'chat_friend') {
      if (row.task_chat_claimed) return { success: true, data: row };
      const rid = params.receiverId;
      if (!rid || rid === params.userId) {
        return { success: false, error: 'Invalid receiverId', code: 'INVALID_INPUT' };
      }
      const friends: string[] = Array.isArray(row.task_chat_friends) ? [...row.task_chat_friends] : [];
      const cap = Math.max(Number(params.missions.chatFriends?.target || 3) * 2, 10);
      if (!friends.includes(rid) && friends.length < cap) {
        friends.push(rid);
        row.task_chat_friends = friends;
      }
    } else if (type === 'quick_match') {
      if (row.task_quick_match_claimed) return { success: true, data: row };
      const cap = Math.max(Number(params.missions.quickMatches?.target || 10) * 2, 20);
      row.task_quick_matches = Math.min(cap, Number(row.task_quick_matches || 0) + 1);
    } else if (type === 'video_call') {
      // Progress stored in SECONDS; target from config is also seconds.
      if (row.task_video_call_claimed) return { success: true, data: row };
      const add = Math.max(0, Math.min(600, Math.floor(Number(params.seconds || 0))));
      if (add <= 0) return { success: false, error: 'Invalid seconds', code: 'INVALID_INPUT' };
      const cap = Math.max(Number(params.missions.videoCall?.target || 60) * 3, 3600);
      row.task_video_call_seconds = Math.min(cap, Number(row.task_video_call_seconds || 0) + add);
    } else if (type === 'moment') {
      if (row.task_moment_claimed) return { success: true, data: row };
      const cap = Math.max(Number(params.missions.momentInteract?.target || 3) * 2, 10);
      row.task_moment_interactions = Math.min(cap, Number(row.task_moment_interactions || 0) + 1);
    } else if (type === 'gift') {
      if (row.task_gift_claimed) return { success: true, data: row };
      const cap = Math.max(Number(params.missions.sendGift?.target || 1) * 2, 10);
      row.task_gift_count = Math.min(cap, Number(row.task_gift_count || 0) + 1);
    } else {
      return { success: false, error: 'Invalid progress type', code: 'INVALID_TYPE' };
    }

    row.updated_at = new Date().toISOString();
    const { data, error } = await client
      .from('user_daily_rewards')
      .upsert(row, { onConflict: 'user_id' })
      .select('*')
      .maybeSingle();
    if (error) return { success: false, error: error.message, code: 'UPDATE_FAILED' };
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message, code: 'PROGRESS_FAILED' };
  }
}

/**
 * Server-Side Admin: Upsert User Daily Rewards State
 * @deprecated Prefer claim/progress helpers — do not trust client claim flags.
 */
export async function upsertUserDailyRewardsAdmin(record: any): Promise<{ success: boolean; data?: any; error?: string }> {
  const client = getSupabaseAdmin();
  if (!client || (!record?.userId && !record?.user_id)) return { success: false, error: 'Admin client not available' };
  try {
    // Hardened: never accept claim booleans / coin totals from arbitrary client upserts.
    // Only merge safe progress fields onto the existing/ensured row.
    const userId = record.userId || record.user_id;
    const rewardDay =
      record.rewardDay ||
      record.tasksDate ||
      record.tasks_date ||
      new Date().toISOString().slice(0, 10);
    const ensured = await ensureUserDailyRewardsRolloverAdmin(userId, rewardDay);
    if (!ensured.success) return ensured;
    return { success: true, data: ensured.data };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Server-Side Admin: Fetch Creator Metrics
 */
export async function fetchCreatorMetricsAdmin(creatorId?: string): Promise<{ success: boolean; data?: any; error?: string }> {
  const client = getSupabaseAdmin();
  if (!client) return { success: false, error: 'Admin client not available' };
  try {
    let query = client.from('creator_metrics').select('*');
    if (creatorId) {
      query = query.eq('creator_id', creatorId);
    }
    const { data, error } = await query;
    if (error) return { success: false, error: error.message };
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Server-Side Admin: Upsert Creator Metrics
 */
export async function upsertCreatorMetricsAdmin(record: any): Promise<{ success: boolean; data?: any; error?: string }> {
  const client = getSupabaseAdmin();
  if (!client || (!record?.creatorId && !record?.creator_id)) return { success: false, error: 'Admin client not available' };
  try {
    const activeSeconds = Number(record.activeOnlineSeconds !== undefined ? record.activeOnlineSeconds : (record.active_online_seconds || 0));
    const callsOffered = Number(record.totalCallsOffered !== undefined ? record.totalCallsOffered : (record.total_calls_offered || 0));
    const callsAnswered = Number(record.totalCallsAnswered !== undefined ? record.totalCallsAnswered : (record.total_calls_answered || 0));
    const rawHealthScore = callsOffered > 0 ? (callsAnswered / callsOffered) * 100 : Number(record.responseHealthScore ?? record.response_health_score ?? 100);

    const payload = {
      creator_id: record.creatorId || record.creator_id,
      agency_leader_id: record.agencyLeaderId || record.agency_leader_id || null,
      active_online_seconds: activeSeconds,
      active_online_hours: Number((activeSeconds / 3600).toFixed(2)),
      coins_earned_from_calls: Number(record.coinsEarnedFromCalls !== undefined ? record.coinsEarnedFromCalls : (record.coins_earned_from_calls || 0)),
      coins_earned_from_gifts: Number(record.coinsEarnedFromGifts !== undefined ? record.coinsEarnedFromGifts : (record.coins_earned_from_gifts || 0)),
      total_target_coins: Number(record.totalTargetCoins !== undefined ? record.totalTargetCoins : (record.total_target_coins || 0)),
      current_streak_days: Number(record.currentStreakDays !== undefined ? record.currentStreakDays : (record.current_streak_days || 0)),
      streak_boost_until: record.streakBoostUntil || record.streak_boost_until || null,
      last_active_date: record.lastActiveDate || record.last_active_date || new Date().toISOString().split('T')[0],
      first_call_bonus_claimed_date: record.firstCallBonusClaimedDate || record.first_call_bonus_claimed_date || null,
      total_calls_offered: callsOffered,
      total_calls_answered: callsAnswered,
      total_calls_declined: Number(record.totalCallsDeclined !== undefined ? record.totalCallsDeclined : (record.total_calls_declined || 0)),
      total_calls_missed: Number(record.totalCallsMissed !== undefined ? record.totalCallsMissed : (record.total_calls_missed || 0)),
      response_health_score: Number(rawHealthScore.toFixed(1)),
      performance_tier: record.performanceTier || record.performance_tier || 'bronze',
      is_ready_now_active: Boolean(record.isReadyNowActive ?? record.is_ready_now_active),
      ready_now_toggled_at: record.readyNowToggledAt || record.ready_now_toggled_at || null,
      target_period_start: record.targetPeriodStart || record.target_period_start || null,
      target_period_end: record.targetPeriodEnd || record.target_period_end || null,
      bonus_earned_coins: Number(record.bonusEarnedCoins !== undefined ? record.bonusEarnedCoins : (record.bonus_earned_coins || 0)),
      bonus_earned_usd: Number(record.bonusEarnedUSD !== undefined ? record.bonusEarnedUSD : (record.bonus_earned_usd || 0)),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await client
      .from('creator_metrics')
      .upsert(payload, { onConflict: 'creator_id' })
      .select()
      .maybeSingle();

    if (error) return { success: false, error: error.message };
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Persist a completed call log for platform/admin analytics (bypasses client RLS).
 * Idempotent on call id so caller + receiver end handlers do not double-count.
 */
export async function upsertCallLogAdmin(log: {
  id: string;
  callerId: string;
  receiverId: string;
  hostId?: string;
  callerName?: string;
  hostName?: string;
  receiverName?: string;
  startTime?: number | string;
  endTime?: number | string | null;
  durationSeconds?: number;
  coinsSpent?: number;
  coinsEarned?: number;
  wasFriendCall?: boolean;
  status?: string;
  endReason?: string;
  teamLeaderId?: string | null;
  teamLeaderEarnedCoins?: number;
}): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseAdmin();
  if (!client) return { success: false, error: 'Admin client not available' };
  if (!log?.id || !log.callerId || !log.receiverId) {
    return { success: false, error: 'call log id, callerId, and receiverId are required' };
  }

  try {
    const startIso =
      typeof log.startTime === 'string'
        ? log.startTime
        : new Date(log.startTime || Date.now()).toISOString();
    const endIso =
      log.endTime == null
        ? new Date().toISOString()
        : typeof log.endTime === 'string'
          ? log.endTime
          : new Date(log.endTime).toISOString();

    const hostId = log.hostId || log.receiverId;
    const payload = {
      id: String(log.id),
      caller_id: String(log.callerId),
      receiver_id: String(log.receiverId),
      host_id: String(hostId),
      caller_name: log.callerName || null,
      host_name: log.hostName || log.receiverName || null,
      start_time: startIso,
      started_at: startIso,
      end_time: endIso,
      ended_at: endIso,
      duration_seconds: Math.max(0, Number(log.durationSeconds) || 0),
      coins_spent: Math.max(0, Number(log.coinsSpent) || 0),
      coins_earned: Math.max(0, Number(log.coinsEarned) || 0),
      was_friend_call: Boolean(log.wasFriendCall),
      status: log.status || 'completed',
      end_reason: log.endReason || log.status || 'completed',
      team_leader_id: log.teamLeaderId || null,
      team_leader_earned_coins: Math.max(0, Number(log.teamLeaderEarnedCoins) || 0),
    };

    const { error } = await client.from('call_logs').upsert(payload as any, { onConflict: 'id' });
    if (error) {
      console.warn('[Supabase Admin] upsertCallLogAdmin error:', error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    console.error('[Supabase Admin] upsertCallLogAdmin exception:', err);
    return { success: false, error: err?.message || 'Failed to upsert call log' };
  }
}

const SESSION_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Claim exclusive login for a profile — invalidates every other device. */
export async function claimExclusiveSessionAdmin(
  profileId: string,
  preferredSessionId?: string | null
): Promise<{ success: boolean; sessionId?: string; error?: string }> {
  const client = getSupabaseAdmin();
  if (!client) return { success: false, error: 'Supabase not configured' };
  const id = String(profileId || '').trim();
  if (!id) return { success: false, error: 'profileId required' };

  const preferred = typeof preferredSessionId === 'string' ? preferredSessionId.trim() : '';
  const sessionId =
    preferred && (SESSION_ID_RE.test(preferred) || preferred.startsWith('sess_'))
      ? preferred
      : typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `sess_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;

  try {
    const { error } = await client
      .from('profiles')
      .update({
        active_session_id: sessionId,
        updated_at: new Date().toISOString(),
      } as any)
      .eq('id', id);

    if (error) {
      console.warn('[Supabase Admin] claimExclusiveSessionAdmin error:', error.message);
      return { success: false, error: error.message };
    }
    return { success: true, sessionId };
  } catch (err: any) {
    console.error('[Supabase Admin] claimExclusiveSessionAdmin exception:', err);
    return { success: false, error: err?.message || 'Failed to claim session' };
  }
}

/**
 * Returns ok:false when a non-empty client session id does not match the profile's
 * active_session_id. Missing client header is treated as ok (legacy / first hydrate)
 * unless enforceMissing is true.
 */
export async function assertActiveSessionAdmin(opts: {
  profileId: string;
  clientSessionId?: string | null;
  enforceMissing?: boolean;
}): Promise<{ ok: true } | { ok: false; code: 'SESSION_REPLACED' }> {
  const client = getSupabaseAdmin();
  if (!client) return { ok: true };

  const profileId = String(opts.profileId || '').trim();
  if (!profileId) return { ok: true };

  const clientSessionId =
    typeof opts.clientSessionId === 'string' ? opts.clientSessionId.trim() : '';

  try {
    const { data } = await client
      .from('profiles')
      .select('active_session_id')
      .eq('id', profileId)
      .maybeSingle();

    const active = data?.active_session_id ? String(data.active_session_id).trim() : '';
    if (!active) return { ok: true };
    if (!clientSessionId) {
      return opts.enforceMissing ? { ok: false, code: 'SESSION_REPLACED' } : { ok: true };
    }
    if (clientSessionId !== active) {
      return { ok: false, code: 'SESSION_REPLACED' };
    }
    return { ok: true };
  } catch (err: any) {
    console.warn('[Supabase Admin] assertActiveSessionAdmin notice:', err?.message || err);
    return { ok: true };
  }
}


