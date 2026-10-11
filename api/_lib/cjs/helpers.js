/**
 * Shared CommonJS helpers for Vercel API entries (kept under api/_lib — not a route).
 */
const { createHash } = require('crypto');
const { createClient } = require('@supabase/supabase-js');

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

function getSupabaseEnv() {
  return {
    url: clean(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL),
    anonKey: clean(process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY),
    // Never fall back to anon — service-role only for backend mutations / RLS bypass.
    serviceKey: clean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  };
}

function decodeJwtRole(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    return typeof payload.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

/** Transaction-pooler URL for raw SQL drivers (PgBouncer / Supavisor :6543). */
function getPooledDatabaseUrl() {
  const raw = String(
    process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL || ''
  ).trim();
  if (!raw) return null;
  let url = raw;
  const isPooled =
    /:6543(\/|\?|$)/.test(url) ||
    /\.pooler\.supabase\.com/i.test(url) ||
    /[?&]pgbouncer=true\b/i.test(url);
  if (!isPooled && /:5432(\/|\?|$)/.test(url) && /supabase\.(co|com)/i.test(url)) {
    url = url.replace(/:5432(?=\/|\?|$)/, ':6543');
  }
  if (/:5432(\/|\?|$)/.test(url) && !/:6543(\/|\?|$)/.test(url)) {
    console.warn(
      '[api/_lib/cjs/helpers] DATABASE_URL looks like a direct Postgres session (5432). Use Supabase Transaction pooler port 6543 on Vercel.'
    );
  }
  return url;
}

function createServiceClient() {
  const { url, serviceKey } = getSupabaseEnv();
  if (!url || !serviceKey) return null;
  const role = decodeJwtRole(serviceKey);
  if (role && role !== 'service_role') {
    console.error(
      '[api/_lib/cjs/helpers] SUPABASE_SERVICE_ROLE_KEY is not a service_role JWT (got role=%s). Refusing client.',
      role
    );
    return null;
  }
  // PostgREST HTTPS — pooled server-side. Warn if a direct DB URL is mis-set.
  void getPooledDatabaseUrl();
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'public' },
    global: { headers: { 'X-Client-Info': 'minglecall-vercel-cjs' } },
  });
}

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function isValidOtpToken(token) {
  return typeof token === 'string' && /^\d{6}$/.test(token.trim());
}

const PUBLIC_ROLES = new Set([
  'male_user',
  'female_user',
  'female_creator',
  'female_host',
  'other_user',
]);

function sanitizePublicSignupRole(role) {
  const r = String(role || '').trim();
  return PUBLIC_ROLES.has(r) ? r : 'male_user';
}

const WEAK = new Set(
  [
    'password',
    'password1',
    'password123',
    'passw0rd',
    '123456',
    '12345678',
    'qwerty',
    'admin',
    'admin123',
    'creator123',
    'admin@12345',
  ].map((p) => p.toLowerCase())
);

function getPasswordPolicyError(password) {
  if (typeof password !== 'string' || !password) return 'Password is required.';
  if (password.length < 8) return 'Password requirement not met: at least 8 characters.';
  if (!/[A-Z]/.test(password)) return 'Password requirement not met: at least 1 uppercase letter (A–Z).';
  if (!/[a-z]/.test(password)) return 'Password requirement not met: at least 1 lowercase letter (a–z).';
  if (!/[0-9]/.test(password)) return 'Password requirement not met: at least 1 number (0–9).';
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    return 'Password requirement not met: at least 1 special character (!@#$…).';
  }
  if (WEAK.has(password.toLowerCase()) || /(.)\1{2,}/.test(password)) {
    return 'Password requirement not met: no common or repeating patterns.';
  }
  return null;
}

