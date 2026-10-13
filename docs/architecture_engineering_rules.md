# Dating App Engineering Rules & Architecture Blueprint

**Target Concurrency:** 10,000+ Concurrent Users

**Workload Type:** Mixed Chat, Presence, Sign-in/out, Video Calls (LiveKit), Coin Billing System, swipe, matching, coin share split, finance, payment methods, etc

**Primary Stack:** Next.js (App Router) on Vercel + Supabase (PostgreSQL + Auth + Realtime) + Upstash Redis + LiveKit Cloud + Cloudflare R2

**Runtime (local + Vercel):** One Next.js app. `npm run dev` → `next dev`. `npm run build` / Vercel → `next build`. Do not use a separate Vite SPA or root `api/*.js` deploy.

## 1. Architectural Principles & Core Mandates

1. **Never write transient state to PostgreSQL:** Heartbeats, online/offline presence updates, and temporary typing indicators must **never** hit the database on every tick. Use Redis (`presence:{userId}` TTL).

2. **Never trust the client for billing:** Coin deductions for paid calls must be executed and validated server-side using atomic database transactions and strict idempotency.

3. **Keep database transactions short:** Never hold open a PostgreSQL connection or transaction while waiting for a video call or external network event.

4. **Use targeted Realtime delivery:** Avoid broadcasting global events to all users. Use private, authenticated channels and targeted payloads (Supabase Realtime Broadcast / postgres_changes).

5. **Stateless API on Vercel:** Handlers must not rely on in-memory `Map`s or process-global pools for presence, active calls, or sockets across invocations. Persist durable state in Supabase; ephemeral presence in Redis; media in LiveKit.

6. **Canonical schema:** All DB structure lives in `/supabase_schema.sql`. Do not invent parallel migration trees unless explicitly requested.

## 2. Tech Stack Specification & Responsibilities

| Component | Technology | Primary Responsibility |
| ----- | ----- | ----- |
| **Host** | Next.js 15 App Router on Vercel | Pages, static assets, Node Route Handlers, cron entrypoints |
| **UI** | React in `src/` via `app/client-app.tsx` (`ssr: false` shell) | Client SPA shell; deep links re-export the same shell |
| **API** | `app/api/[[...path]]/route.ts` → `getApp()` / `server/` | Auth, business mutations, LiveKit tokens, R2 presigns, finance jobs |
| **Database & Auth** | Supabase PostgreSQL + Auth | Authoritative data, RLS, chat history, profiles, wallets / call_logs |
| **Realtime** | Supabase Realtime | Targeted chat, call signals, light live events (not Express `/ws` on Vercel) |
| **Cache & Presence** | Upstash Redis (REST) | `presence:{userId}` leases, rate limits, hot ephemeral keys |
| **Media Transport** | LiveKit Cloud | WebRTC A/V; tokens minted **server-side only** |
| **Media Storage** | Cloudflare R2 (presigned PUT) | Avatars, gallery, verification; metadata in Supabase |
| **Cron** | `vercel.json` crons | e.g. `/api/v1/finance/jobs/close-due-periods` (Hobby: daily) |

**Legacy only:** `npm run dev:legacy-express` runs `server.ts` as a direct process for local dual-run. Do not add new Express WebSocket features. Production is Next on Vercel.

## 3. Vercel & Next.js Configuration

### 3.1 Project settings

| Setting | Value |
| ----- | ----- |
| Framework Preset | **Next.js** |
| Build Command | `next build` (or empty / default) |
| Output Directory | **empty** (not `dist`) |
| Install Command | `npm install` |
| Root | `.` |

`vercel.json` is cron-only (no Vite `buildCommand` / SPA rewrite).

### 3.2 Next config (`next.config.mjs`)

* Whitelist remote image hosts (Supabase, R2 / Cloudflare).
* Map public Supabase env for the browser:

  * `NEXT_PUBLIC_SUPABASE_URL` ← or fallback `VITE_SUPABASE_URL`
  * `NEXT_PUBLIC_SUPABASE_ANON_KEY` ← or fallback `VITE_SUPABASE_ANON_KEY`

* Client code must read **`process.env.NEXT_PUBLIC_*` as a direct property** (Next inlines only that form). Dynamic `process.env[key]` will be empty in the browser.
* Keep secrets off `NEXT_PUBLIC_*` / `VITE_*`.

