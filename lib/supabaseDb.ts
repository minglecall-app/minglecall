/**
 * Supabase access helpers for high-concurrency / serverless.
 *
 * - `@supabase/supabase-js` talks to PostgREST over HTTPS (server-side pooled).
 *   Use the project API URL (https://*.supabase.co), never a Postgres host there.
 * - Any direct SQL driver (`pg`, `postgres.js`, Drizzle, Prisma) MUST use the
 *   Transaction pooler on port 6543 (PgBouncer / Supavisor), not direct 5432.
 */

export const DISCOVERY_PAGE_SIZE = 50;
export const MESSAGES_PAGE_SIZE = 40;
export const MESSAGES_PAGE_SIZE_MAX = 50;

/** True when a Postgres URL targets the transaction pooler (6543). */
export function isTransactionPoolerUrl(url: string): boolean {
  const u = String(url || '').trim();
  if (!u) return false;
  if (/[?&]pgbouncer=true\b/i.test(u)) return true;
  if (/:6543(\/|\?|$)/.test(u)) return true;
  if (/\.pooler\.supabase\.com/i.test(u)) return true;
  return false;
}

/**
 * Normalize DATABASE_URL / SUPABASE_DB_URL for serverless.
 * Rewrites direct :5432 → :6543 when the host is a Supabase DB/pooler host.
 */
export function toTransactionPoolerUrl(rawUrl: string): string {
  const url = String(rawUrl || '').trim();
  if (!url) return '';
  if (isTransactionPoolerUrl(url)) return url;

  // Direct Supabase DB host — prefer transaction pooler port
  if (/:5432(\/|\?|$)/.test(url) && /supabase\.(co|com)/i.test(url)) {
    return url.replace(/:5432(?=\/|\?|$)/, ':6543');
  }
  return url;
}

/**
 * Server-only pooled Postgres URL for raw SQL drivers.
 * Returns null when unset (PostgREST/supabase-js path needs no DB URL).
 */
export function getPooledDatabaseUrl(): string | null {
  const raw = (
    process.env.DATABASE_URL ||
    process.env.SUPABASE_DB_URL ||
    process.env.POSTGRES_URL ||
    ''
  ).trim();
  if (!raw) return null;
  const pooled = toTransactionPoolerUrl(raw);
  if (!isTransactionPoolerUrl(pooled) && /:5432(\/|\?|$)/.test(pooled)) {
    console.warn(
      '[supabaseDb] DATABASE_URL looks like a direct Postgres session (5432). ' +
        'Use the Supabase Transaction pooler URL on port 6543 for Vercel/serverless.'
    );
  }
  return pooled;
}

export function clampPageSize(requested: unknown, fallback: number, max: number = MESSAGES_PAGE_SIZE_MAX): number {
  const n = Number(requested);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}