function mapProfileRow(p) {
  if (!p) return null;
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
    gallery: splitGalleryPhotosAndVideos(Array.isArray(p.gallery) ? p.gallery : []).photos,
    galleryVideos: resolveGalleryVideosFromRow(p),
    introVideoUrl: p.intro_video_url || p.introVideoUrl || undefined,
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

/** Dating-safe public profile DTO — no email, wallet, KYC, ban, or secrets. */
function mapPublicProfileRow(p) {
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

/** Persist gallery videos inside profiles.gallery (TEXT[]) when gallery_videos column is missing. */
const GALLERY_VIDEOS_SENTINEL_PREFIX = '__mc_gv1__:';

function encodeGalleryVideosSentinel(videos) {
  return `${GALLERY_VIDEOS_SENTINEL_PREFIX}${JSON.stringify(Array.isArray(videos) ? videos : [])}`;
}

function splitGalleryPhotosAndVideos(gallery) {
  const photos = [];
  let videos = null;
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

function mergeGalleryWithVideoSentinel(photos, videos) {
  const cleanPhotos = (Array.isArray(photos) ? photos : []).filter(
    (u) => u && !String(u).startsWith(GALLERY_VIDEOS_SENTINEL_PREFIX)
  );
  return [...cleanPhotos, encodeGalleryVideosSentinel(videos || [])];
}

function resolveGalleryVideosFromRow(p) {
  // Prefer non-empty column; empty [] must not block sentinel fallback
  // (common after ADD COLUMN ... DEFAULT '[]' while videos still live in gallery).
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

function findAuthUserByEmail(users, email) {
  const target = String(email || '')
    .trim()
    .toLowerCase();
  if (!target || !Array.isArray(users)) return null;
  return users.find((u) => String((u && u.email) || '').toLowerCase() === target) || null;
}

async function requireAuth(req) {
  const { url, serviceKey } = getSupabaseEnv();
  if (!url || !serviceKey) {
    return {
      ok: false,
      status: 503,
      error: { message: 'Supabase not configured', code: 'ENV' },
    };
  }
  let token = bearer(req);
  // sendBeacon cannot set Authorization — allow accessToken in JSON body (cached on req.body)
  if (!token) {
    try {
      const body = await readJsonBody(req);
      if (body && typeof body === 'object') {
        req.body = body;
        const fromBody = body.accessToken || body.access_token;
        if (typeof fromBody === 'string' && fromBody.trim()) {
          token = fromBody.trim();
        }
      }
    } catch (_) {
      /* ignore */
    }
  }
  if (!token) {
    return {
      ok: false,
      status: 401,
      error: { message: 'Missing Authorization Bearer token.', code: 'UNAUTHORIZED' },
    };
  }
  const client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await client.auth.getUser(token);
  if (userErr || !userData || !userData.user) {
    let hint = '';
    try {
      const parts = String(token).split('.');
      if (parts.length >= 2) {
        const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
        const iss = String(payload.iss || '').replace(/\/$/, '');
        const expected = String(url || '').replace(/\/$/, '');
        if (payload.exp && Number(payload.exp) * 1000 < Date.now()) {
          hint = ' Session expired — sign out and sign in again.';
        } else if (iss && expected && !iss.startsWith(expected)) {
          hint =
            ' Browser session project does not match server SUPABASE URL. On Vercel, VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be from the same project, then Redeploy.';
        } else if (userErr && userErr.message) {
          hint = ` (${String(userErr.message).slice(0, 120)})`;
        }
      }
    } catch (_) {
      /* ignore decode errors */
    }
    return {
      ok: false,
      status: 401,
      error: {
        message: `Invalid or expired authentication token.${hint}`,
        code: 'UNAUTHORIZED',
      },
    };
  }
  const authUser = userData.user;
  // Sequential lookup — avoid .or(...).maybeSingle() which errors when multiple rows match
  let profile = null;
  {
    const { data: byAuth } = await client
      .from('profiles')
      .select('*')
      .eq('auth_id', authUser.id)
      .maybeSingle();
    profile = byAuth || null;
  }
  if (!profile) {
    const { data: byId } = await client
      .from('profiles')
      .select('*')
      .eq('id', authUser.id)
      .maybeSingle();
    profile = byId || null;
  }
  if (!profile && authUser.email) {
    // limit(1) avoids maybeSingle() hard-fail when duplicate emails exist
    const { data: byEmailRows } = await client
      .from('profiles')
      .select('*')
      .ilike('email', String(authUser.email).trim().toLowerCase())
      .limit(1);
    profile = Array.isArray(byEmailRows) && byEmailRows[0] ? byEmailRows[0] : null;
  }
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
    user: authUser,
    profile,
  };
}

function isAdminRole(role, email) {
  return (
    role === 'admin' || email === 'admin@livecall.app' || email === 'superadmin@minglecall.com'
  );
}

function isTeamLeaderRole(role, email) {
  return (
    role === 'team_leader' ||
    role === 'agency_manager' ||
    isAdminRole(role, email)
  );
}

function hashOtp(code) {
  return createHash('sha256').update(String(code).trim()).digest('hex');
}

async function saveOtpDb(client, email, code, metadata) {
  const cleanEmail = email.trim().toLowerCase();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const { error } = await client.from('auth_otps').upsert(
    {
      email: cleanEmail,
      code_hash: hashOtp(code),
      name: (metadata && metadata.name) || null,
      role: (metadata && metadata.role) || null,
      expires_at: expiresAt,
      attempts: 0,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'email' }
  );
  if (error) throw new Error(error.message);
}

async function verifyOtpDb(client, email, inputCode) {
  const cleanEmail = email.trim().toLowerCase();
  const { data: stored, error } = await client
    .from('auth_otps')
    .select('email, code_hash, name, role, expires_at, attempts')
    .eq('email', cleanEmail)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!stored) {
    return {
      success: false,
      error: 'No active verification code found for this email. Please request a new code.',
    };
  }
  if (Date.now() > new Date(stored.expires_at).getTime()) {
    await client.from('auth_otps').delete().eq('email', cleanEmail);
    return { success: false, error: 'The verification code has expired. Please request a new one.' };
  }
  const attempts = Number(stored.attempts || 0);
  if (attempts >= 5) {
    await client.from('auth_otps').delete().eq('email', cleanEmail);
    return {
      success: false,
      error: 'Too many incorrect attempts. Please request a fresh verification code.',
    };
  }
  if (stored.code_hash === hashOtp(inputCode)) {
    await client.from('auth_otps').delete().eq('email', cleanEmail);
    return {
      success: true,
      metadata: {
        email: stored.email,
        name: stored.name || undefined,
        role: stored.role || undefined,
      },
    };
  }
  await client
    .from('auth_otps')
    .update({ attempts: attempts + 1, updated_at: new Date().toISOString() })
    .eq('email', cleanEmail);
  return {
    success: false,
    error: `Invalid verification code. ${5 - (attempts + 1)} attempt(s) remaining.`,
  };
}

async function savePendingSignupDb(client, email, passwordHash, meta) {
  const cleanEmail = email.trim().toLowerCase();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const { error } = await client.from('auth_pending_signups').upsert(
    {
      email: cleanEmail,
      password_hash: passwordHash,
      name: (meta && meta.name) || null,
      role: (meta && meta.role) || null,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'email' }
  );
  if (error) throw new Error(error.message);
}

async function peekPendingSignupDb(client, email) {
  const cleanEmail = email.trim().toLowerCase();
  const { data } = await client
    .from('auth_pending_signups')
    .select('password_hash, name, role, expires_at')
    .eq('email', cleanEmail)
    .maybeSingle();
  if (!data) return null;
  if (Date.now() > new Date(data.expires_at).getTime()) {
    await client.from('auth_pending_signups').delete().eq('email', cleanEmail);
    return null;
  }
  return {
    password_hash: data.password_hash,
    name: data.name || undefined,
    role: data.role || undefined,
  };
}

async function deletePendingSignupDb(client, email) {
  const cleanEmail = email.trim().toLowerCase();
  await client.from('auth_pending_signups').delete().eq('email', cleanEmail);
}

/** Peek + delete (legacy). Prefer peek then delete after Auth create succeeds. */
async function takePendingSignupDb(client, email) {
  const pending = await peekPendingSignupDb(client, email);
  if (pending) await deletePendingSignupDb(client, email);
  return pending;
}

function generateSixDigitOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function isSmtpConfigured() {
  return Boolean(
    clean(process.env.RESEND_API_KEY) ||
      (clean(process.env.SMTP_HOST) && clean(process.env.SMTP_USER) && clean(process.env.SMTP_PASS))
  );
}

function getEmailEnvStatus() {
  const resendKey = clean(process.env.RESEND_API_KEY);
  const smtpHost = clean(process.env.SMTP_HOST);
  const smtpUser = clean(process.env.SMTP_USER);
  const smtpPass = clean(process.env.SMTP_PASS);
  const smtpFromRaw = clean(process.env.SMTP_FROM || process.env.RESEND_FROM);
  const smtpFromResolved = resolveResendFromAddress();
  const smtpPort = clean(process.env.SMTP_PORT) || '465';
  const smtpSecure = clean(process.env.SMTP_SECURE) || 'true';
  return {
    source: 'environment',
    resendConfigured: Boolean(resendKey),
    resendApiKeyPreview: resendKey ? `${resendKey.slice(0, 5)}…` : '',
    smtpConfigured: Boolean(smtpHost && smtpUser && smtpPass),
    smtpHost: smtpHost || '',
    smtpPort,
    smtpUser: smtpUser ? smtpUser.replace(/(.{2})(.*)(@.*)/, '$1***$3') : '',
    smtpFrom: smtpFromRaw || '',
    smtpFromResolved,
    smtpSecure: smtpSecure === 'true' || smtpPort === '465',
    smtpPassConfigured: Boolean(smtpPass),
    configured: isSmtpConfigured(),
    vercel: Boolean(process.env.VERCEL),
    message:
      'Email credentials are loaded from Vercel Environment Variables (RESEND_API_KEY and/or SMTP_*). Set SMTP_FROM to an address on a Resend-verified domain (e.g. noreply@minglecall.com).',
  };
}

const DEFAULT_EMAIL_POLICY = {
  emailRegisterEnabled: true,
  emailAccountCreateEnabled: true,
  emailAccountDeleteEnabled: false,
  allowCreateWithoutOtp: false,
  emailShowOtpFallback: false,
};

const DEFAULT_OTP_HTML =
  '<p>Hello <strong>{{name}}</strong>,</p><p>Your 6-digit OTP is:</p><p style="font-size:28px;letter-spacing:6px;font-weight:800">{{otp}}</p><p>Valid for 10 minutes.</p><p><a href="{{link}}">Confirm email</a></p>';

const DEFAULT_EMAIL_TEMPLATES = {
  otp_register: {
    subject: 'Your 6-Digit Verification Code: {{otp}} - MingleCall',
    html: DEFAULT_OTP_HTML,
  },
  otp_signin: {
    subject: 'Your sign-in code: {{otp}} - MingleCall',
    html: DEFAULT_OTP_HTML,
  },
  password_reset: {
    subject: 'Password reset code: {{otp}} - MingleCall',
    html: DEFAULT_OTP_HTML,
  },
  account_create: {
    subject: 'Your MingleCall account is ready',
    html: '<p>Hello <strong>{{name}}</strong>,</p><p>Your account (<strong>{{email}}</strong>) was created. Sign in with the password you were given.</p>',
  },
  account_delete: {
    subject: 'Your MingleCall account was deleted',
    html: '<p>Hello <strong>{{name}}</strong>,</p><p>Your account (<strong>{{email}}</strong>) has been permanently deleted.</p>',
  },
  connection_test: {
    subject: 'MingleCall email connection test ({{otp}})',
    html: '<p>Hello <strong>{{name}}</strong>,</p><p>This is a connection test from the Admin Email tab.</p><p>Test code: <strong>{{otp}}</strong></p>',
  },
};

function parseEmailTemplatesJson(raw) {
  const base = JSON.parse(JSON.stringify(DEFAULT_EMAIL_TEMPLATES));
  if (!raw || typeof raw !== 'string' || !String(raw).trim()) return base;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return base;
    Object.keys(DEFAULT_EMAIL_TEMPLATES).forEach((key) => {
      const row = parsed[key];
      if (row && typeof row === 'object') {
        if (typeof row.subject === 'string' && row.subject.trim()) base[key].subject = row.subject;
        if (typeof row.html === 'string' && row.html.trim()) base[key].html = row.html;
      }
    });
  } catch (e) {
    // keep defaults
  }
  return base;
}

function renderEmailTemplate(template, vars) {
  const replace = (input) =>
    String(input || '')
      .replace(/\{\{\s*name\s*\}\}/gi, (vars && vars.name) || 'User')
      .replace(/\{\{\s*otp\s*\}\}/gi, (vars && vars.otp) || '')
      .replace(/\{\{\s*email\s*\}\}/gi, (vars && vars.email) || '')
      .replace(/\{\{\s*link\s*\}\}/gi, (vars && vars.link) || '#');
  return {
    subject: replace(template && template.subject),
    html: replace(template && template.html),
  };
}

async function getEmailTemplates(client) {
  if (!client) return parseEmailTemplatesJson('');
  try {
    const { data } = await client
      .from('system_configs')
      .select('email_templates_json')
      .eq('id', 'default')
      .maybeSingle();
    return parseEmailTemplatesJson(data && data.email_templates_json);
  } catch (e) {
    console.warn('[email] getEmailTemplates notice:', e && e.message);
    return parseEmailTemplatesJson('');
  }
}

async function saveEmailTemplates(client, templates) {
  if (!client) throw new Error('Supabase not configured');
  const merged = parseEmailTemplatesJson(JSON.stringify(templates || {}));
  const { error } = await client.from('system_configs').upsert(
    {
      id: 'default',
      email_templates_json: JSON.stringify(merged),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );
  if (error) throw new Error(error.message);
  return merged;
}

async function getEmailPolicy(client) {
  const out = { ...DEFAULT_EMAIL_POLICY };
  if (!client) return out;
  try {
    const { data } = await client
      .from('system_configs')
      .select(
        'email_register_enabled, email_account_create_enabled, email_account_delete_enabled, allow_create_without_otp, email_show_otp_fallback, smtp_show_otp'
      )
      .eq('id', 'default')
      .maybeSingle();
    if (!data) return out;
    if (data.email_register_enabled != null) out.emailRegisterEnabled = Boolean(data.email_register_enabled);
    if (data.email_account_create_enabled != null) {
      out.emailAccountCreateEnabled = Boolean(data.email_account_create_enabled);
    }
    if (data.email_account_delete_enabled != null) {
      out.emailAccountDeleteEnabled = Boolean(data.email_account_delete_enabled);
    }
    if (data.allow_create_without_otp != null) {
      out.allowCreateWithoutOtp = Boolean(data.allow_create_without_otp);
    }
    if (data.email_show_otp_fallback != null) {
      out.emailShowOtpFallback = Boolean(data.email_show_otp_fallback);
    } else if (data.smtp_show_otp != null) {
      out.emailShowOtpFallback = Boolean(data.smtp_show_otp);
    }
  } catch (e) {
    console.warn('[email] getEmailPolicy notice:', e && e.message);
  }
  return out;
}

async function saveEmailPolicy(client, policy) {
  if (!client) throw new Error('Supabase not configured');
  const payload = {
    id: 'default',
    email_register_enabled:
      policy.emailRegisterEnabled != null
        ? Boolean(policy.emailRegisterEnabled)
        : DEFAULT_EMAIL_POLICY.emailRegisterEnabled,
    email_account_create_enabled:
      policy.emailAccountCreateEnabled != null
        ? Boolean(policy.emailAccountCreateEnabled)
        : DEFAULT_EMAIL_POLICY.emailAccountCreateEnabled,
    email_account_delete_enabled:
      policy.emailAccountDeleteEnabled != null
        ? Boolean(policy.emailAccountDeleteEnabled)
        : DEFAULT_EMAIL_POLICY.emailAccountDeleteEnabled,
    allow_create_without_otp:
      policy.allowCreateWithoutOtp != null
        ? Boolean(policy.allowCreateWithoutOtp)
        : DEFAULT_EMAIL_POLICY.allowCreateWithoutOtp,
    email_show_otp_fallback:
      policy.emailShowOtpFallback != null
        ? Boolean(policy.emailShowOtpFallback)
        : DEFAULT_EMAIL_POLICY.emailShowOtpFallback,
    smtp_show_otp:
      policy.emailShowOtpFallback != null
        ? Boolean(policy.emailShowOtpFallback)
        : DEFAULT_EMAIL_POLICY.emailShowOtpFallback,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await client
    .from('system_configs')
    .upsert(payload, { onConflict: 'id' })
    .select(
      'email_register_enabled, email_account_create_enabled, email_account_delete_enabled, allow_create_without_otp, email_show_otp_fallback'
    )
    .maybeSingle();
  if (error) throw new Error(error.message);
  return {
    emailRegisterEnabled: Boolean(
      data?.email_register_enabled ?? payload.email_register_enabled
    ),
    emailAccountCreateEnabled: Boolean(
      data?.email_account_create_enabled ?? payload.email_account_create_enabled
    ),
    emailAccountDeleteEnabled: Boolean(
      data?.email_account_delete_enabled ?? payload.email_account_delete_enabled
    ),
    allowCreateWithoutOtp: Boolean(
      data?.allow_create_without_otp ?? payload.allow_create_without_otp
    ),
    emailShowOtpFallback: Boolean(
      data?.email_show_otp_fallback ?? payload.email_show_otp_fallback
    ),
  };
}

async function logEmailDispatch(client, entry) {
  if (!client) return;
  try {
    await client.from('email_dispatch_log').insert({
      purpose: entry.purpose || 'other',
      recipient_email: String(entry.recipientEmail || '').toLowerCase().trim(),
      recipient_name: entry.recipientName || null,
      subject: entry.subject || null,
      provider: entry.provider || null,
      status: entry.status || 'sent',
      error_message: entry.errorMessage || null,
      meta: entry.meta || {},
    });
  } catch (e) {
    console.warn('[email] logEmailDispatch notice:', e && e.message);
  }
}

const RESEND_SAFE_FROM = 'MingleCall <onboarding@resend.dev>';
const UNVERIFIED_FROM_DOMAINS = [
  'livecallvip.com',
  'livecall-app.com',
  'livecall.app',
  'minglecall.local',
];

/** Prefer verified product domain; never send Resend mail from known-unverified legacy domains. */
function resolveResendFromAddress() {
  const raw = clean(process.env.SMTP_FROM || process.env.RESEND_FROM);
  if (!raw) return 'MingleCall <noreply@minglecall.com>';
  const lower = raw.toLowerCase();
  if (UNVERIFIED_FROM_DOMAINS.some((d) => lower.includes(d))) {
    // Product domain — must be verified in Resend; code retries to onboarding@resend.dev on 403
    return 'MingleCall <noreply@minglecall.com>';
  }
  if (lower.includes('<') && lower.includes('>')) return raw;
  if (lower.includes('@')) return `MingleCall <${raw}>`;
  return RESEND_SAFE_FROM;
}

function isResendDomainError(text) {
  const t = String(text || '').toLowerCase();
  return (
    t.includes('domain is not verified') ||
    t.includes('not verified') ||
    t.includes('validation_error') ||
    t.includes('verify a domain')
  );
}

async function dispatchEmailViaEnv({ to, name, subject, html, purpose, meta }) {
  const dest = String(to || '')
    .trim()
    .toLowerCase();
  const display = name || 'User';
  const client = createServiceClient();
  const resendKey = clean(process.env.RESEND_API_KEY);
  let from = resolveResendFromAddress();

  if (resendKey) {
    try {
      const sendOnce = async (fromAddr) => {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ from: fromAddr, to: [dest], subject, html }),
        });
        const t = (await res.text().catch(() => '')).slice(0, 280);
        return { ok: res.ok, status: res.status, body: t };
      };

      let result = await sendOnce(from);
      // Unverified minglecall.com / wrong From → retry with Resend sandbox sender
      if (!result.ok && isResendDomainError(result.body) && !from.includes('onboarding@resend.dev')) {
        from = RESEND_SAFE_FROM;
        result = await sendOnce(from);
      }

      if (!result.ok) {
        await logEmailDispatch(client, {
          purpose,
          recipientEmail: dest,
          recipientName: display,
          subject,
          provider: 'resend',
          status: 'failed',
          errorMessage: result.body,
          meta: { ...(meta || {}), from },
        });
        let hint = '';
        if (isResendDomainError(result.body)) {
          hint =
            ' Add and verify minglecall.com at https://resend.com/domains, then set SMTP_FROM=noreply@minglecall.com in Vercel.';
        }
        return {
          success: true,
          delivered: false,
          provider: 'resend',
          message: `Email provider error (${result.status}). ${result.body}${hint}`,
        };
      }
      await logEmailDispatch(client, {
        purpose,
        recipientEmail: dest,
        recipientName: display,
        subject,
        provider: 'resend',
        status: 'sent',
        meta: { ...(meta || {}), from },
      });
      return {
        success: true,
        delivered: true,
        provider: 'resend',
        message:
          from.includes('onboarding@resend.dev')
            ? 'Email sent via Resend (sandbox sender). Verify minglecall.com on Resend for production From addresses.'
            : 'Email sent via Resend.',
      };
    } catch (e) {
      await logEmailDispatch(client, {
        purpose,
        recipientEmail: dest,
        recipientName: display,
        subject,
        provider: 'resend',
        status: 'failed',
        errorMessage: (e && e.message) || 'Resend failed',
        meta,
      });
      return { success: true, delivered: false, provider: 'resend', message: (e && e.message) || 'Email send failed' };
    }
  }

  try {
    const nodemailer = require('nodemailer');
    const host = clean(process.env.SMTP_HOST);
    const user = clean(process.env.SMTP_USER);
    const pass = clean(process.env.SMTP_PASS);
    if (!host || !user || !pass) {
      await logEmailDispatch(client, {
        purpose,
        recipientEmail: dest,
        recipientName: display,
        subject,
        provider: 'none',
        status: 'skipped',
        errorMessage: 'RESEND_API_KEY / SMTP_* not configured in environment',
        meta,
      });
      return {
        success: true,
        delivered: false,
        provider: 'none',
        message: 'Email not configured in Vercel env; message not delivered.',
      };
    }
    // When SMTP is Resend's relay, use same From resolution rules
    let smtpFrom = from;
    if (host.includes('resend.com') && UNVERIFIED_FROM_DOMAINS.some((d) => smtpFrom.toLowerCase().includes(d))) {
      smtpFrom = RESEND_SAFE_FROM;
    }
    const port = parseInt(process.env.SMTP_PORT || '465', 10);
    const secure = String(process.env.SMTP_SECURE || 'true') === 'true' || port === 465;
    const transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
    await transporter.sendMail({ from: smtpFrom, to: dest, subject, html });
    await logEmailDispatch(client, {
      purpose,
      recipientEmail: dest,
      recipientName: display,
      subject,
      provider: 'smtp',
      status: 'sent',
      meta: { ...(meta || {}), from: smtpFrom },
    });
    return { success: true, delivered: true, provider: 'smtp', message: 'Email sent via SMTP.' };
  } catch (e) {
    await logEmailDispatch(client, {
      purpose,
      recipientEmail: dest,
      recipientName: display,
      subject,
      provider: 'smtp',
      status: 'failed',
      errorMessage: (e && e.message) || 'SMTP failed',
      meta,
    });
    return { success: true, delivered: false, provider: 'smtp', message: (e && e.message) || 'Email send failed' };
  }
}

