import { supabase, isSupabaseConfigured } from '../lib/supabase';
export { isSupabaseConfigured };
import { Database } from '../types/database.types';
import {
  UserProfile,
  ChatMessage,
  OnlineStatus,
  DailyRewardRecord,
  GalleryVideoItem,
} from '../types';

/** Fallback when profiles.gallery_videos column is not migrated yet. */
const GALLERY_VIDEOS_SENTINEL_PREFIX = '__mc_gv1__:';

function splitGalleryPhotosAndVideos(gallery: unknown): {
  photos: string[];
  videos: GalleryVideoItem[] | null;
} {
  const photos: string[] = [];
  let videos: GalleryVideoItem[] | null = null;
  if (!Array.isArray(gallery)) return { photos, videos };
  for (const item of gallery) {
    const s = String(item || '');
    if (s.startsWith(GALLERY_VIDEOS_SENTINEL_PREFIX)) {
      try {
        const parsed = JSON.parse(s.slice(GALLERY_VIDEOS_SENTINEL_PREFIX.length));
        videos = normalizeGalleryVideos(parsed);
      } catch {
        videos = [];
      }
    } else if (s) {
      photos.push(s);
    }
  }
  return { photos, videos };
}

function normalizeGalleryVideos(raw: unknown): GalleryVideoItem[] {
  if (!raw) return [];
  let arr: unknown[] = [];
  if (typeof raw === 'string') {
    try {
      arr = JSON.parse(raw);
    } catch {
      return [];
    }
  } else if (Array.isArray(raw)) {
    arr = raw;
  } else {
    return [];
  }
  return arr
    .map((item: any) => {
      if (!item || typeof item !== 'object') return null;
      const storageKey = String(item.storageKey || item.storage_key || '').trim() || undefined;
      let url = String(item.url || '').trim();
      if (!url && storageKey) {
        url = `/api/storage/media?key=${encodeURIComponent(storageKey)}`;
      }
      if (!url && !storageKey) return null;
      const sizeBytes = Number(item.sizeBytes ?? item.size_bytes ?? 0);
      return {
        url,
        storageKey,
        sizeBytes: Number.isFinite(sizeBytes) && sizeBytes > 0 ? sizeBytes : 0,
        contentType: item.contentType || item.content_type || undefined,
        createdAt: item.createdAt || item.created_at || undefined,
      } as GalleryVideoItem;
    })
    .filter(Boolean) as GalleryVideoItem[];
}
import {
  ALL_WORLDWIDE_COUNTRIES,
  ALL_LANGUAGES,
  ALL_ZODIAC_SIGNS,
  ALL_INTERESTS,
} from '../utils/taxonomies';
import { DEFAULT_FLAG_SIZES } from '../constants/appDefaults';
import { authFetch } from '../utils/apiClient';

export type DbProfile = Database['public']['Tables']['profiles']['Row'];
export type DbMatch = Database['public']['Tables']['matches']['Row'];
export type DbMessage = Database['public']['Tables']['messages']['Row'];
export type DbSystemConfig = Database['public']['Tables']['system_configs']['Row'];
export type DbModerationReport = Database['public']['Tables']['moderation_reports']['Row'];
export type DbUserDailyRewards = Database['public']['Tables']['user_daily_rewards']['Row'];

/** PostgREST requires a filter on DELETE; PK columns are NOT NULL so this matches every row. */
function deleteAllRows(table: string, notNullColumn: string) {
  return (supabase.from(table) as any).delete().not(notNullColumn, 'is', null);
}

export function generateValidUuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function isValidUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

/** True for UUIDs that may reference auth.users (rejects synthetic user_/admin_ prefixes). */
export function isWritableAuthUuid(id: string | null | undefined): id is string {
  if (!id || !isValidUuid(id)) return false;
  const s = String(id);
  return !s.startsWith('user_') && !s.startsWith('admin_');
}

/**
 * Resolve auth_id for DB writes.
 * Prefer explicit authId; else allow profile.id when it is a real UUID.
 * Returns undefined to OMIT the column (never write null — preserves existing auth_id on upsert).
 */
export function resolveAuthIdForDbWrite(profile: {
  id?: string;
  authId?: string | null;
}): string | undefined {
  if (isWritableAuthUuid(profile.authId)) return profile.authId;
  if (isWritableAuthUuid(profile.id)) return profile.id;
  return undefined;
}

// Mapper from DbProfile to App UserProfile
export function mapDbProfileToUserProfile(db: DbProfile): UserProfile {
  return {
    id: db.id,
    // Prefer real auth_id; fall back to id only for UI identity matching (writes use resolveAuthIdForDbWrite)
    authId: db.auth_id || db.id,
    name: db.name,
    email: db.email || '',
    phone: db.phone || undefined,
    gender: db.gender,
    genderLocked: db.gender_locked,
    age: db.age || 25,
    dob: db.dob || '1998-01-01',
    nationality: db.nationality || 'United States',
    countryCode: db.country_code || 'US',
    spokenLanguages: db.spoken_languages || ['English'],
    bio: db.bio || '',
    extendedBio: db.extended_bio || undefined,
    locationCity: db.location_city || undefined,
    zodiac: db.zodiac || undefined,
    interests: db.interests || [],
    interestedIn: db.interested_in || [],
    tags: db.tags || [],
    avatarUrl: db.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=600',
    gallery: (() => {
      const split = splitGalleryPhotosAndVideos(db.gallery || []);
      return split.photos;
    })(),
    galleryVideos: (() => {
      const fromCol = normalizeGalleryVideos((db as any).gallery_videos);
      if (fromCol.length > 0) return fromCol;
      const split = splitGalleryPhotosAndVideos(db.gallery || []);
      return split.videos || [];
    })(),
    introVideoUrl: db.intro_video_url || undefined,
    verificationVideoUrl: db.verification_video_url || undefined,
    isVerified: db.is_verified,
    isOnboarded: db.is_onboarded ?? true,
    agreedToTerms: db.agreed_to_terms ?? true,
    agreedToAdultTerms: db.agreed_to_adult_terms ?? false,
    agreedToHostTerms: db.agreed_to_host_terms ?? false,
    kycStatus: db.kyc_status || 'unsubmitted',
    kycDocuments: db.kyc_documents ? (db.kyc_documents as any) : undefined,
    onlineStatus: db.online_status,
    role: db.role,
    createdAt: db.created_at,
    coinBalance: Number(db.coin_balance || 0),
    hourlyCoinRate: db.hourly_coin_rate,
    earningsCoins: Number(db.earnings_coins || 0),
    totalLifetimeEarnedUSD: Number(db.total_lifetime_earned_usd || 0),
    allowMockLocation: db.allow_mock_location,
    isUsingMockLocation: db.is_using_mock_location,
    mockLocationCity: db.mock_location_city || undefined,
    mockLocationCountry: db.mock_location_country || undefined,
    exactLocation: db.latitude && db.longitude ? {
      latitude: db.latitude,
      longitude: db.longitude,
      city: db.location_city || undefined,
      countryCode: db.country_code || undefined,
    } : undefined,
    totalCallsHosted: db.total_calls_hosted,
    totalCallMinutes: db.total_call_minutes,
    totalGiftsReceivedCount: db.total_gifts_received_count,
    ratingScore: Number(db.rating_score || 5.0),
    totalReviewsCount: db.total_reviews_count || 0,
    acceptanceRatePercent: Number(db.acceptance_rate_percent || 100),
    teamLeaderId: (db as any).team_leader_id || (db as any).created_by_id || undefined,
    createdById: (db as any).created_by_id || (db as any).team_leader_id || undefined,
    agencyName: (db as any).agency_name || undefined,
    coinEarnOverrideRate: (db as any).coin_earn_override_rate !== undefined && (db as any).coin_earn_override_rate !== null ? Number((db as any).coin_earn_override_rate) : undefined,
    commissionPercent: (db as any).commission_percent !== undefined && (db as any).commission_percent !== null ? Number((db as any).commission_percent) : undefined,
    teamLeaderNote: (db as any).team_leader_note || undefined,
    hasPasswordSet: Boolean((db as any).has_password_set || (db as any).password_hash || (db as any).password),
    isBanned: Boolean(db.is_banned),
    banReason: db.ban_reason || undefined,
    bannedUntil: (db as any).banned_until || undefined,
    bannedById: (db as any).banned_by_id || undefined,
    bannedByRole: (db as any).banned_by_role || undefined,
  };
}

// Mapper from App UserProfile to DbProfile Insert/Update
export function mapUserProfileToDbInsert(profile: UserProfile): Database['public']['Tables']['profiles']['Insert'] {
  // Persist auth_id when it references a UUID (including when authId === profile.id for public signups).
  // NEVER write auth_id: null — omitting the field preserves an existing DB value on upsert.
  // If the UUID is not in auth.users, callers must omit/retry on FK error (see upsertProfileToSupabase).
  const authIdForDb = resolveAuthIdForDbWrite(profile);

  const row: Database['public']['Tables']['profiles']['Insert'] = {
    id: profile.id || generateValidUuid(),
    name: profile.name,
    email: profile.email || null,
    phone: profile.phone || null,
    gender: profile.gender,
    gender_locked: profile.genderLocked,
    age: profile.age,
    dob: profile.dob,
    nationality: profile.nationality,
    country_code: profile.countryCode,
    bio: profile.bio,
    extended_bio: profile.extendedBio || null,
    location_city: profile.locationCity || profile.exactLocation?.city || null,
    zodiac: profile.zodiac || null,
    interests: profile.interests,
    interested_in: profile.interestedIn || [],
    tags: profile.tags || [],
    spoken_languages: profile.spokenLanguages,
    avatar_url: profile.avatarUrl,
    gallery: profile.gallery,
    gallery_videos: (profile.galleryVideos || []) as any,
    intro_video_url: profile.introVideoUrl || null,
    verification_video_url: profile.verificationVideoUrl || null,
    is_verified: profile.isVerified,
    is_onboarded: profile.isOnboarded ?? true,
    agreed_to_terms: profile.agreedToTerms ?? true,
    agreed_to_adult_terms: profile.agreedToAdultTerms ?? false,
    agreed_to_host_terms: profile.agreedToHostTerms ?? false,
    kyc_status: profile.kycStatus || 'unsubmitted',
    kyc_documents: profile.kycDocuments ? (profile.kycDocuments as any) : null,
    online_status: profile.onlineStatus,
    role: (profile.role === 'female_host' ? 'female_creator' : profile.role) as any,
    coin_balance: profile.coinBalance,
    hourly_coin_rate: profile.hourlyCoinRate || 10,
    earnings_coins: profile.earningsCoins || 0,
    total_lifetime_earned_usd: profile.totalLifetimeEarnedUSD || 0,
    latitude: profile.exactLocation?.latitude || null,
    longitude: profile.exactLocation?.longitude || null,
    allow_mock_location: profile.allowMockLocation || false,
    is_using_mock_location: profile.isUsingMockLocation || false,
    mock_location_city: profile.mockLocationCity || null,
    mock_location_country: profile.mockLocationCountry || null,
    total_calls_hosted: profile.totalCallsHosted || 0,
    total_call_minutes: profile.totalCallMinutes || 0,
    total_gifts_received_count: profile.totalGiftsReceivedCount || 0,
    rating_score: profile.ratingScore || 5.0,
    total_reviews_count: profile.totalReviewsCount || 0,
    acceptance_rate_percent: profile.acceptanceRatePercent || 100,
    is_banned: profile.isBanned ?? false,
    ban_reason: profile.banReason || null,
    banned_until: profile.bannedUntil || null,
    banned_by_id: profile.bannedById || null,
    banned_by_role: profile.bannedByRole || null,
    team_leader_id: profile.teamLeaderId || profile.createdById || null,
    created_by_id: profile.createdById || profile.teamLeaderId || null,
    agency_name: profile.agencyName || null,
    coin_earn_override_rate: profile.coinEarnOverrideRate ?? null,
    commission_percent: profile.commissionPercent ?? null,
    team_leader_note: profile.teamLeaderNote || null,
    has_password_set: Boolean(profile.hasPasswordSet),
  };
  if (authIdForDb) {
    row.auth_id = authIdForDb;
  }
  return row;
}

// Mapper from DbMessage to ChatMessage
export function mapDbMessageToChatMessage(db: DbMessage): ChatMessage {
  return {
    id: db.id,
    senderId: db.sender_id,
    receiverId: db.receiver_id,
    text: db.text || '',
    originalLanguage: db.original_language || 'English',
    translatedText: db.translated_text || undefined,
    targetLanguage: db.target_language || undefined,
    mediaUrl: db.media_url || undefined,
    type: db.type,
    giftInfo: db.gift_info ? (db.gift_info as any) : undefined,
    friendRequestInfo: db.friend_request_info ? (db.friend_request_info as any) : undefined,
    ratingInfo: (db as any).rating_info ? ((db as any).rating_info as any) : undefined,
    isRead: Boolean(db.is_read),
    createdAt: db.created_at,
    timestamp: db.created_at,
  };
}

