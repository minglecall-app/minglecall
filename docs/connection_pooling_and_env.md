# Connection Pooling & Environment (High-Concurrency)

## Supabase connection pooling

### PostgREST / `@supabase/supabase-js` (default for this app)

- Next.js Route Handlers, Express, and Vercel CJS handlers use **`@supabase/supabase-js`** against the project **HTTPS API URL** (`https://<ref>.supabase.co`).
- That path hits **PostgREST**, which already uses a server-side pool. Do **not** put a Postgres `host:6543` string into `VITE_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL`.
- Client factories: `lib/nextAuth.ts` (`createServiceClient`), `api/_lib/cjs/helpers.js`, `server/supabaseAdmin.ts`.

### Direct SQL drivers (PgBouncer / Supavisor)

- Prefer the **Transaction** pooler (port **`6543`**) for any direct `postgres` / `pg` / `postgres.js` / Prisma / Drizzle connections from serverless or workers.
- Set `DATABASE_URL` (or `SUPABASE_DB_URL` / `POSTGRES_URL`) to the pooler URI from Supabase Dashboard → **Connect** → **Transaction pooler**.
- Helper: `lib/supabaseDb.ts` → `getPooledDatabaseUrl()` (also exported from `api/_lib/cjs/helpers.js` as `getPooledDatabaseUrl`).
- Never use the direct session port **`5432`** from Vercel functions — it exhausts Postgres connection limits under concurrency.
- Transaction mode does not support prepared statements; disable them in the driver when using `:6543`.

Example:

```txt
DATABASE_URL=postgresql://postgres.<PROJECT_REF>:<PASSWORD>@aws-0-<REGION>.pooler.supabase.com:6543/postgres
```

## Cursor pagination (required under load)

| Path | Limit | Cursor |
| --- | --- | --- |
| Discovery / `GET /api/users` | 50 | `created_at` (DESC, `lt`) |
| `fetchProfilesPageFromSupabase` | 50 | `created_at` |
| Conversation history (`GET /api/messages`, `/api/messages/conversation/:id`) | 30–50 (default 40) | `created_at` (DESC, `lt`) → `nextCursor` |
| Recent inbox hydrate | 50 max | newest-first page |

Never run unconstrained `select * from profiles` / `messages` for discovery or chat history.

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

There is **no** `conversation_id` column on `messages` today — pair indexes are the supported model. Do not add a `conversation_id` index until a conversations table exists.

## Vercel / Next.js environment variables

| Variable | Client? | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` or `VITE_SUPABASE_URL` | Yes | Supabase project HTTPS URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `VITE_SUPABASE_ANON_KEY` | Yes | Anon key (RLS-protected) |
| `SUPABASE_SERVICE_ROLE_KEY` | **No** | Server-only admin client |
| `DATABASE_URL` / `SUPABASE_DB_URL` | **No** | Optional; Transaction pooler `:6543` for raw SQL only |
| `UPSTASH_REDIS_REST_URL` or `KV_REST_API_URL` | **No** | Redis **HTTPS REST** endpoint (required). `KV_URL` / `REDIS_URL` as `rediss://` are TCP-only and are **not** enough for presence |
| `UPSTASH_REDIS_REST_TOKEN` or `KV_REST_API_TOKEN` | **No** | Redis **read-write** REST token. `KV_REST_API_READ_ONLY_TOKEN` alone cannot write heartbeats |
| Local / Preview | — | Vercel Storage vars must be enabled for that environment; for local: `vercel env pull .env.local` then restart |
| `LIVEKIT_URL` | **No** (config may expose URL) | LiveKit WebSocket URL |
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | **No** | Token minting |
| `R2_*` / SMTP / payment secrets | **No** | Server-only |

During the Vite → Next migration, both `VITE_*` and `NEXT_PUBLIC_*` names are accepted for Supabase public config.

## Presence durability rule

- Routine heartbeats update **Redis only** (`presence:{userId}`, TTL 60–90s).
- Write `profiles.online_status` / `profiles.last_seen_at` only on login, logout, or significant status transitions — never on every heartbeat tick.
