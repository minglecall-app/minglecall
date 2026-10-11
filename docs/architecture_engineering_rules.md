# Dating App Engineering Rules & Architecture Blueprint

**Target Concurrency:** 10,000+ Concurrent Users

**Workload Type:** Mixed Chat, Presence, Sign-in/out, Video Calls (LiveKit), Coin Billing System, swipe, matching, coin share split, finance, payment methods, etc

**Primary Stack:** Vercel (Next.js) + Supabase (PostgreSQL) + Upstash Redis + LiveKit Cloud + Cloudflare R2

## 1. Architectural Principles & Core Mandates

1. **Never write transient state to PostgreSQL:** Heartbeats, online/offline presence updates, and temporary typing indicators must **never** hit the database directly. Use Redis.

2. **Never trust the client for billing:** Coin deductions for paid calls must be executed and validated server-side using atomic database transactions and strict idempotency.

3. **Keep database transactions short:** Never hold open a PostgreSQL connection or transaction while waiting for a video call or external network event.

4. **Use targeted Realtime delivery:** Avoid broadcasting global events to all users. Use private, authenticated channels and targeted payloads.

5. **Stateless API Handlers:** Vercel functions are stateless. Never use in-memory `Map` or global variables to track active sessions, socket pools, or cluster-wide presence.

## 2. Tech Stack Specification & Responsibilities

| Component | Technology | Primary Responsibility | 
| ----- | ----- | ----- | 
| **Frontend / API** | Next.js on Vercel | SSR, Static assets, stateless API routes, auth validation, call orchestration | 
| **Database & Auth** | Supabase PostgreSQL | Authoritative data source, relational data, chat history, user records, wallet ledger | 
| **Realtime Engine** | Supabase Realtime | Delivering targeted chat messages and light live event notifications | 
| **Cache & Presence** | Upstash Redis | Ephemeral online presence, session leases, token rate-limiting, hot public profiles cache | 
| **Media Transport** | LiveKit Cloud | WebRTC video/audio transport, room management, media streams | 
| **Media Storage** | Cloudflare R2 + CDN | User avatar images, media verification photos, heavy file storage | 
| **Async Tasks** | Upstash QStash / Workers | Push notifications, email digests, analytical logs, backup routines | 

## 3. Vercel Configuration & API Rules

### 3.1 Next.js Configuration (`next.config.js`)

* Ensure proper external asset domain whitelisting (Cloudflare R2 CDN, Supabase storage).