### 3.3 Environment locations

| Where | Purpose |
| ----- | ----- |
| `.env.local` | Local `next dev` / `next start` (gitignored) |
| Vercel → Project → Environment Variables | Production + Preview (import same names; Vercel does **not** read `.env.local`) |
| `.env.example` | Name checklist only — empty placeholders |

Required names: see `docs/connection_pooling_and_env.md` and `.env.example`.

### 3.4 Function best practices

* Keep Route Handlers lean; finance close job uses `CRON_SECRET` / `FINANCE_JOB_SECRET` + `FINANCE_JOB_ACTOR_USER_ID`.
* Use Supabase HTTPS + service role for most data access; use `DATABASE_URL` pooler `:6543` only for raw SQL drivers.
* **No long-lived custom WebSockets on Vercel.** Signaling = Supabase Realtime; A/V = LiveKit. Leave `NEXT_PUBLIC_API_BASE_URL` / `VITE_API_BASE_URL` unset so the browser calls same-origin `/api/*`.

## 4. Upstash Redis Implementation & Operations

### 4.1 Key naming & TTL

| Data Type | Redis Key Pattern | TTL / Expiration | Purpose |
| ----- | ----- | ----- | ----- |
| **User Presence Lease** | `presence:{userId}` | 60–90 seconds | Active lease; refreshed via heartbeats |
| **Cached Profile** | `profile:{userId}` | 30–120 seconds | Optional hot public attributes |
| **Rate Limit** | `rate:{userId}:{endpoint}` | Short window (e.g. 10–60s) | Abuse protection |
| **Call Room State** | `call:{callId}` | Dynamic (call max) | Ephemeral call coordination when used |

Use **HTTPS REST** credentials: `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`, or `KV_REST_API_URL` + `KV_REST_API_TOKEN`. A `rediss://` `KV_URL` / `REDIS_URL` alone is **not** enough for the REST client.

### 4.2 Presence heartbeat protocol

* Clients heartbeat on a ~30s jittered interval to `POST /api/presence/heartbeat`.
* API updates Redis `presence:{userId}` with 60–90s TTL.
* Unexpected disconnect → key expires; do not write Postgres on every tick.
* Durable `last_seen` / status transitions → PostgreSQL only on login, logout, or significant changes.

## 5. Supabase Database Design & Rules

### 5.1 Source of truth

* Full schema: **`/supabase_schema.sql`**.
* App tables in use include (non-exhaustive): `profiles`, `messages`, `call_logs`, `system_configs`, wallets / ledger RPCs, finance settlement tables, CMS tables, etc.
* Messaging today is a **pair model** (sender/receiver), not a mandatory `conversation_id` column. Do not add conversation indexes until that model exists in schema + code.

### 5.2 Database performance rules

1. **Indexing:** Every FK and hot filter column must have indexes (see schema + `docs/connection_pooling_and_env.md`).
2. **Pagination:** Discovery and messages use cursor pages (limit 30–50). Never unconstrained `select *` for directories or history.
3. **Wallet safety:** Coin burns / gifts use atomic SQL / RPCs with locks or equivalent; never trust client amounts.
4. **RLS:** Enabled on user-accessible tables; service role only on the server.

## 6. End-to-End Delivery & Data Flow

### 6.1 Authentication

1. Browser uses **Supabase Auth** (session in client; bearer token to APIs).
2. API verifies JWT; never trust client-submitted `user_id` / role for authorization.
3. Presence lease set/refreshed via heartbeat API → Redis.
4. Sign-out clears session and presence; durable last-seen update is a transition write, not a heartbeat.

### 6.2 Chat

1. Client `POST /api/messages` (or `/api/v1/...` equivalent under the catch-all).
2. Route Handler authenticates, validates membership / blocks / limits, inserts into Supabase.
3. Supabase Realtime delivers to the recipient; history loads via cursor pagination from Postgres.

### 6.3 Video calling & billing

1. Call orchestration via authenticated API; membership recorded in `call_logs` (and Redis where used).
2. LiveKit access token minted **only** on the server; secret never in the browser.
3. Media stays on LiveKit/WebRTC.
4. Coin burn / settlement runs server-side with idempotent ledger updates.

### 6.4 Cache vs database