// ============================================================================
// PROFILES API (High-Performance Modular Data Queries)
// ============================================================================

const DISCOVERY_PAGE_SIZE = 50;
const DISCOVERY_MAX_PAGES = 10; // hard cap: 500 profiles per sync

/** One discovery page — cursor is the last row's created_at (DESC). */
export async function fetchProfilesPageFromSupabase(opts?: {
  filterRole?: string;
  cursor?: string | null;
  limit?: number;
}): Promise<{ profiles: UserProfile[]; nextCursor: string | null } | null> {
  if (!isSupabaseConfigured()) return null;

  const limit = Math.min(Math.max(Number(opts?.limit) || DISCOVERY_PAGE_SIZE, 1), DISCOVERY_PAGE_SIZE);
  try {
    let query = supabase
      .from('profiles')
      .select('*')
      // Treat NULL is_banned as not banned (eq.false alone drops legacy/null rows)
      .or('is_banned.eq.false,is_banned.is.null')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (opts?.filterRole) {
      query = query.eq('role', opts.filterRole);
    }
    if (opts?.cursor) {
      query = query.lt('created_at', opts.cursor);
    }

    const { data, error } = await query;
    if (error) {
      console.warn('Supabase fetchProfilesPage error:', error.message);
      return null;
    }

    const profiles = (data || []).map(mapDbProfileToUserProfile);
    const nextCursor =
      profiles.length === limit ? profiles[profiles.length - 1]?.createdAt || null : null;
    return { profiles, nextCursor };
  } catch (err) {
    console.warn('Supabase fetchProfilesPage exception:', err);
    return null;
  }
}

/**
 * Discovery/directory hydrate — cursor pages of 50 (never an unbounded select *).
 * Caps at DISCOVERY_MAX_PAGES to protect PostgREST under concurrency.
 */
export async function fetchProfilesFromSupabase(filterRole?: string): Promise<UserProfile[] | null> {
  if (!isSupabaseConfigured()) return null;

  try {
    const all: UserProfile[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < DISCOVERY_MAX_PAGES; page++) {
      const batch = await fetchProfilesPageFromSupabase({ filterRole, cursor, limit: DISCOVERY_PAGE_SIZE });
      if (!batch) return all.length ? all : null;
      all.push(...batch.profiles);
      if (!batch.nextCursor) break;
      cursor = batch.nextCursor;
    }
    return all;
  } catch (err) {
    console.warn('Supabase fetchProfiles exception:', err);
    return null;
  }
}

export async function upsertProfileToSupabase(profile: UserProfile): Promise<boolean> {
  let validId = isValidUuid(profile.id) ? profile.id : undefined;

  // If email provided and validId is undefined, check if profile exists in Supabase to reuse ID
  if (!validId && profile.email && isSupabaseConfigured()) {
    try {
      const { data: userByEmail }: any = await (supabase.from('profiles') as any)
        .select('id')
        .eq('email', profile.email.toLowerCase().trim())
        .maybeSingle();
      if (userByEmail?.id) {
        validId = userByEmail.id;
      }
    } catch {}
  }

  if (!validId) {
    validId = generateValidUuid();
  }

  const normalizedProfile: UserProfile = {
    ...profile,
    id: validId,
    // Keep authId even when it equals profile.id (normal signup: id === auth.users.id)
    authId: isWritableAuthUuid(profile.authId)
      ? profile.authId
      : isWritableAuthUuid(validId)
        ? validId
        : undefined,
  };

  let clientSuccess = false;

  // 1. Try client-side Supabase direct upsert if configured
  if (isSupabaseConfigured()) {
    try {
      let payload: any = mapUserProfileToDbInsert(normalizedProfile);
      let retries = 5;

      while (retries > 0) {
        const { error } = await supabase
          .from('profiles')
          .upsert(payload, { onConflict: 'id' });

        if (!error) {
          clientSuccess = true;
          break;
        }

        if (
          error.message.includes('unique constraint') ||
          error.message.includes('profiles_email_key') ||
          error.message.includes('duplicate key')
        ) {
          if (payload.email) {
            try {
              const { data: existingUser }: any = await (supabase.from('profiles') as any)
                .select('id')
                .eq('email', payload.email)
                .limit(1)
                .maybeSingle();

              if (existingUser && existingUser.id) {
                payload.id = existingUser.id;
                const { error: updErr }: any = await (supabase.from('profiles') as any)
                  .update(payload)
                  .eq('id', existingUser.id);

                if (!updErr) {
                  clientSuccess = true;
                  break;
                }
              }
            } catch (e) { }
            delete payload.email;
          }
          retries--;
          continue;
        }

        if (
          error.message.includes('foreign key constraint') ||
          error.message.includes('auth_id_fkey') ||
          error.message.includes('profiles_auth_id_fkey')
        ) {
          delete payload.auth_id;
          retries--;
          continue;
        }

        const colMatch =
          error.message.match(/Could not find the '([^']+)' column/i) ||
          error.message.match(/column ["']?([a-zA-Z0-9_]+)["']? of/i) ||
          error.message.match(/column ["']?([a-zA-Z0-9_]+)["']? does not exist/i);

        if (colMatch && colMatch[1]) {
          delete payload[colMatch[1]];
          retries--;
          continue;
        }

        console.warn('Client Supabase upsertProfile warning (falling back to server upsert):', error.message);
        break;
      }
    } catch (err) {
      console.warn('Client Supabase upsertProfile exception:', err);
    }
  }

  // 2. Also dispatch to server Supabase upsert API endpoint to guarantee persistence (bypasses RLS issues)
  try {
    const sRes = await authFetch('/api/supabase/upsert-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(normalizedProfile),
    });
    if (sRes.ok) {
      const data = await sRes.json();
      if (data.success) {
        return true;
      }
    }
  } catch (err) {
    console.warn('Server Supabase upsert endpoint error:', err);
  }

  // 3. Sync to local server user directory
  try {
    await authFetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(normalizedProfile),
    });
  } catch (e) { }

  return clientSuccess;
}

/**
 * Update partial user profile columns directly in Supabase PostgreSQL by userId
 */
export async function updateUserProfileInSupabase(
  userId: string,
  updates: Partial<UserProfile>
): Promise<boolean> {
  if (!isSupabaseConfigured() || !userId) return false;

  try {
    const payload: Record<string, any> = {};
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.email !== undefined) payload.email = updates.email || null;
    if (updates.phone !== undefined) payload.phone = updates.phone || null;
    if (updates.gender !== undefined) payload.gender = updates.gender;
    if (updates.age !== undefined) payload.age = Number(updates.age);
    if (updates.dob !== undefined) payload.dob = updates.dob;
    if (updates.nationality !== undefined) payload.nationality = updates.nationality;
    if (updates.countryCode !== undefined) payload.country_code = String(updates.countryCode).toUpperCase();
    if (updates.bio !== undefined) payload.bio = updates.bio;
    if (updates.extendedBio !== undefined) payload.extended_bio = updates.extendedBio;
    if (updates.locationCity !== undefined) payload.location_city = updates.locationCity;
    if (updates.spokenLanguages !== undefined) payload.spoken_languages = updates.spokenLanguages;
    if (updates.interests !== undefined) payload.interests = updates.interests;
    if (updates.tags !== undefined) payload.tags = updates.tags;
    if (updates.avatarUrl !== undefined) payload.avatar_url = updates.avatarUrl;
    if (updates.gallery !== undefined) payload.gallery = updates.gallery;
    if (updates.galleryVideos !== undefined) payload.gallery_videos = updates.galleryVideos;
    if (updates.introVideoUrl !== undefined) payload.intro_video_url = updates.introVideoUrl || null;
    if (updates.isVerified !== undefined) payload.is_verified = updates.isVerified;
    if (updates.role !== undefined) payload.role = updates.role === 'female_host' ? 'female_creator' : updates.role;
    // coin_balance / earnings_coins are server-only (REVOKE + RPC). Never accept client wallet writes.
    if (updates.hourlyCoinRate !== undefined) payload.hourly_coin_rate = Number(updates.hourlyCoinRate);
    if (updates.totalLifetimeEarnedUSD !== undefined) payload.total_lifetime_earned_usd = Number(updates.totalLifetimeEarnedUSD);
    // online_status / last_seen are owned by /api/presence (Redis); do not write from profile updates
    if (updates.teamLeaderId !== undefined) payload.team_leader_id = updates.teamLeaderId;
    if (updates.createdById !== undefined) payload.created_by_id = updates.createdById;
    if (updates.coinEarnOverrideRate !== undefined) payload.coin_earn_override_rate = updates.coinEarnOverrideRate;
    if (updates.commissionPercent !== undefined) payload.commission_percent = updates.commissionPercent;
    if (updates.isBanned !== undefined) payload.is_banned = updates.isBanned;
    if (updates.banReason !== undefined) payload.ban_reason = updates.banReason;
    if (updates.isUsingMockLocation !== undefined) payload.is_using_mock_location = updates.isUsingMockLocation;
    if (updates.mockLocationCountry !== undefined) payload.mock_location_country = updates.mockLocationCountry;
    if (updates.mockLocationCity !== undefined) payload.mock_location_city = updates.mockLocationCity;
    if (updates.allowMockLocation !== undefined) payload.allow_mock_location = updates.allowMockLocation;
    if (updates.exactLocation?.latitude !== undefined) payload.latitude = updates.exactLocation.latitude;
    if (updates.exactLocation?.longitude !== undefined) payload.longitude = updates.exactLocation.longitude;
    payload.updated_at = new Date().toISOString();

    // 1. Direct client-side update by ID
    const { data: updatedRows, error: updateErr }: any = await (supabase.from('profiles') as any)
      .update(payload)
      .eq('id', userId)
      .select('id');

    // 1b. If no rows updated, try auth_id then email
    if ((!updatedRows || updatedRows.length === 0 || updateErr)) {
      await (supabase.from('profiles') as any).update(payload).eq('auth_id', userId);
      if (updates.email) {
        const cleanEmail = updates.email.toLowerCase().trim();
        await (supabase.from('profiles') as any)
          .update(payload)
          .ilike('email', cleanEmail);
      }
    }

    // Wallet and admin callers still mirror through the backend. Profile saves use
    // persistUserProfileUpdate instead, so they do not race this fire-and-forget write.
    authFetch('/api/supabase/update-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, updates: { ...updates, email: updates.email } }),
    }).catch(() => {});

    return true;
  } catch (err) {
    console.warn('Supabase updateUserProfile exception:', err);
    return false;
  }
}

/**
 * Authoritative partial profile write. One request, awaited, so a later
 * presence heartbeat cannot persist a stale full-profile snapshot over it.
 */
export async function persistUserProfileUpdate(
  userId: string,
  updates: Partial<UserProfile>
): Promise<boolean> {
  if (!userId || !updates || Object.keys(updates).length === 0) return false;
  try {
    const res = await authFetch('/api/supabase/update-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, updates }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      const errMsg =
        (typeof data?.error === 'string' && data.error) ||
        data?.error?.message ||
        `HTTP ${res.status}`;
      console.warn('persistUserProfileUpdate rejected:', errMsg, {
        userId,
        keys: Object.keys(updates),
      });
      return false;
    }
    return true;
  } catch (err) {
    console.warn('persistUserProfileUpdate failed:', err);
    return false;
  }
}

export async function deleteProfileFromSupabase(userId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  try {
    const { error } = await supabase
      .from('profiles')
      .delete()
      .eq('id', userId);

    if (error) {
      console.warn('Supabase deleteProfile error:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Supabase deleteProfile exception:', err);
    return false;
  }
}

/**
 * Directly update a user's online_status in Supabase PostgreSQL
 */
export async function updateUserStatusInSupabase(
  userId: string,
  status: OnlineStatus
): Promise<boolean> {
  // online | offline | busy (manual). in_call normalizes to busy.
  // Open call_logs still force busy on the server when not offline.
  const normalized: OnlineStatus =
    status === 'in_call' || status === 'busy'
      ? 'busy'
      : status === 'offline'
        ? 'offline'
        : 'online';

  // Presence leases live in Redis only — never fall back to profiles.last_seen_at
  try {
    const res = await authFetch('/api/presence/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        status: normalized,
      }),
    });
    return res.ok;
  } catch (e) {
    console.warn('presence heartbeat status update failed:', e);
    return false;
  }
}