* Configure environment variables securely on Vercel dashboards (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `UPSTASH_REDIS_REST_URL` / `KV_REST_API_URL`, `UPSTASH_REDIS_REST_TOKEN` / `KV_REST_API_TOKEN`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`).

### 3.2 Vercel Function Best Practices

* **Timeout & Sizing:** Keep API endpoints lean. Complex jobs must be offloaded to background workers.

* **Connection Pooling:** Always connect to Supabase via its connection pooler URL (e.g., PgBouncer port `6543`) to prevent exhausting Postgres connection limits during traffic spikes.

* **No Long-lived WebSockets:** Do not attempt to run custom persistent TCP/WebSocket servers inside standard Vercel serverless functions. Use Supabase Realtime and LiveKit Cloud for real-time channels.

## 4. Upstash Redis Implementation & Operations

### 4.1 Key Naming Conventions & TTL Rules

| Data Type | Redis Key Pattern | TTL / Expiration | Purpose | 
| ----- | ----- | ----- | ----- | 
| **User Presence Lease** | `presence:{userId}` | 60–90 seconds | Tracks if user is active; refreshed via heartbeats | 
| **Cached Profile** | `profile:{userId}` | 30–120 seconds | Public profile attributes (name, age, bio, avatar URL) | 
| **Rate Limit** | `rate:{userId}:{endpoint}` | Short window (e.g., 10–60s) | Prevents spamming endpoints or abuse | 
| **Call Room State** | `call:{callId}` | Dynamic (Call duration max) | Tracks active call tokens and participants | 

### 4.2 Presence Heartbeat Protocol

* Clients emit a jittered heartbeat signal every **30 seconds** (randomized offset to prevent synchronized write bursts).

* The API updates the Redis key `presence:{userId}` with a 60–90 second expiration using atomic Redis commands.

* If a client disconnects unexpectedly, the key naturally expires without writing trash data to PostgreSQL.

* Durable last-seen values are written to PostgreSQL **only** upon explicit login/logout or significant state transitions, never on heartbeat ticks.

## 5. Supabase Database Design & Rules

### 5.1 Core Schema Blueprint

* **`profiles`**: `id` (UUID, PK, references auth.users), `username`, `bio`, `avatar_url`, `created_at`, `updated_at`.

* **`conversations`**: `id` (UUID, PK), `created_at`, `updated_at`.

* **`conversation_members`**: `conversation_id` (FK), `user_id` (FK), `joined_at`.

* **`messages`**: `id` (UUID, PK), `conversation_id` (FK), `sender_id` (FK), `content` (TEXT), `created_at` (TIMESTAMPTZ). **Index required on `(conversation_id, created_at)`**.

* **`calls`**: `id` (UUID, PK), `caller_id` (FK), `callee_id` (FK), `status` (initiated, active, ended, missed), `started_at`, `ended_at`, `rate_per_min`.

* **`wallets`**: `user_id` (UUID, PK, FK), `balance` (BIGINT / NUMERIC), `updated_at`.

* **`wallet_transactions`**: `id` (UUID, PK), `user_id` (FK), `amount` (NUMERIC), `type` (credit, debit_call, reward), `reference_id`, `created_at`.

### 5.2 Database Performance Rules

1. **Indexing:** Every foreign key and frequently filtered column (e.g., `messages.conversation_id`, `conversations.updated_at`) must have explicit b-tree indexes.

2. **Pagination:** Message fetch queries must use cursor-based pagination (e.g., `WHERE conversation_id = X AND created_at < cursor LIMIT 30`). Never fetch an entire conversation history unconstrained.

3. **Transaction Safety for Wallets:** Coin deductions must use SQL transactions with row-level locks (`SELECT ... FOR UPDATE`) or explicit atomic checks to avoid race conditions and double-spending.

## 6. End-to-End Delivery & Data Flow Mechanisms

### 6.1 Authentication & Sign-in / Sign-out Flow

1. **Client** authenticates via Supabase Auth.

2. **Backend/API** verifies session, generates JWT/cookies, and sets a Redis presence session (`presence:{userId}`).

3. **Client** mounts and opens subscribed channels.

4. **Sign-out:** Client hits sign-out endpoint, clearing the Redis presence key immediately and updating `last_seen` in PostgreSQL.

### 6.2 Chat Message Delivery Flow

1. **Sender Client** sends a POST request to `/api/messages` with `conversation_id` and `content`.

2. **Next.js API Route** authenticates the user, checks conversation membership, and inserts the record into Supabase PostgreSQL (`messages` table).

3. **Supabase Realtime (Broadcast / Postgres Changes)** dispatches the new message event to the targeted `conversation_id` channel.

4. **Recipient Client** receives the real-time payload via WebSocket, appends the message to local state. If offline, messages are fetched upon reconnect via cursor pagination.

### 6.3 Video Calling & Coin Billing Flow

1. **Caller** initiates a call via API. Backend verifies both users' wallet balances (minimum threshold check).

2. **Backend** generates a secure **LiveKit Access Token** and returns room credentials.

3. **LiveKit Cloud** handles peer-to-peer/SFU WebRTC media transport entirely outside the application database.

4. **Billing Service (Server-side):** Periodically validates call duration, calculates coin burn rates (e.g., 120 coins/min for friends, 180 coins/min for non-friends), and executes atomic debit transactions against the Supabase `wallets` ledger table.

### 6.4 What is Served from Cache vs. Database?

* **Served from Redis Cache:** Public user profiles (`profile:{userId}` with 30s-2min TTL), presence status maps, rate limit tokens.

* **Served Directly from Database (Supabase):** Secure auth profiles, wallet balances (authoritative), complete chat message history, transaction ledgers, call histories.

## 7. Load Testing Targets & Acceptance Criteria (10k Concurrency)

Before deploying to production, validate the system using tools like `k6` against these performance metrics:

* **Steady State Load:** 10,000 active concurrent users maintaining presence without database CPU saturation.

* **API Bursts:** Handle 500–1,000 requests per second (RPS) on authentication and profile reads with p95 latency $\le 300\text{ ms}$.

* **Chat Delivery Latency:** End-to-end message delivery under normal conditions at p95 $\le 500\text{ ms}$.

* **Reconnect Storms:** Simulate 5,000 clients dropping and reconnecting over a 30-second window to verify Redis expiry handling and clean state recovery without cascading API failures.

* **Billing Concurrency:** Execute 1,000 simultaneous coin-deduction transactions with zero duplicate charges or ledger corruption.