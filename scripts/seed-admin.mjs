/**
 * Seed a platform admin Auth user + profiles row on a fresh Supabase project.
 *
 * Usage (from repo root):
 *   node --env-file=.env.local scripts/seed-admin.mjs
 *
 * Optional env:
 *   SEED_ADMIN_EMAIL=admin@livecall.app
 *   SEED_ADMIN_PASSWORD=...
 *   SEED_ADMIN_NAME=System Admin
 */
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';

const url = (
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  ''
).trim();
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

const email = (process.env.SEED_ADMIN_EMAIL || 'admin@livecall.app').trim().toLowerCase();
const name = (process.env.SEED_ADMIN_NAME || 'System Admin').trim();
const password =
  (process.env.SEED_ADMIN_PASSWORD || '').trim() ||
  `Admin-${randomBytes(6).toString('base64url')}!1a`;

if (!url || !serviceKey) {
  console.error('Missing SUPABASE URL or SUPABASE_SERVICE_ROLE_KEY (.env.local).');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function findAuthUserByEmail(targetEmail) {
  // Paginate a few pages; fine for empty/new projects.
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = (data?.users || []).find(
      (u) => String(u.email || '').toLowerCase() === targetEmail
    );
    if (hit) return hit;
    if (!data?.users?.length || data.users.length < 200) break;
  }
  return null;
}

async function main() {
  console.log(`Seeding admin for ${url}`);
  console.log(`Email: ${email}`);

  let authUser = await findAuthUserByEmail(email);
  let created = false;

  if (!authUser) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        role: 'admin',
        full_name: name,
        name,
        gender: 'male',
        is_onboarded: true,
      },
      app_metadata: { role: 'admin' },
    });
    if (error) {
      console.error('createUser failed:', error.message);
      process.exit(1);
    }
    authUser = data.user;
    created = true;
    console.log('Created Auth user:', authUser.id);
  } else {
    console.log('Auth user already exists:', authUser.id);
    const { error: pwErr } = await admin.auth.admin.updateUserById(authUser.id, {
      password,
      email_confirm: true,
      user_metadata: {
        ...(authUser.user_metadata || {}),
        role: 'admin',
        full_name: name,
        name,
        gender: 'male',
        is_onboarded: true,
      },
      app_metadata: { ...(authUser.app_metadata || {}), role: 'admin' },
    });
    if (pwErr) {
      console.error('updateUser password/metadata failed:', pwErr.message);
      process.exit(1);
    }
    console.log('Updated Auth password + admin metadata');
  }

  // Wait briefly for on_auth_user_created trigger (new users only)
  if (created) {
    await new Promise((r) => setTimeout(r, 800));
  }

  const authId = authUser.id;
  const profilePayload = {
    id: authId,
    auth_id: authId,
    email,
    name,
    gender: 'male',
    gender_locked: true,
    role: 'admin',
    coin_balance: 0,
    earnings_coins: 0,
    hourly_coin_rate: 10,
    is_onboarded: true,
    is_verified: true,
    online_status: 'online',
    nationality: 'United States',
    country_code: 'US',
    spoken_languages: ['English'],
    bio: 'Platform Root Administrator',
    avatar_url:
      'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=400',
    updated_at: new Date().toISOString(),
  };

  // Prefer link existing email row; else upsert by auth id
  const { data: byEmail } = await admin
    .from('profiles')
    .select('id')
    .ilike('email', email)
    .maybeSingle();

  let profileId = byEmail?.id || authId;

  if (byEmail?.id && byEmail.id !== authId) {
    const { error: linkErr } = await admin
      .from('profiles')
      .update({
        auth_id: authId,
        role: 'admin',
        name,
        is_onboarded: true,
        is_verified: true,
        gender: 'male',
        gender_locked: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', byEmail.id);
    if (linkErr) {
      console.error('Link existing profile failed:', linkErr.message);
      process.exit(1);
    }
    profileId = byEmail.id;
    console.log('Linked existing profile to Auth:', profileId);
  } else {
    const { error: upsertErr } = await admin.from('profiles').upsert(profilePayload, {
      onConflict: 'id',
    });
    if (upsertErr) {
      console.error('Upsert profile failed:', upsertErr.message);
      process.exit(1);
    }
    console.log('Upserted admin profile:', profileId);
  }

  // Ensure system_configs default row exists (fresh DB)
  const { error: cfgErr } = await admin.from('system_configs').upsert(
    { id: 'default' },
    { onConflict: 'id' }
  );
  if (cfgErr) {
    console.warn('system_configs upsert notice:', cfgErr.message);
  }

  const { data: verify, error: verifyErr } = await admin
    .from('profiles')
    .select('id, auth_id, email, role, is_onboarded, is_verified')
    .eq('id', profileId)
    .maybeSingle();

  if (verifyErr || !verify || verify.role !== 'admin') {
    console.error('Verify failed:', verifyErr?.message || verify);
    process.exit(1);
  }

  console.log('\nAdmin ready:');
  console.log(JSON.stringify(verify, null, 2));
  console.log('\nLogin with:');
  console.log(`  email:    ${email}`);
  console.log(`  password: ${password}`);
  console.log('\nChange this password after first login.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