/**
 * Fast lightweight fetch of all user statuses from Supabase
 */
export async function fetchUserStatusesFromSupabase(): Promise<Array<{ id: string; online_status: OnlineStatus }> | null> {
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, online_status');

      if (!error && data && data.length > 0) {
        return data as Array<{ id: string; online_status: OnlineStatus }>;
      }
    } catch (err) {
      console.warn('Direct fetchUserStatusesFromSupabase exception:', err);
    }
  }

  // Fallback to server admin endpoint
  try {
    const res = await authFetch('/api/supabase/user-statuses');
    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.statuses)) {
        return data.statuses;
      }
    }
  } catch (e) { }

  return null;
}


// Purge all mock/demo profiles from Supabase database
export async function purgeMockProfilesFromSupabase(mockIds: string[]): Promise<{
  success: boolean;
  deletedCount: number;
  error?: string;
}> {
  if (!isSupabaseConfigured()) {
    return { success: false, deletedCount: 0, error: 'Supabase is not configured' };
  }

  try {
    if (!mockIds || mockIds.length === 0) {
      return { success: true, deletedCount: 0 };
    }

    const { error } = await supabase
      .from('profiles')
      .delete()
      .in('id', mockIds);

    if (error) {
      console.warn('Supabase purgeMockProfiles error:', error.message);
      return { success: false, deletedCount: 0, error: error.message };
    }

    return { success: true, deletedCount: mockIds.length };
  } catch (err: any) {
    console.warn('Supabase purgeMockProfiles exception:', err);
    return { success: false, deletedCount: 0, error: err.message };
  }
}

