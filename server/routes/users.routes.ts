import { Router } from 'express';
import type { ServerRuntime } from '../runtimeTypes';
import { requireAuth } from '../middleware/auth';
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '../supabaseAdmin';

function authUserId(req: any): string {
  return String(req.profileId || req.user?.id || '');
}

function sendError(res: any, status: number, message: string, code: string) {
  return res.status(status).json({ success: false, error: { message, code } });
}

async function isBlockedEitherWay(client: any, userId: string, targetUserId: string) {
  const { data, error } = await client
    .from('blocked_users')
    .select('user_id, blocked_user_id')
    .or(
      `and(user_id.eq.${userId},blocked_user_id.eq.${targetUserId}),and(user_id.eq.${targetUserId},blocked_user_id.eq.${userId})`
    )
    .limit(1);
  if (error) throw error;
  return Boolean(data && data.length > 0);
}

const GALLERY_VIDEOS_SENTINEL_PREFIX = '__mc_gv1__:';

function splitGalleryPhotosAndVideos(gallery: unknown): { photos: string[]; videos: any[] | null } {
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

function resolveGalleryVideosFromRow(p: any): any[] {
  const fromCol = Array.isArray(p.gallery_videos)
    ? p.gallery_videos
    : Array.isArray(p.galleryVideos)
      ? p.galleryVideos
      : null;
  if (Array.isArray(fromCol) && fromCol.length > 0) return fromCol;
  const fromGallery = splitGalleryPhotosAndVideos(p.gallery).videos;
  if (Array.isArray(fromGallery) && fromGallery.length > 0) return fromGallery;
  return Array.isArray(fromCol) ? fromCol : [];
}

/** Dating-safe public profile DTO — no email, wallet, KYC, ban, or secrets. */
export function mapPublicProfileRow(p: any) {
  if (!p) return null;
  const split = splitGalleryPhotosAndVideos(Array.isArray(p.gallery) ? p.gallery : []);
  return {
    id: p.id,
    name: p.name || 'Member',
    gender: p.gender || 'male',
    age: Number(p.age) || 24,
    dob: p.dob || undefined,
    nationality: p.nationality || 'United States',
    countryCode: String(p.country_code || 'US').toUpperCase(),
    spokenLanguages: Array.isArray(p.spoken_languages) ? p.spoken_languages : ['English'],
    bio: p.bio || '',
    extendedBio: p.extended_bio || undefined,
    locationCity: p.location_city || undefined,
    zodiac: p.zodiac || undefined,
    interests: Array.isArray(p.interests) ? p.interests : [],
    tags: Array.isArray(p.tags) ? p.tags : [],
    interestedIn: Array.isArray(p.interested_in) ? p.interested_in : undefined,
    avatarUrl:
      p.avatar_url ||
      'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=400',
    gallery: split.photos,
    galleryVideos: resolveGalleryVideosFromRow(p),
    introVideoUrl: p.intro_video_url || undefined,
    isVerified: Boolean(p.is_verified),
    onlineStatus: p.online_status || 'offline',
    role: p.role || 'male_user',
    responseRate: p.response_rate || undefined,
    hourlyCoinRate: Number(p.hourly_coin_rate) || 0,
    ratingScore: p.rating_score != null ? Number(p.rating_score) : undefined,
    totalReviewsCount: p.total_reviews_count != null ? Number(p.total_reviews_count) : undefined,
    totalCallsHosted: p.total_calls_hosted != null ? Number(p.total_calls_hosted) : undefined,
    exactLocation: p.exact_location || undefined,
    isUsingMockLocation: Boolean(p.is_using_mock_location),
    mockLocationCity: p.mock_location_city || undefined,
    mockLocationCountry: p.mock_location_country || undefined,
    mockLocationCountryCode: p.mock_location_country_code || undefined,
    createdAt: p.created_at,
  };
}

export const PUBLIC_PROFILE_SELECT = [
  'id',
  'name',
  'gender',
  'age',
  'dob',
  'nationality',
  'country_code',
  'spoken_languages',
  'bio',
  'extended_bio',
  'location_city',
  'zodiac',
  'interests',
  'tags',
  'interested_in',
  'avatar_url',
  'gallery',
  'gallery_videos',
  'intro_video_url',
  'is_verified',
  'online_status',
  'role',
  'response_rate',
  'hourly_coin_rate',
  'rating_score',
  'total_reviews_count',
  'total_calls_hosted',
  'exact_location',
  'is_using_mock_location',
  'mock_location_city',
  'mock_location_country',
  'mock_location_country_code',
  'created_at',
  'is_banned',
].join(', ');

export function createUsersPublicRouter(_runtime: ServerRuntime) {
  const router = Router();

  /** GET /api/v1/users/me — own profile including wallet (service-role). */
  router.get('/me', requireAuth, async (req, res) => {
    try {
      if (!isSupabaseAdminConfigured()) {
        return sendError(res, 503, 'Profiles backend unavailable', 'NO_ADMIN');
      }
      const viewerId = authUserId(req);
      if (!viewerId) return sendError(res, 401, 'Unauthorized', 'UNAUTHORIZED');

      const client = getSupabaseAdmin()!;
      const { data, error } = await client
        .from('profiles')
        .select(
          `${PUBLIC_PROFILE_SELECT}, coin_balance, earnings_coins, email, auth_id` as string
        )
        .eq('id', viewerId)
        .maybeSingle();

      if (error) {
        console.error('[users/me]', error.message);
        return sendError(res, 500, 'Failed to load profile', 'LOAD_FAILED');
      }
      const row = data as Record<string, any> | null;
      if (!row) return sendError(res, 404, 'Profile not found', 'NOT_FOUND');

      const pub = mapPublicProfileRow(row);
      return res.json({
        success: true,
        data: {
          user: {
            ...pub,
            email: row.email || undefined,
            authId: row.auth_id || undefined,
            coinBalance: Number(row.coin_balance || 0),
            earningsCoins: Number(row.earnings_coins || 0),
          },
        },
      });
    } catch (err: any) {
      console.error('[users/me] exception:', err);
      return sendError(res, 500, err?.message || 'Failed to load profile', 'LOAD_FAILED');
    }
  });

  /** GET /api/v1/users/:id/public */
  router.get('/:id/public', requireAuth, async (req, res) => {
    try {
      if (!isSupabaseAdminConfigured()) {
        return sendError(res, 503, 'Profiles backend unavailable', 'NO_ADMIN');
      }
      const viewerId = authUserId(req);
      if (!viewerId) return sendError(res, 401, 'Unauthorized', 'UNAUTHORIZED');

      const targetId = String(req.params.id || '').trim();
      if (!targetId) return sendError(res, 400, 'Invalid user id', 'INVALID_ID');

      const client = getSupabaseAdmin()!;

      if (targetId !== viewerId && (await isBlockedEitherWay(client, viewerId, targetId))) {
        return sendError(res, 404, 'Profile not found', 'NOT_FOUND');
      }

      let { data, error } = await client
        .from('profiles')
        .select(PUBLIC_PROFILE_SELECT as string)
        .eq('id', targetId)
        .maybeSingle();

      // gallery_videos / some columns may be missing on older DBs — retry without them.
      if (error && /column|does not exist/i.test(String(error.message || ''))) {
        const fallback = await client
          .from('profiles')
          .select(
            'id, name, gender, age, dob, nationality, country_code, spoken_languages, bio, extended_bio, location_city, zodiac, interests, tags, avatar_url, gallery, intro_video_url, is_verified, online_status, role, hourly_coin_rate, created_at, is_banned'
          )
          .eq('id', targetId)
          .maybeSingle();
        data = fallback.data as unknown as typeof data;
        error = fallback.error;
      }

      if (error) {
        console.error('[users/:id/public]', error.message);
        return sendError(res, 500, 'Failed to load profile', 'LOAD_FAILED');
      }
      const row = data as unknown as Record<string, any> | null;
      if (!row || row.is_banned) {
        return sendError(res, 404, 'Profile not found', 'NOT_FOUND');
      }

      return res.json({ success: true, data: { user: mapPublicProfileRow(row) } });
    } catch (err: any) {
      console.error('[users/:id/public] exception:', err);
      return sendError(res, 500, err?.message || 'Failed to load profile', 'LOAD_FAILED');
    }
  });

  return router;
}