async function sendOtpEmailVercel({ to, name, otpCode, confirmationUrl, templateKey }) {
  const display = name || 'User';
  const cleanTo = String(to || '')
    .trim()
    .toLowerCase();
  const client = createServiceClient();
  const templates = await getEmailTemplates(client);
  const key = templateKey && templates[templateKey] ? templateKey : 'otp_register';
  const appUrl =
    clean(process.env.APP_URL) ||
    clean(process.env.VITE_APP_URL) ||
    'https://minglecall.com';
  const link =
    confirmationUrl ||
    `${appUrl}/?auth_verify=1&email=${encodeURIComponent(cleanTo)}&code=${otpCode}`;
  const rendered = renderEmailTemplate(templates[key], {
    name: display,
    otp: String(otpCode || ''),
    email: cleanTo,
    link,
  });
  return dispatchEmailViaEnv({
    to: cleanTo,
    name: display,
    subject: rendered.subject,
    html: rendered.html,
    purpose: key,
    meta: { kind: 'otp', templateKey: key },
  });
}

async function sendTransactionalEmail({ to, name, purpose, subject, html, meta }) {
  return dispatchEmailViaEnv({ to, name, subject, html, purpose: purpose || 'other', meta });
}

async function testEmailConnection({ to, name } = {}) {
  const dest =
    String(to || '')
      .trim()
      .toLowerCase() || clean(process.env.SMTP_USER) || '';
  if (!dest || !dest.includes('@')) {
    // Probe Resend API keys without sending if no recipient
    const resendKey = clean(process.env.RESEND_API_KEY);
    if (resendKey) {
      try {
        const res = await fetch('https://api.resend.com/domains', {
          headers: { Authorization: `Bearer ${resendKey}` },
        });
        if (res.ok || res.status === 200) {
          return {
            success: true,
            ok: true,
            provider: 'resend',
            message: 'Resend API key accepted (domains endpoint reachable). Provide a recipient to send a live test email.',
          };
        }
        const t = (await res.text().catch(() => '')).slice(0, 160);
        return {
          success: true,
          ok: false,
          provider: 'resend',
          message: `Resend key rejected (${res.status}): ${t}`,
        };
      } catch (e) {
        return {
          success: true,
          ok: false,
          provider: 'resend',
          message: (e && e.message) || 'Resend connection failed',
        };
      }
    }
    if (isSmtpConfigured()) {
      return {
        success: true,
        ok: true,
        provider: 'smtp',
        message: 'SMTP env vars present. Provide a recipient email to send a live test message.',
      };
    }
    return {
      success: true,
      ok: false,
      provider: 'none',
      message: 'Set RESEND_API_KEY or SMTP_HOST/SMTP_USER/SMTP_PASS in Vercel Environment Variables.',
    };
  }

  const display = name || 'Admin';
  const otp = generateSixDigitOtp();
  const client = createServiceClient();
  const templates = await getEmailTemplates(client);
  const rendered = renderEmailTemplate(templates.connection_test, {
    name: display,
    otp,
    email: dest,
    link: clean(process.env.APP_URL) || 'https://minglecall.com',
  });
  const result = await dispatchEmailViaEnv({
    to: dest,
    name: display,
    subject: rendered.subject,
    html: rendered.html,
    purpose: 'test',
    meta: { kind: 'connection_test' },
  });
  return {
    success: true,
    ok: Boolean(result.delivered),
    provider: result.provider,
    message: result.message,
    delivered: result.delivered,
    recipient: dest,
  };
}