// Purge all messages from Supabase messages table
export async function purgeMessagesFromSupabase(): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) return { success: false, error: 'Supabase is not configured' };
  try {
    const { error } = await deleteAllRows('messages', 'id');
    if (error) {
      console.warn('Supabase purgeMessages error:', error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// Purge all matches from Supabase matches table
export async function purgeMatchesFromSupabase(): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) return { success: false, error: 'Supabase is not configured' };
  try {
    const { error } = await deleteAllRows('matches', 'id');
    if (error) {
      console.warn('Supabase purgeMatches error:', error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// Purge all moderation reports from Supabase
export async function purgeModerationReportsFromSupabase(): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) return { success: false, error: 'Supabase is not configured' };
  try {
    const { error } = await deleteAllRows('moderation_reports', 'id');
    if (error) {
      console.warn('Supabase purgeModerationReports error:', error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// Purge all call logs from Supabase
export async function purgeCallLogsFromSupabase(): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) return { success: false, error: 'Supabase is not configured' };
  try {
    const { error } = await deleteAllRows('call_logs', 'id');
    if (error) {
      console.warn('Supabase purgeCallLogs error:', error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// Purge all friend requests from Supabase
export async function purgeFriendRequestsFromSupabase(): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) return { success: false, error: 'Supabase is not configured' };
  try {
    const { error } = await deleteAllRows('friend_requests', 'id');
    if (error) {
      console.warn('Supabase purgeFriendRequests error:', error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// Purge all payout requests from Supabase
export async function purgePayoutRequestsFromSupabase(): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) return { success: false, error: 'Supabase is not configured' };
  try {
    const { error } = await deleteAllRows('payout_requests', 'id');
    if (error) {
      console.warn('Supabase purgePayoutRequests error:', error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// Purge all feed posts from Supabase
export async function purgeFeedPostsFromSupabase(): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) return { success: false, error: 'Supabase is not configured' };
  try {
    const { error } = await deleteAllRows('feed_posts', 'id');
    if (error) {
      console.warn('Supabase purgeFeedPosts error:', error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// Purge all favorites from Supabase
export async function purgeFavoritesFromSupabase(): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) return { success: false, error: 'Supabase is not configured' };
  try {
    const { error } = await deleteAllRows('favorites', 'user_id');
    if (error) {
      console.warn('Supabase purgeFavorites error:', error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// Purge all blocked users from Supabase
export async function purgeBlockedUsersFromSupabase(): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) return { success: false, error: 'Supabase is not configured' };
  try {
    const { error } = await deleteAllRows('blocked_users', 'user_id');
    if (error) {
      console.warn('Supabase purgeBlockedUsers error:', error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// Purge all creator goals from Supabase
export async function purgeCreatorGoalsFromSupabase(): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) return { success: false, error: 'Supabase is not configured' };
  try {
    const { error } = await deleteAllRows('creator_goals', 'creator_id');
    if (error) {
      console.warn('Supabase purgeCreatorGoals error:', error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// Reset financial balances on Supabase profiles
export async function resetFinancialBalancesInSupabase(type: 'caller_coins' | 'creator_earnings'): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) return { success: false, error: 'Supabase is not configured' };
  try {
    const updates: any = {};
    if (type === 'caller_coins') updates.coin_balance = 0;
    if (type === 'creator_earnings') {
      updates.earnings_coins = 0;
      updates.total_lifetime_earned_usd = 0;
      updates.total_calls_hosted = 0;
      updates.total_call_minutes = 0;
    }

    const { error } = await (supabase.from('profiles') as any).update(updates).not('id', 'is', null);
    if (error) {
      console.warn('Supabase resetFinancialBalances error:', error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// Purge all profiles from Supabase
export async function purgeAllProfilesFromSupabase(keepAdmin: boolean = true): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) return { success: false, error: 'Supabase is not configured' };
  try {
    let query = supabase.from('profiles').delete();
    if (keepAdmin) {
      query = query.neq('role', 'admin');
    } else {
      query = query.not('id', 'is', null);
    }
    const { error } = await query;
    if (error) {
      console.warn('Supabase purgeAllProfiles error:', error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// Real-time Supabase Subscription for Global User Profiles Directory
export function subscribeToRealtimeProfiles(
  onProfileEvent: (event: {
    eventType: 'INSERT' | 'UPDATE' | 'DELETE';
    profile?: UserProfile;
    userId?: string;
  }) => void
) {
  if (!isSupabaseConfigured()) return () => { };

  // INSERT/DELETE only — never subscribe to profile UPDATEs (heartbeat/last_seen fan-out).
  const channel = supabase
    .channel('public_profiles_changes')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'profiles',
      },
      (payload) => {
        try {
          const raw = payload.new as DbProfile;
          if (raw && raw.id) {
            const mapped = mapDbProfileToUserProfile(raw);
            onProfileEvent({ eventType: 'INSERT', profile: mapped, userId: mapped.id });
          }
        } catch (err) {
          console.warn('Realtime profiles channel handler warning:', err);
        }
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'profiles',
      },
      (payload) => {
        try {
          const oldRecord = payload.old as DbProfile;
          const deletedId = oldRecord?.id;
          if (deletedId) {
            onProfileEvent({ eventType: 'DELETE', userId: deletedId });
          }
        } catch (err) {
          console.warn('Realtime profiles channel handler warning:', err);
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// Bulk upsert all profiles to populate/seed empty Supabase tables
export async function bulkUpsertProfilesToSupabase(profiles: UserProfile[]): Promise<{
  success: boolean;
  count: number;
  error?: string;
}> {
  if (!profiles || profiles.length === 0) {
    return { success: true, count: 0 };
  }

  // 1. Try client-side Supabase batch upsert if configured
  if (isSupabaseConfigured()) {
    try {
      let payloads = profiles.map(mapUserProfileToDbInsert);
      let retries = 3;

      while (retries > 0) {
        const { data, error } = await supabase
          .from('profiles')
          .upsert(payloads as any, { onConflict: 'id' })
          .select('id');

        if (!error) {
          const insertedCount = data?.length || payloads.length;
          return { success: true, count: insertedCount };
        }

        console.warn(`[Client Supabase] bulkUpsert error (${retries} retries left):`, error.message);

        // Handle foreign key constraint on auth_id
        if (
          error.message.includes('foreign key constraint') ||
          error.message.includes('auth_id_fkey') ||
          error.message.includes('profiles_auth_id_fkey')
        ) {
          payloads = payloads.map((p) => {
            const copy = { ...p };
            delete copy.auth_id;
            return copy;
          });
          retries--;
          continue;
        }

        // Handle column not found in remote schema
        const colMatch =
          error.message.match(/Could not find the '([^']+)' column/i) ||
          error.message.match(/column ["']?([a-zA-Z0-9_]+)["']? of/i) ||
          error.message.match(/column ["']?([a-zA-Z0-9_]+)["']? does not exist/i);

        if (colMatch && colMatch[1]) {
          const missingCol = colMatch[1];
          payloads = payloads.map((p) => {
            const copy = { ...p };
            delete (copy as any)[missingCol];
            return copy;
          });
          retries--;
          continue;
        }

        break;
      }
    } catch (err: any) {
      console.warn('[Client Supabase] bulkUpsertProfiles exception, falling back to server:', err);
    }
  }

  // 2. Fallback to server-side admin bulk upsert API
  try {
    const sRes = await authFetch('/api/supabase/bulk-upsert-profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profiles }),
    });

    if (sRes.ok) {
      const sData = await sRes.json();
      if (sData.success) {
        return { success: true, count: sData.count || profiles.length };
      }
      return { success: false, count: 0, error: sData.error || 'Server bulk upsert failed.' };
    }
  } catch (err: any) {
    console.warn('Server bulk upsert fallback exception:', err);
  }

  return {
    success: false,
    count: 0,
    error: 'Failed to sync profiles into Supabase. Check database credentials or foreign key constraints.',
  };
}

// Check count of profiles currently stored in Supabase
export async function getSupabaseProfilesStats(): Promise<{
  configured: boolean;
  tableExists: boolean;
  count: number;
  error?: string;
}> {
  if (!isSupabaseConfigured()) {
    return { configured: false, tableExists: false, count: 0, error: 'Supabase not configured' };
  }

  try {
    const { count, error } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true });

    if (error) {
      return {
        configured: true,
        tableExists: false,
        count: 0,
        error: error.message,
      };
    }

    return {
      configured: true,
      tableExists: true,
      count: count ?? 0,
    };
  } catch (err: any) {
    return {
      configured: true,
      tableExists: false,
      count: 0,
      error: err.message,
    };
  }
}

// ============================================================================
// MATCHES API (Joined Queries avoiding N+1)
// ============================================================================

export async function fetchMatchesForUser(userId: string) {
  if (!isSupabaseConfigured()) return null;

  try {
    const { data, error } = await (supabase.from('matches') as any)
      .select('*')
      .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
      .order('last_interaction_at', { ascending: false });

    if (error) {
      console.warn('Supabase fetchMatches error:', error.message);
      return null;
    }

    return data;
  } catch (err) {
    console.warn('Supabase fetchMatches exception:', err);
    return null;
  }
}

export async function upsertMatchToSupabase(
  userAId: string,
  userBId: string,
  status: 'pending' | 'matched' | 'rejected' | 'unmatched' = 'pending',
  initiatedBy?: string
): Promise<boolean> {
  // Prefer Express /api/v1/matches/* for mutations. This client helper remains for
  // legacy/admin paths only — default is pending (never auto-matched).
  if (!isSupabaseConfigured()) return false;

  try {
    const actorId = initiatedBy || userAId;
    const nowIso = new Date().toISOString();

    // Check if match already exists in either direction
    const { data: existing } = await (supabase.from('matches') as any)
      .select('id, user_a_id, user_b_id')
      .or(`and(user_a_id.eq.${userAId},user_b_id.eq.${userBId}),and(user_a_id.eq.${userBId},user_b_id.eq.${userAId})`)
      .limit(1);

    if (existing && existing.length > 0) {
      const matchRecord = existing[0];
      const { error } = await (supabase.from('matches') as any)
        .update({
          status,
          last_interaction_at: nowIso,
          matched_at: status === 'matched' ? nowIso : undefined,
        })
        .eq('id', matchRecord.id);

      if (error) {
        console.warn('Supabase updateMatch error:', error.message);
        return false;
      }
      return true;
    } else {
      const { error } = await (supabase.from('matches') as any)
        .insert({
          user_a_id: userAId,
          user_b_id: userBId,
          status,
          initiated_by: actorId,
          matched_at: status === 'matched' ? nowIso : null,
          last_interaction_at: nowIso,
          created_at: nowIso,
        });

      if (error) {
        console.warn('Supabase insertMatch error:', error.message);
        return false;
      }
      return true;
    }
  } catch (err: any) {
    console.warn('Supabase upsertMatch exception:', err);
    return false;
  }
}

export async function deleteMatchFromSupabase(userAId: string, userBId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  try {
    const { error } = await (supabase.from('matches') as any)
      .delete()
      .or(`and(user_a_id.eq.${userAId},user_b_id.eq.${userBId}),and(user_a_id.eq.${userBId},user_b_id.eq.${userAId})`);

    return !error;
  } catch {
    return false;
  }
}

// ============================================================================
// MESSAGES API (Paginated & Indexed Conversation Threads)
// ============================================================================

/**
 * Conversation page — newest-first cursor (`created_at < cursor`), max 50.
 * Returns chronological ascending for UI after reversing the DESC page.
 */
export async function fetchConversationMessages(
  userId1: string,
  userId2: string,
  limit: number = 40,
  cursor?: string | null
): Promise<{ messages: ChatMessage[]; nextCursor: string | null } | null> {
  if (!isSupabaseConfigured()) return null;

  const pageSize = Math.min(Math.max(Number(limit) || 40, 1), 50);
  try {
    let query = supabase
      .from('messages')
      .select('*')
      .or(
        `and(sender_id.eq.${userId1},receiver_id.eq.${userId2}),and(sender_id.eq.${userId2},receiver_id.eq.${userId1})`
      )
      .order('created_at', { ascending: false })
      .limit(pageSize);

    if (cursor) {
      query = query.lt('created_at', cursor);
    }

    const { data, error } = await query;

    if (error) {
      console.warn('Supabase fetchConversation error:', error.message);
      return null;
    }

    const newestFirst = (data || []).map(mapDbMessageToChatMessage);
    const nextCursor =
      newestFirst.length === pageSize
        ? newestFirst[newestFirst.length - 1]?.createdAt || null
        : null;
    return { messages: newestFirst.slice().reverse(), nextCursor };
  } catch (err) {
    console.warn('Supabase fetchConversation exception:', err);
    return null;
  }
}

/** Recent messages for a user across all conversations (authoritative hydrate; not localStorage). */
export async function fetchRecentMessagesForUser(
  userId: string,
  limit: number = 50
): Promise<ChatMessage[] | null> {
  if (!isSupabaseConfigured() || !userId) return null;

  const pageSize = Math.min(Math.max(Number(limit) || 50, 1), 50);
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .order('created_at', { ascending: false })
      .limit(pageSize);

    if (error) {
      console.warn('Supabase fetchRecentMessagesForUser error:', error.message);
      return null;
    }

    // Newest-first page → chronological ascending for UI
    const mapped = (data || []).map(mapDbMessageToChatMessage).reverse();

    // Soft-hide: apply per-conversation clear watermarks for this user
    const { data: clears, error: clearErr } = await supabase
      .from('message_conversation_clears')
      .select('other_user_id, cleared_at')
      .eq('user_id', userId);

    if (clearErr) {
      // Table may not exist yet on older DBs — return unfiltered rather than failing hydrate
      console.warn('Supabase message_conversation_clears fetch note:', clearErr.message);
      return mapped;
    }

    if (!clears || clears.length === 0) return mapped;

    const clearMap = new Map<string, number>();
    for (const row of clears) {
      const otherId = String((row as any).other_user_id || '');
      const ts = new Date(String((row as any).cleared_at || '')).getTime();
      if (otherId && !Number.isNaN(ts)) clearMap.set(otherId, ts);
    }

    return mapped.filter((m) => {
      const otherId = m.senderId === userId ? m.receiverId : m.senderId;
      const clearedAt = clearMap.get(otherId);
      if (clearedAt == null) return true;
      const createdMs = new Date(m.createdAt || m.timestamp).getTime();
      if (Number.isNaN(createdMs)) return true;
      return createdMs > clearedAt;
    });
  } catch (err) {
    console.warn('Supabase fetchRecentMessagesForUser exception:', err);
    return null;
  }
}

/**
 * @deprecated Client-side message inserts are not production-safe (UUID/timestamptz).
 * Use POST /api/messages via AppContext.sendMessage instead.
 */
export async function saveMessageToSupabase(_message: ChatMessage): Promise<boolean> {
  console.warn(
    'saveMessageToSupabase is deprecated — messages must be inserted via POST /api/messages'
  );
  return false;
}

// ============================================================================
// REALTIME CHAT & PRESENCE SUBSCRIPTIONS
// ============================================================================

/** Realtime friend_requests for badge counts (pending incoming). */
export function subscribeToFriendRequests(
  userId: string,
  onChange: (row: {
    id: string;
    senderId: string;
    receiverId: string;
    status: string;
    createdAt?: string;
  }) => void
) {
  if (!isSupabaseConfigured() || !userId) return () => {};

  const mapRow = (raw: any) => ({
    id: String(raw.id),
    senderId: String(raw.sender_id),
    receiverId: String(raw.receiver_id),
    status: String(raw.status || 'pending'),
    createdAt: raw.created_at,
  });

  const channel = supabase
    .channel(`friend_requests_${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'friend_requests',
        filter: `receiver_id=eq.${userId}`,
      },
      (payload) => {
        const raw = (payload.new || payload.old) as any;
        if (raw?.id) onChange(mapRow(raw));
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'friend_requests',
        filter: `sender_id=eq.${userId}`,
      },
      (payload) => {
        const raw = (payload.new || payload.old) as any;
        if (raw?.id) onChange(mapRow(raw));
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Targeted chat inbox: Realtime Broadcast on `user:{userId}` (event `chat`).
 * Reconnects once on CHANNEL_ERROR / TIMED_OUT. Optional postgres_changes UPDATE
 * remains as a thin read-receipt fallback (no table-wide INSERT fan-out).
 */
export function subscribeToRealtimeChat(
  userId: string,
  onNewMessage: (msg: ChatMessage) => void,
  onMessageUpdate?: (msg: ChatMessage) => void
) {
  if (!isSupabaseConfigured() || !userId) return () => {};

  let disposed = false;
  let channel: ReturnType<typeof supabase.channel> | null = null;
  let updateChannel: ReturnType<typeof supabase.channel> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retryCount = 0;

  const handlePayload = (payload: any) => {
    const type = String(payload?.type || '');
    const msg = payload?.message;
    if (!msg || typeof msg !== 'object') return;
    const normalized: ChatMessage = {
      id: String(msg.id || ''),
      senderId: String(msg.senderId || msg.sender_id || ''),
      receiverId: String(msg.receiverId || msg.receiver_id || ''),
      text: String(msg.text || ''),
      originalLanguage: String(msg.originalLanguage || msg.original_language || 'English'),
      mediaUrl: msg.mediaUrl || msg.media_url || undefined,
      type: (msg.type || 'text') as ChatMessage['type'],
      isRead: Boolean(msg.isRead ?? msg.is_read),
      createdAt: msg.createdAt || msg.created_at || msg.timestamp || new Date().toISOString(),
      timestamp: msg.timestamp || msg.createdAt || msg.created_at || new Date().toISOString(),
      clientTempId: msg.clientTempId || undefined,
    };
    if (!normalized.id || !normalized.senderId || !normalized.receiverId) return;
    if (type === 'chat:update') {
      onMessageUpdate?.(normalized);
      return;
    }
    // chat:message (default)
    onNewMessage(normalized);
  };

  const attach = () => {
    if (disposed) return;
    if (channel) {
      try {
        supabase.removeChannel(channel);
      } catch {
        /* ignore */
      }
      channel = null;
    }

    const inbox = supabase.channel(`user:${userId}`, {
      config: { broadcast: { self: true } },
    });
    inbox.on('broadcast', { event: 'chat' }, ({ payload }) => {
      try {
        handlePayload(payload);
      } catch (err) {
        console.warn('[subscribeToRealtimeChat] broadcast handler', err);
      }
    });

    channel = inbox;
    inbox.subscribe((status) => {
      if (disposed) return;
      if (status === 'SUBSCRIBED') {
        retryCount = 0;
        return;
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        if (retryCount >= 2) {
          console.warn('[subscribeToRealtimeChat] inbox channel failed after retries');
          return;
        }
        retryCount += 1;
        if (retryTimer) clearTimeout(retryTimer);
        retryTimer = setTimeout(() => {
          console.warn('[subscribeToRealtimeChat] reconnecting user inbox…');
          attach();
        }, 800 * retryCount);
      }
    });

    // Narrow UPDATE feed for read receipts only (not INSERT delivery)
    if (onMessageUpdate && !updateChannel) {
      updateChannel = supabase
        .channel(`chat_read_${userId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'messages',
            filter: `receiver_id=eq.${userId}`,
          },
          (payload) => {
            const raw = payload.new as DbMessage;
            if (raw) onMessageUpdate(mapDbMessageToChatMessage(raw));
          }
        )
        .subscribe();
    }
  };

  attach();

  return () => {
    disposed = true;
    if (retryTimer) clearTimeout(retryTimer);
    if (channel) {
      try {
        supabase.removeChannel(channel);
      } catch {
        /* ignore */
      }
    }
    if (updateChannel) {
      try {
        supabase.removeChannel(updateChannel);
      } catch {
        /* ignore */
      }
    }
  };
}

/** Load one conversation page (cursor = older than created_at). Prefers API, falls back to direct query. */
export async function loadConversationHistoryPage(
  selfUserId: string,
  otherUserId: string,
  opts?: { cursor?: string | null; limit?: number }
): Promise<{ messages: ChatMessage[]; nextCursor: string | null } | null> {
  const self = String(selfUserId || '').trim();
  const other = String(otherUserId || '').trim();
  if (!self || !other) return null;
  const limit = Math.min(Math.max(Number(opts?.limit) || 40, 1), 50);
  const cursor = opts?.cursor ? String(opts.cursor) : '';

  try {
    const qs = new URLSearchParams({ limit: String(limit) });
    if (cursor) qs.set('cursor', cursor);
    const { authFetch } = await import('../utils/apiClient');
    const res = await authFetch(
      `/api/messages/conversation/${encodeURIComponent(other)}?${qs.toString()}`
    );
    if (res.ok) {
      const json = await res.json().catch(() => null);
      if (json?.success && Array.isArray(json.messages)) {
        const messages = (json.messages as any[]).map((row) =>
          row.senderId
            ? (row as ChatMessage)
            : mapDbMessageToChatMessage(row as DbMessage)
        );
        return {
          messages,
          nextCursor: typeof json.nextCursor === 'string' ? json.nextCursor : null,
        };
      }
    }
  } catch (e) {
    console.warn('[loadConversationHistoryPage] API note:', e);
  }

  return fetchConversationMessages(self, other, limit, cursor || null);
}

// ============================================================================
// SYSTEM CONFIGS & ADMIN SETTINGS API
// ============================================================================

export async function fetchSystemConfigsFromSupabase(): Promise<DbSystemConfig | null> {
  if (!isSupabaseConfigured()) return null;

  try {
    const { data, error } = await supabase
      .from('system_configs')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn('Supabase fetchSystemConfigs error:', error.message);
      return null;
    }
    return data;
  } catch (err) {
    console.warn('Supabase fetchSystemConfigs exception:', err);
    return null;
  }
}

export async function updateSystemConfigsInSupabase(
  updates: Record<string, any>
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  try {
    // 1. Check existing config id
    const existing = await fetchSystemConfigsFromSupabase();
    const configId = existing?.id || 'default';

    const payload: Record<string, any> = {
      id: configId,
      updated_at: new Date().toISOString(),
    };

    if (updates.coinBurnRatePerMin !== undefined) payload.coin_burn_rate_per_min = updates.coinBurnRatePerMin;
    if (updates.coin_burn_rate_per_min !== undefined) payload.coin_burn_rate_per_min = updates.coin_burn_rate_per_min;
    if (updates.coinBurnRateFriendPerMin !== undefined) payload.coin_burn_rate_friend_per_min = updates.coinBurnRateFriendPerMin;
    if (updates.coin_burn_rate_friend_per_min !== undefined) payload.coin_burn_rate_friend_per_min = updates.coin_burn_rate_friend_per_min;
    if (updates.femaleHostSharePercent !== undefined) payload.female_host_share_percent = updates.femaleHostSharePercent;
    if (updates.female_host_share_percent !== undefined) payload.female_host_share_percent = updates.female_host_share_percent;
    if (updates.femaleHostTargetSharePercent !== undefined) {
      payload.female_host_target_share_percent = updates.femaleHostTargetSharePercent;
    }
    if (updates.female_host_target_share_percent !== undefined) {
      payload.female_host_target_share_percent = updates.female_host_target_share_percent;
    }
    if (updates.teamLeaderSharePercent !== undefined) payload.team_leader_share_percent = updates.teamLeaderSharePercent;
    if (updates.team_leader_share_percent !== undefined) payload.team_leader_share_percent = updates.team_leader_share_percent;
    if (updates.giftFemaleHostSharePercent !== undefined) payload.gift_female_host_share_percent = updates.giftFemaleHostSharePercent;
    if (updates.gift_female_host_share_percent !== undefined) payload.gift_female_host_share_percent = updates.gift_female_host_share_percent;
    if (updates.giftTeamLeaderSharePercent !== undefined) payload.gift_team_leader_share_percent = updates.giftTeamLeaderSharePercent;
    if (updates.gift_team_leader_share_percent !== undefined) payload.gift_team_leader_share_percent = updates.gift_team_leader_share_percent;
    if (updates.enableVirtualGifts !== undefined) payload.enable_virtual_gifts = updates.enableVirtualGifts;
    if (updates.virtualGifts !== undefined) payload.virtual_gifts_json = JSON.stringify(updates.virtualGifts);
    if (updates.virtual_gifts_json !== undefined) payload.virtual_gifts_json = updates.virtual_gifts_json;
    if (updates.femaleEarningRatePerMin !== undefined) payload.female_earning_rate_per_min = updates.femaleEarningRatePerMin;
    if (updates.female_earning_rate_per_min !== undefined) payload.female_earning_rate_per_min = updates.female_earning_rate_per_min;
    // Fixed Peg (Phase 1): write coin_usd_peg and sync legacy dual-FX columns.
    if (updates.coinUsdPeg !== undefined || updates.coin_usd_peg !== undefined) {
      const peg = Number(updates.coinUsdPeg ?? updates.coin_usd_peg);
      if (Number.isFinite(peg) && peg > 0) {
        payload.coin_usd_peg = peg;
        payload.female_payout_ratio_usd = peg;
        payload.coin_to_usd_ratio = peg;
      }
    }
    if (updates.coinToUSDRatio !== undefined && updates.coinUsdPeg === undefined && updates.coin_usd_peg === undefined) {
      payload.coin_to_usd_ratio = updates.coinToUSDRatio;
    }
    if (updates.femalePayoutRatioUSD !== undefined && updates.coinUsdPeg === undefined && updates.coin_usd_peg === undefined) {
      payload.female_payout_ratio_usd = updates.femalePayoutRatioUSD;
    }
    if (updates.minPayoutThresholdUSD !== undefined) payload.min_payout_threshold_usd = updates.minPayoutThresholdUSD;
    if (updates.platformFeePercent !== undefined) payload.platform_fee_percent = updates.platformFeePercent;
    if (updates.freeMinutesTrial !== undefined) payload.free_minutes_trial = updates.freeMinutesTrial;
    if (updates.showDevPersonaBar !== undefined) payload.show_dev_persona_bar = updates.showDevPersonaBar;
    if (updates.enableRegularFemaleCoinEarning !== undefined) payload.enable_regular_female_coin_earning = updates.enableRegularFemaleCoinEarning;
    if (updates.aiNudityShieldEnabled !== undefined) {
      payload.ai_nudity_shield_enabled = updates.aiNudityShieldEnabled;
      payload.nsfw_filter_enabled = updates.aiNudityShieldEnabled;
    }
    if (updates.screenRecordingProtection !== undefined) payload.screen_recording_protection = updates.screenRecordingProtection;
    if (updates.freeDailyLoginCoins !== undefined) {
      payload.free_daily_login_coins = Math.max(0, Math.round(Number(updates.freeDailyLoginCoins) || 0));
    }
    if (updates.allowedCountryCodes !== undefined) payload.allowed_country_codes = updates.allowedCountryCodes;
    if (updates.allowedLanguages !== undefined) payload.allowed_languages = updates.allowedLanguages;
    if (updates.allowedZodiacSigns !== undefined) payload.allowed_zodiac_signs = updates.allowedZodiacSigns;
    if (updates.allowedInterests !== undefined) payload.allowed_interests = updates.allowedInterests;
    if (updates.flagSizes !== undefined) payload.flag_sizes_json = JSON.stringify(updates.flagSizes);
    if (updates.flag_sizes_json !== undefined) payload.flag_sizes_json = updates.flag_sizes_json;
    if (updates.discoveryCardLayout !== undefined) {
      payload.discovery_card_layout_json = JSON.stringify(updates.discoveryCardLayout);
    }
    if (updates.discovery_card_layout_json !== undefined) {
      payload.discovery_card_layout_json = updates.discovery_card_layout_json;
    }
    if (updates.dailyStreakRewards !== undefined) payload.daily_streak_rewards_json = JSON.stringify(updates.dailyStreakRewards);
    if (updates.daily_streak_rewards_json !== undefined) payload.daily_streak_rewards_json = updates.daily_streak_rewards_json;
    if (updates.dailyMissionsConfig !== undefined) payload.daily_missions_config_json = JSON.stringify(updates.dailyMissionsConfig);
    if (updates.daily_missions_config_json !== undefined) payload.daily_missions_config_json = updates.daily_missions_config_json;
    if (updates.creatorTargetCycle !== undefined) payload.creator_target_cycle = updates.creatorTargetCycle;
    if (updates.creator_target_cycle !== undefined) payload.creator_target_cycle = updates.creator_target_cycle;
    if (updates.periodCloseUtcTime !== undefined) payload.period_close_utc_time = updates.periodCloseUtcTime;
    if (updates.period_close_utc_time !== undefined) payload.period_close_utc_time = updates.period_close_utc_time;
    if (updates.settlementEnabled !== undefined) payload.settlement_enabled = updates.settlementEnabled;
    if (updates.settlement_enabled !== undefined) payload.settlement_enabled = updates.settlement_enabled;
    if (updates.profileVideoQuotaMb !== undefined) payload.r2_profile_video_quota_mb = Number(updates.profileVideoQuotaMb);
    if (updates.r2_profile_video_quota_mb !== undefined) payload.r2_profile_video_quota_mb = Number(updates.r2_profile_video_quota_mb);
    if (updates.r2ProfileVideoQuotaMb !== undefined) payload.r2_profile_video_quota_mb = Number(updates.r2ProfileVideoQuotaMb);
    if (updates.r2MaxVideoSizeMb !== undefined) payload.r2_max_video_size_mb = Number(updates.r2MaxVideoSizeMb);
    if (updates.r2_max_video_size_mb !== undefined) payload.r2_max_video_size_mb = Number(updates.r2_max_video_size_mb);
    if (updates.r2MaxImageSizeMb !== undefined) payload.r2_max_image_size_mb = Number(updates.r2MaxImageSizeMb);
    if (updates.r2_max_image_size_mb !== undefined) payload.r2_max_image_size_mb = Number(updates.r2_max_image_size_mb);
    if (updates.creatorTargetBronzeHours !== undefined) payload.creator_target_bronze_hours = updates.creatorTargetBronzeHours;
    if (updates.creator_target_bronze_hours !== undefined) payload.creator_target_bronze_hours = updates.creator_target_bronze_hours;
    if (updates.creatorTargetBronzeCoins !== undefined) payload.creator_target_bronze_coins = updates.creatorTargetBronzeCoins;
    if (updates.creator_target_bronze_coins !== undefined) payload.creator_target_bronze_coins = updates.creator_target_bronze_coins;
    if (updates.creatorTargetBronzeBonusUSD !== undefined) payload.creator_target_bronze_bonus_usd = updates.creatorTargetBronzeBonusUSD;
    if (updates.creator_target_bronze_bonus_usd !== undefined) payload.creator_target_bronze_bonus_usd = updates.creator_target_bronze_bonus_usd;
    if (updates.creatorTargetSilverHours !== undefined) payload.creator_target_silver_hours = updates.creatorTargetSilverHours;
    if (updates.creator_target_silver_hours !== undefined) payload.creator_target_silver_hours = updates.creator_target_silver_hours;
    if (updates.creatorTargetSilverCoins !== undefined) payload.creator_target_silver_coins = updates.creatorTargetSilverCoins;
    if (updates.creator_target_silver_coins !== undefined) payload.creator_target_silver_coins = updates.creator_target_silver_coins;
    if (updates.creatorTargetSilverBonusUSD !== undefined) payload.creator_target_silver_bonus_usd = updates.creatorTargetSilverBonusUSD;
    if (updates.creator_target_silver_bonus_usd !== undefined) payload.creator_target_silver_bonus_usd = updates.creator_target_silver_bonus_usd;
    if (updates.creatorTargetGoldHours !== undefined) payload.creator_target_gold_hours = updates.creatorTargetGoldHours;
    if (updates.creator_target_gold_hours !== undefined) payload.creator_target_gold_hours = updates.creator_target_gold_hours;
    if (updates.creatorTargetGoldCoins !== undefined) payload.creator_target_gold_coins = updates.creatorTargetGoldCoins;
    if (updates.creator_target_gold_coins !== undefined) payload.creator_target_gold_coins = updates.creator_target_gold_coins;
    if (updates.creatorTargetGoldBonusUSD !== undefined) payload.creator_target_gold_bonus_usd = updates.creatorTargetGoldBonusUSD;
    if (updates.creator_target_gold_bonus_usd !== undefined) payload.creator_target_gold_bonus_usd = updates.creator_target_gold_bonus_usd;
    if (updates.peakHoursStart !== undefined) payload.peak_hours_start = updates.peakHoursStart;
    if (updates.peak_hours_start !== undefined) payload.peak_hours_start = updates.peak_hours_start;
    if (updates.peakHoursEnd !== undefined) payload.peak_hours_end = updates.peakHoursEnd;
    if (updates.peak_hours_end !== undefined) payload.peak_hours_end = updates.peak_hours_end;
    if (updates.peakHoursEnabled !== undefined) payload.peak_hours_enabled = updates.peakHoursEnabled;
    if (updates.peak_hours_enabled !== undefined) payload.peak_hours_enabled = updates.peak_hours_enabled;
    if (updates.callRingTimeoutSeconds !== undefined) payload.call_ring_timeout_seconds = updates.callRingTimeoutSeconds;
    if (updates.call_ring_timeout_seconds !== undefined) payload.call_ring_timeout_seconds = updates.call_ring_timeout_seconds;
    if (updates.dailyFirstCallBonusCoins !== undefined) payload.daily_first_call_bonus_coins = updates.dailyFirstCallBonusCoins;
    if (updates.daily_first_call_bonus_coins !== undefined) payload.daily_first_call_bonus_coins = updates.daily_first_call_bonus_coins;
    if (updates.dailyFirstCallBonusUSD !== undefined) payload.daily_first_call_bonus_usd = updates.dailyFirstCallBonusUSD;
    if (updates.daily_first_call_bonus_usd !== undefined) payload.daily_first_call_bonus_usd = updates.daily_first_call_bonus_usd;
    if (updates.dailyFirstCallMinDurationSec !== undefined) payload.daily_first_call_min_duration_sec = updates.dailyFirstCallMinDurationSec;
    if (updates.daily_first_call_min_duration_sec !== undefined) payload.daily_first_call_min_duration_sec = updates.daily_first_call_min_duration_sec;
    if (updates.streakTargetDays !== undefined) payload.streak_target_days = updates.streakTargetDays;
    if (updates.streak_target_days !== undefined) payload.streak_target_days = updates.streak_target_days;
    if (updates.streakBoostDurationDays !== undefined) payload.streak_boost_duration_days = updates.streakBoostDurationDays;
    if (updates.streak_boost_duration_days !== undefined) payload.streak_boost_duration_days = updates.streak_boost_duration_days;
    if (updates.minDailyActiveHoursForStreak !== undefined) payload.min_daily_active_hours_for_streak = updates.minDailyActiveHoursForStreak;
    if (updates.min_daily_active_hours_for_streak !== undefined) payload.min_daily_active_hours_for_streak = updates.min_daily_active_hours_for_streak;

    // Copy any direct snake_case properties if present
    for (const [key, val] of Object.entries(updates)) {
      if (key.includes('_')) {
        payload[key] = val;
      }
    }

    // Try full upsert first
    const { error } = await (supabase as any)
      .from('system_configs')
      .upsert(payload, { onConflict: 'id' });

    if (!error) return true;

    // If a column is missing from DB schema, filter to standard guaranteed base columns and retry
    console.warn('Supabase updateSystemConfigs partial column notice:', error.message);
    const guaranteedPayload: Record<string, any> = {
      id: configId,
      updated_at: new Date().toISOString(),
    };
    const guaranteedCols = [
      'coin_burn_rate_per_min',
      'coin_burn_rate_friend_per_min',
      'female_earning_rate_per_min',
      'female_host_share_percent',
      'female_host_target_share_percent',
      'team_leader_share_percent',
      'gift_female_host_share_percent',
      'gift_team_leader_share_percent',
      'enable_virtual_gifts',
      'coin_usd_peg',
      'coin_to_usd_ratio',
      'female_payout_ratio_usd',
      'min_payout_threshold_usd',
      'allowed_country_codes',
      'allowed_languages',
      'allowed_zodiac_signs',
      'allowed_interests',
      'flag_sizes_json',
      'discovery_card_layout_json',
      'r2_bucket_name',
      'smtp_host',
      'smtp_port',
      'smtp_user',
      'smtp_pass',
      'smtp_from',
      'smtp_show_otp',
      'resend_api_key',
      'ai_nudity_shield_enabled',
      'nsfw_filter_enabled',
      'screen_recording_protection',
      'free_daily_login_coins',
      'feature_maintenance_mode',
    ];

    for (const col of guaranteedCols) {
      if (payload[col] !== undefined) {
        guaranteedPayload[col] = payload[col];
      }
    }

    const { error: retryError } = await (supabase as any)
      .from('system_configs')
      .upsert(guaranteedPayload, { onConflict: 'id' });

    if (retryError) {
      console.warn('Supabase updateSystemConfigs retry error:', retryError.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Supabase updateSystemConfigs exception:', err);
    return false;
  }
}

// ============================================================================
// TAXONOMY DATABASE SERVICES (Countries, Languages, Zodiac, Interests)
// ============================================================================

export async function updateCountryConfigsInSupabase(configs: any[]): Promise<boolean> {
  if (!isSupabaseConfigured() || !configs || configs.length === 0) return false;
  try {
    const { error } = await (supabase as any)
      .from('country_configs')
      .upsert(configs, { onConflict: 'code' });
    if (error) {
      console.warn('Supabase updateCountryConfigs error:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Supabase updateCountryConfigs exception:', err);
    return false;
  }
}

export async function fetchLanguageConfigsFromSupabase(): Promise<any[] | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const { data, error } = await (supabase as any)
      .from('language_configs')
      .select('*');
    if (error) {
      console.warn('Supabase fetchLanguageConfigs note:', error.message);
      return null;
    }
    return data;
  } catch (err) {
    console.warn('Supabase fetchLanguageConfigs exception:', err);
    return null;
  }
}

export async function updateLanguageConfigsInSupabase(configs: any[]): Promise<boolean> {
  if (!isSupabaseConfigured() || !configs || configs.length === 0) return false;
  try {
    const { error } = await (supabase as any)
      .from('language_configs')
      .upsert(configs, { onConflict: 'code' });
    if (error) {
      console.warn('Supabase updateLanguageConfigs error:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Supabase updateLanguageConfigs exception:', err);
    return false;
  }
}

export async function fetchZodiacConfigsFromSupabase(): Promise<any[] | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const { data, error } = await (supabase as any)
      .from('zodiac_configs')
      .select('*');
    if (error) {
      console.warn('Supabase fetchZodiacConfigs note:', error.message);
      return null;
    }
    return data;
  } catch (err) {
    console.warn('Supabase fetchZodiacConfigs exception:', err);
    return null;
  }
}

export async function updateZodiacConfigsInSupabase(configs: any[]): Promise<boolean> {
  if (!isSupabaseConfigured() || !configs || configs.length === 0) return false;
  try {
    const { error } = await (supabase as any)
      .from('zodiac_configs')
      .upsert(configs, { onConflict: 'key' });
    if (error) {
      console.warn('Supabase updateZodiacConfigs error:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Supabase updateZodiacConfigs exception:', err);
    return false;
  }
}

export async function fetchInterestConfigsFromSupabase(): Promise<any[] | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const { data, error } = await (supabase as any)
      .from('interest_configs')
      .select('*');
    if (error) {
      console.warn('Supabase fetchInterestConfigs note:', error.message);
      return null;
    }
    return data;
  } catch (err) {
    console.warn('Supabase fetchInterestConfigs exception:', err);
    return null;
  }
}

export async function updateInterestConfigsInSupabase(configs: any[]): Promise<boolean> {
  if (!isSupabaseConfigured() || !configs || configs.length === 0) return false;
  try {
    const { error } = await (supabase as any)
      .from('interest_configs')
      .upsert(configs, { onConflict: 'id' });
    if (error) {
      console.warn('Supabase updateInterestConfigs error:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Supabase updateInterestConfigs exception:', err);
    return false;
  }
}

export async function fetchCurrencyConfigsFromSupabase(): Promise<
  import('../utils/taxonomies').CurrencyItem[] | null
> {
  if (!isSupabaseConfigured()) return null;
  try {
    const { data, error } = await (supabase as any)
      .from('currency_configs')
      .select('*')
      .order('order_num', { ascending: true });
    if (error) {
      console.warn('Supabase fetchCurrencyConfigs note:', error.message);
      return null;
    }
    if (!data || data.length === 0) return null;
    return data.map((row: any) => ({
      code: String(row.code || '').toUpperCase(),
      name: String(row.name || row.code || ''),
      symbol: String(row.symbol || row.code || ''),
      rateFromUsd: Number(row.rate_from_usd) > 0 ? Number(row.rate_from_usd) : 1,
      enabled: row.enabled !== false,
      orderNum: row.order_num != null ? Number(row.order_num) : 0,
    }));
  } catch (err) {
    console.warn('Supabase fetchCurrencyConfigs exception:', err);
    return null;
  }
}

export async function upsertCurrencyConfigsToSupabase(
  configs: import('../utils/taxonomies').CurrencyItem[]
): Promise<boolean> {
  if (!isSupabaseConfigured() || !configs || configs.length === 0) return false;
  try {
    const payload = configs.map((c, idx) => ({
      code: String(c.code || '').toUpperCase(),
      name: c.name,
      symbol: c.symbol,
      rate_from_usd: Number(c.rateFromUsd) > 0 ? Number(c.rateFromUsd) : 1,
      enabled: c.enabled !== false,
      order_num: c.orderNum != null ? Number(c.orderNum) : idx,
    }));
    const { error } = await (supabase as any)
      .from('currency_configs')
      .upsert(payload, { onConflict: 'code' });
    if (error) {
      console.warn('Supabase upsertCurrencyConfigs error:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Supabase upsertCurrencyConfigs exception:', err);
    return false;
  }
}

export interface PushTaxonomiesResult {
  success: boolean;
  countriesCount: number;
  languagesCount: number;
  zodiacsCount: number;
  interestsCount: number;
  currenciesCount: number;
  systemConfigsSaved: boolean;
  errors: string[];
}

/**
 * Pushes and synchronizes all master taxonomies (Countries, Languages, Zodiac Signs, Interests, Currencies)
 * and active system settings directly into their respective Supabase PostgreSQL database tables.
 */
export async function pushAllTaxonomiesAndSettingsToSupabase(
  customSettings?: Record<string, any>
): Promise<PushTaxonomiesResult> {
  const result: PushTaxonomiesResult = {
    success: true,
    countriesCount: 0,
    languagesCount: 0,
    zodiacsCount: 0,
    interestsCount: 0,
    currenciesCount: 0,
    systemConfigsSaved: false,
    errors: [],
  };

  if (!isSupabaseConfigured()) {
    result.success = false;
    result.errors.push('Supabase is not configured. Please set your Supabase URL & Anon Key.');
    return result;
  }

  // 1. Countries table sync
  try {
    const countryPayload = ALL_WORLDWIDE_COUNTRIES.map((c) => ({
      code: c.code,
      name: c.name,
      flag: c.flag,
      region: c.region,
      is_tier1: !!c.isTier1,
      enabled: customSettings?.allowedCountryCodes
        ? customSettings.allowedCountryCodes.map((x: string) => x.toUpperCase()).includes(c.code.toUpperCase())
        : true,
    }));
    const { error: cErr } = await (supabase as any)
      .from('country_configs')
      .upsert(countryPayload, { onConflict: 'code' });
    if (cErr) {
      result.errors.push(`Countries: ${cErr.message}`);
    } else {
      result.countriesCount = countryPayload.length;
    }
  } catch (err: any) {
    result.errors.push(`Countries: ${err.message}`);
  }

  // 2. Languages table sync
  try {
    const langPayload = ALL_LANGUAGES.map((l) => ({
      code: l.code,
      name: l.name,
      native_name: l.nativeName,
      popular: !!l.popular,
      region: l.region || 'Global',
      enabled: customSettings?.allowedLanguages
        ? customSettings.allowedLanguages.map((x: string) => x.toLowerCase()).includes(l.name.toLowerCase()) ||
          customSettings.allowedLanguages.map((x: string) => x.toLowerCase()).includes(l.code.toLowerCase())
        : true,
    }));
    const { error: lErr } = await (supabase as any)
      .from('language_configs')
      .upsert(langPayload, { onConflict: 'code' });
    if (lErr) {
      result.errors.push(`Languages: ${lErr.message}`);
    } else {
      result.languagesCount = langPayload.length;
    }
  } catch (err: any) {
    result.errors.push(`Languages: ${err.message}`);
  }

  // 3. Zodiac Signs table sync
  try {
    const zodiacPayload = ALL_ZODIAC_SIGNS.map((z) => ({
      key: z.key,
      name: z.name,
      symbol: z.symbol,
      date_range: z.dateRange,
      element: z.element,
      enabled: customSettings?.allowedZodiacSigns
        ? customSettings.allowedZodiacSigns.map((x: string) => x.toLowerCase()).includes(z.key.toLowerCase()) ||
          customSettings.allowedZodiacSigns.map((x: string) => x.toLowerCase()).includes(z.name.toLowerCase())
        : true,
    }));
    const { error: zErr } = await (supabase as any)
      .from('zodiac_configs')
      .upsert(zodiacPayload, { onConflict: 'key' });
    if (zErr) {
      result.errors.push(`Zodiac: ${zErr.message}`);
    } else {
      result.zodiacsCount = zodiacPayload.length;
    }
  } catch (err: any) {
    result.errors.push(`Zodiac: ${err.message}`);
  }

  // 4. Interests table sync
  try {
    const interestPayload = ALL_INTERESTS.map((i) => ({
      id: i.id,
      name: i.name,
      category: i.category,
      icon_name: i.iconName,
      color: i.color,
      popular: !!i.popular,
      enabled: customSettings?.allowedInterests
        ? customSettings.allowedInterests.map((x: string) => x.toLowerCase()).includes(i.name.toLowerCase()) ||
          customSettings.allowedInterests.map((x: string) => x.toLowerCase()).includes(i.id.toLowerCase())
        : true,
    }));
    const { error: iErr } = await (supabase as any)
      .from('interest_configs')
      .upsert(interestPayload, { onConflict: 'id' });
    if (iErr) {
      result.errors.push(`Interests: ${iErr.message}`);
    } else {
      result.interestsCount = interestPayload.length;
    }
  } catch (err: any) {
    result.errors.push(`Interests: ${err.message}`);
  }

  // 4b. Currencies — only when explicitly provided (avoid clobbering admin rates on taxonomy allow-list sync)
  try {
    if (Array.isArray(customSettings?.currencyConfigs) && customSettings.currencyConfigs.length > 0) {
      const currencyPayload = customSettings.currencyConfigs.map((c: any, idx: number) => ({
        code: String(c.code || '').toUpperCase(),
        name: c.name,
        symbol: c.symbol,
        rate_from_usd: Number(c.rateFromUsd) > 0 ? Number(c.rateFromUsd) : 1,
        enabled: c.enabled !== false,
        order_num: c.orderNum != null ? Number(c.orderNum) : idx,
      }));
      const { error: curErr } = await (supabase as any)
        .from('currency_configs')
        .upsert(currencyPayload, { onConflict: 'code' });
      if (curErr) {
        result.errors.push(`Currencies: ${curErr.message}`);
      } else {
        result.currenciesCount = currencyPayload.length;
      }
    }
  } catch (err: any) {
    result.errors.push(`Currencies: ${err.message}`);
  }

  // 5. System Configs sync (including dynamic SVG flag sizes)
  try {
    const configSettings = {
      ...(customSettings || {}),
      flagSizes: customSettings?.flagSizes || DEFAULT_FLAG_SIZES,
    };
    const saved = await updateSystemConfigsInSupabase(configSettings);
    result.systemConfigsSaved = saved;
    if (!saved) {
      result.errors.push('System Configs: Failed to save to system_configs table');
    }
  } catch (err: any) {
    result.errors.push(`System Configs: ${err.message}`);
  }

  if (result.errors.length > 0 && result.countriesCount === 0 && !result.systemConfigsSaved) {
    result.success = false;
  }

  return result;
}

// ============================================================================
// CONTENT MODERATION REPORTS API
// Deprecated: use POST /api/v1/reports via AppContext.reportUser (Express + service role).
// Client-side inserts are not used — reporter_id must come from the JWT on the server.
// ============================================================================

export async function submitModerationReport(_report: {
  reporterId: string;
  reportedUserId: string;
  reason: string;
  details?: string;
  evidenceSnapshotUrl?: string;
}): Promise<boolean> {
  console.warn(
    'submitModerationReport is deprecated. Use authFetch POST /api/v1/reports instead.'
  );
  return false;
}

// ============================================================================
// CMS POLICIES & LEGAL DOCUMENTS API
// ============================================================================

export async function fetchCmsPoliciesFromSupabase(): Promise<any[] | null> {
  if (!isSupabaseConfigured()) return null;

  try {
    const { data, error } = await supabase
      .from('cms_policies')
      .select('*')
      .order('order_num', { ascending: true });

    if (error) {
      console.warn('Supabase fetchCmsPolicies error:', error.message);
      return null;
    }

    return (data || []).map((row: any) => ({
      id: row.id || row.slug,
      slug: row.slug,
      title: row.title,
      category: row.category || 'safety',
      icon: row.icon || 'ShieldCheck',
      summary: row.summary || '',
      content: row.content || '',
      lastUpdated: row.effective_date || new Date().toISOString().split('T')[0],
      order: row.order_num || 1,
      isFeaturedOnHome: row.is_featured ?? true,
      externalUrl: row.external_url || undefined,
    }));
  } catch (err) {
    console.warn('Supabase fetchCmsPolicies error:', err);
    return null;
  }
}

export async function fetchCmsPolicy(slug: string): Promise<{
  title: string;
  content: string;
  summary?: string;
  effectiveDate: string;
} | null> {
  if (!isSupabaseConfigured()) return null;

  try {
    const { data, error } = await supabase
      .from('cms_policies')
      .select('*')
      .eq('slug', slug)
      .single();

    if (error || !data) {
      return null;
    }

    const row = data as any;
    return {
      title: row.title,
      content: row.content,
      summary: row.summary || undefined,
      effectiveDate: row.effective_date,
    };
  } catch (err) {
    console.warn('Supabase fetchCmsPolicy error:', err);
    return null;
  }
}

export async function upsertCmsPolicy(policy: {
  id?: string;
  slug: string;
  title: string;
  category?: string;
  icon?: string;
  content: string;
  summary?: string;
  effectiveDate?: string;
  lastUpdated?: string;
  order?: number;
  isFeaturedOnHome?: boolean;
  externalUrl?: string;
}): Promise<boolean> {
  try {
    const res = await authFetch('/api/admin/cms/policies', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...policy,
        id: policy.id || policy.slug,
        lastUpdated: policy.lastUpdated || policy.effectiveDate,
      }),
    });
    const data = await res.json().catch(() => ({}));
    return res.ok && Boolean(data.success);
  } catch (err) {
    console.warn('Admin upsertCmsPolicy exception:', err);
    return false;
  }
}

export async function deleteCmsPolicyFromSupabase(policyIdOrSlug: string): Promise<boolean> {
  try {
    const res = await authFetch(`/api/admin/cms/policies/${encodeURIComponent(policyIdOrSlug)}`, {
      method: 'DELETE',
    });
    const data = await res.json().catch(() => ({}));
    return res.ok && Boolean(data.success);
  } catch (err) {
    console.warn('Admin deleteCmsPolicy error:', err);
    return false;
  }
}

// ============================================================================
// HOME BANNERS & QUICK LINKS API
// ============================================================================

/** Site SEO & branding singleton — public SELECT. */
export async function fetchCmsSiteBrandingFromSupabase(): Promise<{
  id: string;
  pageTitle: string;
  metaDescription: string;
  siteName: string;
  logoUrl: string;
  faviconUrl: string;
  ogImageUrl: string;
  themeColor: string;
  updatedAt?: string | null;
} | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const { data, error } = await supabase
      .from('cms_site_branding')
      .select(
        'id, page_title, meta_description, site_name, logo_url, favicon_url, og_image_url, theme_color, updated_at'
      )
      .eq('id', 'default')
      .maybeSingle();
    if (error) {
      console.warn('Supabase fetchCmsSiteBranding error:', error.message);
      return null;
    }
    if (!data) return null;
    return {
      id: String(data.id || 'default'),
      pageTitle: String(data.page_title || ''),
      metaDescription: String(data.meta_description || ''),
      siteName: String(data.site_name || ''),
      logoUrl: String(data.logo_url || ''),
      faviconUrl: String(data.favicon_url || ''),
      ogImageUrl: String(data.og_image_url || ''),
      themeColor: String(data.theme_color || '#09090C'),
      updatedAt: data.updated_at ?? null,
    };
  } catch (err) {
    console.warn('Supabase fetchCmsSiteBranding exception:', err);
    return null;
  }
}

/** Active UI feedback rows (toasts/alerts) — public SELECT of active only. */
export async function fetchUiFeedbackMessagesFromSupabase(): Promise<
  | Array<{
      key: string;
      kind: string;
      category: string;
      title: string;
      message: string;
      defaultType: string;
      active: boolean;
    }>
  | null
> {
  if (!isSupabaseConfigured()) return null;
  try {
    const { data, error } = await supabase
      .from('ui_feedback_messages')
      .select('key, kind, category, title, message, default_type, active')
      .eq('active', true)
      .order('key', { ascending: true });
    if (error) {
      console.warn('Supabase fetchUiFeedbackMessages error:', error.message);
      return null;
    }
    return (data || []).map((row: any) => ({
      key: String(row.key),
      kind: String(row.kind || 'toast'),
      category: String(row.category || 'general'),
      title: String(row.title || ''),
      message: String(row.message || ''),
      defaultType: String(row.default_type || 'info'),
      active: row.active !== false,
    }));
  } catch (err) {
    console.warn('Supabase fetchUiFeedbackMessages exception:', err);
    return null;
  }
}

export async function fetchHomeBannersFromSupabase(): Promise<any[] | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const { data, error } = await supabase
      .from('home_banners')
      .select('*')
      .order('order_num', { ascending: true });

    // Empty array is a valid DB state — do not treat as "fetch failed"
    if (error) {
      console.warn('Supabase fetchHomeBanners error:', error.message);
      return null;
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      title: row.title,
      subtitle: row.subtitle || '',
      tagText: row.badge || 'FEATURED',
      tagColor: row.tag_color || 'bg-indigo-600 text-white',
      imageUrl: row.image_url || '',
      ctaText: row.cta_text || 'Explore Now',
      actionType: row.action_type || 'tab',
      actionTarget: row.action_target || 'coins',
      active: row.active ?? true,
      order: row.order_num || 1,
      bgGradient: row.bg_gradient || 'from-indigo-950/90 via-purple-950/70 to-slate-900/90',
    }));
  } catch (err) {
    console.warn('Supabase fetchHomeBanners exception:', err);
    return null;
  }
}

/** Admin CMS writes must go through Express requireAdmin — not client upsert. */
export async function upsertHomeBannerToSupabase(banner: any): Promise<boolean> {
  try {
    const res = await authFetch('/api/admin/cms/banners', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(banner),
    });
    const data = await res.json().catch(() => ({}));
    return res.ok && Boolean(data.success);
  } catch (err) {
    console.warn('Admin upsertHomeBanner error:', err);
    return false;
  }
}

export async function deleteHomeBannerFromSupabase(bannerId: string): Promise<boolean> {
  try {
    const res = await authFetch(`/api/admin/cms/banners/${encodeURIComponent(bannerId)}`, {
      method: 'DELETE',
    });
    const data = await res.json().catch(() => ({}));
    return res.ok && Boolean(data.success);
  } catch (err) {
    console.warn('Admin deleteHomeBanner error:', err);
    return false;
  }
}

export async function fetchAppNavItemsFromSupabase(): Promise<any[] | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const { data, error } = await supabase
      .from('app_nav_items')
      .select('*')
      .order('order_num', { ascending: true });
    if (error) {
      console.warn('Supabase fetchAppNavItems error:', error.message);
      return null;
    }
    return data || [];
  } catch (err) {
    console.warn('Supabase fetchAppNavItems exception:', err);
    return null;
  }
}

export async function fetchHomeQuickLinksFromSupabase(): Promise<any[] | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const { data, error } = await supabase
      .from('home_quick_links')
      .select('*')
      .order('order_num', { ascending: true });

    if (error) {
      console.warn('Supabase fetchHomeQuickLinks error:', error.message);
      return null;
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      title: row.title,
      subtitle: row.subtitle || '',
      icon: row.icon || 'Zap',
      badge: row.badge || undefined,
      actionType: row.action_type || 'tab',
      actionTarget: row.action_target || 'discovery',
      colorGradient: row.color_gradient || 'from-indigo-500 to-purple-600',
      order: row.order_num || 1,
      active: row.active ?? true,
    }));
  } catch (err) {
    console.warn('Supabase fetchHomeQuickLinks exception:', err);
    return null;
  }
}

export async function upsertHomeQuickLinkToSupabase(link: any): Promise<boolean> {
  try {
    const res = await authFetch('/api/admin/cms/quick-links', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(link),
    });
    const data = await res.json().catch(() => ({}));
    return res.ok && Boolean(data.success);
  } catch (err) {
    console.warn('Admin upsertHomeQuickLink error:', err);
    return false;
  }
}

export async function deleteHomeQuickLinkFromSupabase(linkId: string): Promise<boolean> {
  try {
    const res = await authFetch(`/api/admin/cms/quick-links/${encodeURIComponent(linkId)}`, {
      method: 'DELETE',
    });
    const data = await res.json().catch(() => ({}));
    return res.ok && Boolean(data.success);
  } catch (err) {
    console.warn('Admin deleteHomeQuickLink error:', err);
    return false;
  }
}

// ============================================================================
// PAYOUT REQUESTS API
// ============================================================================

export async function fetchPayoutRequestsFromSupabase(): Promise<any[] | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const { data, error } = await supabase
      .from('payout_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Supabase fetchPayoutRequests error:', error.message);
      return null;
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      userId: row.user_id,
      userName: row.user_name,
      userEmail: row.user_email || undefined,
      amountCoins: Number(row.amount_coins || 0),
      amountUSD: Number(row.amount_usd || 0),
      payoutMethod: row.payout_method,
      accountDetails: row.account_details,
      status: row.status,
      adminNote: row.admin_note || undefined,
      kycVerified: Boolean(row.kyc_verified),
      teamLeaderId: row.team_leader_id || undefined,
      teamLeaderName: row.team_leader_name || undefined,
      requestDate: row.request_date || row.created_at,
      processedDate: row.processed_date || undefined,
    }));
  } catch (err) {
    console.warn('Supabase fetchPayoutRequests exception:', err);
    return null;
  }
}

/**
 * Phase 7: client writes to payout_requests are blocked.
 * Cash-out is settlement_batches only; use POST /api/v1/finance/manual-payouts (always rejects).
 */
export async function upsertPayoutRequestToSupabase(_payout: any): Promise<boolean> {
  console.warn(
    'upsertPayoutRequestToSupabase blocked (PAYOUT_PERIOD_END_ONLY): use settlement batches'
  );
  return false;
}

// ============================================================================
// CALL LOGS API
// ============================================================================

export async function fetchCallLogsFromSupabase(): Promise<any[] | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const { data, error } = await supabase
      .from('call_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(2000);

    if (error) {
      console.warn('Supabase fetchCallLogs error:', error.message);
      return null;
    }

    return (data || []).map((row: any) => {
      const startRaw = row.start_time || row.started_at || row.created_at;
      const endRaw = row.end_time || row.ended_at;
      const callerName =
        row.caller_name && String(row.caller_name).trim()
          ? String(row.caller_name).trim()
          : '';
      const hostName =
        (row.host_name && String(row.host_name).trim()) ||
        (row.receiver_name && String(row.receiver_name).trim()) ||
        '';
      const receiverId = row.receiver_id || row.host_id || '';

      return {
        id: row.id,
        callerId: row.caller_id,
        callerName: callerName || row.caller_id || 'Caller',
        callerAvatar: '',
        callerCountry: '',
        receiverId,
        receiverName: hostName || receiverId || 'Host',
        receiverAvatar: '',
        hostId: row.host_id || receiverId,
        hostName: hostName || undefined,
        startTime: startRaw ? new Date(startRaw).getTime() : Date.now(),
        endTime: endRaw ? new Date(endRaw).getTime() : undefined,
        durationSeconds: Number(row.duration_seconds || 0),
        coinsSpent: Number(row.coins_spent || 0),
        coinsEarned: Number(row.coins_earned || 0),
        teamLeaderEarnedCoins: Number(row.team_leader_earned_coins || 0),
        teamLeaderId: row.team_leader_id || undefined,
        wasFriendCall: Boolean(row.was_friend_call),
        status: row.status || row.end_reason || 'completed',
        timestamp: startRaw
          ? new Date(startRaw).toLocaleString()
          : new Date().toLocaleString(),
      };
    });
  } catch (err) {
    console.warn('Supabase fetchCallLogs exception:', err);
    return null;
  }
}

export async function insertCallLogToSupabase(log: any): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  try {
    const payload = {
      id: log.id,
      caller_id: log.callerId,
      receiver_id: log.receiverId,
      host_id: log.hostId || log.receiverId || null,
      caller_name: log.callerName || null,
      host_name: log.hostName || log.receiverName || null,
      start_time: new Date(log.startTime || Date.now()).toISOString(),
      end_time: log.endTime ? new Date(log.endTime).toISOString() : null,
      duration_seconds: log.durationSeconds || 0,
      coins_spent: log.coinsSpent || 0,
      coins_earned: log.coinsEarned || 0,
      was_friend_call: Boolean(log.wasFriendCall),
      status: log.status || 'completed',
      team_leader_id: log.teamLeaderId || null,
      team_leader_earned_coins: log.teamLeaderEarnedCoins || 0,
    };

    const { error } = await supabase.from('call_logs').upsert(payload as any, { onConflict: 'id' });
    if (error) {
      console.warn('Supabase insertCallLog error:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Supabase insertCallLog exception:', err);
    return false;
  }
}

// ============================================================================
// FRIEND REQUESTS API
// Mutations MUST go through Express (/api/v1/friends/*).
// ============================================================================

export async function fetchFriendRequestsFromSupabase(): Promise<any[] | null> {
  // Prefer GET /api/v1/friends/requests (JWT-derived user).
  if (!isSupabaseConfigured()) return null;
  try {
    const { data, error } = await supabase
      .from('friend_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Supabase fetchFriendRequests error:', error.message);
      return null;
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      senderId: row.sender_id,
      senderName: row.sender_id,
      senderAvatar: '',
      receiverId: row.receiver_id,
      receiverName: row.receiver_id,
      receiverAvatar: '',
      status: row.status,
      callLogId: row.call_log_id || undefined,
      timestamp: row.created_at ? new Date(row.created_at).toLocaleString() : new Date().toLocaleString(),
    }));
  } catch (err) {
    console.warn('Supabase fetchFriendRequests exception:', err);
    return null;
  }
}

