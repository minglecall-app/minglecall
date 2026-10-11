/**
 * GET|POST /api/users — plain CommonJS (Hobby-safe).
 * Isolated from api/router.ts so list/create/update users still work when the router crashes.
 */
const { createClient } = require('@supabase/supabase-js');
const {
  mapProfileRow: mapProfileRowShared,
} = require('./_lib/cjs/helpers');

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function clean(v) {
  return String(v || '')
    .trim()
    .replace(/^["']|["']$/g, '');
}

function bearer(req) {
  const h = req.headers.authorization || req.headers.Authorization;
  if (!h || typeof h !== 'string') return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

/** Prefer shared mapper so gallery video sentinel is never returned as a photo URL. */
function mapProfileRow(p) {
  if (typeof mapProfileRowShared === 'function') {
    return mapProfileRowShared(p);
  }
  // Minimal fallback if helpers failed to load
  const GALLERY_VIDEOS_SENTINEL_PREFIX = '__mc_gv1__:';
  const gallery = Array.isArray(p.gallery) ? p.gallery : [];
  return {
    id: p.id,
    authId: p.auth_id || p.id,
    name: p.name || 'Member',
    email: p.email || '',
    gender: p.gender || 'male',
    genderLocked: p.gender_locked ?? true,
    role: p.role || 'male_user',
    age: Number(p.age) || 24,
    nationality: p.nationality || 'United States',
    countryCode: String(p.country_code || 'US').toUpperCase(),
    spokenLanguages: Array.isArray(p.spoken_languages) ? p.spoken_languages : ['English'],
    bio: p.bio || '',
    interests: Array.isArray(p.interests) ? p.interests : [],
    tags: Array.isArray(p.tags) ? p.tags : [],
    avatarUrl:
      p.avatar_url ||
      'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=400',
    gallery: gallery.filter((u) => u && !String(u).startsWith(GALLERY_VIDEOS_SENTINEL_PREFIX)),
    galleryVideos: Array.isArray(p.gallery_videos) ? p.gallery_videos : [],
    isVerified: Boolean(p.is_verified),
    isOnboarded: p.is_onboarded !== false,
    onlineStatus: p.online_status || 'offline',
    coinBalance: Number(p.coin_balance) || 0,
    hourlyCoinRate: Number(p.hourly_coin_rate) || 0,
    earningsCoins: Number(p.earnings_coins) || 0,
    hasPasswordSet: Boolean(p.has_password_set),
    isBanned: Boolean(p.is_banned),
    banReason: p.ban_reason || undefined,
    bannedUntil: p.banned_until || undefined,
    agencyName: p.agency_name || undefined,
    teamLeaderId: p.team_leader_id || p.created_by_id || undefined,
    createdById: p.created_by_id || p.team_leader_id || undefined,
    commissionPercent: p.commission_percent != null ? Number(p.commission_percent) : undefined,
    createdAt: p.created_at,
  };
}

function findAuthUserByEmail(users, email) {
  const target = String(email || '')
    .trim()
    .toLowerCase();
  if (!target || !Array.isArray(users)) return null;
  return users.find((u) => String((u && u.email) || '').toLowerCase() === target) || null;
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function requireAuth(req) {
  const supabaseUrl = clean(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL);
  const serviceKey = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl || !serviceKey) {
    return {
      ok: false,
      status: 503,
      error: { message: 'Supabase not configured', code: 'ENV' },
    };
  }

  const token = bearer(req);
  if (!token) {
    return {
      ok: false,
      status: 401,
      error: { message: 'Missing Authorization Bearer token.', code: 'UNAUTHORIZED' },
    };
  }

  const client = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await client.auth.getUser(token);
  if (userErr || !userData || !userData.user) {
    return {
      ok: false,
      status: 401,
      error: { message: 'Invalid or expired authentication token.', code: 'UNAUTHORIZED' },
    };
  }

  const authUser = userData.user;
  const { data: profile } = await client
    .from('profiles')
    .select('id, role, email')
    .or(`auth_id.eq.${authUser.id},id.eq.${authUser.id}`)
    .maybeSingle();

  const profileId = String((profile && profile.id) || authUser.id);
  const role = String((profile && profile.role) || '').toLowerCase();
  const email = String((profile && profile.email) || authUser.email || '').toLowerCase();

  return {
    ok: true,
    client,
    userId: authUser.id,
    profileId,
    role,
    email,
  };
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    const auth = await requireAuth(req);
    if (auth.ok === false) {
      return send(res, auth.status, { success: false, error: auth.error });
    }

    const client = auth.client;

    if (req.method === 'GET') {
      // Cursor page for discovery/directory — never unbounded select *
      const cursor = String((req.query && req.query.cursor) || '').trim();
      let limit = Number((req.query && req.query.limit) || 50);
      if (!Number.isFinite(limit) || limit <= 0) limit = 50;
      limit = Math.min(Math.floor(limit), 50);

      let q = client
        .from('profiles')
        .select('*')
        .or('is_banned.eq.false,is_banned.is.null')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (cursor) q = q.lt('created_at', cursor);

      const { data, error } = await q;
      if (error) {
        return send(res, 500, { success: false, error: { message: error.message } });
      }
      const users = (data || []).map(mapProfileRow);
      const nextCursor =
        users.length === limit && users[users.length - 1]
          ? users[users.length - 1].createdAt || users[users.length - 1].created_at || null
          : null;
      return send(res, 200, {
        success: true,
        users,
        count: users.length,
        nextCursor,
        pageSize: limit,
        timestamp: Date.now(),
      });
    }

    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const isAdmin =
        auth.role === 'admin' ||
        auth.email === 'superadmin@minglecall.com' ||
        auth.email === 'admin@livecall.app';

      let raw = body || {};
      if (!isAdmin) {
        raw = {
          ...raw,
          id: auth.profileId,
          role: auth.role,
          coinBalance: undefined,
          earningsCoins: undefined,
        };
      }

      const id = String(raw.id || auth.profileId);
      if (!isAdmin && id !== auth.profileId) {
        return send(res, 403, {
          success: false,
          error: { message: 'Forbidden', code: 'FORBIDDEN' },
        });
      }

      const payload = {
        id,
        auth_id: raw.authId || raw.auth_id || (id === auth.userId ? auth.userId : undefined),
        name: raw.name,
        email: raw.email ? String(raw.email).toLowerCase().trim() : undefined,
        gender: raw.gender,
        gender_locked: raw.genderLocked ?? raw.gender_locked,
        role: isAdmin ? raw.role : auth.role,
        age: raw.age != null ? Number(raw.age) : undefined,
        nationality: raw.nationality,
        country_code: raw.countryCode || raw.country_code,
        bio: raw.bio,
        interests: raw.interests,
        tags: raw.tags,
        spoken_languages: raw.spokenLanguages || raw.spoken_languages,
        avatar_url: raw.avatarUrl || raw.avatar_url,
        gallery: raw.gallery,
        is_verified: raw.isVerified ?? raw.is_verified,
        is_onboarded: raw.isOnboarded ?? raw.is_onboarded,
        online_status: raw.onlineStatus || raw.online_status,
        agency_name: raw.agencyName || raw.agency_name,
        commission_percent: raw.commissionPercent ?? raw.commission_percent,
        team_leader_id: raw.teamLeaderId || raw.team_leader_id,
        created_by_id: raw.createdById || raw.created_by_id,
        has_password_set: raw.hasPasswordSet ?? raw.has_password_set,
        updated_at: new Date().toISOString(),
      };
      Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);

      if (isAdmin && raw.coinBalance != null) payload.coin_balance = Number(raw.coinBalance);
      if (isAdmin && raw.earningsCoins != null) payload.earnings_coins = Number(raw.earningsCoins);
      if (isAdmin && raw.hourlyCoinRate != null) payload.hourly_coin_rate = Number(raw.hourlyCoinRate);

      const { data, error } = await client
        .from('profiles')
        .upsert(payload, { onConflict: 'id' })
        .select('*')
        .maybeSingle();
      if (error) {
        return send(res, 500, { success: false, error: { message: error.message } });
      }

      if (isAdmin && typeof raw.password === 'string' && raw.password && raw.email) {
        const { data: list } = await client.auth.admin.listUsers({ perPage: 1000 });
        const matched = findAuthUserByEmail(list && list.users, String(raw.email));
        if (matched) {
          await client.auth.admin.updateUserById(matched.id, {
            password: raw.password,
            email_confirm: true,
            user_metadata: { role: payload.role, gender: payload.gender, name: payload.name },
          });
          await client.from('profiles').update({ auth_id: matched.id }).eq('id', id);
        } else {
          const { data: created } = await client.auth.admin.createUser({
            email: String(raw.email).toLowerCase(),
            password: raw.password,
            email_confirm: true,
            user_metadata: { role: payload.role, gender: payload.gender, name: payload.name },
          });
          if (created && created.user && created.user.id) {
            await client.from('profiles').update({ auth_id: created.user.id }).eq('id', id);
          }
        }
      }

      return send(res, 200, { success: true, user: mapProfileRow(data) });
    }

    return send(res, 405, { success: false, error: { message: 'Method not allowed' } });
  } catch (err) {
    console.error('[api/users]', err);
    return send(res, 500, {
      success: false,
      error: { message: (err && err.message) || 'Users API failed', code: 'INTERNAL' },
    });
  }
};