function hashPasswordSync(password) {
  try {
    const bcrypt = require('bcryptjs');
    return bcrypt.hashSync(password, 10);
  } catch {
    return `sha256:${createHash('sha256').update(password).digest('hex')}`;
  }
}

module.exports = {
  send,
  clean,
  bearer,
  readJsonBody,
  getSupabaseEnv,
  getPooledDatabaseUrl,
  createServiceClient,
  createClient,
  isValidEmail,
  isValidOtpToken,
  sanitizePublicSignupRole,
  getPasswordPolicyError,
  mapProfileRow,
  mapPublicProfileRow,
  GALLERY_VIDEOS_SENTINEL_PREFIX,
  encodeGalleryVideosSentinel,
  splitGalleryPhotosAndVideos,
  mergeGalleryWithVideoSentinel,
  resolveGalleryVideosFromRow,
  findAuthUserByEmail,
  requireAuth,
  isAdminRole,
  isTeamLeaderRole,
  saveOtpDb,
  verifyOtpDb,
  savePendingSignupDb,
  peekPendingSignupDb,
  deletePendingSignupDb,
  takePendingSignupDb,
  generateSixDigitOtp,
  isSmtpConfigured,
  sendOtpEmailVercel,
  sendTransactionalEmail,
  getEmailEnvStatus,
  getEmailPolicy,
  saveEmailPolicy,
  getEmailTemplates,
  saveEmailTemplates,
  parseEmailTemplatesJson,
  renderEmailTemplate,
  DEFAULT_EMAIL_TEMPLATES,
  logEmailDispatch,
  testEmailConnection,
  DEFAULT_EMAIL_POLICY,
  hashPasswordSync,
};