/** @deprecated Use POST /api/v1/friends/* */
export async function upsertFriendRequestToSupabase(req: any): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  try {
    const payload = {
      id: req.id,
      sender_id: req.senderId,
      receiver_id: req.receiverId,
      status: req.status || 'pending',
    };

    const { error } = await supabase.from('friend_requests').upsert(payload as any, { onConflict: 'id' });
    if (error) {
      console.warn('Supabase upsertFriendRequest error:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Supabase upsertFriendRequest exception:', err);
    return false;
  }
}

/** @deprecated Use POST /api/v1/friends/remove */
export async function removeFriendInSupabase(userA: string, userB: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  try {
    const { error } = await supabase
      .from('friend_requests')
      .delete()
      .or(`and(sender_id.eq.${userA},receiver_id.eq.${userB}),and(sender_id.eq.${userB},receiver_id.eq.${userA})`);

    if (error) {
      console.warn('Supabase removeFriend delete error:', error.message);
      await (supabase.from('friend_requests') as any)
        .update({ status: 'declined' })
        .or(`and(sender_id.eq.${userA},receiver_id.eq.${userB}),and(sender_id.eq.${userB},receiver_id.eq.${userA})`);
    }
    return true;
  } catch (err) {
    console.warn('Supabase removeFriend exception:', err);
    return false;
  }
}

