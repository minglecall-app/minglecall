/**
 * Auth helpers for Next.js App Router (Web Request).
 * supabase-js uses PostgREST (HTTPS) — already pooled server-side.
 * Raw SQL drivers must use getPooledDatabaseUrl() (port 6543).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import { getPooledDatabaseUrl } from './supabaseDb';

export function getSupabaseEnv() {
  const clean = (v: string) => v.trim().replace(/^["']|["']$/g, '');
  const url = clean(
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.VITE_SUPABASE_URL ||
      process.env.SUPABASE_URL ||
      ''
  );
  const anonKey = clean(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      ''
  );
  const serviceKey = clean(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
  return { url, anonKey, serviceKey };
}

export function createServiceClient(): SupabaseClient | null {
  const { url, serviceKey } = getSupabaseEnv();
  if (!url || !serviceKey) return null;
  // Touch pooler env early so misconfigured DATABASE_URL is logged once per cold start
  void getPooledDatabaseUrl();
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'public' },
    global: { headers: { 'X-Client-Info': 'minglecall-next-service' } },
  });
}

export function extractBearer(req: NextRequest): string | null {
  const header = req.headers.get('authorization') || req.headers.get('Authorization');
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

export async function requireAuth(req: NextRequest): Promise<
  | { ok: true; userId: string; profileId: string; role: string; email?: string }
  | { ok: false; status: number; error: { message: string; code: string } }
> {
  const token = extractBearer(req);
  if (!token) {
    return { ok: false, status: 401, error: { message: 'Missing bearer token', code: 'UNAUTHORIZED' } };
  }
  const { url, anonKey, serviceKey } = getSupabaseEnv();
  if (!url || !anonKey) {
    return { ok: false, status: 503, error: { message: 'Supabase not configured', code: 'NO_SUPABASE' } };
  }
  const anon = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error } = await anon.auth.getUser(token);
  if (error || !userData?.user) {
    return { ok: false, status: 401, error: { message: 'Invalid session', code: 'UNAUTHORIZED' } };
  }
  const userId = userData.user.id;
  const email = userData.user.email || undefined;
  const service = serviceKey ? createServiceClient() : null;
  let profileId = userId;
  let role = 'male_user';
  if (service) {
    const { data: profile } = await service
      .from('profiles')
      .select('id, role, auth_id, email')
      .or(`id.eq.${userId},auth_id.eq.${userId}`)
      .maybeSingle();
    if (profile?.id) {
      profileId = String(profile.id);
      role = String(profile.role || role);
    }
  }
  return { ok: true, userId, profileId, role, email };
}
