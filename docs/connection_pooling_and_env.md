# Connection Pooling & Environment (Next.js + Vercel)

## Host model

- **One app:** Next.js App Router for localhost and Vercel.
- **Dev:** `npm run dev` → `next dev` (loads `.env.local`).
- **Prod:** Vercel Framework Preset **Next.js**, build `next build`, output directory empty.
- **API:** `app/api/[[...path]]/route.ts` dispatches into `server/` via `getApp()`. Same-origin `/api/*`.
- **Legacy only:** `npm run dev:legacy-express` runs `server.ts` as a process. Not the Vercel path.

## Supabase connection pooling

### PostgREST / `@supabase/supabase-js` (default)

- Route Handlers and `server/` use **`@supabase/supabase-js`** against the project **HTTPS API URL** (`https://<ref>.supabase.co`).
- That path hits **PostgREST**, which already pools. Do **not** put a Postgres `host:6543` string into `NEXT_PUBLIC_SUPABASE_URL` / `VITE_SUPABASE_URL`.
- Client factories: `lib/nextAuth.ts`, `server/supabaseAdmin.ts`. Browser client: `src/lib/supabase.ts` (reads inlined `NEXT_PUBLIC_SUPABASE_*`).
- Some admin diagnostics still `require` CJS under `api/_lib/` (kept as libraries, not public Vercel functions).

### Direct SQL drivers (PgBouncer / Supavisor)

- Prefer the **Transaction** pooler (port **`6543`**) for any direct `postgres` / `pg` / Prisma / Drizzle use from serverless.
- Set `DATABASE_URL` to the pooler URI from Supabase Dashboard → **Connect** → **Transaction pooler**.
- Helper: `lib/supabaseDb.ts` → `getPooledDatabaseUrl()` (also available from `api/_lib` helpers where still used).
- Never use direct session port **`5432`** from Vercel functions — it exhausts connections under concurrency.
- Transaction mode: disable prepared statements in the driver when using `:6543`.

Example:

```txt
DATABASE_URL=postgresql://postgres.<PROJECT_REF>:<PASSWORD>@aws-0-<REGION>.pooler.supabase.com:6543/postgres
```

## Cursor pagination (required under load)

| Path | Limit | Cursor |
| --- | --- | --- |
| Discovery / `GET /api/users` | 50 | `created_at` (DESC, `lt`) |
| `fetchProfilesPageFromSupabase` | 50 | `created_at` |
| Conversation history (`GET /api/messages`, …) | 30–50 (default 40) | `created_at` (DESC, `lt`) → `nextCursor` |
| Recent inbox hydrate | 50 max | newest-first page |
| Call logs (browser hydrate) | ~100 (user) / higher for admin staff | newest-first; prefer scoped to current user |

Never run unconstrained `select * from profiles` / `messages` / `call_logs` for discovery or default UI hydrate.

## Indexes (see `supabase_schema.sql`)

| Index | Purpose |
| --- | --- |
| `idx_messages_conversation (sender_id, receiver_id, created_at DESC)` | Pair conversation pages |
| `idx_messages_receiver_sender_created (receiver_id, sender_id, created_at DESC)` | Reverse pair |
| `idx_messages_receiver_created (receiver_id, created_at DESC)` | Inbox by receiver |
| `idx_messages_sender_created (sender_id, created_at DESC)` | Outbound / OR-inbox scans |
| `idx_messages_unread (receiver_id, is_read) WHERE NOT is_read` | Unread badge |
| `idx_profiles_created_at (created_at DESC)` | Discovery cursor pages |
| `idx_profiles_discovery_banned_created (...) WHERE not banned` | Non-banned discovery |

There is **no** `conversation_id` column on `messages` today — pair indexes are the supported model.

## Environment variables (local + Vercel)

Copy names into **`.env.local`** and into **Vercel → Settings → Environment Variables** (Production + Preview). After changing Vercel env, **redeploy**.

| Variable | Client? | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Preferred public Supabase HTTPS URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Preferred anon key (RLS) |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Yes* | Still accepted; `next.config.mjs` copies them into `NEXT_PUBLIC_*` at build/dev |
| `SUPABASE_SERVICE_ROLE_KEY` | **No** | Server admin client |
| `DATABASE_URL` | **No** | Optional Transaction pooler `:6543` for raw SQL |
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | **No** | Preferred Redis REST pair |
| `KV_REST_API_URL` + `KV_REST_API_TOKEN` | **No** | Alternate Redis REST pair (Vercel KV / Upstash) |
| `KV_REST_API_READ_ONLY_TOKEN` | — | **Not enough** for heartbeats (no writes) |
| `KV_URL` / `REDIS_URL` as `rediss://` | — | TCP only; REST client ignores them |
| `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | **No** (URL may be returned to client after auth) | Token minting |
| `R2_*` | **No** | Presigned uploads |
| `SMTP_*` / `RESEND_API_KEY` | **No** | OTP / email |
| `CRON_SECRET` or `FINANCE_JOB_SECRET` | **No** | Finance close job auth (required in production) |
| `FINANCE_JOB_ACTOR_USER_ID` | **No** | Profile id for cron settlement actor |
| `FINANCE_WEBHOOK_SECRET` | **No** | Payment webhooks when enabled |
| `SETUP_MASTER_KEY` / `SETUP_LOCKED` / `ALLOW_FACTORY_RESET` | **No** | Server setup lock |
| `NEXT_PUBLIC_API_BASE_URL` / `VITE_API_BASE_URL` | — | **Leave unset** on Vercel (same-origin `/api`) |

\*Browser must see URL/anon via inlined `NEXT_PUBLIC_*`. Prefer setting `NEXT_PUBLIC_*` on Vercel, or keep `VITE_*` and rely on `next.config.mjs` mapping.

## Presence durability rule

- Routine heartbeats update **Redis only** (`presence:{userId}`, TTL 60–90s).
- Write `profiles.online_status` / `profiles.last_seen_at` only on login, logout, or significant status transitions — never on every heartbeat tick.
- Without Redis REST credentials, presence must not fall back to Postgres under load (configure Redis before 10k tests).