// ============================================================================
// COUNTRY CONFIGURATIONS API (Worldwide Admin Countries)
// ============================================================================

export async function fetchCountryConfigsFromSupabase(): Promise<any[] | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const { data, error } = await supabase
      .from('country_configs')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      console.warn('Supabase fetchCountryConfigs error:', error.message);
      return null;
    }
    return data || [];
  } catch (err) {
    console.warn('Supabase fetchCountryConfigs exception:', err);
    return null;
  }
}

export async function upsertCountryConfigInSupabase(country: {
  code: string;
  name: string;
  flag?: string;
  region?: string;
  enabled: boolean;
}): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  try {
    const { error } = await supabase.from('country_configs').upsert(country as any, { onConflict: 'code' });
    if (error) {
      console.warn('Supabase upsertCountryConfig error:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Supabase upsertCountryConfig exception:', err);
    return false;
  }
}

// ============================================================================
// FEED POSTS & CREATOR MOMENTS API
// ============================================================================

export async function fetchFeedPostsFromSupabase(): Promise<any[] | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const { data, error } = await supabase
      .from('feed_posts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error || !data) return null;

    return data.map((row: any) => ({
      id: row.id,
      creatorId: row.creator_id,
      creatorName: row.creator_name,
      creatorAvatar: row.creator_avatar || '',
      mediaUrl: row.media_url,
      mediaType: row.media_type,
      caption: row.caption || '',
      likes: Number(row.likes || 0),
      commentsCount: Number(row.comments_count || 0),
      createdAt: row.created_at ? new Date(row.created_at).toLocaleDateString() : 'Just now',
    }));
  } catch {
    return null;
  }
}