* **Redis:** Presence, rate limits, short-lived coordination keys.
* **Supabase:** Profiles, wallets, messages, call history, admin/finance configs — authoritative.

## 7. Local vs Vercel (same app)

| | Localhost | Vercel |
| ----- | ----- | ----- |
| Command | `npm run dev` | Git push → `next build` |
| Env file | `.env.local` | Project Environment Variables |
| API | Same-origin `/api/*` via Next Route Handler | Same |
| Presence | Upstash / KV REST | Same |
| Signaling | Supabase Realtime (default) | Same |
| Cron | Manual / curl with job secret | `vercel.json` schedule |

## 8. Load Testing Targets & Acceptance Criteria (10k Concurrency)

Before production load claims, validate with `k6` (see `k6/` and `npm run test:load`):

* **Steady state:** 10,000 concurrent users maintaining presence **without** Postgres heartbeat saturation (Redis required).
* **API bursts:** 500–1,000 RPS on auth/profile-style reads with p95 ≤ 300 ms.
* **Chat delivery:** p95 ≤ 500 ms under normal conditions.
* **Reconnect storms:** ~5,000 clients reconnect in ~30s; Redis TTL recovers cleanly.
* **Billing concurrency:** Parallel coin deductions with zero double-charges.

Always run load tests against a **staging** project with Redis configured — never against production with heartbeat falling through to Postgres.


## 9. Monetization, Coin Burn & Real-Time Billing Architecture

1. **Atomic Coin Deductions:** All coin burns (gifts, video call per-minute billing, quick match fees) must use Supabase Postgres RPC functions with row-level locking (`SELECT ... FOR UPDATE` on `wallets`) to prevent negative balances and race conditions.
2. **Video Call Billing Ticks:** 
   * During an active 1-on-1 video call, the client or server initiates a periodic sync (e.g., every 30–60 seconds).
   * Ephemeral consumption counters are tracked in Redis (`call:ledger:{callId}`) to minimize Postgres write pressure.
   * Upon call termination, the total delta is flushed atomically to the `call_logs` table and the financial ledger.
3. **Multi-Tier Revenue Share Split (Host + TL + Platform):**
   * Revenue splits must be computed server-side via database triggers or idempotent financial ledger entries upon transaction settlement.
   * Split configurations (percentages for Platform, Team Leader / Agency, and Host) must be fetched from cached `system_configs` or immutable historical snapshots per transaction, avoiding real-time lookups of mutable profile settings.

## 10. Team Leader (TL) & Agency Management Rules

1. **Hierarchical Relationships:** A dedicated `agency_memberships` or `tl_hosts` table must map hosts to their respective Team Leaders with audit trails for start/end dates.
2. **Dashboard Isolation:** TL dashboard queries must be strictly scoped via Supabase Row Level Security (RLS) policies or server-side role checks (`auth.jwt() ->> 'role'`) ensuring TLs only access analytics and salary data for their assigned downline hosts.

## 11. Swipe, Discovery & Matching Engine

1. **Cursor Pagination:** Discovery feeds and swipe card queues must use keyset/cursor pagination (e.g., `WHERE id > last_seen_id LIMIT 20`) combined with exclusion filters (`swiped_users` table) to avoid expensive `OFFSET` scans.
2. **Quick Match Queue:** Quick match candidate matching should prioritize active Redis presence keys (`presence:{userId}`) to ensure users matched for instant calls are actively online, preventing dead connection attempts.

## 12. Finance & Salary Batches

1. **Period Closing & Idempotency:** Salary batch calculations (`/api/v1/finance/batches`) must use idempotency keys and transactional locks. Once a batch status is marked `processing` or `paid`, it cannot be recalculated.
2. **Cron Automation:** Financial period closings run via Vercel Cron (`vercel.json`) with mandatory secret header verification (`Authorization: Bearer $FINANCE_JOB_SECRET`).

## 13. K6 Load Testing Requirements for Dating Features

Load testing scripts in `k6/` must simulate realistic user behavior distributions:
* **Presence & Heartbeat Storms:** 5,000 concurrent users hitting `/api/presence/heartbeat` at jittered 30s intervals.
* **Swipe & Match Throughput:** Concurrent swipe requests maintaining sub-200ms p95 latency.
* **Video Call Signaling & Token Minting:** Concurrent requests to `/api/livekit/token` verifying rate limits and token generation under load.