export async function upsertFeedPostToSupabase(_post: any): Promise<boolean> {
  console.warn(
    'upsertFeedPostToSupabase is deprecated — use POST /api/v1/feed via AppContext.addFeedPost'
  );
  return false;
}

export async function deleteFeedPostFromSupabase(postId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  try {
    const { error } = await supabase.from('feed_posts').delete().eq('id', postId);
    return !error;
  } catch {
    return false;
  }
}

// ============================================================================
// COIN PACKAGES & STORE SKUS API
// ============================================================================

export async function fetchCoinPackagesFromSupabase(): Promise<any[] | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const { data, error } = await supabase
      .from('coin_packages')
      .select('*')
      .order('order_num', { ascending: true });

    if (error || !data || data.length === 0) return null;

    return data.map((row: any) => ({
      id: row.id,
      title: row.title,
      coins: Number(row.coins || 0),
      bonusCoins: Number(row.bonus_coins || 0),
      priceUSD: Number(row.price_usd || 0),
      discountPriceUSD:
        row.discount_price_usd == null || row.discount_price_usd === ''
          ? null
          : Number(row.discount_price_usd),
      approxCallMinutes:
        row.approx_call_minutes == null || row.approx_call_minutes === ''
          ? null
          : Number(row.approx_call_minutes),
      savingLabel: row.saving_label || null,
      badgeTag: row.badge_tag || undefined,
      popular: Boolean(row.popular),
      orderNum: row.order_num != null ? Number(row.order_num) : undefined,
    }));
  } catch {
    return null;
  }
}

export async function upsertCoinPackageToSupabase(pkg: any): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  try {
    const discountRaw = pkg.discountPriceUSD;
    const approxRaw = pkg.approxCallMinutes;
    const payload = {
      id: pkg.id,
      title: pkg.title,
      coins: pkg.coins,
      bonus_coins: pkg.bonusCoins || 0,
      price_usd: pkg.priceUSD,
      discount_price_usd:
        discountRaw == null || discountRaw === '' || !Number.isFinite(Number(discountRaw))
          ? null
          : Number(discountRaw),
      approx_call_minutes:
        approxRaw == null || approxRaw === '' || !Number.isFinite(Number(approxRaw))
          ? null
          : Math.floor(Number(approxRaw)),
      saving_label: pkg.savingLabel ? String(pkg.savingLabel).trim() || null : null,
      badge_tag: pkg.badgeTag || null,
      popular: Boolean(pkg.popular),
      ...(pkg.orderNum != null ? { order_num: Number(pkg.orderNum) } : {}),
    };
    const { error } = await supabase.from('coin_packages').upsert(payload as any, { onConflict: 'id' });
    return !error;
  } catch {
    return false;
  }
}

export async function deleteCoinPackageFromSupabase(pkgId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  try {
    const { error } = await supabase.from('coin_packages').delete().eq('id', pkgId);
    return !error;
  } catch {
    return false;
  }
}

// ============================================================================
// FAVORITES & BLOCKED USERS API
// Mutations MUST go through Express (/api/v1/favorites/*, /api/v1/blocks/*).
// ============================================================================

export async function fetchFavoritesFromSupabase(userId: string): Promise<string[] | null> {
  // Prefer GET /api/v1/favorites/me (JWT-derived user). Kept for legacy reads.
  if (!isSupabaseConfigured()) return null;
  try {
    const { data, error } = await supabase
      .from('favorites')
      .select('favorite_user_id')
      .eq('user_id', userId);

    if (error || !data) return null;
    return data.map((r: any) => r.favorite_user_id);
  } catch {
    return null;
  }
}

/** @deprecated Use POST /api/v1/favorites/toggle */
export async function addFavoriteToSupabase(userId: string, favoriteUserId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  try {
    const { error } = await supabase.from('favorites').upsert({
      user_id: userId,
      favorite_user_id: favoriteUserId,
    } as any);
    return !error;
  } catch {
    return false;
  }
}

export async function removeFavoriteFromSupabase(userId: string, favoriteUserId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  try {
    const { error } = await supabase
      .from('favorites')
      .delete()
      .match({ user_id: userId, favorite_user_id: favoriteUserId });
    return !error;
  } catch {
    return false;
  }
}

export async function fetchBlockedUsersFromSupabase(userId: string): Promise<string[] | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const { data, error } = await supabase
      .from('blocked_users')
      .select('blocked_user_id')
      .eq('user_id', userId);

    if (error || !data) return null;
    return data.map((r: any) => r.blocked_user_id);
  } catch {
    return null;
  }
}

/** @deprecated Use POST /api/v1/blocks */
export async function addBlockedUserToSupabase(userId: string, blockedUserId: string, reason?: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  try {
    const { error } = await supabase.from('blocked_users').upsert({
      user_id: userId,
      blocked_user_id: blockedUserId,
      reason: reason || null,
    } as any);
    return !error;
  } catch {
    return false;
  }
}

/** @deprecated Use DELETE /api/v1/blocks/:targetUserId */
export async function removeBlockedUserFromSupabase(userId: string, blockedUserId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  try {
    const { error } = await supabase
      .from('blocked_users')
      .delete()
      .eq('user_id', userId)
      .eq('blocked_user_id', blockedUserId);
    return !error;
  } catch {
    return false;
  }
}

// ============================================================================
// USER DAILY REWARDS & ACTIVITY QUESTS API
// ============================================================================

export function mapDbUserDailyRewardsToRecord(db: DbUserDailyRewards): DailyRewardRecord {
  return {
    userId: db.user_id,
    lastLoginDate: db.last_login_date,
    streakCount: Number(db.streak_count || 1),
    streakClaimedDate: db.streak_claimed_date,
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

export async function fetchUserDailyRewardsFromSupabase(userId: string): Promise<DailyRewardRecord | null> {
  if (!isSupabaseConfigured() || !userId) return null;
  try {
    const { data, error } = await (supabase.from('user_daily_rewards') as any)
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.warn('[Supabase] fetchUserDailyRewards error:', error.message);
      return null;
    }
    if (!data) return null;
    return mapDbUserDailyRewardsToRecord(data as DbUserDailyRewards);
  } catch (err) {
    console.warn('[Supabase] fetchUserDailyRewards exception:', err);
    return null;
  }
}

export async function upsertUserDailyRewardsInSupabase(record: DailyRewardRecord): Promise<boolean> {
  if (!record?.userId) return false;
  // Claims & coin totals must go through /api/rewards/claim-*.
  // This helper only forwards progress-shaped payloads to the hardened update endpoint.
  try {
    const res = await authFetch('/api/rewards/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rewardDay: record.tasksDate,
        taskChatFriends: record.taskChatFriends,
        taskQuickMatches: record.taskQuickMatches,
        taskVideoCallSeconds: record.taskVideoCallSeconds,
        taskMomentInteractions: record.taskMomentInteractions,
        taskGiftCount: record.taskGiftCount,
      }),
    });
    const json = await res.json().catch(() => ({}));
    return Boolean(json?.success);
  } catch (err) {
    console.warn('[Supabase] upsertUserDailyRewards exception:', err);
    return false;
  }
}

export * from './supabaseAuthService';

