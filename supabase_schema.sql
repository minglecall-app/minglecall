-- ============================================================================
-- LIVECALL DATING & MONETIZATION ECOSYSTEM - SUPABASE POSTGRESQL SCHEMA
-- Version: 3.2 (Production Master Schema - 100% Idempotent)
-- CANONICAL SOURCE OF TRUTH ? do not maintain parallel schema copies.
-- Served by GET /api/admin/schema via server/schemaLoader.ts
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. PROFILES TABLE (Core user accounts, creators, hosts, callers & admins)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id TEXT PRIMARY KEY,
    auth_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    gender TEXT NOT NULL DEFAULT 'male' CHECK (gender IN ('male', 'female', 'other')),
    gender_locked BOOLEAN NOT NULL DEFAULT true,
    age INT DEFAULT 21 CHECK (age >= 18),
    dob DATE DEFAULT '2000-01-01',
    nationality TEXT DEFAULT 'United States',
    country_code VARCHAR(8) DEFAULT 'US',
    bio TEXT DEFAULT '',
    extended_bio TEXT,
    location_city TEXT,
    zodiac TEXT,
    interests TEXT[] DEFAULT '{}',
    interested_in TEXT[] DEFAULT '{}',
    tags TEXT[] DEFAULT '{}',
    spoken_languages TEXT[] DEFAULT '{"English"}',
    avatar_url TEXT DEFAULT 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=400',
    gallery TEXT[] DEFAULT '{}',
    -- Profile gallery videos: [{url, storageKey, sizeBytes, contentType, createdAt}]
    gallery_videos JSONB NOT NULL DEFAULT '[]'::jsonb,
    intro_video_url TEXT,
    verification_video_url TEXT,
    is_verified BOOLEAN NOT NULL DEFAULT false,
    is_onboarded BOOLEAN NOT NULL DEFAULT true,
    agreed_to_terms BOOLEAN NOT NULL DEFAULT true,
    agreed_to_adult_terms BOOLEAN NOT NULL DEFAULT false,
    agreed_to_host_terms BOOLEAN NOT NULL DEFAULT false,
    kyc_status TEXT NOT NULL DEFAULT 'unsubmitted' CHECK (kyc_status IN ('unsubmitted', 'pending', 'verified', 'rejected')),
    kyc_documents JSONB,
    online_status TEXT NOT NULL DEFAULT 'online' CHECK (online_status IN ('online', 'busy', 'offline', 'in_call')),
    role TEXT NOT NULL DEFAULT 'male_user' CHECK (role IN ('male_user', 'female_user', 'female_creator', 'female_host', 'other_user', 'admin', 'team_leader', 'agency_manager')),
    coin_balance BIGINT NOT NULL DEFAULT 50,
    hourly_coin_rate INT NOT NULL DEFAULT 10,
    earnings_coins BIGINT NOT NULL DEFAULT 0,
    total_lifetime_earned_usd NUMERIC NOT NULL DEFAULT 0,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    allow_mock_location BOOLEAN DEFAULT false,
    is_using_mock_location BOOLEAN DEFAULT false,
    mock_location_city TEXT,
    mock_location_country TEXT,
    total_calls_hosted INT DEFAULT 0,
    total_call_minutes INT DEFAULT 0,
    total_gifts_received_count INT DEFAULT 0,
    rating_score NUMERIC DEFAULT 5.0,
    total_reviews_count INT DEFAULT 0,
    acceptance_rate_percent NUMERIC DEFAULT 100,
    is_banned BOOLEAN NOT NULL DEFAULT false,
    ban_reason TEXT,
    banned_until TIMESTAMPTZ,
    banned_by_id TEXT,
    banned_by_role TEXT,
    team_leader_id TEXT,
    created_by_id TEXT,
    agency_name TEXT,
    coin_earn_override_rate INT DEFAULT NULL, -- NULL = use system female host share %; set only by Admin override
    commission_percent NUMERIC DEFAULT 15,
    team_leader_note TEXT,
    password_hash TEXT,
    has_password_set BOOLEAN DEFAULT false,
    last_seen_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure all updated columns exist if table was previously created
ALTER TABLE public.profiles DROP COLUMN IF EXISTS vip_tier;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS auth_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS interested_in TEXT[] DEFAULT '{}';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS gallery_videos JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS intro_video_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_onboarded BOOLEAN DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS agreed_to_terms BOOLEAN DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS agreed_to_adult_terms BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS agreed_to_host_terms BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS kyc_status TEXT DEFAULT 'unsubmitted';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS kyc_documents JSONB;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ban_reason TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS banned_until TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS banned_by_id TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS banned_by_role TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS team_leader_id TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_by_id TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS agency_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS coin_earn_override_rate INT DEFAULT NULL;
ALTER TABLE public.profiles ALTER COLUMN coin_earn_override_rate DROP DEFAULT;
ALTER TABLE public.profiles ALTER COLUMN coin_earn_override_rate SET DEFAULT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS commission_percent NUMERIC DEFAULT 15;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS team_leader_note TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS has_password_set BOOLEAN DEFAULT false;
-- Single-device login: only the device holding this id may stay authenticated
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS active_session_id TEXT;
-- Clients must not self-assign session ids; only service-role (backend claim) may write
REVOKE UPDATE (active_session_id) ON public.profiles FROM anon, authenticated;

-- Realtime kick for exclusive login (idempotent)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

-- Allow female_user alongside female_creator (idempotent for existing DBs)
DO $$
BEGIN
    ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
    ALTER TABLE public.profiles
        ADD CONSTRAINT profiles_role_check
        CHECK (role IN ('male_user', 'female_user', 'female_creator', 'female_host', 'other_user', 'admin', 'team_leader', 'agency_manager'));
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_role_status ON public.profiles(role, online_status);
-- Discovery directory cursor pages: ORDER BY created_at DESC LIMIT 50
CREATE INDEX IF NOT EXISTS idx_profiles_created_at ON public.profiles(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_discovery_banned_created
  ON public.profiles(created_at DESC)
  WHERE is_banned IS DISTINCT FROM true;
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
-- Soft uniqueness for registrations (case-insensitive). Skips quietly if duplicates already exist.
DO $$
BEGIN
    CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_email_unique_lower
        ON public.profiles (lower(email))
        WHERE email IS NOT NULL AND btrim(email) <> '';
EXCEPTION
    WHEN unique_violation THEN
        RAISE NOTICE 'idx_profiles_email_unique_lower skipped: duplicate emails already present ? clean them before enabling uniqueness';
    WHEN OTHERS THEN
        RAISE NOTICE 'idx_profiles_email_unique_lower skipped: %', SQLERRM;
END $$;
CREATE INDEX IF NOT EXISTS idx_profiles_geo ON public.profiles(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_profiles_team_leader ON public.profiles(team_leader_id);
CREATE INDEX IF NOT EXISTS idx_profiles_agency ON public.profiles(agency_name);

-- ============================================================================
-- 2. MATCHES TABLE (Real-time Video & Discovery pairings)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_a_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    user_b_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('pending', 'matched', 'rejected', 'unmatched')) DEFAULT 'pending',
    initiated_by TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    matched_at TIMESTAMPTZ,
    last_interaction_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_match_pair UNIQUE (user_a_id, user_b_id)
);

CREATE INDEX IF NOT EXISTS idx_matches_users ON public.matches(user_a_id, user_b_id);

-- ============================================================================
-- 3. MESSAGES TABLE (Real-time chats, auto-translations, media & virtual gifts)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID REFERENCES public.matches(id) ON DELETE SET NULL,
    sender_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    receiver_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    text TEXT,
    original_language TEXT DEFAULT 'en',
    translated_text TEXT,
    target_language TEXT,
    media_url TEXT,
    media_type TEXT,
    media_storage_key TEXT,
    type TEXT NOT NULL CHECK (type IN ('text', 'image', 'video', 'voice', 'gift', 'friend_request', 'call_rating', 'system')) DEFAULT 'text',
    gift_info JSONB,
    friend_request_info JSONB,
    rating_info JSONB,
    is_read BOOLEAN NOT NULL DEFAULT false,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pair + time: primary conversation history lookup (cursor: created_at < X LIMIT 40)
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.messages(sender_id, receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_unread ON public.messages(receiver_id, is_read) WHERE is_read = false;
-- Reverse pair direction + inbox / recent-for-user scans
CREATE INDEX IF NOT EXISTS idx_messages_sender_created ON public.messages(sender_id, created_at DESC);

-- Evolve messages type CHECK + rating_info for durable call-rating request cards
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'type'
  ) THEN
    ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_type_check;
    ALTER TABLE public.messages
      ADD CONSTRAINT messages_type_check
      CHECK (type IN ('text', 'image', 'video', 'voice', 'gift', 'friend_request', 'call_rating', 'system'));
  END IF;
END $$;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS rating_info JSONB;

-- Soft-hide clear chat: per-user conversation watermark (does NOT delete peer copy)
CREATE TABLE IF NOT EXISTS public.message_conversation_clears (
    user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    other_user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    cleared_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, other_user_id)
);
CREATE INDEX IF NOT EXISTS idx_message_conversation_clears_user ON public.message_conversation_clears(user_id);

-- ============================================================================
-- 4. CALL LOGS TABLE (1-on-1 WebRTC & LiveKit billed sessions)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.call_logs (
    id TEXT PRIMARY KEY,
    caller_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    host_id TEXT REFERENCES public.profiles(id) ON DELETE CASCADE,
    receiver_id TEXT REFERENCES public.profiles(id) ON DELETE CASCADE,
    caller_name TEXT,
    host_name TEXT,
    duration_seconds INT NOT NULL DEFAULT 0,
    coins_spent INT NOT NULL DEFAULT 0,
    coins_earned INT NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ DEFAULT now(),
    start_time TIMESTAMPTZ DEFAULT now(),
    ended_at TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    end_reason TEXT DEFAULT 'completed',
    status TEXT DEFAULT 'completed',
    was_friend_call BOOLEAN DEFAULT false,
    burn_rate_per_min INT DEFAULT 120,
    earning_rate_per_min INT DEFAULT 48,
    team_leader_id TEXT,
    team_leader_earned_coins INT DEFAULT 0,
    team_leader_commission_percent NUMERIC DEFAULT 10,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Ensure all updated columns exist if table was previously created
ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS caller_id TEXT;
ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS host_id TEXT REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS receiver_id TEXT REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS caller_name TEXT;
ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS host_name TEXT;
ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS duration_seconds INT DEFAULT 0;
ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS coins_spent INT DEFAULT 0;
ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS coins_earned INT DEFAULT 0;
ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS start_time TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;
ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS end_time TIMESTAMPTZ;
ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS end_reason TEXT DEFAULT 'completed';
ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'completed';
ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS was_friend_call BOOLEAN DEFAULT false;
ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS burn_rate_per_min INT DEFAULT 120;
ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS earning_rate_per_min INT DEFAULT 48;
ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS team_leader_id TEXT;
ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS team_leader_earned_coins INT DEFAULT 0;
ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS team_leader_commission_percent NUMERIC DEFAULT 10;
ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_call_logs_caller ON public.call_logs(caller_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_host ON public.call_logs(host_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_team_leader ON public.call_logs(team_leader_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_participants ON public.call_logs(caller_id, receiver_id, created_at DESC);

-- ============================================================================
-- 5. FRIEND REQUESTS TABLE (Followers, friendships & mutual discounts)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.friend_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    receiver_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')) DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    responded_at TIMESTAMPTZ,
    CONSTRAINT unique_friend_request UNIQUE (sender_id, receiver_id)
);

CREATE INDEX IF NOT EXISTS idx_friend_requests_users ON public.friend_requests(sender_id, receiver_id, status);

-- ============================================================================
-- 6. PAYOUT REQUESTS TABLE (Creator & Agency earnings withdrawals)
-- ============================================================================
-- LEGACY mid-period withdrawal queue.
-- Financial Module source of truth going forward: settlement_periods / settlement_batches /
-- settlement_line_items / financial_ledger (period-end payouts only). Keep this table for
-- historical reads; do not write new settlement obligations here.
-- Column drift vs some React mappers:
--   schema: payout_details (JSONB), admin_notes, status includes 'approved'
--   legacy clients: account_details, admin_note, user_name, user_email (not DB columns)
CREATE TABLE IF NOT EXISTS public.payout_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    amount_coins BIGINT NOT NULL,
    amount_usd NUMERIC NOT NULL,
    payout_method TEXT NOT NULL CHECK (payout_method IN ('paypal', 'bank_wire', 'crypto_usdt', 'stripe')),
    payout_details JSONB NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'processing', 'completed')) DEFAULT 'pending',
    admin_notes TEXT,
    kyc_verified BOOLEAN NOT NULL DEFAULT false,
    team_leader_id TEXT,
    team_leader_name TEXT,
    request_date TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.payout_requests ADD COLUMN IF NOT EXISTS team_leader_id TEXT;
ALTER TABLE public.payout_requests ADD COLUMN IF NOT EXISTS team_leader_name TEXT;

CREATE INDEX IF NOT EXISTS idx_payout_requests_user ON public.payout_requests(user_id, status);
CREATE INDEX IF NOT EXISTS idx_payout_requests_team_leader ON public.payout_requests(team_leader_id);

COMMENT ON TABLE public.payout_requests IS
  'LEGACY read-only historical withdrawal requests. Cash-out is settlement_batches only (Phase 7). No new inserts; do not approve against settlements (double-pay risk).';

-- Phase 7: block client inserts/updates on legacy payout_requests (settlement batches are SoT)
DROP POLICY IF EXISTS "owner insert payout_requests" ON public.payout_requests;
DROP POLICY IF EXISTS "authenticated insert payout_requests" ON public.payout_requests;
DROP POLICY IF EXISTS "admin update payout_requests" ON public.payout_requests;
DROP POLICY IF EXISTS "authenticated update payout_requests" ON public.payout_requests;
-- SELECT policies remain (owner/admin) for historical read-only views.
-- ============================================================================
-- 7. TAXONOMY CONFIGURATIONS TABLES (Countries, Languages, Zodiac Signs, Interests)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.country_configs (
    code VARCHAR(8) PRIMARY KEY,
    name TEXT NOT NULL,
    flag TEXT NOT NULL DEFAULT '??',
    region TEXT NOT NULL DEFAULT 'Worldwide',
    is_tier1 BOOLEAN NOT NULL DEFAULT false,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.country_configs ADD COLUMN IF NOT EXISTS is_tier1 BOOLEAN DEFAULT false;

CREATE TABLE IF NOT EXISTS public.language_configs (
    code VARCHAR(16) PRIMARY KEY,
    name TEXT NOT NULL,
    native_name TEXT NOT NULL,
    popular BOOLEAN NOT NULL DEFAULT false,
    region TEXT DEFAULT 'Global',
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.zodiac_configs (
    key VARCHAR(32) PRIMARY KEY,
    name TEXT NOT NULL,
    symbol VARCHAR(8) NOT NULL,
    date_range TEXT NOT NULL,
    element TEXT NOT NULL DEFAULT 'fire',
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.interest_configs (
    id VARCHAR(64) PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'lifestyle',
    icon_name TEXT,
    color TEXT,
    popular BOOLEAN DEFAULT false,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Store display currencies (canonical package prices remain USD)
CREATE TABLE IF NOT EXISTS public.currency_configs (
    code VARCHAR(8) PRIMARY KEY,
    name TEXT NOT NULL,
    symbol TEXT NOT NULL,
    rate_from_usd NUMERIC NOT NULL DEFAULT 1,
    enabled BOOLEAN NOT NULL DEFAULT true,
    order_num INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.currency_configs ADD COLUMN IF NOT EXISTS rate_from_usd NUMERIC NOT NULL DEFAULT 1;
ALTER TABLE public.currency_configs ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.currency_configs ADD COLUMN IF NOT EXISTS order_num INT NOT NULL DEFAULT 0;
ALTER TABLE public.currency_configs ADD COLUMN IF NOT EXISTS symbol TEXT;
ALTER TABLE public.currency_configs ADD COLUMN IF NOT EXISTS name TEXT;

-- ============================================================================
-- 8. SYSTEM CONFIGS TABLE (Global economy rates, R2, SMTP, AI moderation)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.system_configs (
    id TEXT PRIMARY KEY DEFAULT 'default',
    coin_burn_rate_per_min INT DEFAULT 120,
    coin_burn_rate_friend_per_min INT DEFAULT 80,
    female_earning_rate_per_min INT DEFAULT 48,
    -- Call burn shares (Phase 2): base vs target-met host %. Platform = 100 ? host ? TL (display).
    female_host_share_percent NUMERIC DEFAULT 30,
    female_host_target_share_percent NUMERIC DEFAULT 40,
    team_leader_share_percent NUMERIC DEFAULT 10,
    gift_female_host_share_percent NUMERIC DEFAULT 70,
    gift_team_leader_share_percent NUMERIC DEFAULT 10,
    enable_virtual_gifts BOOLEAN DEFAULT true,
    virtual_gifts_json TEXT DEFAULT '',
    allowed_country_codes TEXT[] DEFAULT '{}',
    allowed_languages TEXT[] DEFAULT '{}',
    allowed_zodiac_signs TEXT[] DEFAULT '{}',
    allowed_interests TEXT[] DEFAULT '{}',
    flag_sizes_json TEXT DEFAULT '',
    discovery_card_layout_json TEXT DEFAULT '',
    show_dev_persona_bar BOOLEAN DEFAULT false,
    enable_regular_female_coin_earning BOOLEAN DEFAULT false,
    -- Fixed Peg / Economy (Phase 1): ONE coin?USD rate for host, TL, and platform.
    -- Example: coin_usd_peg = 0.003 ? 1000 coins = $3. Package price_usd stays purchase amount (not coins?peg).
    coin_usd_peg NUMERIC DEFAULT 0.003,
    -- LEGACY (kept for backward compat; synced to coin_usd_peg on admin save ? do not use in new code paths):
    coin_to_usd_ratio NUMERIC DEFAULT 0.003,
    female_payout_ratio_usd NUMERIC DEFAULT 0.003,
    min_payout_threshold_usd INT DEFAULT 50,
    r2_bucket_name TEXT DEFAULT 'datingappbucket',
    r2_max_image_size_mb INT DEFAULT 15,
    r2_max_video_size_mb INT DEFAULT 100,
    -- Per-user total storage quota for profile gallery videos (all videos combined)
    r2_profile_video_quota_mb INT DEFAULT 100,
    r2_allowed_mime_types TEXT[] DEFAULT '{"image/jpeg","image/png","image/webp","video/mp4","video/webm","video/quicktime"}',
    r2_cdn_cache_ttl_seconds INT DEFAULT 86400,
    smtp_host TEXT DEFAULT '',
    smtp_port INT DEFAULT 587, 
    smtp_user TEXT DEFAULT '',
    smtp_pass TEXT DEFAULT '',
    smtp_from TEXT DEFAULT '',
    smtp_show_otp BOOLEAN DEFAULT true,
    resend_api_key TEXT DEFAULT '',
    auto_moderation_sensitivity TEXT DEFAULT 'medium',
    nsfw_filter_enabled BOOLEAN DEFAULT true,
    ai_nudity_shield_enabled BOOLEAN DEFAULT true,
    screen_recording_protection BOOLEAN DEFAULT true,
    free_daily_login_coins INT DEFAULT 20,
    banned_keywords TEXT[] DEFAULT '{"scam","wire transfer","bank password","abuse"}',
    abuse_report_auto_suspend_threshold INT DEFAULT 5,
    db_max_pool_size INT DEFAULT 50,
    db_idle_timeout_seconds INT DEFAULT 30,
    db_statement_timeout_ms INT DEFAULT 5000,
    db_query_caching_enabled BOOLEAN DEFAULT true,
    feature_realtime_chat_enabled BOOLEAN DEFAULT true,
    feature_r2_direct_upload_enabled BOOLEAN DEFAULT true,
    feature_video_calling_enabled BOOLEAN DEFAULT true,
    feature_geo_discovery_enabled BOOLEAN DEFAULT true,
    feature_maintenance_mode BOOLEAN DEFAULT false,
    daily_streak_rewards_json TEXT DEFAULT '[10,15,20,25,35,50,100]',
    daily_missions_config_json TEXT DEFAULT '{"chat_friends":{"target":3,"reward":25},"quick_matches":{"target":10,"reward":30},"video_call_min":{"target":60,"reward":35},"moment_interactions":{"target":3,"reward":15},"send_gift":{"target":1,"reward":20},"master_chest":{"target":4,"reward":50}}',
    creator_target_cycle TEXT DEFAULT 'weekly',
    creator_target_bronze_hours NUMERIC DEFAULT 20,
    creator_target_bronze_coins BIGINT DEFAULT 5000,
    creator_target_bronze_bonus_usd NUMERIC DEFAULT 15,
    creator_target_silver_hours NUMERIC DEFAULT 40,
    creator_target_silver_coins BIGINT DEFAULT 20000,
    creator_target_silver_bonus_usd NUMERIC DEFAULT 50,
    creator_target_gold_hours NUMERIC DEFAULT 60,
    creator_target_gold_coins BIGINT DEFAULT 60000,
    creator_target_gold_bonus_usd NUMERIC DEFAULT 150,
    -- Financial Module: UTC close clock (HH:mm) + settlement master switch
    period_close_utc_time TEXT DEFAULT '00:00',
    settlement_enabled BOOLEAN DEFAULT true,
    peak_hours_start TEXT DEFAULT '18:00',
    peak_hours_end TEXT DEFAULT '00:00',
    peak_hours_enabled BOOLEAN DEFAULT true,
    call_ring_timeout_seconds INT DEFAULT 30,
    daily_first_call_bonus_coins INT DEFAULT 100,
    daily_first_call_bonus_usd NUMERIC DEFAULT 1.00,
    daily_first_call_min_duration_sec INT DEFAULT 30,
    streak_target_days INT DEFAULT 7,
    streak_boost_duration_days INT DEFAULT 3,
    min_daily_active_hours_for_streak NUMERIC DEFAULT 2.0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.system_configs ADD COLUMN IF NOT EXISTS allowed_languages TEXT[] DEFAULT '{}';
ALTER TABLE public.system_configs ADD COLUMN IF NOT EXISTS allowed_zodiac_signs TEXT[] DEFAULT '{}';
ALTER TABLE public.system_configs ADD COLUMN IF NOT EXISTS allowed_interests TEXT[] DEFAULT '{}';
ALTER TABLE public.system_configs ADD COLUMN IF NOT EXISTS flag_sizes_json TEXT DEFAULT '';
ALTER TABLE public.system_configs ADD COLUMN IF NOT EXISTS discovery_card_layout_json TEXT DEFAULT '';
ALTER TABLE public.system_configs ADD COLUMN IF NOT EXISTS daily_streak_rewards_json TEXT DEFAULT '[10,15,20,25,35,50,100]';
ALTER TABLE public.system_configs ADD COLUMN IF NOT EXISTS daily_missions_config_json TEXT DEFAULT '{"chat_friends":{"target":3,"reward":25},"quick_matches":{"target":10,"reward":30},"video_call_min":{"target":60,"reward":35},"moment_interactions":{"target":3,"reward":15},"send_gift":{"target":1,"reward":20},"master_chest":{"target":4,"reward":50}}';
ALTER TABLE public.system_configs ADD COLUMN IF NOT EXISTS creator_target_cycle TEXT DEFAULT 'weekly';
ALTER TABLE public.system_configs ADD COLUMN IF NOT EXISTS creator_target_bronze_hours NUMERIC DEFAULT 20;
ALTER TABLE public.system_configs ADD COLUMN IF NOT EXISTS creator_target_bronze_coins BIGINT DEFAULT 5000;
ALTER TABLE public.system_configs ADD COLUMN IF NOT EXISTS creator_target_bronze_bonus_usd NUMERIC DEFAULT 15;
ALTER TABLE public.system_configs ADD COLUMN IF NOT EXISTS creator_target_silver_hours NUMERIC DEFAULT 40;
ALTER TABLE public.system_configs ADD COLUMN IF NOT EXISTS creator_target_silver_coins BIGINT DEFAULT 20000;
ALTER TABLE public.system_configs ADD COLUMN IF NOT EXISTS creator_target_silver_bonus_usd NUMERIC DEFAULT 50;
ALTER TABLE public.system_configs ADD COLUMN IF NOT EXISTS creator_target_gold_hours NUMERIC DEFAULT 60;
ALTER TABLE public.system_configs ADD COLUMN IF NOT EXISTS creator_target_gold_coins BIGINT DEFAULT 60000;
ALTER TABLE public.system_configs ADD COLUMN IF NOT EXISTS creator_target_gold_bonus_usd NUMERIC DEFAULT 150;
ALTER TABLE public.system_configs ADD COLUMN IF NOT EXISTS peak_hours_start TEXT DEFAULT '18:00';
ALTER TABLE public.system_configs ADD COLUMN IF NOT EXISTS peak_hours_end TEXT DEFAULT '00:00';
ALTER TABLE public.system_configs ADD COLUMN IF NOT EXISTS peak_hours_enabled BOOLEAN DEFAULT true;
ALTER TABLE public.system_configs ADD COLUMN IF NOT EXISTS call_ring_timeout_seconds INT DEFAULT 30;
ALTER TABLE public.system_configs ADD COLUMN IF NOT EXISTS daily_first_call_bonus_coins INT DEFAULT 100;
ALTER TABLE public.system_configs ADD COLUMN IF NOT EXISTS daily_first_call_bonus_usd NUMERIC DEFAULT 1.00;
ALTER TABLE public.system_configs ADD COLUMN IF NOT EXISTS daily_first_call_min_duration_sec INT DEFAULT 30;
ALTER TABLE public.system_configs ADD COLUMN IF NOT EXISTS streak_target_days INT DEFAULT 7;
ALTER TABLE public.system_configs ADD COLUMN IF NOT EXISTS streak_boost_duration_days INT DEFAULT 3;
ALTER TABLE public.system_configs ADD COLUMN IF NOT EXISTS min_daily_active_hours_for_streak NUMERIC DEFAULT 2.0;
ALTER TABLE public.system_configs ADD COLUMN IF NOT EXISTS free_daily_login_coins INT DEFAULT 20;
ALTER TABLE public.system_configs ADD COLUMN IF NOT EXISTS period_close_utc_time TEXT DEFAULT '00:00';
ALTER TABLE public.system_configs ADD COLUMN IF NOT EXISTS settlement_enabled BOOLEAN DEFAULT true;
ALTER TABLE public.system_configs ADD COLUMN IF NOT EXISTS r2_profile_video_quota_mb INT DEFAULT 100;
COMMENT ON COLUMN public.system_configs.r2_profile_video_quota_mb IS
  'Per-user total MB quota for all profile gallery videos combined. Admin-configurable; default 100.';
-- Ensure existing installs pick up the higher multi-video quota when still on the old default.
UPDATE public.system_configs
SET r2_profile_video_quota_mb = 100
WHERE r2_profile_video_quota_mb IS NULL OR r2_profile_video_quota_mb = 30;
-- Phase 1 host true-up: base share on live burns; target share at period close
ALTER TABLE public.system_configs ADD COLUMN IF NOT EXISTS female_host_target_share_percent NUMERIC DEFAULT 40;
COMMENT ON COLUMN public.system_configs.female_host_share_percent IS
  'Call burn: live host base share % every billing minute (admin-configurable). Target true-up is separate at period close.';
COMMENT ON COLUMN public.system_configs.female_host_target_share_percent IS
  'Call burn: host target share % applied at period END via true-up if bronze+ hours AND coins met. Not used mid-call.';
COMMENT ON COLUMN public.system_configs.team_leader_share_percent IS
  'Call burn: TL share % of burn when host has a linked team leader. Platform retained = 100 ? host ? TL.';
COMMENT ON COLUMN public.system_configs.coin_burn_rate_per_min IS
  'Caller burn coins/min (non-friends). Economy hub only.';
COMMENT ON COLUMN public.system_configs.coin_burn_rate_friend_per_min IS
  'Caller burn coins/min (friends). Economy hub only.';
COMMENT ON COLUMN public.system_configs.female_earning_rate_per_min IS
  'LEGACY derived display (burn ? host%). Not used by burn_call_coins_atomic / call burn path.';
COMMENT ON COLUMN public.system_configs.gift_female_host_share_percent IS
  'Gift/tip host share % of gift coin cost. Editable only in Admin ? Coin Burn & Economy ?C. Catalog SKUs do not edit this.';
COMMENT ON COLUMN public.system_configs.gift_team_leader_share_percent IS
  'Gift/tip TL share % of gift coin cost when host has linked TL. Economy ?C only. Platform = 100 ? host ? TL.';
-- Fixed Peg (Phase 1): canonical coin?USD for host/TL/platform. Legacy ratios kept & synced.
ALTER TABLE public.system_configs ADD COLUMN IF NOT EXISTS coin_usd_peg NUMERIC DEFAULT 0.003;
COMMENT ON COLUMN public.system_configs.coin_usd_peg IS
  'Fixed Peg: USD per coin for host/TL payables and platform retained FX. 0.003 = 1000 coins = $3. Package price_usd is purchase amount, not forced to coins?peg.';
COMMENT ON COLUMN public.system_configs.female_payout_ratio_usd IS
  'LEGACY: was host/TL payout FX. Synced to coin_usd_peg; prefer coin_usd_peg in application code.';
COMMENT ON COLUMN public.system_configs.coin_to_usd_ratio IS
  'LEGACY: was spend/platform FX. Synced to coin_usd_peg; prefer coin_usd_peg in application code.';
-- Backfill peg from prior host payout ratio when column was just added (NULL), else keep default.
UPDATE public.system_configs
SET coin_usd_peg = COALESCE(NULLIF(female_payout_ratio_usd, 0), NULLIF(coin_to_usd_ratio, 0), 0.003)
WHERE coin_usd_peg IS NULL;
-- Align legacy columns to peg for backward-compatible readers.
UPDATE public.system_configs
SET
  female_payout_ratio_usd = coin_usd_peg,
  coin_to_usd_ratio = coin_usd_peg
WHERE coin_usd_peg IS NOT NULL
  AND (
    female_payout_ratio_usd IS DISTINCT FROM coin_usd_peg
    OR coin_to_usd_ratio IS DISTINCT FROM coin_usd_peg
  );

DO $$
BEGIN
  ALTER TABLE public.system_configs DROP CONSTRAINT IF EXISTS system_configs_period_close_utc_time_check;
  ALTER TABLE public.system_configs
    ADD CONSTRAINT system_configs_period_close_utc_time_check
    CHECK (period_close_utc_time ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN public.system_configs.period_close_utc_time IS
  'UTC HH:mm when a settlement period close job may run relative to period_end (Financial Module). Default 00:00.';
COMMENT ON COLUMN public.system_configs.settlement_enabled IS
  'When true, period-end settlement batches are the intended cash-out path (Financial Module). Mid-period manual payouts will be disabled in a later phase.';
COMMENT ON COLUMN public.system_configs.creator_target_cycle IS
  'weekly = Monday 00:00 UTC ? next Monday 00:00 UTC; monthly = calendar month 1st 00:00 UTC ? next 1st 00:00 UTC (not rolling 30 days).';

-- ============================================================================
-- 9. MODERATION REPORTS TABLE (User incident telemetry & live QA evidence)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.moderation_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reported_user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    details TEXT,
    evidence_snapshot_url TEXT,
    status TEXT NOT NULL CHECK (status IN ('pending', 'investigating', 'action_taken', 'dismissed')) DEFAULT 'pending',
    action_taken TEXT,
    admin_notes TEXT,
    resolved_by TEXT,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_moderation_reports_reporter_created
  ON public.moderation_reports (reporter_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_moderation_reports_status_created
  ON public.moderation_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_moderation_reports_pair_pending
  ON public.moderation_reports (reporter_id, reported_user_id, status, created_at DESC);

-- ============================================================================
-- 9b. CREATOR REVIEWS (caller feedback after an explicit rating request)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.creator_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    call_log_id TEXT REFERENCES public.call_logs(id) ON DELETE SET NULL,
    creator_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    caller_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    stars INT NOT NULL CHECK (stars BETWEEN 1 AND 5),
    communication INT CHECK (communication IS NULL OR (communication BETWEEN 1 AND 5)),
    friendliness INT CHECK (friendliness IS NULL OR (friendliness BETWEEN 1 AND 5)),
    clarity INT CHECK (clarity IS NULL OR (clarity BETWEEN 1 AND 5)),
    energy INT CHECK (energy IS NULL OR (energy BETWEEN 1 AND 5)),
    comment TEXT,
    tags TEXT[] DEFAULT '{}',
    call_duration_seconds INT,
    requested_by TEXT REFERENCES public.profiles(id) ON DELETE SET NULL,
    rating_request_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
    caller_name TEXT,
    caller_avatar TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Evolve legacy creator_reviews shape (older DBs used rating/review_text TEXT id)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'creator_reviews' AND column_name = 'rating'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'creator_reviews' AND column_name = 'stars'
  ) THEN
    ALTER TABLE public.creator_reviews RENAME COLUMN rating TO stars;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'creator_reviews' AND column_name = 'review_text'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'creator_reviews' AND column_name = 'comment'
  ) THEN
    ALTER TABLE public.creator_reviews RENAME COLUMN review_text TO comment;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'creator_reviews' AND column_name = 'duration_seconds'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'creator_reviews' AND column_name = 'call_duration_seconds'
  ) THEN
    ALTER TABLE public.creator_reviews RENAME COLUMN duration_seconds TO call_duration_seconds;
  END IF;
END $$;

ALTER TABLE public.creator_reviews ADD COLUMN IF NOT EXISTS stars INT;
ALTER TABLE public.creator_reviews ADD COLUMN IF NOT EXISTS communication INT;
ALTER TABLE public.creator_reviews ADD COLUMN IF NOT EXISTS friendliness INT;
ALTER TABLE public.creator_reviews ADD COLUMN IF NOT EXISTS clarity INT;
ALTER TABLE public.creator_reviews ADD COLUMN IF NOT EXISTS energy INT;
ALTER TABLE public.creator_reviews ADD COLUMN IF NOT EXISTS comment TEXT;
ALTER TABLE public.creator_reviews ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE public.creator_reviews ADD COLUMN IF NOT EXISTS call_duration_seconds INT;
ALTER TABLE public.creator_reviews ADD COLUMN IF NOT EXISTS requested_by TEXT REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.creator_reviews ADD COLUMN IF NOT EXISTS rating_request_message_id UUID;
ALTER TABLE public.creator_reviews ADD COLUMN IF NOT EXISTS caller_name TEXT;
ALTER TABLE public.creator_reviews ADD COLUMN IF NOT EXISTS caller_avatar TEXT;
ALTER TABLE public.creator_reviews ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS idx_creator_reviews_caller_call_unique
  ON public.creator_reviews (caller_id, call_log_id)
  WHERE call_log_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_creator_reviews_caller_request_unique
  ON public.creator_reviews (caller_id, rating_request_message_id)
  WHERE rating_request_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_creator_reviews_creator_created
  ON public.creator_reviews (creator_id, created_at DESC);

-- ============================================================================
-- 10. CMS POLICIES & HOME CMS TABLES
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.cms_policies (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'safety',
    icon TEXT DEFAULT 'ShieldCheck',
    summary TEXT,
    content TEXT NOT NULL,
    order_num INT DEFAULT 0,
    is_featured BOOLEAN DEFAULT true,
    external_url TEXT,
    effective_date TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.home_banners (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    subtitle TEXT,
    badge TEXT,
    cta_text TEXT DEFAULT 'Explore Now',
    tag_color TEXT DEFAULT 'bg-indigo-600 text-white',
    image_url TEXT,
    action_type TEXT DEFAULT 'tab',
    action_target TEXT DEFAULT 'coins',
    bg_gradient TEXT DEFAULT 'from-indigo-950/90 via-purple-950/70 to-slate-900/90',
    order_num INT DEFAULT 0,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.home_banners ADD COLUMN IF NOT EXISTS cta_text TEXT DEFAULT 'Explore Now';
ALTER TABLE public.home_banners ADD COLUMN IF NOT EXISTS tag_color TEXT DEFAULT 'bg-indigo-600 text-white';
ALTER TABLE public.home_banners ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE TABLE IF NOT EXISTS public.home_quick_links (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    subtitle TEXT,
    icon TEXT DEFAULT 'Zap',
    badge TEXT,
    action_type TEXT DEFAULT 'tab',
    action_target TEXT DEFAULT 'discovery',
    color_gradient TEXT DEFAULT 'from-indigo-500 to-purple-600',
    order_num INT DEFAULT 0,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Default homepage CMS content for fresh databases (safe to re-run).
INSERT INTO public.home_banners (
  id, title, subtitle, badge, cta_text, tag_color, image_url,
  action_type, action_target, bg_gradient, order_num, active
) VALUES
  (
    'banner_live_dating',
    'Experience Genuine 1-on-1 Video Moments',
    'Connect with creators and matches around the globe in HD video calls.',
    '?? TRENDING NOW',
    'Explore Matches',
    'bg-rose-500 text-white',
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=1200',
    'tab', 'discovery',
    'from-purple-900/90 via-pink-900/60 to-slate-900/90',
    1, true
  ),
  (
    'banner_quick_roulette',
    'Instant Video Roulette Matching',
    'Skip endless texting. Jump into a live match and meet someone new in seconds.',
    '? QUICK RADAR',
    'Start Match',
    'bg-amber-400 text-slate-950',
    'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&q=80&w=1200',
    'modal', 'match',
    'from-amber-950/90 via-rose-950/60 to-slate-900/90',
    2, true
  ),
  (
    'banner_coin_store',
    'Top Up Your Coin Balance',
    'Unlock longer video calls and send gifts with coin packages built for every budget.',
    '?? COIN STORE',
    'Open Coin Store',
    'bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950',
    'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&q=80&w=1200',
    'modal', 'store',
    'from-amber-900/90 via-purple-950/70 to-slate-900/90',
    3, true
  ),
  (
    'banner_creator_earnings',
    'Earn As a Verified Host',
    'Get paid for completed video calls. Request payouts through supported methods after verification.',
    '?? CREATOR REWARDS',
    'Creator Dashboard',
    'bg-emerald-500 text-slate-950',
    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=1200',
    'tab', 'earnings',
    'from-emerald-950/90 via-teal-950/60 to-slate-900/90',
    4, true
  ),
  (
    'banner_safety_first',
    'Your Privacy & Safety Matters',
    'Zero tolerance for harassment. Use Block & Report anytime ? our team reviews safety reports.',
    '??? SAFETY CENTER',
    'Read Safety Policy',
    'bg-indigo-500 text-white',
    'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&q=80&w=1200',
    'policy', 'policy_safety',
    'from-indigo-950/90 via-slate-900/80 to-slate-950/90',
    5, true
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.home_quick_links (
  id, title, subtitle, icon, badge, action_type, action_target, color_gradient, order_num, active
) VALUES
  ('link_quick_match', 'Quick Match', 'Instant Video Radar', 'Zap', 'HOT', 'modal', 'match', 'from-amber-500 to-rose-500', 1, true),
  ('link_swipe_deck', 'Swipe Deck', 'Browse Cards', 'Layers', 'NEW', 'tab', 'swipe', 'from-pink-500 to-purple-600', 2, true),
  ('link_discovery', 'Discover', 'Browse Creators', 'Globe', 'LIVE', 'tab', 'discovery', 'from-yellow-400 to-amber-600', 3, true),
  ('link_coin_store', 'Get Coins', 'Refill Balance', 'Coins', 'STORE', 'modal', 'store', 'from-emerald-400 to-teal-600', 4, true),
  ('link_moments_feed', 'Moments Feed', 'Creator Stories', 'Sparkles', 'FEED', 'tab', 'moments', 'from-blue-500 to-indigo-600', 5, true),
  ('link_safety_policy', 'Safety Center', 'Policies & Reporting', 'ShieldCheck', 'INFO', 'policy', 'policy_safety', 'from-indigo-500 to-cyan-600', 6, true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 10b. PAYOUT METHOD TEMPLATES (CMS) + USER PAYOUT CARDS
-- Admin defines field templates per method; hosts/TLs save local remittance details.
-- Mutations via backend service-role APIs only (RLS denies client writes).
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.payout_method_templates (
    method_key TEXT PRIMARY KEY CHECK (method_key IN ('paypal', 'bank_account', 'wallet')),
    label TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT 'Wallet',
    description TEXT NOT NULL DEFAULT '',
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    countries_mode TEXT NOT NULL DEFAULT 'all' CHECK (countries_mode IN ('all', 'selected')),
    country_codes TEXT[] NOT NULL DEFAULT '{}',
    fields_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_payout_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    method_key TEXT NOT NULL CHECK (method_key IN ('paypal', 'bank_account', 'wallet')),
    country_code VARCHAR(8) NOT NULL,
    values_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, method_key)
);

CREATE INDEX IF NOT EXISTS idx_user_payout_cards_user ON public.user_payout_cards(user_id);
CREATE INDEX IF NOT EXISTS idx_user_payout_cards_method ON public.user_payout_cards(method_key);
CREATE INDEX IF NOT EXISTS idx_user_payout_cards_primary
  ON public.user_payout_cards(user_id) WHERE is_primary = true;

COMMENT ON TABLE public.payout_method_templates IS
  'Admin CMS templates for PayPal / Bank / Wallet payout field sets and country availability.';
COMMENT ON TABLE public.user_payout_cards IS
  'Host/TL saved local remittance details (one card per method). Read/write via backend APIs only.';

INSERT INTO public.payout_method_templates (
  method_key, label, icon, description, is_enabled, countries_mode, country_codes, fields_json, sort_order
) VALUES
(
  'paypal',
  'PayPal',
  'Wallet',
  'PayPal wallet remittance for period-end local salary payments.',
  true,
  'all',
  '{}',
  '[
    {"id":"pp_email","key":"email","label":"PayPal Email","type":"email","required":true,"placeholder":"name@example.com"},
    {"id":"pp_name","key":"account_name","label":"Account Name","type":"text","required":true,"placeholder":"Full name on PayPal"},
    {"id":"pp_phone","key":"phone","label":"Contact Phone","type":"phone","required":false,"placeholder":"Country code + number"}
  ]'::jsonb,
  1
),
(
  'bank_account',
  'Bank Account',
  'Landmark',
  'Bank wire / IBAN details for local salary transfers.',
  true,
  'all',
  '{}',
  '[
    {"id":"ba_holder","key":"account_holder","label":"Account Holder","type":"text","required":true,"placeholder":"Name as on bank account"},
    {"id":"ba_bank","key":"bank_name","label":"Bank Name","type":"text","required":true,"placeholder":"Bank name"},
    {"id":"ba_iban","key":"iban_or_account","label":"IBAN / Account Number","type":"text","required":true,"placeholder":"IBAN or account number"},
    {"id":"ba_swift","key":"swift_bic","label":"SWIFT / BIC","type":"text","required":false,"placeholder":"Optional"},
    {"id":"ba_routing","key":"routing_number","label":"Routing Number","type":"text","required":false,"placeholder":"Optional"},
    {"id":"ba_branch","key":"branch","label":"Branch","type":"text","required":false,"placeholder":"Optional"},
    {"id":"ba_phone","key":"phone","label":"Contact Phone","type":"phone","required":false,"placeholder":"Country code + number"}
  ]'::jsonb,
  2
),
(
  'wallet',
  'Wallets',
  'Smartphone',
  'E-wallets and crypto addresses for local remittance.',
  true,
  'all',
  '{}',
  '[
    {"id":"w_type","key":"wallet_type","label":"Wallet Type","type":"select","required":true,"options":["USDT TRC20","USDT ERC20","GCash","PIX","Revolut","Other"]},
    {"id":"w_addr","key":"address_or_id","label":"Wallet Address / Account ID","type":"text","required":true,"placeholder":"Address or account ID"},
    {"id":"w_name","key":"account_name","label":"Account Name","type":"text","required":false,"placeholder":"Optional"},
    {"id":"w_phone","key":"phone","label":"Phone Number","type":"phone","required":false,"placeholder":"Optional"}
  ]'::jsonb,
  3
)
ON CONFLICT (method_key) DO NOTHING;

-- Ensure contact phone field exists on bank/PayPal templates (idempotent for existing DBs).
UPDATE public.payout_method_templates
SET fields_json = fields_json || '[{"id":"ba_phone","key":"phone","label":"Contact Phone","type":"phone","required":false,"placeholder":"Country code + number"}]'::jsonb,
    updated_at = NOW()
WHERE method_key = 'bank_account'
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(fields_json) AS f
    WHERE f->>'key' = 'phone'
  );

UPDATE public.payout_method_templates
SET fields_json = fields_json || '[{"id":"pp_phone","key":"phone","label":"Contact Phone","type":"phone","required":false,"placeholder":"Country code + number"}]'::jsonb,
    updated_at = NOW()
WHERE method_key = 'paypal'
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(fields_json) AS f
    WHERE f->>'key' = 'phone'
  );

ALTER TABLE public.payout_method_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_payout_cards ENABLE ROW LEVEL SECURITY;

-- No client policies: deny-by-default for anon/authenticated; service-role APIs only.
DROP POLICY IF EXISTS "public select payout_method_templates" ON public.payout_method_templates;
DROP POLICY IF EXISTS "public select user_payout_cards" ON public.user_payout_cards;

CREATE TABLE IF NOT EXISTS public.app_nav_items (
    id TEXT PRIMARY KEY,
    audience_role TEXT NOT NULL,
    bar TEXT NOT NULL,
    slot TEXT NOT NULL DEFAULT 'default',
    label TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT 'Circle',
    action_type TEXT NOT NULL,
    action_target TEXT NOT NULL,
    badge TEXT DEFAULT 'none',
    meta JSONB,
    order_num INT NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_nav_items_lookup
  ON public.app_nav_items (audience_role, bar, slot, order_num);

ALTER TABLE public.app_nav_items
  ADD COLUMN IF NOT EXISTS parent_id TEXT REFERENCES public.app_nav_items(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_app_nav_items_parent
  ON public.app_nav_items (parent_id, order_num);

INSERT INTO public.app_nav_items (
  id, audience_role, bar, slot, label, icon, action_type, action_target, badge, meta, order_num, active
) VALUES
  ('brand_global', '*', 'brand', 'default', 'Minglecall', 'Sparkles', 'tab', 'home', 'none', '{"markText":"M","wordmarkPrimary":"Mingle","wordmarkAccent":"call","imageUrl":"","showMark":true,"showWordmark":true}'::jsonb, 0, true),
  ('nav_guest_logged_out_header_default_auth_login', 'guest', 'logged_out_header', 'default', 'Sign In', 'LogIn', 'auth', 'auth_login', 'none', NULL, 1, true),
  ('nav_guest_logged_out_header_default_auth_register', 'guest', 'logged_out_header', 'default', 'Join free', 'UserPlus', 'auth', 'auth_register', 'none', NULL, 2, true),
  ('nav_admin_main_header_left_home', 'admin', 'main_header', 'left', 'Home', 'Home', 'tab', 'home', 'none', NULL, 1, true),
  ('nav_admin_main_header_left_admin', 'admin', 'main_header', 'left', 'Admin', 'Settings', 'tab', 'admin', 'none', NULL, 2, true),
  ('nav_admin_main_header_right_daily_rewards', 'admin', 'main_header', 'right', 'Rewards', 'Gift', 'modal', 'daily_rewards', 'unclaimed_rewards', NULL, 1, true),
  ('nav_admin_main_header_right_store', 'admin', 'main_header', 'right', 'Buy', 'Coins', 'modal', 'store', 'coin_balance', NULL, 2, true),
  ('nav_admin_subheader_default_discovery', 'admin', 'subheader', 'default', 'Discover', 'LayoutGrid', 'tab', 'discovery', 'none', '{"group":"primary"}'::jsonb, 1, true),
  ('nav_admin_subheader_default_swipe', 'admin', 'subheader', 'default', 'Swipe', 'Layers', 'tab', 'swipe', 'none', '{"group":"primary"}'::jsonb, 2, true),
  ('nav_admin_subheader_default_moments', 'admin', 'subheader', 'default', 'Moments', 'Image', 'tab', 'moments', 'none', '{"group":"primary"}'::jsonb, 3, true),
  ('nav_admin_subheader_default_match', 'admin', 'subheader', 'default', 'Match', 'Zap', 'overlay', 'match', 'none', '{"group":"primary"}'::jsonb, 4, true),
  ('nav_admin_subheader_default_chat', 'admin', 'subheader', 'default', 'Chat', 'MessageCircle', 'overlay', 'chat', 'unread_messages', '{"group":"primary"}'::jsonb, 5, true),
  ('nav_admin_subheader_default_call_logs', 'admin', 'subheader', 'default', 'Calls', 'PhoneCall', 'tab', 'call_logs', 'missed_calls', '{"group":"secondary"}'::jsonb, 6, true),
  ('nav_admin_subheader_default_friend_requests', 'admin', 'subheader', 'default', 'Friends', 'UserPlus', 'overlay', 'friend_requests', 'friend_requests', '{"group":"secondary"}'::jsonb, 7, true),
  ('nav_admin_subheader_default_social_circle', 'admin', 'subheader', 'default', 'Circle', 'Users', 'overlay', 'social_circle', 'none', '{"group":"secondary"}'::jsonb, 8, true),
  ('nav_admin_mobile_bottom_default_home', 'admin', 'mobile_bottom', 'default', 'Home', 'Home', 'tab', 'home', 'none', NULL, 1, true),
  ('nav_admin_mobile_bottom_default_discovery', 'admin', 'mobile_bottom', 'default', 'Discover', 'Compass', 'tab', 'discovery', 'none', NULL, 2, true),
  ('nav_admin_mobile_bottom_default_match', 'admin', 'mobile_bottom', 'default', 'Match', 'Flame', 'overlay', 'match', 'none', NULL, 3, true),
  ('nav_admin_mobile_bottom_default_chat', 'admin', 'mobile_bottom', 'default', 'Chat', 'MessageCircle', 'overlay', 'chat', 'unread_messages', NULL, 4, true),
  ('nav_admin_mobile_bottom_default_profile', 'admin', 'mobile_bottom', 'default', 'Profile', 'User', 'tab', 'profile', 'none', NULL, 5, true),
  ('nav_admin_mobile_bottom_default_call_logs', 'admin', 'mobile_bottom', 'default', 'Logs', 'PhoneCall', 'tab', 'call_logs', 'missed_calls', NULL, 6, true),
  ('nav_admin_mobile_bottom_default_admin', 'admin', 'mobile_bottom', 'default', 'Admin', 'Settings', 'tab', 'admin', 'none', NULL, 7, true),
  ('nav_admin_persona_menu_default_status_online', 'admin', 'persona_menu', 'default', 'Available', 'Circle', 'system', 'status_online', 'none', NULL, 1, true),
  ('nav_admin_persona_menu_default_status_busy', 'admin', 'persona_menu', 'default', 'Busy', 'Circle', 'system', 'status_busy', 'none', NULL, 2, true),
  ('nav_admin_persona_menu_default_status_offline', 'admin', 'persona_menu', 'default', 'Offline', 'Circle', 'system', 'status_offline', 'none', NULL, 3, true),
  ('nav_admin_persona_menu_default_store', 'admin', 'persona_menu', 'default', 'Top Up', 'Coins', 'modal', 'store', 'coin_balance', NULL, 4, true),
  ('nav_admin_persona_menu_default_profile', 'admin', 'persona_menu', 'default', 'Profile', 'User', 'tab', 'profile', 'none', NULL, 5, true),
  ('nav_admin_persona_menu_default_earnings', 'admin', 'persona_menu', 'default', 'Spending & Analytics', 'TrendingUp', 'tab', 'earnings', 'none', NULL, 6, true),
  ('nav_admin_persona_menu_default_social_circle', 'admin', 'persona_menu', 'default', 'Friends & Social Circle', 'Users', 'overlay', 'social_circle', 'none', NULL, 7, true),
  ('nav_admin_persona_menu_default_install_pwa', 'admin', 'persona_menu', 'default', 'Install LiveCall PWA App', 'Download', 'system', 'install_pwa', 'none', NULL, 8, true),
  ('nav_admin_persona_menu_default_logout', 'admin', 'persona_menu', 'default', 'Log Out', 'LogOut', 'system', 'logout', 'none', NULL, 9, true),
  ('nav_team_leader_main_header_left_home', 'team_leader', 'main_header', 'left', 'Home', 'Home', 'tab', 'home', 'none', NULL, 1, true),
  ('nav_team_leader_main_header_right_daily_rewards', 'team_leader', 'main_header', 'right', 'Rewards', 'Gift', 'modal', 'daily_rewards', 'unclaimed_rewards', NULL, 1, true),
  ('nav_team_leader_main_header_right_team_leader', 'team_leader', 'main_header', 'right', 'Agency', 'Crown', 'tab', 'team_leader', 'none', NULL, 2, true),
  ('nav_team_leader_subheader_default_discovery', 'team_leader', 'subheader', 'default', 'Discover', 'LayoutGrid', 'tab', 'discovery', 'none', '{"group":"primary"}'::jsonb, 1, true),
  ('nav_team_leader_subheader_default_swipe', 'team_leader', 'subheader', 'default', 'Swipe', 'Layers', 'tab', 'swipe', 'none', '{"group":"primary"}'::jsonb, 2, true),
  ('nav_team_leader_subheader_default_moments', 'team_leader', 'subheader', 'default', 'Moments', 'Image', 'tab', 'moments', 'none', '{"group":"primary"}'::jsonb, 3, true),
  ('nav_team_leader_subheader_default_match', 'team_leader', 'subheader', 'default', 'Match', 'Zap', 'overlay', 'match', 'none', '{"group":"primary"}'::jsonb, 4, true),
  ('nav_team_leader_subheader_default_chat', 'team_leader', 'subheader', 'default', 'Chat', 'MessageCircle', 'overlay', 'chat', 'unread_messages', '{"group":"primary"}'::jsonb, 5, true),
  ('nav_team_leader_subheader_default_call_logs', 'team_leader', 'subheader', 'default', 'Calls', 'PhoneCall', 'tab', 'call_logs', 'missed_calls', '{"group":"secondary"}'::jsonb, 6, true),
  ('nav_team_leader_subheader_default_friend_requests', 'team_leader', 'subheader', 'default', 'Friends', 'UserPlus', 'overlay', 'friend_requests', 'friend_requests', '{"group":"secondary"}'::jsonb, 7, true),
  ('nav_team_leader_subheader_default_social_circle', 'team_leader', 'subheader', 'default', 'Circle', 'Users', 'overlay', 'social_circle', 'none', '{"group":"secondary"}'::jsonb, 8, true),
  ('nav_team_leader_mobile_bottom_default_home', 'team_leader', 'mobile_bottom', 'default', 'Home', 'Home', 'tab', 'home', 'none', NULL, 1, true),
  ('nav_team_leader_mobile_bottom_default_discovery', 'team_leader', 'mobile_bottom', 'default', 'Discover', 'Compass', 'tab', 'discovery', 'none', NULL, 2, true),
  ('nav_team_leader_mobile_bottom_default_match', 'team_leader', 'mobile_bottom', 'default', 'Match', 'Flame', 'overlay', 'match', 'none', NULL, 3, true),
  ('nav_team_leader_mobile_bottom_default_chat', 'team_leader', 'mobile_bottom', 'default', 'Chat', 'MessageCircle', 'overlay', 'chat', 'unread_messages', NULL, 4, true),
  ('nav_team_leader_mobile_bottom_default_profile', 'team_leader', 'mobile_bottom', 'default', 'Profile', 'User', 'tab', 'profile', 'none', NULL, 5, true),
  ('nav_team_leader_mobile_bottom_default_call_logs', 'team_leader', 'mobile_bottom', 'default', 'Logs', 'PhoneCall', 'tab', 'call_logs', 'missed_calls', NULL, 6, true),
  ('nav_team_leader_mobile_bottom_default_team_leader', 'team_leader', 'mobile_bottom', 'default', 'Agency', 'Crown', 'tab', 'team_leader', 'none', NULL, 7, true),
  ('nav_team_leader_persona_menu_default_status_online', 'team_leader', 'persona_menu', 'default', 'Available', 'Circle', 'system', 'status_online', 'none', NULL, 1, true),
  ('nav_team_leader_persona_menu_default_status_busy', 'team_leader', 'persona_menu', 'default', 'Busy', 'Circle', 'system', 'status_busy', 'none', NULL, 2, true),
  ('nav_team_leader_persona_menu_default_status_offline', 'team_leader', 'persona_menu', 'default', 'Offline', 'Circle', 'system', 'status_offline', 'none', NULL, 3, true),
  ('nav_team_leader_persona_menu_default_profile', 'team_leader', 'persona_menu', 'default', 'Profile', 'User', 'tab', 'profile', 'none', NULL, 4, true),
  ('nav_team_leader_persona_menu_default_earnings', 'team_leader', 'persona_menu', 'default', 'Earnings & Analytics', 'DollarSign', 'tab', 'earnings', 'none', NULL, 5, true),
  ('nav_team_leader_persona_menu_default_social_circle', 'team_leader', 'persona_menu', 'default', 'Friends & Social Circle', 'Users', 'overlay', 'social_circle', 'none', NULL, 6, true),
  ('nav_team_leader_persona_menu_default_install_pwa', 'team_leader', 'persona_menu', 'default', 'Install LiveCall PWA App', 'Download', 'system', 'install_pwa', 'none', NULL, 7, true),
  ('nav_team_leader_persona_menu_default_logout', 'team_leader', 'persona_menu', 'default', 'Log Out', 'LogOut', 'system', 'logout', 'none', NULL, 8, true),
  ('nav_male_user_main_header_left_home', 'male_user', 'main_header', 'left', 'Home', 'Home', 'tab', 'home', 'none', NULL, 1, true),
  ('nav_male_user_main_header_right_daily_rewards', 'male_user', 'main_header', 'right', 'Rewards', 'Gift', 'modal', 'daily_rewards', 'unclaimed_rewards', NULL, 1, true),
  ('nav_male_user_main_header_right_store', 'male_user', 'main_header', 'right', 'Buy', 'Coins', 'modal', 'store', 'coin_balance', NULL, 2, true),
  ('nav_male_user_subheader_default_discovery', 'male_user', 'subheader', 'default', 'Discover', 'LayoutGrid', 'tab', 'discovery', 'none', '{"group":"primary"}'::jsonb, 1, true),
  ('nav_male_user_subheader_default_swipe', 'male_user', 'subheader', 'default', 'Swipe', 'Layers', 'tab', 'swipe', 'none', '{"group":"primary"}'::jsonb, 2, true),
  ('nav_male_user_subheader_default_moments', 'male_user', 'subheader', 'default', 'Moments', 'Image', 'tab', 'moments', 'none', '{"group":"primary"}'::jsonb, 3, true),
  ('nav_male_user_subheader_default_match', 'male_user', 'subheader', 'default', 'Match', 'Zap', 'overlay', 'match', 'none', '{"group":"primary"}'::jsonb, 4, true),
  ('nav_male_user_subheader_default_chat', 'male_user', 'subheader', 'default', 'Chat', 'MessageCircle', 'overlay', 'chat', 'unread_messages', '{"group":"primary"}'::jsonb, 5, true),
  ('nav_male_user_subheader_default_call_logs', 'male_user', 'subheader', 'default', 'Calls', 'PhoneCall', 'tab', 'call_logs', 'missed_calls', '{"group":"secondary"}'::jsonb, 6, true),
  ('nav_male_user_subheader_default_friend_requests', 'male_user', 'subheader', 'default', 'Friends', 'UserPlus', 'overlay', 'friend_requests', 'friend_requests', '{"group":"secondary"}'::jsonb, 7, true),
  ('nav_male_user_subheader_default_social_circle', 'male_user', 'subheader', 'default', 'Circle', 'Users', 'overlay', 'social_circle', 'none', '{"group":"secondary"}'::jsonb, 8, true),
  ('nav_male_user_mobile_bottom_default_home', 'male_user', 'mobile_bottom', 'default', 'Home', 'Home', 'tab', 'home', 'none', NULL, 1, true),
  ('nav_male_user_mobile_bottom_default_discovery', 'male_user', 'mobile_bottom', 'default', 'Discover', 'Compass', 'tab', 'discovery', 'none', NULL, 2, true),
  ('nav_male_user_mobile_bottom_default_match', 'male_user', 'mobile_bottom', 'default', 'Match', 'Flame', 'overlay', 'match', 'none', NULL, 3, true),
  ('nav_male_user_mobile_bottom_default_chat', 'male_user', 'mobile_bottom', 'default', 'Chat', 'MessageCircle', 'overlay', 'chat', 'unread_messages', NULL, 4, true),
  ('nav_male_user_mobile_bottom_default_profile', 'male_user', 'mobile_bottom', 'default', 'Profile', 'User', 'tab', 'profile', 'none', NULL, 5, true),
  ('nav_male_user_persona_menu_default_status_online', 'male_user', 'persona_menu', 'default', 'Available', 'Circle', 'system', 'status_online', 'none', NULL, 1, true),
  ('nav_male_user_persona_menu_default_status_busy', 'male_user', 'persona_menu', 'default', 'Busy', 'Circle', 'system', 'status_busy', 'none', NULL, 2, true),
  ('nav_male_user_persona_menu_default_status_offline', 'male_user', 'persona_menu', 'default', 'Offline', 'Circle', 'system', 'status_offline', 'none', NULL, 3, true),
  ('nav_male_user_persona_menu_default_store', 'male_user', 'persona_menu', 'default', 'Top Up', 'Coins', 'modal', 'store', 'coin_balance', NULL, 4, true),
  ('nav_male_user_persona_menu_default_profile', 'male_user', 'persona_menu', 'default', 'Profile', 'User', 'tab', 'profile', 'none', NULL, 5, true),
  ('nav_male_user_persona_menu_default_earnings', 'male_user', 'persona_menu', 'default', 'Spending & Analytics', 'TrendingUp', 'tab', 'earnings', 'none', NULL, 6, true),
  ('nav_male_user_persona_menu_default_social_circle', 'male_user', 'persona_menu', 'default', 'Friends & Social Circle', 'Users', 'overlay', 'social_circle', 'none', NULL, 7, true),
  ('nav_male_user_persona_menu_default_install_pwa', 'male_user', 'persona_menu', 'default', 'Install LiveCall PWA App', 'Download', 'system', 'install_pwa', 'none', NULL, 8, true),
  ('nav_male_user_persona_menu_default_logout', 'male_user', 'persona_menu', 'default', 'Log Out', 'LogOut', 'system', 'logout', 'none', NULL, 9, true),
  ('nav_female_user_main_header_left_home', 'female_user', 'main_header', 'left', 'Home', 'Home', 'tab', 'home', 'none', NULL, 1, true),
  ('nav_female_user_main_header_right_daily_rewards', 'female_user', 'main_header', 'right', 'Rewards', 'Gift', 'modal', 'daily_rewards', 'unclaimed_rewards', NULL, 1, true),
  ('nav_female_user_subheader_default_discovery', 'female_user', 'subheader', 'default', 'Discover', 'LayoutGrid', 'tab', 'discovery', 'none', '{"group":"primary"}'::jsonb, 1, true),
  ('nav_female_user_subheader_default_swipe', 'female_user', 'subheader', 'default', 'Swipe', 'Layers', 'tab', 'swipe', 'none', '{"group":"primary"}'::jsonb, 2, true),
  ('nav_female_user_subheader_default_moments', 'female_user', 'subheader', 'default', 'Moments', 'Image', 'tab', 'moments', 'none', '{"group":"primary"}'::jsonb, 3, true),
  ('nav_female_user_subheader_default_match', 'female_user', 'subheader', 'default', 'Match', 'Zap', 'overlay', 'match', 'none', '{"group":"primary"}'::jsonb, 4, true),
  ('nav_female_user_subheader_default_chat', 'female_user', 'subheader', 'default', 'Chat', 'MessageCircle', 'overlay', 'chat', 'unread_messages', '{"group":"primary"}'::jsonb, 5, true),
  ('nav_female_user_subheader_default_call_logs', 'female_user', 'subheader', 'default', 'Calls', 'PhoneCall', 'tab', 'call_logs', 'missed_calls', '{"group":"secondary"}'::jsonb, 6, true),
  ('nav_female_user_subheader_default_friend_requests', 'female_user', 'subheader', 'default', 'Friends', 'UserPlus', 'overlay', 'friend_requests', 'friend_requests', '{"group":"secondary"}'::jsonb, 7, true),
  ('nav_female_user_subheader_default_social_circle', 'female_user', 'subheader', 'default', 'Circle', 'Users', 'overlay', 'social_circle', 'none', '{"group":"secondary"}'::jsonb, 8, true),
  ('nav_female_user_mobile_bottom_default_home', 'female_user', 'mobile_bottom', 'default', 'Home', 'Home', 'tab', 'home', 'none', NULL, 1, true),
  ('nav_female_user_mobile_bottom_default_discovery', 'female_user', 'mobile_bottom', 'default', 'Discover', 'Compass', 'tab', 'discovery', 'none', NULL, 2, true),
  ('nav_female_user_mobile_bottom_default_match', 'female_user', 'mobile_bottom', 'default', 'Match', 'Flame', 'overlay', 'match', 'none', NULL, 3, true),
  ('nav_female_user_mobile_bottom_default_chat', 'female_user', 'mobile_bottom', 'default', 'Chat', 'MessageCircle', 'overlay', 'chat', 'unread_messages', NULL, 4, true),
  ('nav_female_user_mobile_bottom_default_profile', 'female_user', 'mobile_bottom', 'default', 'Profile', 'User', 'tab', 'profile', 'none', NULL, 5, true),
  ('nav_female_user_mobile_bottom_default_call_logs', 'female_user', 'mobile_bottom', 'default', 'Logs', 'PhoneCall', 'tab', 'call_logs', 'missed_calls', NULL, 6, true),
  ('nav_female_user_persona_menu_default_status_online', 'female_user', 'persona_menu', 'default', 'Available', 'Circle', 'system', 'status_online', 'none', NULL, 1, true),
  ('nav_female_user_persona_menu_default_status_busy', 'female_user', 'persona_menu', 'default', 'Busy', 'Circle', 'system', 'status_busy', 'none', NULL, 2, true),
  ('nav_female_user_persona_menu_default_status_offline', 'female_user', 'persona_menu', 'default', 'Offline', 'Circle', 'system', 'status_offline', 'none', NULL, 3, true),
  ('nav_female_user_persona_menu_default_profile', 'female_user', 'persona_menu', 'default', 'Profile', 'User', 'tab', 'profile', 'none', NULL, 4, true),
  ('nav_female_user_persona_menu_default_earnings', 'female_user', 'persona_menu', 'default', 'Activity & Performance', 'DollarSign', 'tab', 'earnings', 'none', NULL, 5, true),
  ('nav_female_user_persona_menu_default_social_circle', 'female_user', 'persona_menu', 'default', 'Friends & Social Circle', 'Users', 'overlay', 'social_circle', 'none', NULL, 6, true),
  ('nav_female_user_persona_menu_default_install_pwa', 'female_user', 'persona_menu', 'default', 'Install LiveCall PWA App', 'Download', 'system', 'install_pwa', 'none', NULL, 7, true),
  ('nav_female_user_persona_menu_default_logout', 'female_user', 'persona_menu', 'default', 'Log Out', 'LogOut', 'system', 'logout', 'none', NULL, 8, true),
  ('nav_female_host_main_header_left_home', 'female_host', 'main_header', 'left', 'Home', 'Home', 'tab', 'home', 'none', NULL, 1, true),
  ('nav_female_host_main_header_right_daily_rewards', 'female_host', 'main_header', 'right', 'Rewards', 'Gift', 'modal', 'daily_rewards', 'unclaimed_rewards', NULL, 1, true),
  ('nav_female_host_subheader_default_discovery', 'female_host', 'subheader', 'default', 'Discover', 'LayoutGrid', 'tab', 'discovery', 'none', '{"group":"primary"}'::jsonb, 1, true),
  ('nav_female_host_subheader_default_swipe', 'female_host', 'subheader', 'default', 'Swipe', 'Layers', 'tab', 'swipe', 'none', '{"group":"primary"}'::jsonb, 2, true),
  ('nav_female_host_subheader_default_moments', 'female_host', 'subheader', 'default', 'Moments', 'Image', 'tab', 'moments', 'none', '{"group":"primary"}'::jsonb, 3, true),
  ('nav_female_host_subheader_default_match', 'female_host', 'subheader', 'default', 'Match', 'Zap', 'overlay', 'match', 'none', '{"group":"primary"}'::jsonb, 4, true),
  ('nav_female_host_subheader_default_chat', 'female_host', 'subheader', 'default', 'Chat', 'MessageCircle', 'overlay', 'chat', 'unread_messages', '{"group":"primary"}'::jsonb, 5, true),
  ('nav_female_host_subheader_default_call_logs', 'female_host', 'subheader', 'default', 'Calls', 'PhoneCall', 'tab', 'call_logs', 'missed_calls', '{"group":"secondary"}'::jsonb, 6, true),
  ('nav_female_host_subheader_default_friend_requests', 'female_host', 'subheader', 'default', 'Friends', 'UserPlus', 'overlay', 'friend_requests', 'friend_requests', '{"group":"secondary"}'::jsonb, 7, true),
  ('nav_female_host_subheader_default_social_circle', 'female_host', 'subheader', 'default', 'Circle', 'Users', 'overlay', 'social_circle', 'none', '{"group":"secondary"}'::jsonb, 8, true),
  ('nav_female_host_mobile_bottom_default_home', 'female_host', 'mobile_bottom', 'default', 'Home', 'Home', 'tab', 'home', 'none', NULL, 1, true),
  ('nav_female_host_mobile_bottom_default_discovery', 'female_host', 'mobile_bottom', 'default', 'Discover', 'Compass', 'tab', 'discovery', 'none', NULL, 2, true),
  ('nav_female_host_mobile_bottom_default_match', 'female_host', 'mobile_bottom', 'default', 'Match', 'Flame', 'overlay', 'match', 'none', NULL, 3, true),
  ('nav_female_host_mobile_bottom_default_chat', 'female_host', 'mobile_bottom', 'default', 'Chat', 'MessageCircle', 'overlay', 'chat', 'unread_messages', NULL, 4, true),
  ('nav_female_host_mobile_bottom_default_profile', 'female_host', 'mobile_bottom', 'default', 'Profile', 'User', 'tab', 'profile', 'none', NULL, 5, true),
  ('nav_female_host_mobile_bottom_default_call_logs', 'female_host', 'mobile_bottom', 'default', 'Logs', 'PhoneCall', 'tab', 'call_logs', 'missed_calls', NULL, 6, true),
  ('nav_female_host_persona_menu_default_status_online', 'female_host', 'persona_menu', 'default', 'Available', 'Circle', 'system', 'status_online', 'none', NULL, 1, true),
  ('nav_female_host_persona_menu_default_status_busy', 'female_host', 'persona_menu', 'default', 'Busy', 'Circle', 'system', 'status_busy', 'none', NULL, 2, true),
  ('nav_female_host_persona_menu_default_status_offline', 'female_host', 'persona_menu', 'default', 'Offline', 'Circle', 'system', 'status_offline', 'none', NULL, 3, true),
  ('nav_female_host_persona_menu_default_profile', 'female_host', 'persona_menu', 'default', 'Profile', 'User', 'tab', 'profile', 'none', NULL, 4, true),
  ('nav_female_host_persona_menu_default_earnings', 'female_host', 'persona_menu', 'default', 'Earnings & Analytics', 'DollarSign', 'tab', 'earnings', 'none', NULL, 5, true),
  ('nav_female_host_persona_menu_default_social_circle', 'female_host', 'persona_menu', 'default', 'Friends & Social Circle', 'Users', 'overlay', 'social_circle', 'none', NULL, 6, true),
  ('nav_female_host_persona_menu_default_install_pwa', 'female_host', 'persona_menu', 'default', 'Install LiveCall PWA App', 'Download', 'system', 'install_pwa', 'none', NULL, 7, true),
  ('nav_female_host_persona_menu_default_logout', 'female_host', 'persona_menu', 'default', 'Log Out', 'LogOut', 'system', 'logout', 'none', NULL, 8, true)

ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 11. FEED POSTS & CREATOR MOMENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.feed_posts (
    id TEXT PRIMARY KEY,
    creator_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    creator_name TEXT NOT NULL,
    creator_avatar TEXT,
    media_url TEXT NOT NULL,
    media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')) DEFAULT 'image',
    caption TEXT DEFAULT '',
    likes INT DEFAULT 0,
    comments_count INT DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feed_posts_creator ON public.feed_posts(creator_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.feed_post_likes (
    post_id TEXT NOT NULL REFERENCES public.feed_posts(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (post_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_feed_post_likes_user ON public.feed_post_likes(user_id, created_at DESC);

-- ============================================================================
-- 12. COIN PACKAGES & STORE SKUS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.coin_packages (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    coins INT NOT NULL,
    bonus_coins INT DEFAULT 0,
    price_usd NUMERIC NOT NULL,
    discount_price_usd NUMERIC NULL,
    approx_call_minutes INT NULL,
    saving_label TEXT NULL,
    badge_tag TEXT,
    popular BOOLEAN DEFAULT false,
    order_num INT DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.coin_packages ADD COLUMN IF NOT EXISTS discount_price_usd NUMERIC NULL;
ALTER TABLE public.coin_packages ADD COLUMN IF NOT EXISTS approx_call_minutes INT NULL;
ALTER TABLE public.coin_packages ADD COLUMN IF NOT EXISTS saving_label TEXT NULL;

-- ============================================================================
-- 13. FAVORITES, BLOCKED USERS & CREATOR GOALS TABLES
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.favorites (
    user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    favorite_user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, favorite_user_id)
);

CREATE TABLE IF NOT EXISTS public.blocked_users (
    user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    blocked_user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, blocked_user_id)
);

CREATE TABLE IF NOT EXISTS public.creator_goals (
    creator_id TEXT PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    current_coins INT DEFAULT 0,
    target_coins INT NOT NULL DEFAULT 10000,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 13b. CREATOR METRICS (server-owned online hours, Ready Now, tiers)
-- Writes MUST go through Express + service role. Clients may SELECT only.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.creator_metrics (
    creator_id TEXT PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    agency_leader_id TEXT REFERENCES public.profiles(id) ON DELETE SET NULL,
    active_online_seconds BIGINT NOT NULL DEFAULT 0,
    active_online_hours NUMERIC NOT NULL DEFAULT 0,
    coins_earned_from_calls BIGINT NOT NULL DEFAULT 0,
    coins_earned_from_gifts BIGINT NOT NULL DEFAULT 0,
    total_target_coins BIGINT NOT NULL DEFAULT 0,
    current_streak_days INT NOT NULL DEFAULT 0,
    streak_boost_until TIMESTAMPTZ,
    last_active_date DATE,
    first_call_bonus_claimed_date DATE,
    total_calls_offered INT NOT NULL DEFAULT 0,
    total_calls_answered INT NOT NULL DEFAULT 0,
    total_calls_declined INT NOT NULL DEFAULT 0,
    total_calls_missed INT NOT NULL DEFAULT 0,
    response_health_score NUMERIC NOT NULL DEFAULT 100,
    performance_tier TEXT NOT NULL DEFAULT 'bronze' CHECK (performance_tier IN ('bronze', 'silver', 'gold')),
    is_ready_now_active BOOLEAN NOT NULL DEFAULT false,
    ready_now_toggled_at TIMESTAMPTZ,
    target_period_start DATE,
    target_period_end DATE,
    bonus_earned_coins BIGINT NOT NULL DEFAULT 0,
    bonus_earned_usd NUMERIC NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT creator_metrics_creator_id_unique UNIQUE (creator_id)
);

ALTER TABLE public.creator_metrics ADD COLUMN IF NOT EXISTS agency_leader_id TEXT REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.creator_metrics ADD COLUMN IF NOT EXISTS active_online_seconds BIGINT DEFAULT 0;
ALTER TABLE public.creator_metrics ADD COLUMN IF NOT EXISTS active_online_hours NUMERIC DEFAULT 0;
ALTER TABLE public.creator_metrics ADD COLUMN IF NOT EXISTS coins_earned_from_calls BIGINT DEFAULT 0;
ALTER TABLE public.creator_metrics ADD COLUMN IF NOT EXISTS coins_earned_from_gifts BIGINT DEFAULT 0;
ALTER TABLE public.creator_metrics ADD COLUMN IF NOT EXISTS total_target_coins BIGINT DEFAULT 0;
ALTER TABLE public.creator_metrics ADD COLUMN IF NOT EXISTS current_streak_days INT DEFAULT 0;
ALTER TABLE public.creator_metrics ADD COLUMN IF NOT EXISTS streak_boost_until TIMESTAMPTZ;
ALTER TABLE public.creator_metrics ADD COLUMN IF NOT EXISTS last_active_date DATE;
ALTER TABLE public.creator_metrics ADD COLUMN IF NOT EXISTS first_call_bonus_claimed_date DATE;
ALTER TABLE public.creator_metrics ADD COLUMN IF NOT EXISTS total_calls_offered INT DEFAULT 0;
ALTER TABLE public.creator_metrics ADD COLUMN IF NOT EXISTS total_calls_answered INT DEFAULT 0;
ALTER TABLE public.creator_metrics ADD COLUMN IF NOT EXISTS total_calls_declined INT DEFAULT 0;
ALTER TABLE public.creator_metrics ADD COLUMN IF NOT EXISTS total_calls_missed INT DEFAULT 0;
ALTER TABLE public.creator_metrics ADD COLUMN IF NOT EXISTS response_health_score NUMERIC DEFAULT 100;
ALTER TABLE public.creator_metrics ADD COLUMN IF NOT EXISTS performance_tier TEXT DEFAULT 'bronze';
ALTER TABLE public.creator_metrics ADD COLUMN IF NOT EXISTS is_ready_now_active BOOLEAN DEFAULT false;
ALTER TABLE public.creator_metrics ADD COLUMN IF NOT EXISTS ready_now_toggled_at TIMESTAMPTZ;
ALTER TABLE public.creator_metrics ADD COLUMN IF NOT EXISTS target_period_start DATE;
ALTER TABLE public.creator_metrics ADD COLUMN IF NOT EXISTS target_period_end DATE;
ALTER TABLE public.creator_metrics ADD COLUMN IF NOT EXISTS bonus_earned_coins BIGINT DEFAULT 0;
ALTER TABLE public.creator_metrics ADD COLUMN IF NOT EXISTS bonus_earned_usd NUMERIC DEFAULT 0;
ALTER TABLE public.creator_metrics ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.creator_metrics ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

DO $$
BEGIN
    ALTER TABLE public.creator_metrics DROP CONSTRAINT IF EXISTS creator_metrics_performance_tier_check;
    ALTER TABLE public.creator_metrics
        ADD CONSTRAINT creator_metrics_performance_tier_check
        CHECK (performance_tier IN ('bronze', 'silver', 'gold'));
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_creator_metrics_agency_leader ON public.creator_metrics(agency_leader_id);
CREATE INDEX IF NOT EXISTS idx_creator_metrics_ready_now ON public.creator_metrics(is_ready_now_active) WHERE is_ready_now_active = true;
CREATE INDEX IF NOT EXISTS idx_creator_metrics_tier ON public.creator_metrics(performance_tier);
CREATE INDEX IF NOT EXISTS idx_profiles_last_seen_at ON public.profiles(last_seen_at);

-- ============================================================================
-- 14. USER DAILY REWARDS & ACTIVITY QUESTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_daily_rewards (
    user_id TEXT PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    last_login_date DATE NOT NULL DEFAULT CURRENT_DATE,
    streak_count INT NOT NULL DEFAULT 1,
    streak_claimed_date DATE,
    tasks_date DATE NOT NULL DEFAULT CURRENT_DATE,
    task_chat_friends TEXT[] NOT NULL DEFAULT '{}',
    task_chat_claimed BOOLEAN NOT NULL DEFAULT false,
    task_quick_matches INT NOT NULL DEFAULT 0,
    task_quick_match_claimed BOOLEAN NOT NULL DEFAULT false,
    task_video_call_seconds INT NOT NULL DEFAULT 0,
    task_video_call_claimed BOOLEAN NOT NULL DEFAULT false,
    task_moment_interactions INT NOT NULL DEFAULT 0,
    task_moment_claimed BOOLEAN NOT NULL DEFAULT false,
    task_gift_count INT NOT NULL DEFAULT 0,
    task_gift_claimed BOOLEAN NOT NULL DEFAULT false,
    master_chest_claimed BOOLEAN NOT NULL DEFAULT false,
    total_coins_earned BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_daily_rewards ADD COLUMN IF NOT EXISTS last_login_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE public.user_daily_rewards ADD COLUMN IF NOT EXISTS streak_count INT DEFAULT 1;
ALTER TABLE public.user_daily_rewards ADD COLUMN IF NOT EXISTS streak_claimed_date DATE;
ALTER TABLE public.user_daily_rewards ADD COLUMN IF NOT EXISTS tasks_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE public.user_daily_rewards ADD COLUMN IF NOT EXISTS task_chat_friends TEXT[] DEFAULT '{}';
ALTER TABLE public.user_daily_rewards ADD COLUMN IF NOT EXISTS task_chat_claimed BOOLEAN DEFAULT false;
ALTER TABLE public.user_daily_rewards ADD COLUMN IF NOT EXISTS task_quick_matches INT DEFAULT 0;
ALTER TABLE public.user_daily_rewards ADD COLUMN IF NOT EXISTS task_quick_match_claimed BOOLEAN DEFAULT false;
ALTER TABLE public.user_daily_rewards ADD COLUMN IF NOT EXISTS task_video_call_seconds INT DEFAULT 0;
ALTER TABLE public.user_daily_rewards ADD COLUMN IF NOT EXISTS task_video_call_claimed BOOLEAN DEFAULT false;
ALTER TABLE public.user_daily_rewards ADD COLUMN IF NOT EXISTS task_moment_interactions INT DEFAULT 0;
ALTER TABLE public.user_daily_rewards ADD COLUMN IF NOT EXISTS task_moment_claimed BOOLEAN DEFAULT false;
ALTER TABLE public.user_daily_rewards ADD COLUMN IF NOT EXISTS task_gift_count INT DEFAULT 0;
ALTER TABLE public.user_daily_rewards ADD COLUMN IF NOT EXISTS task_gift_claimed BOOLEAN DEFAULT false;
ALTER TABLE public.user_daily_rewards ADD COLUMN IF NOT EXISTS master_chest_claimed BOOLEAN DEFAULT false;
ALTER TABLE public.user_daily_rewards ADD COLUMN IF NOT EXISTS total_coins_earned BIGINT DEFAULT 0;

-- Ensure video call seconds column comment (progress unit = seconds)
COMMENT ON COLUMN public.user_daily_rewards.task_video_call_seconds IS
  'Accumulated 1-on-1 video call seconds for daily mission. Target in daily_missions_config.videoCall.target is also seconds. UI may display minutes (seconds/60).';


-- ============================================================================
-- 15. ROW LEVEL SECURITY (RLS) POLICIES (Full Public & Authenticated Access)
-- ============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_conversation_clears ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.country_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.language_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zodiac_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interest_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.currency_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cms_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_banners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_quick_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coin_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_daily_rewards ENABLE ROW LEVEL SECURITY;

-- Financial Module RLS is enabled after CREATE TABLE (section 16.55), not here ?
-- those relations are defined later in this file.

-- Replace permissive "Public full access" policies with command-specific policies.
-- Goal: prevent destructive DELETE operations from being executed by non-admin clients.
-- SELECT remains public for discovery. INSERT/UPDATE remain authenticated-only to reduce anonymous abuse.
-- DELETE is restricted:
--   - admin-only for most tables
--   - owner-or-admin for favorites & blocked_users
--   - participant policies for friend_requests (hardened in section 19+)

-- Shared admin predicate used in multiple DELETE policies
-- (admin@livecall.app is also checked for environments where profiles.role may drift)
--
-- NOTE: RLS policies cannot define variables; we inline the predicate.

DROP POLICY IF EXISTS "Public full access to profiles" ON public.profiles;
DROP POLICY IF EXISTS "Public full access to matches" ON public.matches;
DROP POLICY IF EXISTS "Public full access to messages" ON public.messages;
DROP POLICY IF EXISTS "Public full access to call_logs" ON public.call_logs;
DROP POLICY IF EXISTS "Public full access to friend_requests" ON public.friend_requests;
DROP POLICY IF EXISTS "Public full access to payout_requests" ON public.payout_requests;
DROP POLICY IF EXISTS "Public full access to country_configs" ON public.country_configs;
DROP POLICY IF EXISTS "Public full access to language_configs" ON public.language_configs;
DROP POLICY IF EXISTS "Public full access to currency_configs" ON public.currency_configs;
DROP POLICY IF EXISTS "Public full access to zodiac_configs" ON public.zodiac_configs;
DROP POLICY IF EXISTS "Public full access to interest_configs" ON public.interest_configs;
DROP POLICY IF EXISTS "Public full access to system_configs" ON public.system_configs;
DROP POLICY IF EXISTS "Public full access to moderation_reports" ON public.moderation_reports;
DROP POLICY IF EXISTS "Public full access to cms_policies" ON public.cms_policies;
DROP POLICY IF EXISTS "Public full access to home_banners" ON public.home_banners;
DROP POLICY IF EXISTS "Public full access to home_quick_links" ON public.home_quick_links;
DROP POLICY IF EXISTS "Public full access to feed_posts" ON public.feed_posts;
DROP POLICY IF EXISTS "Public full access to coin_packages" ON public.coin_packages;
DROP POLICY IF EXISTS "Public full access to favorites" ON public.favorites;
DROP POLICY IF EXISTS "Public full access to blocked_users" ON public.blocked_users;
DROP POLICY IF EXISTS "Public full access to creator_goals" ON public.creator_goals;
DROP POLICY IF EXISTS "Public full access to user_daily_rewards" ON public.user_daily_rewards;

-- Drop current command-specific policies so re-runs are idempotent
DROP POLICY IF EXISTS "public select profiles" ON public.profiles;
DROP POLICY IF EXISTS "authenticated insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "authenticated update profiles" ON public.profiles;
DROP POLICY IF EXISTS "admin delete profiles" ON public.profiles;
DROP POLICY IF EXISTS "authenticated select profiles" ON public.profiles;
DROP POLICY IF EXISTS "owner insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "owner update profiles" ON public.profiles;

DROP POLICY IF EXISTS "public select matches" ON public.matches;
DROP POLICY IF EXISTS "authenticated insert matches" ON public.matches;
DROP POLICY IF EXISTS "authenticated update matches" ON public.matches;
DROP POLICY IF EXISTS "admin delete matches" ON public.matches;

DROP POLICY IF EXISTS "public select messages" ON public.messages;
DROP POLICY IF EXISTS "authenticated insert messages" ON public.messages;
DROP POLICY IF EXISTS "authenticated update messages" ON public.messages;
DROP POLICY IF EXISTS "admin delete messages" ON public.messages;
DROP POLICY IF EXISTS "participants select messages" ON public.messages;
DROP POLICY IF EXISTS "sender insert messages" ON public.messages;
DROP POLICY IF EXISTS "participants update messages" ON public.messages;

DROP POLICY IF EXISTS "public select call_logs" ON public.call_logs;
DROP POLICY IF EXISTS "authenticated insert call_logs" ON public.call_logs;
DROP POLICY IF EXISTS "authenticated update call_logs" ON public.call_logs;
DROP POLICY IF EXISTS "admin delete call_logs" ON public.call_logs;
DROP POLICY IF EXISTS "participants select call_logs" ON public.call_logs;
DROP POLICY IF EXISTS "admin insert call_logs" ON public.call_logs;
DROP POLICY IF EXISTS "admin update call_logs" ON public.call_logs;

DROP POLICY IF EXISTS "public select friend_requests" ON public.friend_requests;
DROP POLICY IF EXISTS "authenticated insert friend_requests" ON public.friend_requests;
DROP POLICY IF EXISTS "authenticated update friend_requests" ON public.friend_requests;
DROP POLICY IF EXISTS "admin delete friend_requests" ON public.friend_requests;

DROP POLICY IF EXISTS "public select payout_requests" ON public.payout_requests;
DROP POLICY IF EXISTS "authenticated insert payout_requests" ON public.payout_requests;
DROP POLICY IF EXISTS "authenticated update payout_requests" ON public.payout_requests;
DROP POLICY IF EXISTS "admin delete payout_requests" ON public.payout_requests;
DROP POLICY IF EXISTS "owner select payout_requests" ON public.payout_requests;
DROP POLICY IF EXISTS "owner insert payout_requests" ON public.payout_requests;
DROP POLICY IF EXISTS "admin update payout_requests" ON public.payout_requests;

DROP POLICY IF EXISTS "public select country_configs" ON public.country_configs;
DROP POLICY IF EXISTS "authenticated insert country_configs" ON public.country_configs;
DROP POLICY IF EXISTS "authenticated update country_configs" ON public.country_configs;
DROP POLICY IF EXISTS "admin delete country_configs" ON public.country_configs;

DROP POLICY IF EXISTS "public select language_configs" ON public.language_configs;
DROP POLICY IF EXISTS "authenticated insert language_configs" ON public.language_configs;
DROP POLICY IF EXISTS "authenticated update language_configs" ON public.language_configs;
DROP POLICY IF EXISTS "admin delete language_configs" ON public.language_configs;

DROP POLICY IF EXISTS "public select zodiac_configs" ON public.zodiac_configs;
DROP POLICY IF EXISTS "authenticated insert zodiac_configs" ON public.zodiac_configs;
DROP POLICY IF EXISTS "authenticated update zodiac_configs" ON public.zodiac_configs;
DROP POLICY IF EXISTS "admin delete zodiac_configs" ON public.zodiac_configs;

DROP POLICY IF EXISTS "public select interest_configs" ON public.interest_configs;
DROP POLICY IF EXISTS "authenticated insert interest_configs" ON public.interest_configs;
DROP POLICY IF EXISTS "authenticated update interest_configs" ON public.interest_configs;
DROP POLICY IF EXISTS "admin delete interest_configs" ON public.interest_configs;

DROP POLICY IF EXISTS "public select currency_configs" ON public.currency_configs;
DROP POLICY IF EXISTS "authenticated insert currency_configs" ON public.currency_configs;
DROP POLICY IF EXISTS "authenticated update currency_configs" ON public.currency_configs;
DROP POLICY IF EXISTS "admin delete currency_configs" ON public.currency_configs;

DROP POLICY IF EXISTS "public select system_configs" ON public.system_configs;
DROP POLICY IF EXISTS "authenticated insert system_configs" ON public.system_configs;
DROP POLICY IF EXISTS "authenticated update system_configs" ON public.system_configs;
DROP POLICY IF EXISTS "admin delete system_configs" ON public.system_configs;
DROP POLICY IF EXISTS "admin write system_configs" ON public.system_configs;

DROP POLICY IF EXISTS "public select moderation_reports" ON public.moderation_reports;
DROP POLICY IF EXISTS "authenticated insert moderation_reports" ON public.moderation_reports;
DROP POLICY IF EXISTS "authenticated update moderation_reports" ON public.moderation_reports;
DROP POLICY IF EXISTS "admin delete moderation_reports" ON public.moderation_reports;

DROP POLICY IF EXISTS "public select cms_policies" ON public.cms_policies;
DROP POLICY IF EXISTS "authenticated insert cms_policies" ON public.cms_policies;
DROP POLICY IF EXISTS "authenticated update cms_policies" ON public.cms_policies;
DROP POLICY IF EXISTS "admin delete cms_policies" ON public.cms_policies;

DROP POLICY IF EXISTS "public select home_banners" ON public.home_banners;
DROP POLICY IF EXISTS "authenticated insert home_banners" ON public.home_banners;
DROP POLICY IF EXISTS "authenticated update home_banners" ON public.home_banners;
DROP POLICY IF EXISTS "admin delete home_banners" ON public.home_banners;

DROP POLICY IF EXISTS "public select home_quick_links" ON public.home_quick_links;
DROP POLICY IF EXISTS "authenticated insert home_quick_links" ON public.home_quick_links;
DROP POLICY IF EXISTS "authenticated update home_quick_links" ON public.home_quick_links;
DROP POLICY IF EXISTS "admin delete home_quick_links" ON public.home_quick_links;

DROP POLICY IF EXISTS "public select feed_posts" ON public.feed_posts;
DROP POLICY IF EXISTS "authenticated insert feed_posts" ON public.feed_posts;
DROP POLICY IF EXISTS "authenticated update feed_posts" ON public.feed_posts;
DROP POLICY IF EXISTS "admin delete feed_posts" ON public.feed_posts;
DROP POLICY IF EXISTS "owner insert feed_posts" ON public.feed_posts;
DROP POLICY IF EXISTS "owner update feed_posts" ON public.feed_posts;
DROP POLICY IF EXISTS "owner delete feed_posts" ON public.feed_posts;

DROP POLICY IF EXISTS "public select feed_post_likes" ON public.feed_post_likes;
DROP POLICY IF EXISTS "owner select feed_post_likes" ON public.feed_post_likes;
DROP POLICY IF EXISTS "owner insert feed_post_likes" ON public.feed_post_likes;
DROP POLICY IF EXISTS "owner delete feed_post_likes" ON public.feed_post_likes;

DROP POLICY IF EXISTS "public select coin_packages" ON public.coin_packages;
DROP POLICY IF EXISTS "authenticated insert coin_packages" ON public.coin_packages;
DROP POLICY IF EXISTS "authenticated update coin_packages" ON public.coin_packages;
DROP POLICY IF EXISTS "admin delete coin_packages" ON public.coin_packages;

DROP POLICY IF EXISTS "public select favorites" ON public.favorites;
DROP POLICY IF EXISTS "authenticated insert favorites" ON public.favorites;
DROP POLICY IF EXISTS "authenticated update favorites" ON public.favorites;
DROP POLICY IF EXISTS "owner/admin delete favorites" ON public.favorites;

DROP POLICY IF EXISTS "public select blocked_users" ON public.blocked_users;
DROP POLICY IF EXISTS "authenticated insert blocked_users" ON public.blocked_users;
DROP POLICY IF EXISTS "authenticated update blocked_users" ON public.blocked_users;
DROP POLICY IF EXISTS "owner/admin delete blocked_users" ON public.blocked_users;

DROP POLICY IF EXISTS "public select creator_goals" ON public.creator_goals;
DROP POLICY IF EXISTS "authenticated insert creator_goals" ON public.creator_goals;
DROP POLICY IF EXISTS "authenticated update creator_goals" ON public.creator_goals;
DROP POLICY IF EXISTS "admin delete creator_goals" ON public.creator_goals;

DROP POLICY IF EXISTS "creator_metrics select own" ON public.creator_metrics;
DROP POLICY IF EXISTS "creator_metrics select agency" ON public.creator_metrics;
DROP POLICY IF EXISTS "creator_metrics select admin" ON public.creator_metrics;
DROP POLICY IF EXISTS "public select creator_metrics" ON public.creator_metrics;
DROP POLICY IF EXISTS "authenticated insert creator_metrics" ON public.creator_metrics;
DROP POLICY IF EXISTS "authenticated update creator_metrics" ON public.creator_metrics;
DROP POLICY IF EXISTS "admin delete creator_metrics" ON public.creator_metrics;

DROP POLICY IF EXISTS "public select user_daily_rewards" ON public.user_daily_rewards;
DROP POLICY IF EXISTS "authenticated insert user_daily_rewards" ON public.user_daily_rewards;
DROP POLICY IF EXISTS "authenticated update user_daily_rewards" ON public.user_daily_rewards;
DROP POLICY IF EXISTS "admin delete user_daily_rewards" ON public.user_daily_rewards;

-- PROFILES
CREATE POLICY "public select profiles" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "authenticated insert profiles" ON public.profiles FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "authenticated update profiles" ON public.profiles FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "admin delete profiles" ON public.profiles
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.role = 'admin'
        AND (
          p.auth_id = auth.uid()
          OR p.id = auth.uid()::text
          OR (p.email IS NOT NULL AND lower(p.email) = 'admin@livecall.app')
        )
    )
  );

-- MATCHES
-- Semantics (app-enforced via Express; RLS restricts row visibility/writes to participants):
--   pending  = one-sided swipe like (initiated_by = liker); NOT a mutual match
--   matched  = mutual like OR successful Quick Match connection
--   rejected = swipe pass / reject (same profile should not immediately reshown)
--   unmatched = previously matched then dissolved
CREATE POLICY "public select matches" ON public.matches FOR SELECT USING (true);
CREATE POLICY "authenticated insert matches" ON public.matches FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "authenticated update matches" ON public.matches FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "admin delete matches" ON public.matches
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.role = 'admin'
        AND (
          p.auth_id = auth.uid()
          OR p.id = auth.uid()::text
          OR (p.email IS NOT NULL AND lower(p.email) = 'admin@livecall.app')
        )
    )
  );

-- MESSAGES
CREATE POLICY "public select messages" ON public.messages FOR SELECT USING (true);
CREATE POLICY "authenticated insert messages" ON public.messages FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "authenticated update messages" ON public.messages FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "admin delete messages" ON public.messages
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.role = 'admin'
        AND (
          p.auth_id = auth.uid()
          OR p.id = auth.uid()::text
          OR (p.email IS NOT NULL AND lower(p.email) = 'admin@livecall.app')
        )
    )
  );

-- CALL LOGS
CREATE POLICY "public select call_logs" ON public.call_logs FOR SELECT USING (true);
CREATE POLICY "authenticated insert call_logs" ON public.call_logs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "authenticated update call_logs" ON public.call_logs FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "admin delete call_logs" ON public.call_logs
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.role = 'admin'
        AND (
          p.auth_id = auth.uid()
          OR p.id = auth.uid()::text
          OR (p.email IS NOT NULL AND lower(p.email) = 'admin@livecall.app')
        )
    )
  );

-- FRIEND REQUESTS
CREATE POLICY "public select friend_requests" ON public.friend_requests FOR SELECT USING (true);
CREATE POLICY "authenticated insert friend_requests" ON public.friend_requests FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "authenticated update friend_requests" ON public.friend_requests FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "admin delete friend_requests" ON public.friend_requests
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.role = 'admin'
        AND (
          p.auth_id = auth.uid()
          OR p.id = auth.uid()::text
          OR (p.email IS NOT NULL AND lower(p.email) = 'admin@livecall.app')
        )
    )
  );

-- PAYOUT REQUESTS (Phase 7: SELECT/DELETE only ? no client INSERT/UPDATE)
CREATE POLICY "public select payout_requests" ON public.payout_requests FOR SELECT USING (true);
CREATE POLICY "admin delete payout_requests" ON public.payout_requests
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.role = 'admin'
        AND (
          p.auth_id = auth.uid()
          OR p.id = auth.uid()::text
          OR (p.email IS NOT NULL AND lower(p.email) = 'admin@livecall.app')
        )
    )
  );

-- CONFIG / TAXONOMY TABLES
CREATE POLICY "public select country_configs" ON public.country_configs FOR SELECT USING (true);
CREATE POLICY "authenticated insert country_configs" ON public.country_configs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "authenticated update country_configs" ON public.country_configs FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "admin delete country_configs" ON public.country_configs
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.role = 'admin'
        AND (
          p.auth_id = auth.uid()
          OR p.id = auth.uid()::text
          OR (p.email IS NOT NULL AND lower(p.email) = 'admin@livecall.app')
        )
    )
  );

CREATE POLICY "public select language_configs" ON public.language_configs FOR SELECT USING (true);
CREATE POLICY "authenticated insert language_configs" ON public.language_configs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "authenticated update language_configs" ON public.language_configs FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "admin delete language_configs" ON public.language_configs
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.role = 'admin'
        AND (
          p.auth_id = auth.uid()
          OR p.id = auth.uid()::text
          OR (p.email IS NOT NULL AND lower(p.email) = 'admin@livecall.app')
        )
    )
  );

CREATE POLICY "public select zodiac_configs" ON public.zodiac_configs FOR SELECT USING (true);
CREATE POLICY "authenticated insert zodiac_configs" ON public.zodiac_configs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "authenticated update zodiac_configs" ON public.zodiac_configs FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "admin delete zodiac_configs" ON public.zodiac_configs
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.role = 'admin'
        AND (
          p.auth_id = auth.uid()
          OR p.id = auth.uid()::text
          OR (p.email IS NOT NULL AND lower(p.email) = 'admin@livecall.app')
        )
    )
  );

CREATE POLICY "public select interest_configs" ON public.interest_configs FOR SELECT USING (true);
CREATE POLICY "authenticated insert interest_configs" ON public.interest_configs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "authenticated update interest_configs" ON public.interest_configs FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "admin delete interest_configs" ON public.interest_configs
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.role = 'admin'
        AND (
          p.auth_id = auth.uid()
          OR p.id = auth.uid()::text
          OR (p.email IS NOT NULL AND lower(p.email) = 'admin@livecall.app')
        )
    )
  );

CREATE POLICY "public select currency_configs" ON public.currency_configs FOR SELECT USING (true);
CREATE POLICY "authenticated insert currency_configs" ON public.currency_configs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "authenticated update currency_configs" ON public.currency_configs FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "admin delete currency_configs" ON public.currency_configs
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.role = 'admin'
        AND (
          p.auth_id = auth.uid()
          OR p.id = auth.uid()::text
          OR (p.email IS NOT NULL AND lower(p.email) = 'admin@livecall.app')
        )
    )
  );

CREATE POLICY "public select system_configs" ON public.system_configs FOR SELECT USING (true);
CREATE POLICY "authenticated insert system_configs" ON public.system_configs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "authenticated update system_configs" ON public.system_configs FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "admin delete system_configs" ON public.system_configs
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.role = 'admin'
        AND (
          p.auth_id = auth.uid()
          OR p.id = auth.uid()::text
          OR (p.email IS NOT NULL AND lower(p.email) = 'admin@livecall.app')
        )
    )
  );

-- Moderation reports: policies defined after current_profile_id()/is_admin_user() helpers
-- (see MODERATION REPORTS ? reporter/admin scoped section near end of this file).
-- Do not re-create public SELECT / authenticated UPDATE here.

-- Home CMS: public read; admin-only writes (mutations also go through Express requireAdmin)
DROP POLICY IF EXISTS "public select cms_policies" ON public.cms_policies;
DROP POLICY IF EXISTS "authenticated insert cms_policies" ON public.cms_policies;
DROP POLICY IF EXISTS "authenticated update cms_policies" ON public.cms_policies;
DROP POLICY IF EXISTS "admin delete cms_policies" ON public.cms_policies;
DROP POLICY IF EXISTS "admin write cms_policies" ON public.cms_policies;
CREATE POLICY "public select cms_policies" ON public.cms_policies FOR SELECT USING (true);
CREATE POLICY "admin write cms_policies" ON public.cms_policies
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.role = 'admin'
        AND (p.auth_id = auth.uid() OR p.id = auth.uid()::text)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.role = 'admin'
        AND (p.auth_id = auth.uid() OR p.id = auth.uid()::text)
    )
  );

DROP POLICY IF EXISTS "public select home_banners" ON public.home_banners;
DROP POLICY IF EXISTS "authenticated insert home_banners" ON public.home_banners;
DROP POLICY IF EXISTS "authenticated update home_banners" ON public.home_banners;
DROP POLICY IF EXISTS "admin delete home_banners" ON public.home_banners;
DROP POLICY IF EXISTS "admin write home_banners" ON public.home_banners;
CREATE POLICY "public select home_banners" ON public.home_banners FOR SELECT USING (true);
CREATE POLICY "admin write home_banners" ON public.home_banners
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.role = 'admin'
        AND (p.auth_id = auth.uid() OR p.id = auth.uid()::text)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.role = 'admin'
        AND (p.auth_id = auth.uid() OR p.id = auth.uid()::text)
    )
  );

DROP POLICY IF EXISTS "public select home_quick_links" ON public.home_quick_links;
DROP POLICY IF EXISTS "authenticated insert home_quick_links" ON public.home_quick_links;
DROP POLICY IF EXISTS "authenticated update home_quick_links" ON public.home_quick_links;
DROP POLICY IF EXISTS "admin delete home_quick_links" ON public.home_quick_links;
DROP POLICY IF EXISTS "admin write home_quick_links" ON public.home_quick_links;
CREATE POLICY "public select home_quick_links" ON public.home_quick_links FOR SELECT USING (true);
CREATE POLICY "admin write home_quick_links" ON public.home_quick_links
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.role = 'admin'
        AND (p.auth_id = auth.uid() OR p.id = auth.uid()::text)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.role = 'admin'
        AND (p.auth_id = auth.uid() OR p.id = auth.uid()::text)
    )
  );


ALTER TABLE public.app_nav_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public select app_nav_items" ON public.app_nav_items;
DROP POLICY IF EXISTS "admin write app_nav_items" ON public.app_nav_items;
CREATE POLICY "public select app_nav_items" ON public.app_nav_items FOR SELECT USING (true);
CREATE POLICY "admin write app_nav_items" ON public.app_nav_items
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.role = 'admin'
        AND (p.auth_id = auth.uid() OR p.id = auth.uid()::text)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.role = 'admin'
        AND (p.auth_id = auth.uid() OR p.id = auth.uid()::text)
    )
  );

-- feed_posts: public read; owner/admin write (mutations preferred via Express service role)
-- (Hardened policies applied after current_profile_id()/is_admin_user() helpers ? see end of file.)

CREATE POLICY "public select coin_packages" ON public.coin_packages FOR SELECT USING (true);
CREATE POLICY "authenticated insert coin_packages" ON public.coin_packages FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "authenticated update coin_packages" ON public.coin_packages FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "admin delete coin_packages" ON public.coin_packages
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.role = 'admin'
        AND (
          p.auth_id = auth.uid()
          OR p.id = auth.uid()::text
          OR (p.email IS NOT NULL AND lower(p.email) = 'admin@livecall.app')
        )
    )
  );

-- USER RELATIONIAL PRIVACY TABLES
CREATE POLICY "public select favorites" ON public.favorites FOR SELECT USING (true);
CREATE POLICY "authenticated insert favorites" ON public.favorites FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "authenticated update favorites" ON public.favorites FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "owner/admin delete favorites" ON public.favorites
  FOR DELETE USING (
    user_id = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.role = 'admin'
        AND (
          p.auth_id = auth.uid()
          OR p.id = auth.uid()::text
          OR (p.email IS NOT NULL AND lower(p.email) = 'admin@livecall.app')
        )
    )
  );

CREATE POLICY "public select blocked_users" ON public.blocked_users FOR SELECT USING (true);
CREATE POLICY "authenticated insert blocked_users" ON public.blocked_users FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "authenticated update blocked_users" ON public.blocked_users FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "owner/admin delete blocked_users" ON public.blocked_users
  FOR DELETE USING (
    user_id = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.role = 'admin'
        AND (
          p.auth_id = auth.uid()
          OR p.id = auth.uid()::text
          OR (p.email IS NOT NULL AND lower(p.email) = 'admin@livecall.app')
        )
    )
  );

-- CREATOR GOALS
CREATE POLICY "public select creator_goals" ON public.creator_goals FOR SELECT USING (true);
CREATE POLICY "authenticated insert creator_goals" ON public.creator_goals FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "authenticated update creator_goals" ON public.creator_goals FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "admin delete creator_goals" ON public.creator_goals
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.role = 'admin'
        AND (
          p.auth_id = auth.uid()
          OR p.id = auth.uid()::text
          OR (p.email IS NOT NULL AND lower(p.email) = 'admin@livecall.app')
        )
    )
  );

-- CREATOR METRICS (read-only for clients; writes via Express service role only)
-- Hardened policies using current_profile_id() are also applied in section 18+.
CREATE POLICY "creator_metrics select own" ON public.creator_metrics FOR SELECT USING (
  creator_id = auth.uid()::text
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = creator_metrics.creator_id AND p.auth_id = auth.uid()
  )
);
CREATE POLICY "creator_metrics select agency" ON public.creator_metrics FOR SELECT USING (
  agency_leader_id = auth.uid()::text
  OR EXISTS (
    SELECT 1 FROM public.profiles me
    WHERE me.auth_id = auth.uid()
      AND (
        me.id = creator_metrics.agency_leader_id
        OR EXISTS (
          SELECT 1 FROM public.profiles host
          WHERE host.id = creator_metrics.creator_id
            AND (host.team_leader_id = me.id OR host.created_by_id = me.id)
        )
      )
  )
);
CREATE POLICY "creator_metrics select admin" ON public.creator_metrics FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.role = 'admin'
      AND (
        p.auth_id = auth.uid()
        OR p.id = auth.uid()::text
        OR (p.email IS NOT NULL AND lower(p.email) = 'admin@livecall.app')
      )
  )
);

-- DAILY REWARDS (legacy permissive policies ? superseded by owner RLS in section 18)
CREATE POLICY "public select user_daily_rewards" ON public.user_daily_rewards FOR SELECT USING (true);
CREATE POLICY "authenticated insert user_daily_rewards" ON public.user_daily_rewards FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "authenticated update user_daily_rewards" ON public.user_daily_rewards FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "admin delete user_daily_rewards" ON public.user_daily_rewards
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.role = 'admin'
        AND (
          p.auth_id = auth.uid()
          OR p.id = auth.uid()::text
          OR (p.email IS NOT NULL AND lower(p.email) = 'admin@livecall.app')
        )
    )
  );

-- ============================================================================
-- 16. AUTOMATED AUTH TRIGGER (Sync auth.users with public.profiles)
-- App upserts MUST preserve auth_id (never write auth_id = NULL).
-- Public signup roles ALWAYS overwrite stale privileged roles on email-link / ON CONFLICT.
-- Privileged roles (team_leader / agency_manager / admin) only applied when Auth metadata says so
-- (admin/TL server createUser paths). Public clients must sanitize metadata before Auth create.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
DECLARE
    v_existing_id TEXT;
    v_meta_role TEXT;
    v_meta_gender TEXT;
    v_role TEXT;
    v_gender TEXT;
    v_is_public BOOLEAN;
    v_is_privileged BOOLEAN;
BEGIN
    v_meta_role := lower(COALESCE(NEW.raw_user_meta_data->>'role', 'male_user'));
    v_meta_gender := lower(COALESCE(NEW.raw_user_meta_data->>'gender', ''));

    -- Normalize role: allow all app roles; unknown ? male_user
    IF v_meta_role IN (
        'male_user', 'female_user', 'female_creator', 'female_host', 'other_user',
        'admin', 'team_leader', 'agency_manager'
    ) THEN
        v_role := v_meta_role;
    ELSE
        v_role := 'male_user';
    END IF;

    v_is_public := v_role IN ('male_user', 'female_user', 'female_creator', 'female_host', 'other_user');
    v_is_privileged := v_role IN ('team_leader', 'agency_manager', 'admin');

    -- Gender from role (public + TL); admin may use meta
    IF v_role IN ('team_leader', 'agency_manager') THEN
        v_gender := 'female';
    ELSIF v_role IN ('female_user', 'female_creator', 'female_host') THEN
        v_gender := 'female';
    ELSIF v_role = 'other_user' THEN
        v_gender := 'other';
    ELSIF v_role = 'admin' THEN
        v_gender := CASE WHEN v_meta_gender IN ('female', 'male', 'other') THEN v_meta_gender ELSE 'male' END;
    ELSE
        -- male_user (and fallback)
        v_gender := 'male';
    END IF;

    -- If a profile already exists for this email, link auth_id (do NOT create a second row).
    IF NEW.email IS NOT NULL AND NEW.email <> '' THEN
        SELECT id INTO v_existing_id
        FROM public.profiles
        WHERE lower(email) = lower(NEW.email)
        LIMIT 1;

        IF v_existing_id IS NOT NULL THEN
            UPDATE public.profiles
            SET
                auth_id = NEW.id,
                email = NEW.email,
                name = COALESCE(NULLIF(name, ''), NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', name),
                -- Public signup MUST overwrite stale team_leader/admin; privileged meta may set privileged role
                role = CASE
                    WHEN v_is_public THEN v_role
                    WHEN v_is_privileged THEN v_role
                    ELSE role
                END,
                gender = CASE
                    WHEN v_is_public THEN v_gender
                    WHEN v_role IN ('team_leader', 'agency_manager') THEN 'female'
                    WHEN v_role = 'admin' THEN v_gender
                    ELSE gender
                END,
                gender_locked = true,
                -- Clear agency branding when a public signup claims a formerly privileged row
                agency_name = CASE WHEN v_is_public THEN NULL ELSE agency_name END,
                commission_percent = CASE WHEN v_is_public THEN NULL ELSE commission_percent END,
                team_leader_note = CASE WHEN v_is_public THEN NULL ELSE team_leader_note END,
                updated_at = now()
            WHERE id = v_existing_id;
            RETURN NEW;
        END IF;
    END IF;

    INSERT INTO public.profiles (
        id,
        auth_id,
        name,
        email,
        gender,
        gender_locked,
        role,
        coin_balance,
        hourly_coin_rate,
        is_onboarded,
        is_verified,
        online_status
    )
    VALUES (
        NEW.id::TEXT,
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1), 'New Member'),
        NEW.email,
        v_gender,
        true,
        v_role,
        CASE WHEN v_role = 'male_user' THEN 50 ELSE 0 END,
        CASE WHEN v_role IN ('female_creator', 'female_host') THEN 10 ELSE 0 END,
        CASE WHEN v_is_privileged THEN true ELSE false END,
        CASE WHEN v_is_privileged THEN true ELSE false END,
        'online'
    )
    ON CONFLICT (id) DO UPDATE SET
        auth_id = COALESCE(EXCLUDED.auth_id, public.profiles.auth_id),
        email = COALESCE(EXCLUDED.email, public.profiles.email),
        role = CASE
            WHEN EXCLUDED.role IN ('male_user', 'female_user', 'female_creator', 'female_host', 'other_user')
                THEN EXCLUDED.role
            WHEN EXCLUDED.role IN ('team_leader', 'agency_manager', 'admin')
                THEN EXCLUDED.role
            ELSE public.profiles.role
        END,
        gender = CASE
            WHEN EXCLUDED.role IN ('male_user', 'female_user', 'female_creator', 'female_host', 'other_user')
                THEN EXCLUDED.gender
            WHEN EXCLUDED.role IN ('team_leader', 'agency_manager') THEN 'female'
            WHEN EXCLUDED.role = 'admin' THEN EXCLUDED.gender
            ELSE public.profiles.gender
        END,
        agency_name = CASE
            WHEN EXCLUDED.role IN ('male_user', 'female_user', 'female_creator', 'female_host', 'other_user')
                THEN NULL
            ELSE public.profiles.agency_name
        END,
        commission_percent = CASE
            WHEN EXCLUDED.role IN ('male_user', 'female_user', 'female_creator', 'female_host', 'other_user')
                THEN NULL
            ELSE public.profiles.commission_percent
        END,
        updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- Prevent accidental null-out of profiles.auth_id from app upserts
CREATE OR REPLACE FUNCTION public.protect_profiles_auth_id()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.auth_id IS NOT NULL AND NEW.auth_id IS NULL THEN
        NEW.auth_id := OLD.auth_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_profiles_auth_id ON public.profiles;
CREATE TRIGGER trg_protect_profiles_auth_id
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_profiles_auth_id();

-- ============================================================================
-- 16.5 IMMUTABLE WALLET LEDGER (append-only call billing)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.wallet_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    call_id TEXT,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN (
      'CALL_DEBIT', 'GIFT_DEBIT', 'HOST_EARN', 'TL_EARN', 'PURCHASE',
      'REWARD_STREAK', 'REWARD_MISSION', 'REWARD_MASTER_CHEST',
      'TARGET_SHARE_TRUEUP'
    )),
    amount NUMERIC NOT NULL,
    balance_after NUMERIC NOT NULL,
    billing_minute INT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Expand CHECK to include reward types + GIFT_DEBIT + TARGET_SHARE_TRUEUP (idempotent)
DO $$
BEGIN
  ALTER TABLE public.wallet_ledger DROP CONSTRAINT IF EXISTS wallet_ledger_transaction_type_check;
EXCEPTION WHEN undefined_object THEN
  NULL;
END $$;
ALTER TABLE public.wallet_ledger DROP CONSTRAINT IF EXISTS wallet_ledger_transaction_type_check;
DO $$
BEGIN
  ALTER TABLE public.wallet_ledger
    ADD CONSTRAINT wallet_ledger_transaction_type_check
    CHECK (transaction_type IN (
      'CALL_DEBIT', 'GIFT_DEBIT', 'HOST_EARN', 'TL_EARN', 'PURCHASE',
      'REWARD_STREAK', 'REWARD_MISSION', 'REWARD_MASTER_CHEST',
      'TARGET_SHARE_TRUEUP'
    ));
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS wallet_ledger_unique_billing_idx
    ON public.wallet_ledger (call_id, billing_minute, transaction_type, user_id);

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_user_created
    ON public.wallet_ledger (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_call
    ON public.wallet_ledger (call_id, billing_minute);

COMMENT ON TABLE public.wallet_ledger IS
  'Operational coin movements. HOST_EARN/TL_EARN in [period_start,period_end) feed closePeriod accrual. TARGET_SHARE_TRUEUP = period-end host call share top-up (append-only; TL has no true-up). Gifts/tips: GIFT_DEBIT (sender, negative) + HOST_EARN/TL_EARN with metadata.kind=gift. Platform retained ? |CALL_DEBIT|+|GIFT_DEBIT| ? HOST ? TARGET_SHARE_TRUEUP ? TL. PURCHASE = coin funding. Rewards excluded from salary accrual.';

ALTER TABLE public.wallet_ledger ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 16.52 COIN PURCHASES ? funding intents (admin manual + gateway-ready)
-- Writes via Express + service role only. Same completeCoinPurchase path for both channels.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.coin_purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    channel TEXT NOT NULL CHECK (channel IN ('ADMIN_MANUAL', 'GATEWAY')),
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
    amount_coins NUMERIC NOT NULL CHECK (amount_coins > 0),
    amount_usd NUMERIC,
    -- Phase 4 Fixed Peg: snapshot at purchase (package price is NOT forced to coins?peg)
    coin_usd_peg_at_purchase NUMERIC,
    peg_value_usd NUMERIC,
    load_margin_usd NUMERIC,
    package_id TEXT,
    payment_provider TEXT,
    external_ref TEXT,
    actor_admin_id TEXT REFERENCES public.profiles(id) ON DELETE SET NULL,
    reason TEXT,
    wallet_ledger_id UUID REFERENCES public.wallet_ledger(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_coin_purchases_user_created
    ON public.coin_purchases (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_coin_purchases_channel_created
    ON public.coin_purchases (channel, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_coin_purchases_status_created
    ON public.coin_purchases (status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS coin_purchases_gateway_external_ref_idx
    ON public.coin_purchases (payment_provider, external_ref)
    WHERE channel = 'GATEWAY' AND external_ref IS NOT NULL AND status = 'completed';

COMMENT ON TABLE public.coin_purchases IS
  'Coin funding intents/records. pending ? checkout-intent; completed via completeCoinPurchase (ADMIN_MANUAL or GATEWAY). amount_usd = cash paid (retail). peg_value_usd = amount_coins ? coin_usd_peg_at_purchase. load_margin_usd = amount_usd ? peg_value_usd. Same PURCHASE wallet_ledger type for both channels.';

ALTER TABLE public.coin_purchases
  ADD COLUMN IF NOT EXISTS coin_usd_peg_at_purchase NUMERIC;
ALTER TABLE public.coin_purchases
  ADD COLUMN IF NOT EXISTS peg_value_usd NUMERIC;
ALTER TABLE public.coin_purchases
  ADD COLUMN IF NOT EXISTS load_margin_usd NUMERIC;

COMMENT ON COLUMN public.coin_purchases.amount_usd IS
  'Cash paid / retail package pay price (USD). Not forced to coins?peg.';
COMMENT ON COLUMN public.coin_purchases.coin_usd_peg_at_purchase IS
  'Fixed Peg snapshot ($/coin) at purchase time from system_configs.coin_usd_peg.';
COMMENT ON COLUMN public.coin_purchases.peg_value_usd IS
  'amount_coins ? coin_usd_peg_at_purchase ? liability / peg value of coins loaded.';
COMMENT ON COLUMN public.coin_purchases.load_margin_usd IS
  'amount_usd ? peg_value_usd when paid USD known; positive = retail above peg.';

ALTER TABLE public.coin_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public select wallet_ledger" ON public.wallet_ledger;
DROP POLICY IF EXISTS "service role manage wallet_ledger" ON public.wallet_ledger;
DROP POLICY IF EXISTS "authenticated insert wallet_ledger" ON public.wallet_ledger;
DROP POLICY IF EXISTS "owner select wallet_ledger" ON public.wallet_ledger;
CREATE POLICY "public select wallet_ledger" ON public.wallet_ledger FOR SELECT USING (true);
CREATE POLICY "authenticated insert wallet_ledger" ON public.wallet_ledger FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================================
-- 16.55 FINANCIAL MODULE ? settlement periods, immutable journal, batches
-- Weekly: Monday 00:00 UTC ? next Monday 00:00 UTC
-- Monthly: calendar month 1st 00:00 UTC ? next 1st 00:00 UTC (NOT rolling 30 days)
-- Close clock: system_configs.period_close_utc_time (UTC HH:mm)
-- Writes MUST go through Express + service role. Amounts are append-only / immutable.
-- ============================================================================

-- Settlement accrual window for a cycle instance
CREATE TABLE IF NOT EXISTS public.settlement_periods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_type TEXT NOT NULL CHECK (cycle_type IN ('weekly', 'monthly')),
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    close_scheduled_at TIMESTAMPTZ NOT NULL,
    closed_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'open'
      CHECK (status IN ('open', 'closing', 'closed', 'failed')),
    config_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    close_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT settlement_periods_end_after_start CHECK (period_end > period_start),
    CONSTRAINT settlement_periods_cycle_start_unique UNIQUE (cycle_type, period_start)
);

CREATE INDEX IF NOT EXISTS idx_settlement_periods_status_close
  ON public.settlement_periods (status, close_scheduled_at);
CREATE INDEX IF NOT EXISTS idx_settlement_periods_window
  ON public.settlement_periods (period_start, period_end);

COMMENT ON TABLE public.settlement_periods IS
  'Financial Module settlement windows. Accrual is [period_start, period_end). close_scheduled_at uses period_end date + period_close_utc_time.';
COMMENT ON COLUMN public.settlement_periods.period_end IS
  'Exclusive end of accrual window (next Monday 00:00 UTC or next month 1st 00:00 UTC).';
COMMENT ON COLUMN public.settlement_periods.config_snapshot IS
  'Frozen ratios, shares, close time, and target bonus thresholds at close time.';

-- Immutable money journal (corrections = new REVERSAL rows, never UPDATE amounts)
CREATE TABLE IF NOT EXISTS public.financial_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    period_id UUID REFERENCES public.settlement_periods(id) ON DELETE SET NULL,
    entry_type TEXT NOT NULL CHECK (entry_type IN (
      'PLATFORM_EARN',
      'HOST_EARN',
      'TL_EARN',
      'TARGET_BONUS',
      'TARGET_SHARE_TRUEUP',
      'SETTLEMENT_ACCRUAL',
      'SETTLEMENT_PAID',
      'REVERSAL'
    )),
    user_id TEXT REFERENCES public.profiles(id) ON DELETE SET NULL,
    team_leader_id TEXT REFERENCES public.profiles(id) ON DELETE SET NULL,
    counterparty_role TEXT CHECK (counterparty_role IN ('platform', 'host', 'team_leader')),
    amount_coins BIGINT NOT NULL,
    amount_usd NUMERIC NOT NULL,
    fx_ratio NUMERIC NOT NULL,
    source_ref_type TEXT,
    source_ref_id TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_financial_ledger_period_created
  ON public.financial_ledger (period_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_financial_ledger_user_created
  ON public.financial_ledger (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_financial_ledger_entry_type
  ON public.financial_ledger (entry_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_financial_ledger_tl
  ON public.financial_ledger (team_leader_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_financial_ledger_source_ref
  ON public.financial_ledger (source_ref_type, source_ref_id);

COMMENT ON TABLE public.financial_ledger IS
  'Immutable Financial Module journal. Never UPDATE amount_coins/amount_usd; use REVERSAL entries for corrections. TARGET_SHARE_TRUEUP = period-end host call share top-up (separate from TARGET_BONUS cash). Writes via Express service role only.';

-- Expand financial_ledger entry_type for host share true-up (idempotent)
DO $$
BEGIN
  ALTER TABLE public.financial_ledger DROP CONSTRAINT IF EXISTS financial_ledger_entry_type_check;
EXCEPTION WHEN undefined_object THEN
  NULL;
END $$;
ALTER TABLE public.financial_ledger DROP CONSTRAINT IF EXISTS financial_ledger_entry_type_check;
DO $$
BEGIN
  ALTER TABLE public.financial_ledger
    ADD CONSTRAINT financial_ledger_entry_type_check
    CHECK (entry_type IN (
      'PLATFORM_EARN',
      'HOST_EARN',
      'TL_EARN',
      'TARGET_BONUS',
      'TARGET_SHARE_TRUEUP',
      'SETTLEMENT_ACCRUAL',
      'SETTLEMENT_PAID',
      'REVERSAL'
    ));
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- One admin remittance unit: TL bundle (TL commission + managed host salaries) or direct host
CREATE TABLE IF NOT EXISTS public.settlement_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_id UUID NOT NULL REFERENCES public.settlement_periods(id) ON DELETE CASCADE,
    batch_kind TEXT NOT NULL CHECK (batch_kind IN ('team_leader_bundle', 'direct_host')),
    team_leader_id TEXT REFERENCES public.profiles(id) ON DELETE SET NULL,
    payee_user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'pending_admin_pay'
      CHECK (status IN ('pending_admin_pay', 'admin_paid', 'tl_confirmed', 'cancelled')),
    total_host_salary_usd NUMERIC NOT NULL DEFAULT 0,
    total_tl_commission_usd NUMERIC NOT NULL DEFAULT 0,
    total_due_usd NUMERIC NOT NULL DEFAULT 0,
    total_host_salary_coins BIGINT NOT NULL DEFAULT 0,
    total_tl_commission_coins BIGINT NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'USD',
    payment_reference TEXT,
    reconcile_status TEXT NOT NULL DEFAULT 'unreconciled'
      CHECK (reconcile_status IN ('unreconciled', 'reconciled')),
    reconciled_at TIMESTAMPTZ,
    reconciled_by TEXT REFERENCES public.profiles(id) ON DELETE SET NULL,
    reconciled_by_role TEXT CHECK (
      reconciled_by_role IS NULL OR reconciled_by_role IN ('admin', 'team_leader')
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT settlement_batches_tl_required_for_bundle CHECK (
      (batch_kind = 'team_leader_bundle' AND team_leader_id IS NOT NULL)
      OR (batch_kind = 'direct_host')
    ),
    CONSTRAINT settlement_batches_due_non_negative CHECK (
      total_due_usd >= 0
      AND total_host_salary_usd >= 0
      AND total_tl_commission_usd >= 0
    )
);

-- Reconcile columns on databases created before salary-reconcile flow
ALTER TABLE public.settlement_batches
  ADD COLUMN IF NOT EXISTS reconcile_status TEXT NOT NULL DEFAULT 'unreconciled';
ALTER TABLE public.settlement_batches
  ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ;
ALTER TABLE public.settlement_batches
  ADD COLUMN IF NOT EXISTS reconciled_by TEXT REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.settlement_batches
  ADD COLUMN IF NOT EXISTS reconciled_by_role TEXT;

DO $$
BEGIN
  IF to_regclass('public.settlement_batches') IS NULL THEN
    RETURN;
  END IF;
  ALTER TABLE public.settlement_batches
    DROP CONSTRAINT IF EXISTS settlement_batches_reconcile_status_check;
  ALTER TABLE public.settlement_batches
    ADD CONSTRAINT settlement_batches_reconcile_status_check
    CHECK (reconcile_status IN ('unreconciled', 'reconciled'));
  ALTER TABLE public.settlement_batches
    DROP CONSTRAINT IF EXISTS settlement_batches_reconciled_by_role_check;
  ALTER TABLE public.settlement_batches
    ADD CONSTRAINT settlement_batches_reconciled_by_role_check
    CHECK (
      reconciled_by_role IS NULL OR reconciled_by_role IN ('admin', 'team_leader')
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_settlement_batches_reconcile
  ON public.settlement_batches (period_id, reconcile_status);

-- One TL bundle per period per team leader
CREATE UNIQUE INDEX IF NOT EXISTS uq_settlement_batches_period_tl_bundle
  ON public.settlement_batches (period_id, team_leader_id)
  WHERE batch_kind = 'team_leader_bundle' AND team_leader_id IS NOT NULL;

-- One direct-host batch per period per payee
CREATE UNIQUE INDEX IF NOT EXISTS uq_settlement_batches_period_direct_payee
  ON public.settlement_batches (period_id, payee_user_id)
  WHERE batch_kind = 'direct_host';

CREATE INDEX IF NOT EXISTS idx_settlement_batches_period_status
  ON public.settlement_batches (period_id, status);
CREATE INDEX IF NOT EXISTS idx_settlement_batches_payee
  ON public.settlement_batches (payee_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_settlement_batches_tl
  ON public.settlement_batches (team_leader_id, created_at DESC);

COMMENT ON TABLE public.settlement_batches IS
  'Period-end remittance batches. Must reconcile before pay. team_leader_bundle: Admin remits to Agency then Agency marks host lines paid; direct_host: Admin marks host paid. Amounts immutable after insert; status/reconcile via settlement_events.';
COMMENT ON COLUMN public.settlement_batches.reconcile_status IS
  'unreconciled|reconciled — must be reconciled before Admin remittance or Agency host mark-paid.';

CREATE TABLE IF NOT EXISTS public.settlement_line_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES public.settlement_batches(id) ON DELETE CASCADE,
    payee_user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    payee_role TEXT NOT NULL CHECK (payee_role IN ('host', 'team_leader')),
    amount_coins BIGINT NOT NULL,
    amount_usd NUMERIC NOT NULL,
    component TEXT NOT NULL CHECK (component IN (
      'call_earnings',
      'gift_earnings',
      'target_bonus',
      'target_share_trueup',
      'tl_commission',
      'other'
    )),
    breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
    host_salary_status TEXT NOT NULL DEFAULT 'pending'
      CHECK (host_salary_status IN ('pending', 'admin_paid', 'acknowledged')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT settlement_line_items_amount_non_negative CHECK (
      amount_coins >= 0 AND amount_usd >= 0
    )
);

-- Widen component on databases created before target_share_trueup.
-- CREATE TABLE above already includes the full list; this replaces an older check.
DO $$
BEGIN
  IF to_regclass('public.settlement_line_items') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE public.settlement_line_items
    DROP CONSTRAINT IF EXISTS settlement_line_items_component_check;

  ALTER TABLE public.settlement_line_items
    ADD CONSTRAINT settlement_line_items_component_check
    CHECK (component IN (
      'call_earnings',
      'gift_earnings',
      'target_bonus',
      'target_share_trueup',
      'tl_commission',
      'other'
    ));
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_settlement_line_items_batch
  ON public.settlement_line_items (batch_id);
CREATE INDEX IF NOT EXISTS idx_settlement_line_items_payee
  ON public.settlement_line_items (payee_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_settlement_line_items_host_status
  ON public.settlement_line_items (host_salary_status)
  WHERE payee_role = 'host';

COMMENT ON TABLE public.settlement_line_items IS
  'Immutable line components inside a settlement batch (host salary parts, TL commission, target bonuses). host_salary_status is payee-facing pending|admin_paid|acknowledged for hosts and TL lines.';

-- Widen host_salary_status on databases created before ack model (pending|paid → pending|admin_paid|acknowledged).
DO $$
BEGIN
  IF to_regclass('public.settlement_line_items') IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.settlement_line_items
  SET host_salary_status = 'acknowledged'
  WHERE host_salary_status = 'paid';

  ALTER TABLE public.settlement_line_items
    DROP CONSTRAINT IF EXISTS settlement_line_items_host_salary_status_check;

  ALTER TABLE public.settlement_line_items
    ADD CONSTRAINT settlement_line_items_host_salary_status_check
    CHECK (host_salary_status IN ('pending', 'admin_paid', 'acknowledged'));
END $$;

-- Append-only audit trail for batch / period settlement actions
CREATE TABLE IF NOT EXISTS public.settlement_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID REFERENCES public.settlement_batches(id) ON DELETE CASCADE,
    period_id UUID REFERENCES public.settlement_periods(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL CHECK (event_type IN (
      'created',
      'reconciled',
      'admin_marked_paid',
      'agency_marked_host_paid',
      'tl_confirmed',
      'cancelled',
      'note',
      'host_acknowledged',
      'tl_acknowledged'
    )),
    actor_user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    note TEXT,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Widen settlement_events.event_type on databases created before reconcile events.
DO $$
BEGIN
  IF to_regclass('public.settlement_events') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE public.settlement_events
    DROP CONSTRAINT IF EXISTS settlement_events_event_type_check;

  ALTER TABLE public.settlement_events
    ADD CONSTRAINT settlement_events_event_type_check
    CHECK (event_type IN (
      'created',
      'reconciled',
      'admin_marked_paid',
      'agency_marked_host_paid',
      'tl_confirmed',
      'cancelled',
      'note',
      'host_acknowledged',
      'tl_acknowledged'
    ));
END $$;

CREATE INDEX IF NOT EXISTS idx_settlement_events_batch_created
  ON public.settlement_events (batch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_settlement_events_period_created
  ON public.settlement_events (period_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_settlement_events_actor
  ON public.settlement_events (actor_user_id, created_at DESC);

COMMENT ON TABLE public.settlement_events IS
  'Append-only settlement audit log. No UPDATEs; status transitions record new events.';

-- Frozen creator metrics at period close (audit + history UI)
CREATE TABLE IF NOT EXISTS public.creator_period_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_id UUID NOT NULL REFERENCES public.settlement_periods(id) ON DELETE CASCADE,
    creator_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    agency_leader_id TEXT REFERENCES public.profiles(id) ON DELETE SET NULL,
    active_online_seconds BIGINT NOT NULL DEFAULT 0,
    active_online_hours NUMERIC NOT NULL DEFAULT 0,
    coins_earned_from_calls BIGINT NOT NULL DEFAULT 0,
    coins_earned_from_gifts BIGINT NOT NULL DEFAULT 0,
    total_target_coins BIGINT NOT NULL DEFAULT 0,
    performance_tier TEXT NOT NULL DEFAULT 'bronze'
      CHECK (performance_tier IN ('bronze', 'silver', 'gold')),
    bonus_earned_coins BIGINT NOT NULL DEFAULT 0,
    bonus_earned_usd NUMERIC NOT NULL DEFAULT 0,
    current_streak_days INT NOT NULL DEFAULT 0,
    response_health_score NUMERIC NOT NULL DEFAULT 100,
    metrics_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT creator_period_snapshots_period_creator_unique UNIQUE (period_id, creator_id)
);

CREATE INDEX IF NOT EXISTS idx_creator_period_snapshots_creator
  ON public.creator_period_snapshots (creator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_creator_period_snapshots_agency
  ON public.creator_period_snapshots (agency_leader_id, period_id);

COMMENT ON TABLE public.creator_period_snapshots IS
  'Point-in-time creator metrics frozen at settlement period close. Live creator_metrics may reset after snapshot.';

-- Enforce append-only / amount immutability at the database layer
CREATE OR REPLACE FUNCTION public.finance_reject_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only / immutable; use REVERSAL or settlement_events instead of %',
    TG_TABLE_NAME, TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_financial_ledger_no_update ON public.financial_ledger;
CREATE TRIGGER trg_financial_ledger_no_update
  BEFORE UPDATE OR DELETE ON public.financial_ledger
  FOR EACH ROW EXECUTE FUNCTION public.finance_reject_mutation();

DROP TRIGGER IF EXISTS trg_settlement_events_no_update ON public.settlement_events;
CREATE TRIGGER trg_settlement_events_no_update
  BEFORE UPDATE OR DELETE ON public.settlement_events
  FOR EACH ROW EXECUTE FUNCTION public.finance_reject_mutation();

CREATE OR REPLACE FUNCTION public.settlement_batches_protect_amounts()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.total_host_salary_usd IS DISTINCT FROM OLD.total_host_salary_usd
     OR NEW.total_tl_commission_usd IS DISTINCT FROM OLD.total_tl_commission_usd
     OR NEW.total_due_usd IS DISTINCT FROM OLD.total_due_usd
     OR NEW.total_host_salary_coins IS DISTINCT FROM OLD.total_host_salary_coins
     OR NEW.total_tl_commission_coins IS DISTINCT FROM OLD.total_tl_commission_coins
     OR NEW.batch_kind IS DISTINCT FROM OLD.batch_kind
     OR NEW.period_id IS DISTINCT FROM OLD.period_id
     OR NEW.team_leader_id IS DISTINCT FROM OLD.team_leader_id
     OR NEW.payee_user_id IS DISTINCT FROM OLD.payee_user_id
  THEN
    RAISE EXCEPTION 'settlement_batches amounts and identity columns are immutable after insert';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_settlement_batches_protect_amounts ON public.settlement_batches;
CREATE TRIGGER trg_settlement_batches_protect_amounts
  BEFORE UPDATE ON public.settlement_batches
  FOR EACH ROW EXECUTE FUNCTION public.settlement_batches_protect_amounts();

-- Phase 10: batches/line amounts are immutable; DELETE blocked (status/events only for lifecycle)
DROP TRIGGER IF EXISTS trg_settlement_batches_no_delete ON public.settlement_batches;
CREATE TRIGGER trg_settlement_batches_no_delete
  BEFORE DELETE ON public.settlement_batches
  FOR EACH ROW EXECUTE FUNCTION public.finance_reject_mutation();

CREATE OR REPLACE FUNCTION public.settlement_line_items_protect_amounts()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.amount_coins IS DISTINCT FROM OLD.amount_coins
     OR NEW.amount_usd IS DISTINCT FROM OLD.amount_usd
     OR NEW.component IS DISTINCT FROM OLD.component
     OR NEW.payee_user_id IS DISTINCT FROM OLD.payee_user_id
     OR NEW.payee_role IS DISTINCT FROM OLD.payee_role
     OR NEW.batch_id IS DISTINCT FROM OLD.batch_id
     OR NEW.breakdown IS DISTINCT FROM OLD.breakdown
  THEN
    RAISE EXCEPTION 'settlement_line_items amounts and identity columns are immutable; only host_salary_status may change';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_settlement_line_items_protect_amounts ON public.settlement_line_items;
CREATE TRIGGER trg_settlement_line_items_protect_amounts
  BEFORE UPDATE ON public.settlement_line_items
  FOR EACH ROW EXECUTE FUNCTION public.settlement_line_items_protect_amounts();

DROP TRIGGER IF EXISTS trg_settlement_line_items_no_delete ON public.settlement_line_items;
CREATE TRIGGER trg_settlement_line_items_no_delete
  BEFORE DELETE ON public.settlement_line_items
  FOR EACH ROW EXECUTE FUNCTION public.finance_reject_mutation();

-- RLS: enable + backend/service-role oriented (no client writes; limited selects)
ALTER TABLE public.settlement_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlement_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlement_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlement_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_period_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin select settlement_periods" ON public.settlement_periods;
DROP POLICY IF EXISTS "admin select financial_ledger" ON public.financial_ledger;
DROP POLICY IF EXISTS "owner select financial_ledger" ON public.financial_ledger;
DROP POLICY IF EXISTS "admin select settlement_batches" ON public.settlement_batches;
DROP POLICY IF EXISTS "payee select settlement_batches" ON public.settlement_batches;
DROP POLICY IF EXISTS "admin select settlement_line_items" ON public.settlement_line_items;
DROP POLICY IF EXISTS "payee select settlement_line_items" ON public.settlement_line_items;
DROP POLICY IF EXISTS "admin select settlement_events" ON public.settlement_events;
DROP POLICY IF EXISTS "admin select creator_period_snapshots" ON public.creator_period_snapshots;
DROP POLICY IF EXISTS "owner select creator_period_snapshots" ON public.creator_period_snapshots;
DROP POLICY IF EXISTS "agency select creator_period_snapshots" ON public.creator_period_snapshots;

-- Policies that depend on is_admin_user()/current_profile_id() are created in section 18+
-- (see FINANCIAL MODULE RLS at end of file). Placeholder comment only here.

-- ============================================================================
-- 16.6 ATOMIC CALL COIN BURNING STORED PROCEDURE
-- Server-authoritative debit/credit with row locks + append-only ledger.
-- Unique (call_id, billing_minute, transaction_type, user_id) prevents duplicate burns.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.burn_call_coins_atomic(
    p_caller_id TEXT,
    p_receiver_id TEXT,
    p_tl_id TEXT,
    p_call_id TEXT,
    p_billing_minute INT,
    p_coins_burned INT,
    p_host_coins_earned INT,
    p_tl_coins_earned INT,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB AS $$
DECLARE
    v_caller_balance BIGINT;
    v_host_earnings BIGINT := 0;
    v_tl_earnings BIGINT := 0;
    v_host_earned INT;
    v_tl_earned INT;
    v_receiver_role TEXT;
BEGIN
    IF p_call_id IS NULL OR p_billing_minute IS NULL OR p_billing_minute < 1 THEN
        RETURN jsonb_build_object(
            'success', false,
            'new_caller_balance', 0,
            'new_host_earnings', 0,
            'error_message', 'Invalid call_id or billing_minute'
        );
    END IF;

    IF p_coins_burned IS NULL OR p_coins_burned <= 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'new_caller_balance', 0,
            'new_host_earnings', 0,
            'error_message', 'Invalid coins_burned'
        );
    END IF;

    -- Enforce invariant: hostEarned + tlEarned <= coinsBurned
    v_host_earned := GREATEST(0, COALESCE(p_host_coins_earned, 0));
    v_tl_earned := GREATEST(0, COALESCE(p_tl_coins_earned, 0));
    IF (v_host_earned + v_tl_earned) > p_coins_burned THEN
        IF v_tl_earned > p_coins_burned THEN
            v_tl_earned := p_coins_burned;
            v_host_earned := 0;
        ELSE
            v_host_earned := p_coins_burned - v_tl_earned;
        END IF;
    END IF;

    -- Idempotent re-hit: already billed this minute for this caller
    IF EXISTS (
        SELECT 1 FROM public.wallet_ledger
        WHERE call_id = p_call_id
          AND billing_minute = p_billing_minute
          AND transaction_type = 'CALL_DEBIT'
          AND user_id = p_caller_id
    ) THEN
        SELECT coin_balance INTO v_caller_balance FROM public.profiles WHERE id = p_caller_id;
        IF p_receiver_id IS NOT NULL AND p_receiver_id <> '' THEN
            SELECT earnings_coins INTO v_host_earnings FROM public.profiles WHERE id = p_receiver_id;
        END IF;
        IF p_tl_id IS NOT NULL AND p_tl_id <> '' THEN
            SELECT earnings_coins INTO v_tl_earnings FROM public.profiles WHERE id = p_tl_id;
        END IF;

        RETURN jsonb_build_object(
            'success', true,
            'new_caller_balance', COALESCE(v_caller_balance, 0),
            'new_host_earnings', COALESCE(v_host_earnings, 0),
            'new_tl_earnings', COALESCE(v_tl_earnings, 0),
            'error_message', NULL,
            'duplicate', true,
            'coins_burned', p_coins_burned,
            'host_coins_earned', v_host_earned,
            'tl_coins_earned', v_tl_earned
        );
    END IF;

    -- Lock caller row and fail hard on insufficient balance
    SELECT coin_balance INTO v_caller_balance
    FROM public.profiles
    WHERE id = p_caller_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'new_caller_balance', 0,
            'new_host_earnings', 0,
            'error_message', 'Caller profile not found'
        );
    END IF;

    IF v_caller_balance < p_coins_burned THEN
        RETURN jsonb_build_object(
            'success', false,
            'new_caller_balance', v_caller_balance,
            'new_host_earnings', 0,
            'error_message', 'INSUFFICIENT_BALANCE',
            'code', 'INSUFFICIENT_BALANCE'
        );
    END IF;

    -- Atomically debit caller (never allow negative)
    UPDATE public.profiles
    SET coin_balance = coin_balance - p_coins_burned,
        updated_at = now()
    WHERE id = p_caller_id
    RETURNING coin_balance INTO v_caller_balance;

    INSERT INTO public.wallet_ledger (
        user_id, call_id, transaction_type, amount, balance_after, billing_minute, metadata
    ) VALUES (
        p_caller_id, p_call_id, 'CALL_DEBIT', -p_coins_burned, v_caller_balance, p_billing_minute,
        COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('side', 'caller')
    );

    -- Credit female_creator host only (server passes 0 for non-creators)
    IF v_host_earned > 0 AND p_receiver_id IS NOT NULL AND p_receiver_id <> '' THEN
        SELECT role INTO v_receiver_role FROM public.profiles WHERE id = p_receiver_id FOR UPDATE;

        IF v_receiver_role IN ('female_creator', 'female_host') THEN
            UPDATE public.profiles
            SET earnings_coins = earnings_coins + v_host_earned,
                total_call_minutes = COALESCE(total_call_minutes, 0) + 1,
                updated_at = now()
            WHERE id = p_receiver_id
            RETURNING earnings_coins INTO v_host_earnings;

            INSERT INTO public.wallet_ledger (
                user_id, call_id, transaction_type, amount, balance_after, billing_minute, metadata
            ) VALUES (
                p_receiver_id, p_call_id, 'HOST_EARN', v_host_earned, v_host_earnings, p_billing_minute,
                COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('side', 'host')
            );
        ELSE
            v_host_earned := 0;
        END IF;
    END IF;

    -- Credit team leader only when TL id present and share > 0 (server gates female_creator)
    IF v_tl_earned > 0 AND p_tl_id IS NOT NULL AND p_tl_id <> '' THEN
        UPDATE public.profiles
        SET earnings_coins = earnings_coins + v_tl_earned,
            updated_at = now()
        WHERE id = p_tl_id
        RETURNING earnings_coins INTO v_tl_earnings;

        IF FOUND THEN
            INSERT INTO public.wallet_ledger (
                user_id, call_id, transaction_type, amount, balance_after, billing_minute, metadata
            ) VALUES (
                p_tl_id, p_call_id, 'TL_EARN', v_tl_earned, v_tl_earnings, p_billing_minute,
                COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('side', 'team_leader')
            );
        ELSE
            v_tl_earned := 0;
            v_tl_earnings := 0;
        END IF;
    ELSE
        v_tl_earned := 0;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'new_caller_balance', v_caller_balance,
        'new_host_earnings', COALESCE(v_host_earnings, 0),
        'new_tl_earnings', COALESCE(v_tl_earnings, 0),
        'error_message', NULL,
        'duplicate', false,
        'coins_burned', p_coins_burned,
        'host_coins_earned', v_host_earned,
        'tl_coins_earned', v_tl_earned
    );
EXCEPTION WHEN unique_violation THEN
    -- Concurrent duplicate burn ? treat as idempotent success
    SELECT coin_balance INTO v_caller_balance FROM public.profiles WHERE id = p_caller_id;
    IF p_receiver_id IS NOT NULL AND p_receiver_id <> '' THEN
        SELECT earnings_coins INTO v_host_earnings FROM public.profiles WHERE id = p_receiver_id;
    END IF;
    RETURN jsonb_build_object(
        'success', true,
        'new_caller_balance', COALESCE(v_caller_balance, 0),
        'new_host_earnings', COALESCE(v_host_earnings, 0),
        'new_tl_earnings', COALESCE(v_tl_earnings, 0),
        'error_message', NULL,
        'duplicate', true,
        'coins_burned', p_coins_burned,
        'host_coins_earned', GREATEST(0, COALESCE(p_host_coins_earned, 0)),
        'tl_coins_earned', GREATEST(0, COALESCE(p_tl_coins_earned, 0))
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 16.7 ATOMIC DAILY REWARD CLAIM (streak / mission / master chest)
-- Server-authoritative coin credit + claim flags + wallet_ledger audit.
-- Video mission progress is stored in SECONDS (task_video_call_seconds).
-- Idempotent via unique (call_id, billing_minute, transaction_type, user_id).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.claim_daily_reward_atomic(
    p_user_id TEXT,
    p_claim_kind TEXT,
    p_mission_key TEXT,
    p_reward_day DATE,
    p_coins INT,
    p_ledger_type TEXT,
    p_billing_minute INT,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB AS $$
DECLARE
    v_row public.user_daily_rewards%ROWTYPE;
    v_balance BIGINT;
    v_call_id TEXT;
    v_coins INT;
BEGIN
    IF p_user_id IS NULL OR p_reward_day IS NULL OR p_claim_kind IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_INPUT', 'error_message', 'Missing claim parameters');
    END IF;

    v_coins := GREATEST(0, COALESCE(p_coins, 0));
    v_call_id := 'daily_reward:' || p_reward_day::text;

    -- Lock profile + rewards row
    SELECT coin_balance INTO v_balance FROM public.profiles WHERE id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'NO_PROFILE', 'error_message', 'Profile not found');
    END IF;

    SELECT * INTO v_row FROM public.user_daily_rewards WHERE user_id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN
        INSERT INTO public.user_daily_rewards (user_id, last_login_date, tasks_date)
        VALUES (p_user_id, p_reward_day, p_reward_day)
        RETURNING * INTO v_row;
    END IF;

    -- Idempotent ledger hit
    IF EXISTS (
        SELECT 1 FROM public.wallet_ledger
        WHERE user_id = p_user_id
          AND call_id = v_call_id
          AND billing_minute = p_billing_minute
          AND transaction_type = p_ledger_type
    ) THEN
        RETURN jsonb_build_object(
            'success', true,
            'duplicate', true,
            'coins_awarded', 0,
            'coin_balance', v_balance,
            'error_code', 'ALREADY_CLAIMED',
            'error_message', 'Already claimed'
        );
    END IF;

    IF p_claim_kind = 'streak' THEN
        IF v_row.streak_claimed_date = p_reward_day THEN
            RETURN jsonb_build_object('success', false, 'error_code', 'ALREADY_CLAIMED', 'error_message', 'Streak already claimed', 'coin_balance', v_balance);
        END IF;
        UPDATE public.user_daily_rewards
        SET streak_claimed_date = p_reward_day,
            total_coins_earned = COALESCE(total_coins_earned, 0) + v_coins,
            updated_at = now()
        WHERE user_id = p_user_id;

    ELSIF p_claim_kind = 'master_chest' THEN
        IF v_row.master_chest_claimed THEN
            RETURN jsonb_build_object('success', false, 'error_code', 'ALREADY_CLAIMED', 'error_message', 'Master chest already claimed', 'coin_balance', v_balance);
        END IF;
        UPDATE public.user_daily_rewards
        SET master_chest_claimed = true,
            total_coins_earned = COALESCE(total_coins_earned, 0) + v_coins,
            updated_at = now()
        WHERE user_id = p_user_id AND master_chest_claimed = false;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'error_code', 'ALREADY_CLAIMED', 'error_message', 'Master chest already claimed', 'coin_balance', v_balance);
        END IF;

    ELSIF p_claim_kind = 'mission' THEN
        IF p_mission_key = 'chat_friends' THEN
            IF v_row.task_chat_claimed THEN
                RETURN jsonb_build_object('success', false, 'error_code', 'ALREADY_CLAIMED', 'error_message', 'Mission already claimed', 'coin_balance', v_balance);
            END IF;
            UPDATE public.user_daily_rewards
            SET task_chat_claimed = true, total_coins_earned = COALESCE(total_coins_earned, 0) + v_coins, updated_at = now()
            WHERE user_id = p_user_id AND task_chat_claimed = false;
        ELSIF p_mission_key = 'quick_matches' THEN
            IF v_row.task_quick_match_claimed THEN
                RETURN jsonb_build_object('success', false, 'error_code', 'ALREADY_CLAIMED', 'error_message', 'Mission already claimed', 'coin_balance', v_balance);
            END IF;
            UPDATE public.user_daily_rewards
            SET task_quick_match_claimed = true, total_coins_earned = COALESCE(total_coins_earned, 0) + v_coins, updated_at = now()
            WHERE user_id = p_user_id AND task_quick_match_claimed = false;
        ELSIF p_mission_key = 'video_call' THEN
            IF v_row.task_video_call_claimed THEN
                RETURN jsonb_build_object('success', false, 'error_code', 'ALREADY_CLAIMED', 'error_message', 'Mission already claimed', 'coin_balance', v_balance);
            END IF;
            UPDATE public.user_daily_rewards
            SET task_video_call_claimed = true, total_coins_earned = COALESCE(total_coins_earned, 0) + v_coins, updated_at = now()
            WHERE user_id = p_user_id AND task_video_call_claimed = false;
        ELSIF p_mission_key = 'moment_interact' THEN
            IF v_row.task_moment_claimed THEN
                RETURN jsonb_build_object('success', false, 'error_code', 'ALREADY_CLAIMED', 'error_message', 'Mission already claimed', 'coin_balance', v_balance);
            END IF;
            UPDATE public.user_daily_rewards
            SET task_moment_claimed = true, total_coins_earned = COALESCE(total_coins_earned, 0) + v_coins, updated_at = now()
            WHERE user_id = p_user_id AND task_moment_claimed = false;
        ELSIF p_mission_key = 'send_gift' THEN
            IF v_row.task_gift_claimed THEN
                RETURN jsonb_build_object('success', false, 'error_code', 'ALREADY_CLAIMED', 'error_message', 'Mission already claimed', 'coin_balance', v_balance);
            END IF;
            UPDATE public.user_daily_rewards
            SET task_gift_claimed = true, total_coins_earned = COALESCE(total_coins_earned, 0) + v_coins, updated_at = now()
            WHERE user_id = p_user_id AND task_gift_claimed = false;
        ELSE
            RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_MISSION', 'error_message', 'Invalid mission key');
        END IF;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'error_code', 'ALREADY_CLAIMED', 'error_message', 'Mission already claimed', 'coin_balance', v_balance);
        END IF;
    ELSE
        RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_KIND', 'error_message', 'Invalid claim kind');
    END IF;

    UPDATE public.profiles
    SET coin_balance = COALESCE(coin_balance, 0) + v_coins,
        updated_at = now()
    WHERE id = p_user_id
    RETURNING coin_balance INTO v_balance;

    INSERT INTO public.wallet_ledger (
        user_id, call_id, transaction_type, amount, balance_after, billing_minute, metadata
    ) VALUES (
        p_user_id, v_call_id, p_ledger_type, v_coins, v_balance, p_billing_minute,
        COALESCE(p_metadata, '{}'::jsonb)
    );

    RETURN jsonb_build_object(
        'success', true,
        'duplicate', false,
        'coins_awarded', v_coins,
        'coin_balance', v_balance,
        'error_message', NULL
    );
EXCEPTION WHEN unique_violation THEN
    SELECT coin_balance INTO v_balance FROM public.profiles WHERE id = p_user_id;
    RETURN jsonb_build_object(
        'success', true,
        'duplicate', true,
        'coins_awarded', 0,
        'coin_balance', COALESCE(v_balance, 0),
        'error_code', 'ALREADY_CLAIMED',
        'error_message', 'Already claimed'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 16. REALTIME PUBLICATION SETUP (Idempotent - checks pg_publication_tables)
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'profiles') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'messages') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'matches') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.matches;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'call_logs') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.call_logs;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'friend_requests') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.friend_requests;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'wallet_ledger') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.wallet_ledger;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'feed_posts') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.feed_posts;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'user_daily_rewards') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.user_daily_rewards;
    END IF;
END $$;

-- ============================================================================
-- 17. TAXONOMY SEED DATA & SYSTEM DEFAULTS
-- ============================================================================

-- 1. Seed All Worldwide Countries
INSERT INTO public.country_configs (code, name, flag, region, is_tier1, enabled) VALUES
('US', 'United States', '????', 'North America', true, true),
('CA', 'Canada', '????', 'North America', true, true),
('GB', 'United Kingdom', '????', 'Europe', true, true),
('AU', 'Australia', '????', 'Oceania', true, true),
('DE', 'Germany', '????', 'Europe', true, true),
('FR', 'France', '????', 'Europe', true, true),
('JP', 'Japan', '????', 'Asia', true, true),
('KR', 'South Korea', '????', 'Asia', true, true),
('ES', 'Spain', '????', 'Europe', true, true),
('IT', 'Italy', '????', 'Europe', true, true),
('NL', 'Netherlands', '????', 'Europe', true, true),
('CH', 'Switzerland', '????', 'Europe', true, true),
('SE', 'Sweden', '????', 'Europe', true, true),
('NO', 'Norway', '????', 'Europe', true, true),
('DK', 'Denmark', '????', 'Europe', true, true),
('FI', 'Finland', '????', 'Europe', true, true),
('IE', 'Ireland', '????', 'Europe', true, true),
('NZ', 'New Zealand', '????', 'Oceania', true, true),
('SG', 'Singapore', '????', 'Asia', true, true),
('AE', 'United Arab Emirates', '????', 'Middle East', true, true),
('SA', 'Saudi Arabia', '????', 'Middle East', true, true),
('QA', 'Qatar', '????', 'Middle East', true, true),
('KW', 'Kuwait', '????', 'Middle East', true, true),
('AT', 'Austria', '????', 'Europe', true, true),
('BE', 'Belgium', '????', 'Europe', true, true),
('BR', 'Brazil', '????', 'South America', false, true),
('MX', 'Mexico', '????', 'North America', false, true),
('CO', 'Colombia', '????', 'South America', false, true),
('AR', 'Argentina', '????', 'South America', false, true),
('CL', 'Chile', '????', 'South America', false, true),
('PE', 'Peru', '????', 'South America', false, true),
('EC', 'Ecuador', '????', 'South America', false, true),
('VE', 'Venezuela', '????', 'South America', false, true),
('UY', 'Uruguay', '????', 'South America', false, true),
('PY', 'Paraguay', '????', 'South America', false, true),
('BO', 'Bolivia', '????', 'South America', false, true),
('CR', 'Costa Rica', '????', 'North America', false, true),
('PA', 'Panama', '????', 'North America', false, true),
('DO', 'Dominican Republic', '????', 'Caribbean', false, true),
('GT', 'Guatemala', '????', 'North America', false, true),
('HN', 'Honduras', '????', 'North America', false, true),
('SV', 'El Salvador', '????', 'North America', false, true),
('NI', 'Nicaragua', '????', 'North America', false, true),
('PR', 'Puerto Rico', '????', 'Caribbean', false, true),
('JM', 'Jamaica', '????', 'Caribbean', false, true),
('TT', 'Trinidad and Tobago', '????', 'Caribbean', false, true),
('PL', 'Poland', '????', 'Europe', false, true),
('PT', 'Portugal', '????', 'Europe', false, true),
('GR', 'Greece', '????', 'Europe', false, true),
('CZ', 'Czech Republic', '????', 'Europe', false, true),
('RO', 'Romania', '????', 'Europe', false, true),
('HU', 'Hungary', '????', 'Europe', false, true),
('BG', 'Bulgaria', '????', 'Europe', false, true),
('HR', 'Croatia', '????', 'Europe', false, true),
('RS', 'Serbia', '????', 'Europe', false, true),
('SK', 'Slovakia', '????', 'Europe', false, true),
('SI', 'Slovenia', '????', 'Europe', false, true),
('LT', 'Lithuania', '????', 'Europe', false, true),
('LV', 'Latvia', '????', 'Europe', false, true),
('EE', 'Estonia', '????', 'Europe', false, true),
('UA', 'Ukraine', '????', 'Europe', false, true),
('TR', 'Turkey', '????', 'Europe', false, true),
('CY', 'Cyprus', '????', 'Europe', false, true),
('MT', 'Malta', '????', 'Europe', false, true),
('IS', 'Iceland', '????', 'Europe', false, true),
('LU', 'Luxembourg', '????', 'Europe', false, true),
('AL', 'Albania', '????', 'Europe', false, true),
('BA', 'Bosnia and Herzegovina', '????', 'Europe', false, true),
('MK', 'North Macedonia', '????', 'Europe', false, true),
('ME', 'Montenegro', '????', 'Europe', false, true),
('MD', 'Moldova', '????', 'Europe', false, true),
('GE', 'Georgia', '????', 'Europe', false, true),
('AM', 'Armenia', '????', 'Europe', false, true),
('AZ', 'Azerbaijan', '????', 'Europe', false, true),
('IN', 'India', '????', 'Asia', false, true),
('CN', 'China', '????', 'Asia', false, true),
('PH', 'Philippines', '????', 'Asia', false, true),
('TH', 'Thailand', '????', 'Asia', false, true),
('ID', 'Indonesia', '????', 'Asia', false, true),
('VN', 'Vietnam', '????', 'Asia', false, true),
('MY', 'Malaysia', '????', 'Asia', false, true),
('TW', 'Taiwan', '????', 'Asia', false, true),
('HK', 'Hong Kong', '????', 'Asia', false, true),
('PK', 'Pakistan', '????', 'Asia', false, true),
('BD', 'Bangladesh', '????', 'Asia', false, true),
('LK', 'Sri Lanka', '????', 'Asia', false, true),
('NP', 'Nepal', '????', 'Asia', false, true),
('KZ', 'Kazakhstan', '????', 'Asia', false, true),
('UZ', 'Uzbekistan', '????', 'Asia', false, true),
('KH', 'Cambodia', '????', 'Asia', false, true),
('MN', 'Mongolia', '????', 'Asia', false, true),
('IL', 'Israel', '????', 'Middle East', false, true),
('EG', 'Egypt', '????', 'Middle East', false, true),
('MA', 'Morocco', '????', 'Middle East', false, true),
('JO', 'Jordan', '????', 'Middle East', false, true),
('LB', 'Lebanon', '????', 'Middle East', false, true),
('OM', 'Oman', '????', 'Middle East', false, true),
('BH', 'Bahrain', '????', 'Middle East', false, true),
('TN', 'Tunisia', '????', 'Middle East', false, true),
('DZ', 'Algeria', '????', 'Middle East', false, true),
('IQ', 'Iraq', '????', 'Middle East', false, true),
('ZA', 'South Africa', '????', 'Africa', false, true),
('NG', 'Nigeria', '????', 'Africa', false, true),
('KE', 'Kenya', '????', 'Africa', false, true),
('GH', 'Ghana', '????', 'Africa', false, true),
('ET', 'Ethiopia', '????', 'Africa', false, true),
('TZ', 'Tanzania', '????', 'Africa', false, true),
('UG', 'Uganda', '????', 'Africa', false, true),
('CI', 'Ivory Coast', '????', 'Africa', false, true),
('SN', 'Senegal', '????', 'Africa', false, true),
('CM', 'Cameroon', '????', 'Africa', false, true),
('ZW', 'Zimbabwe', '????', 'Africa', false, true),
('MU', 'Mauritius', '????', 'Africa', false, true),
('FJ', 'Fiji', '????', 'Oceania', false, true),
('PG', 'Papua New Guinea', '????', 'Oceania', false, true)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    flag = EXCLUDED.flag,
    region = EXCLUDED.region,
    is_tier1 = EXCLUDED.is_tier1;

-- 2. Seed All Spoken Languages
INSERT INTO public.language_configs (code, name, native_name, popular, region, enabled) VALUES
('en', 'English', 'English', true, 'Global', true),
('es', 'Spanish', 'Espa?ol', true, 'Europe & Americas', true),
('fr', 'French', 'Fran?ais', true, 'Europe & Africa', true),
('de', 'German', 'Deutsch', true, 'Europe', true),
('it', 'Italian', 'Italiano', true, 'Europe', true),
('pt', 'Portuguese', 'Portugu?s', true, 'Europe & Americas', true),
('ru', 'Russian', '???????', true, 'Eurasia', true),
('zh', 'Chinese (Mandarin)', '?? (???)', true, 'East Asia', true),
('zh-yue', 'Chinese (Cantonese)', '??', true, 'East Asia', true),
('ja', 'Japanese', '???', true, 'East Asia', true),
('ko', 'Korean', '???', true, 'East Asia', true),
('ar', 'Arabic', '???????', true, 'Middle East & North Africa', true),
('hi', 'Hindi', '??????', true, 'South Asia', true),
('ur', 'Urdu', '????', true, 'South Asia', true),
('tr', 'Turkish', 'T?rk?e', true, 'Middle East & Europe', true),
('vi', 'Vietnamese', 'Ti?ng Vi?t', true, 'Southeast Asia', true),
('th', 'Thai', '???', true, 'Southeast Asia', true),
('tl', 'Tagalog (Filipino)', 'Tagalog', true, 'Southeast Asia', true),
('id', 'Indonesian', 'Bahasa Indonesia', true, 'Southeast Asia', true),
('ms', 'Malay', 'Bahasa Melayu', true, 'Southeast Asia', true),
('nl', 'Dutch', 'Nederlands', false, 'Europe', true),
('pl', 'Polish', 'Polski', false, 'Europe', true),
('uk', 'Ukrainian', '??????????', false, 'Europe', true),
('sv', 'Swedish', 'Svenska', false, 'Europe', true),
('no', 'Norwegian', 'Norsk', false, 'Europe', true),
('da', 'Danish', 'Dansk', false, 'Europe', true),
('fi', 'Finnish', 'Suomi', false, 'Europe', true),
('el', 'Greek', '????????', false, 'Europe', true),
('cs', 'Czech', '?e?tina', false, 'Europe', true),
('ro', 'Romanian', 'Rom?n?', false, 'Europe', true),
('hu', 'Hungarian', 'Magyar', false, 'Europe', true),
('bg', 'Bulgarian', '?????????', false, 'Europe', true),
('hr', 'Croatian', 'Hrvatski', false, 'Europe', true),
('sr', 'Serbian', '??????', false, 'Europe', true),
('sk', 'Slovak', 'Sloven?ina', false, 'Europe', true),
('sl', 'Slovenian', 'Sloven??ina', false, 'Europe', true),
('lt', 'Lithuanian', 'Lietuvi?', false, 'Europe', true),
('lv', 'Latvian', 'Latvie?u', false, 'Europe', true),
('et', 'Estonian', 'Eesti', false, 'Europe', true),
('bn', 'Bengali', '?????', false, 'South Asia', true),
('pa', 'Punjabi', '??????', false, 'South Asia', true),
('ta', 'Tamil', '?????', false, 'South Asia', true),
('te', 'Telugu', '??????', false, 'South Asia', true),
('mr', 'Marathi', '?????', false, 'South Asia', true),
('gu', 'Gujarati', '???????', false, 'South Asia', true),
('kn', 'Kannada', '?????', false, 'South Asia', true),
('ml', 'Malayalam', '??????', false, 'South Asia', true),
('ne', 'Nepali', '??????', false, 'South Asia', true),
('si', 'Sinhala', '?????', false, 'South Asia', true),
('fa', 'Persian (Farsi)', '?????', false, 'Middle East', true),
('he', 'Hebrew', '?????', false, 'Middle East', true),
('az', 'Azerbaijani', 'Az?rbaycan', false, 'Central Asia', true),
('ka', 'Georgian', '???????', false, 'Caucasus', true),
('hy', 'Armenian', '???????', false, 'Caucasus', true),
('kk', 'Kazakh', '???????', false, 'Central Asia', true),
('uz', 'Uzbek', 'O?zbek', false, 'Central Asia', true),
('sw', 'Swahili', 'Kiswahili', false, 'Africa', true),
('am', 'Amharic', '????', false, 'Africa', true),
('yo', 'Yoruba', '?d? Yor?b?', false, 'Africa', true),
('ig', 'Igbo', 'As?s? Igbo', false, 'Africa', true),
('ha', 'Hausa', 'Harshen Hausa', false, 'Africa', true),
('zu', 'Zulu', 'isiZulu', false, 'Africa', true),
('af', 'Afrikaans', 'Afrikaans', false, 'Africa', true)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    native_name = EXCLUDED.native_name,
    popular = EXCLUDED.popular,
    region = EXCLUDED.region;

-- 3. Seed All 12 Astrological Zodiac Signs
INSERT INTO public.zodiac_configs (key, name, symbol, date_range, element, enabled) VALUES
('aries', 'Aries', '?', 'Mar 21 - Apr 19', 'fire', true),
('taurus', 'Taurus', '?', 'Apr 20 - May 20', 'earth', true),
('gemini', 'Gemini', '?', 'May 21 - Jun 20', 'air', true),
('cancer', 'Cancer', '?', 'Jun 21 - Jul 22', 'water', true),
('leo', 'Leo', '?', 'Jul 23 - Aug 22', 'fire', true),
('virgo', 'Virgo', '?', 'Aug 23 - Sep 22', 'earth', true),
('libra', 'Libra', '?', 'Sep 23 - Oct 22', 'air', true),
('scorpio', 'Scorpio', '?', 'Oct 23 - Nov 21', 'water', true),
('sagittarius', 'Sagittarius', '?', 'Nov 22 - Dec 21', 'fire', true),
('capricorn', 'Capricorn', '?', 'Dec 22 - Jan 19', 'earth', true),
('aquarius', 'Aquarius', '?', 'Jan 20 - Feb 18', 'air', true),
('pisces', 'Pisces', '?', 'Feb 19 - Mar 20', 'water', true)
ON CONFLICT (key) DO UPDATE SET
    name = EXCLUDED.name,
    symbol = EXCLUDED.symbol,
    date_range = EXCLUDED.date_range,
    element = EXCLUDED.element;

-- 4. Seed All Categorized Interests & Passions
INSERT INTO public.interest_configs (id, name, category, icon_name, color, popular, enabled) VALUES
('travel', 'Travel & Adventure', 'lifestyle', 'Compass', '#38bdf8', true, true),
('photography', 'Photography & Stories', 'lifestyle', 'Camera', '#f472b6', true, true),
('fashion', 'Fashion & Style', 'lifestyle', 'Shirt', '#ec4899', true, true),
('pets', 'Dogs & Cat Lovers', 'lifestyle', 'PawPrint', '#fb923c', false, true),
('nature', 'Nature & Camping', 'lifestyle', 'Trees', '#4ade80', false, true),
('roadtrips', 'Road Trips', 'lifestyle', 'Car', '#60a5fa', false, true),
('fitness', 'Fitness & Gym', 'sports', 'Dumbbell', '#f97316', true, true),
('running', 'Running & Marathons', 'sports', 'Activity', '#ef4444', false, true),
('swimming', 'Swimming & Beach', 'sports', 'Waves', '#06b6d4', false, true),
('cycling', 'Cycling & Biking', 'sports', 'Bike', '#84cc16', false, true),
('football', 'Soccer & Football', 'sports', 'Trophy', '#22c55e', false, true),
('basketball', 'Basketball', 'sports', 'Target', '#f59e0b', false, true),
('martial_arts', 'Martial Arts & Boxing', 'sports', 'Shield', '#dc2626', false, true),
('music_concerts', 'Music & Concerts', 'music', 'Music', '#a855f7', true, true),
('karaoke', 'Singing & Karaoke', 'music', 'Mic', '#d946ef', true, true),
('dj_edm', 'DJing & EDM Festivals', 'music', 'Radio', '#8b5cf6', false, true),
('rock_metal', 'Rock & Indie Bands', 'music', 'Guitar', '#6366f1', false, true),
('hiphop_rnb', 'Hip-Hop & R&B', 'music', 'Disc', '#ec4899', false, true),
('classical', 'Classical & Jazz', 'music', 'Piano', '#3b82f6', false, true),
('art_design', 'Art & Design', 'art', 'Palette', '#14b8a6', true, true),
('movies_cinema', 'Movies & Cinema', 'art', 'Film', '#0ea5e9', true, true),
('anime_manga', 'Anime & Manga', 'art', 'Sparkles', '#f43f5e', true, true),
('dancing', 'Dancing & Choreography', 'art', 'Footprints', '#e11d48', false, true),
('writing_poetry', 'Writing & Books', 'art', 'BookOpen', '#10b981', false, true),
('cosplay', 'Cosplay & Conventions', 'art', 'Mask', '#a21caf', false, true),
('gaming', 'Gaming & Esports', 'tech', 'Gamepad2', '#3b82f6', true, true),
('streaming', 'Live Streaming & Twitch', 'tech', 'Tv', '#9333ea', true, true),
('tech_coding', 'Tech & Programming', 'tech', 'Code', '#0284c7', false, true),
('crypto_web3', 'Crypto & Investing', 'tech', 'Coins', '#eab308', false, true),
('ai_future', 'AI & Gadgets', 'tech', 'Cpu', '#6366f1', false, true),
('board_games', 'Board Games & Trivia', 'tech', 'Dice', '#f59e0b', false, true),
('cooking', 'Cooking & Foodie', 'food', 'Utensils', '#f97316', true, true),
('coffee_cafes', 'Coffee & Cozy Cafes', 'food', 'Coffee', '#b45309', true, true),
('baking', 'Baking & Desserts', 'food', 'Cake', '#f472b6', false, true),
('wine_cocktails', 'Wine Tasting & Cocktails', 'food', 'Wine', '#be123c', false, true),
('street_food', 'Street Food Exploring', 'food', 'Pizza', '#ea580c', false, true),
('yoga_meditation', 'Yoga & Meditation', 'wellness', 'Smile', '#10b981', true, true),
('mental_health', 'Mindfulness & Growth', 'wellness', 'Heart', '#ec4899', false, true),
('spa_skincare', 'Skincare & Self-Care', 'wellness', 'Flower', '#f43f5e', false, true),
('astrology', 'Astrology & Crystals', 'wellness', 'Moon', '#8b5cf6', false, true),
('late_night_chats', 'Late Night Talks', 'social', 'MessageCircle', '#6366f1', true, true),
('nightlife_dining', 'Nightlife & Lounges', 'social', 'PartyPopper', '#d946ef', true, true),
('language_exchange', 'Language Exchange', 'social', 'Globe', '#06b6d4', true, true),
('volunteering', 'Volunteering & Causes', 'social', 'HeartHandshake', '#10b981', false, true)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    icon_name = EXCLUDED.icon_name,
    color = EXCLUDED.color,
    popular = EXCLUDED.popular;

-- 4b. Seed store display currencies (placeholder rates ? admin-editable)
-- rate_from_usd = local currency units per 1 USD
INSERT INTO public.currency_configs (code, name, symbol, rate_from_usd, enabled, order_num) VALUES
('USD', 'US Dollar', '$', 1, true, 0),
('AED', 'UAE Dirham', '?.?', 3.6725, true, 1),
('EUR', 'Euro', '?', 0.92, true, 2),
('GBP', 'British Pound', '?', 0.79, true, 3),
('SAR', 'Saudi Riyal', '?', 3.75, true, 4),
('PKR', 'Pakistani Rupee', 'Rs', 278, true, 5),
('INR', 'Indian Rupee', '?', 83, true, 6),
('CAD', 'Canadian Dollar', 'C$', 1.36, true, 7),
('AUD', 'Australian Dollar', 'A$', 1.52, true, 8),
('TRY', 'Turkish Lira', '?', 32, true, 9),
('EGP', 'Egyptian Pound', 'E?', 48, true, 10),
('BRL', 'Brazilian Real', 'R$', 5.0, true, 11),
('JPY', 'Japanese Yen', '?', 150, true, 12),
('CNY', 'Chinese Yuan', '?', 7.2, false, 13)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    symbol = EXCLUDED.symbol,
    order_num = EXCLUDED.order_num;

-- 5. Seed / Update Master System Configs
INSERT INTO public.system_configs (
    id,
    coin_burn_rate_per_min,
    coin_burn_rate_friend_per_min,
    female_earning_rate_per_min,
    female_host_share_percent,
    female_host_target_share_percent,
    team_leader_share_percent,
    gift_female_host_share_percent,
    gift_team_leader_share_percent,
    enable_virtual_gifts,
    coin_usd_peg,
    coin_to_usd_ratio,
    female_payout_ratio_usd,
    min_payout_threshold_usd,
    allowed_country_codes,
    allowed_languages,
    allowed_zodiac_signs,
    allowed_interests,
    flag_sizes_json
)
VALUES (
    'default',
    120,
    80,
    36,
    30,
    40,
    10,
    70,
    10,
    true,
    0.003,
    0.003,
    0.003,
    50,
    ARRAY['AL','DZ','AR','AM','AU','AT','AZ','BH','BD','BE','BO','BA','BR','BG','KH','CM','CA','CL','CN','CO','CR','HR','CY','CZ','DK','DO','EC','EG','SV','EE','ET','FJ','FI','FR','GE','DE','GH','GR','GT','HN','HK','HU','IS','IN','ID','IQ','IE','IL','IT','CI','JM','JP','JO','KZ','KE','KW','LV','LB','LT','LU','MY','MT','MU','MX','MD','MN','ME','MA','NP','NL','NZ','NI','NG','MK','NO','OM','PK','PA','PG','PY','PE','PH','PL','PT','PR','QA','RO','SA','SN','RS','SG','SK','SI','ZA','KR','ES','LK','SE','CH','TW','TZ','TH','TT','TN','TR','UG','UA','AE','GB','US','UY','UZ','VE','VN','ZW'],
    ARRAY['Afrikaans','Amharic','Arabic','Armenian','Azerbaijani','Bengali','Bulgarian','Chinese (Cantonese)','Chinese (Mandarin)','Croatian','Czech','Danish','Dutch','English','Estonian','Finnish','French','Georgian','German','Greek','Gujarati','Hausa','Hebrew','Hindi','Hungarian','Igbo','Indonesian','Italian','Japanese','Kannada','Kazakh','Korean','Latvian','Lithuanian','Malay','Malayalam','Marathi','Nepali','Norwegian','Pashto','Persian (Farsi)','Polish','Portuguese','Punjabi','Romanian','Russian','Serbian','Sinhala','Slovak','Slovenian','Spanish','Swahili','Swedish','Tagalog (Filipino)','Tamil','Telugu','Thai','Turkish','Ukrainian','Urdu','Uzbek','Vietnamese','Yoruba','Zulu'],
    ARRAY['aries','taurus','gemini','cancer','leo','virgo','libra','scorpio','sagittarius','capricorn','aquarius','pisces'],
    ARRAY['Travel & Adventure','Photography & Stories','Fashion & Style','Dogs & Cat Lovers','Nature & Camping','Road Trips','Fitness & Gym','Running & Marathons','Swimming & Beach','Cycling & Biking','Soccer & Football','Basketball','Martial Arts & Boxing','Music & Concerts','Singing & Karaoke','DJing & EDM Festivals','Rock & Indie Bands','Hip-Hop & R&B','Classical & Jazz','Art & Design','Movies & Cinema','Anime & Manga','Dancing & Choreography','Writing & Books','Cosplay & Conventions','Gaming & Esports','Live Streaming & Twitch','Tech & Programming','Crypto & Investing','AI & Gadgets','Board Games & Trivia','Cooking & Foodie','Coffee & Cozy Cafes','Baking & Desserts','Wine Tasting & Cocktails','Street Food Exploring','Yoga & Meditation','Mindfulness & Growth','Skincare & Self-Care','Astrology & Crystals','Late Night Talks','Nightlife & Lounges','Language Exchange','Volunteering & Causes'],
    '{"xs":14,"sm":18,"card":18,"md":22,"lg":27,"admin":27,"xl":36,"2xl":48}'
)
ON CONFLICT (id) DO UPDATE SET
    allowed_country_codes = EXCLUDED.allowed_country_codes,
    allowed_languages = EXCLUDED.allowed_languages,
    allowed_zodiac_signs = EXCLUDED.allowed_zodiac_signs,
    allowed_interests = EXCLUDED.allowed_interests,
    flag_sizes_json = EXCLUDED.flag_sizes_json,
    updated_at = now();

-- ============================================================================
-- 18. AUTHZ HARDENING (owner RLS, hide password_hash, admin-only config writes)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT p.id FROM public.profiles p WHERE p.auth_id = auth.uid() LIMIT 1),
    auth.uid()::text
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.role = 'admin'
      AND (p.auth_id = auth.uid() OR p.id = auth.uid()::text)
  );
$$;

-- API roles need table privileges (RLS still applies for anon/authenticated).
-- Fresh projects that omit these grants fail with: permission denied for table profiles
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;

REVOKE SELECT (password_hash) ON public.profiles FROM anon, authenticated;

DROP POLICY IF EXISTS "public select profiles" ON public.profiles;
DROP POLICY IF EXISTS "authenticated insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "authenticated update profiles" ON public.profiles;
DROP POLICY IF EXISTS "authenticated select profiles" ON public.profiles;
DROP POLICY IF EXISTS "owner insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "owner update profiles" ON public.profiles;
CREATE POLICY "authenticated select profiles" ON public.profiles FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "owner insert profiles" ON public.profiles FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL AND (id = auth.uid()::text OR auth_id = auth.uid() OR id = public.current_profile_id())
);
CREATE POLICY "owner update profiles" ON public.profiles FOR UPDATE
  USING (id = public.current_profile_id() OR public.is_admin_user())
  WITH CHECK (id = public.current_profile_id() OR public.is_admin_user());

DROP POLICY IF EXISTS "public select messages" ON public.messages;
DROP POLICY IF EXISTS "authenticated insert messages" ON public.messages;
DROP POLICY IF EXISTS "authenticated update messages" ON public.messages;
DROP POLICY IF EXISTS "participants select messages" ON public.messages;
DROP POLICY IF EXISTS "sender insert messages" ON public.messages;
DROP POLICY IF EXISTS "participants update messages" ON public.messages;
CREATE POLICY "participants select messages" ON public.messages FOR SELECT USING (
  sender_id = public.current_profile_id() OR receiver_id = public.current_profile_id() OR public.is_admin_user()
);
CREATE POLICY "sender insert messages" ON public.messages FOR INSERT WITH CHECK (
  sender_id = public.current_profile_id()
);
CREATE POLICY "participants update messages" ON public.messages FOR UPDATE USING (
  sender_id = public.current_profile_id() OR receiver_id = public.current_profile_id() OR public.is_admin_user()
);

DROP POLICY IF EXISTS "public select call_logs" ON public.call_logs;
DROP POLICY IF EXISTS "authenticated insert call_logs" ON public.call_logs;
DROP POLICY IF EXISTS "authenticated update call_logs" ON public.call_logs;
DROP POLICY IF EXISTS "participants select call_logs" ON public.call_logs;
DROP POLICY IF EXISTS "participants insert call_logs" ON public.call_logs;
DROP POLICY IF EXISTS "participants update call_logs" ON public.call_logs;
DROP POLICY IF EXISTS "admin insert call_logs" ON public.call_logs;
DROP POLICY IF EXISTS "admin update call_logs" ON public.call_logs;
CREATE POLICY "participants select call_logs" ON public.call_logs FOR SELECT USING (
  caller_id = public.current_profile_id() OR receiver_id = public.current_profile_id() OR host_id = public.current_profile_id() OR public.is_admin_user()
);
-- Participants may insert/update their own call rows; platform analytics primarily persist via service-role backend.
CREATE POLICY "participants insert call_logs" ON public.call_logs FOR INSERT WITH CHECK (
  caller_id = public.current_profile_id() OR receiver_id = public.current_profile_id() OR host_id = public.current_profile_id() OR public.is_admin_user()
);
CREATE POLICY "participants update call_logs" ON public.call_logs FOR UPDATE USING (
  caller_id = public.current_profile_id() OR receiver_id = public.current_profile_id() OR host_id = public.current_profile_id() OR public.is_admin_user()
) WITH CHECK (
  caller_id = public.current_profile_id() OR receiver_id = public.current_profile_id() OR host_id = public.current_profile_id() OR public.is_admin_user()
);

DROP POLICY IF EXISTS "public select payout_requests" ON public.payout_requests;
DROP POLICY IF EXISTS "authenticated insert payout_requests" ON public.payout_requests;
DROP POLICY IF EXISTS "authenticated update payout_requests" ON public.payout_requests;
DROP POLICY IF EXISTS "owner select payout_requests" ON public.payout_requests;
DROP POLICY IF EXISTS "owner insert payout_requests" ON public.payout_requests;
DROP POLICY IF EXISTS "admin update payout_requests" ON public.payout_requests;
CREATE POLICY "owner select payout_requests" ON public.payout_requests FOR SELECT USING (
  user_id = public.current_profile_id() OR public.is_admin_user()
);
-- Phase 7: no INSERT/UPDATE via client RLS ? settlement_batches is the only cash-out path

DROP POLICY IF EXISTS "public select wallet_ledger" ON public.wallet_ledger;
DROP POLICY IF EXISTS "authenticated insert wallet_ledger" ON public.wallet_ledger;
DROP POLICY IF EXISTS "owner select wallet_ledger" ON public.wallet_ledger;
CREATE POLICY "owner select wallet_ledger" ON public.wallet_ledger FOR SELECT USING (
  user_id = public.current_profile_id() OR public.is_admin_user()
);

DROP POLICY IF EXISTS "authenticated insert system_configs" ON public.system_configs;
DROP POLICY IF EXISTS "authenticated update system_configs" ON public.system_configs;
DROP POLICY IF EXISTS "admin write system_configs" ON public.system_configs;
CREATE POLICY "admin write system_configs" ON public.system_configs FOR ALL USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());

-- ============================================================================
-- USER DAILY REWARDS ? owner-only RLS (claims/credits go through service-role backend)
-- Clients may SELECT/INSERT own row for bootstrap; claim flags & coin awards are
-- enforced server-side via /api/rewards/claim-* + claim_daily_reward_atomic.
-- Re-apply in Supabase SQL editor after deploy: run this block (and claim_daily_reward_atomic).
-- ============================================================================
DROP POLICY IF EXISTS "public select user_daily_rewards" ON public.user_daily_rewards;
DROP POLICY IF EXISTS "authenticated insert user_daily_rewards" ON public.user_daily_rewards;
DROP POLICY IF EXISTS "authenticated update user_daily_rewards" ON public.user_daily_rewards;
DROP POLICY IF EXISTS "admin delete user_daily_rewards" ON public.user_daily_rewards;
DROP POLICY IF EXISTS "owner select user_daily_rewards" ON public.user_daily_rewards;
DROP POLICY IF EXISTS "owner insert user_daily_rewards" ON public.user_daily_rewards;
DROP POLICY IF EXISTS "owner update progress user_daily_rewards" ON public.user_daily_rewards;

CREATE POLICY "owner select user_daily_rewards" ON public.user_daily_rewards FOR SELECT USING (
  user_id = public.current_profile_id() OR public.is_admin_user()
);
CREATE POLICY "owner insert user_daily_rewards" ON public.user_daily_rewards FOR INSERT WITH CHECK (
  user_id = public.current_profile_id()
);
-- Owner updates allowed for progress fields only via backend preferred path;
-- keep owner UPDATE so legacy clients can sync progress, but claim endpoints
-- remain the only coin source (service role). Prefer removing direct client
-- claim-flag writes in application code.
CREATE POLICY "owner update progress user_daily_rewards" ON public.user_daily_rewards FOR UPDATE
  USING (user_id = public.current_profile_id() OR public.is_admin_user())
  WITH CHECK (user_id = public.current_profile_id() OR public.is_admin_user());
CREATE POLICY "admin delete user_daily_rewards" ON public.user_daily_rewards
  FOR DELETE USING (public.is_admin_user());

-- Video mission note: task_video_call_seconds stores SECONDS; admin config target is seconds;
-- DailyRewardsModal labels convert seconds ? minutes for display (target/60).

-- ============================================================================
-- 19. MATCHES / FAVORITES / BLOCKED_USERS ? participant/owner RLS
-- Mutations for like/pass/favorite MUST go through Express (service role).
-- Client SELECT is limited to participants/owners for privacy.
-- Match status semantics (see also policies comment above):
--   pending  = one-sided like; matched = mutual like OR Quick Match; rejected = pass.
-- ============================================================================
DROP POLICY IF EXISTS "public select matches" ON public.matches;
DROP POLICY IF EXISTS "authenticated insert matches" ON public.matches;
DROP POLICY IF EXISTS "authenticated update matches" ON public.matches;
DROP POLICY IF EXISTS "admin delete matches" ON public.matches;
DROP POLICY IF EXISTS "participants select matches" ON public.matches;
DROP POLICY IF EXISTS "participant insert matches" ON public.matches;
DROP POLICY IF EXISTS "participant update matches" ON public.matches;
DROP POLICY IF EXISTS "admin delete matches hardened" ON public.matches;

CREATE POLICY "participants select matches" ON public.matches FOR SELECT USING (
  user_a_id = public.current_profile_id()
  OR user_b_id = public.current_profile_id()
  OR public.is_admin_user()
);
CREATE POLICY "participant insert matches" ON public.matches FOR INSERT WITH CHECK (
  initiated_by = public.current_profile_id()
  AND (user_a_id = public.current_profile_id() OR user_b_id = public.current_profile_id())
);
CREATE POLICY "participant update matches" ON public.matches FOR UPDATE
  USING (
    user_a_id = public.current_profile_id()
    OR user_b_id = public.current_profile_id()
    OR public.is_admin_user()
  )
  WITH CHECK (
    user_a_id = public.current_profile_id()
    OR user_b_id = public.current_profile_id()
    OR public.is_admin_user()
  );
CREATE POLICY "admin delete matches hardened" ON public.matches
  FOR DELETE USING (public.is_admin_user());

DROP POLICY IF EXISTS "public select favorites" ON public.favorites;
DROP POLICY IF EXISTS "authenticated insert favorites" ON public.favorites;
DROP POLICY IF EXISTS "authenticated update favorites" ON public.favorites;
DROP POLICY IF EXISTS "owner/admin delete favorites" ON public.favorites;
DROP POLICY IF EXISTS "owner select favorites" ON public.favorites;
DROP POLICY IF EXISTS "owner insert favorites" ON public.favorites;
DROP POLICY IF EXISTS "owner update favorites" ON public.favorites;
DROP POLICY IF EXISTS "owner delete favorites" ON public.favorites;

CREATE POLICY "owner select favorites" ON public.favorites FOR SELECT USING (
  user_id = public.current_profile_id() OR public.is_admin_user()
);
CREATE POLICY "owner insert favorites" ON public.favorites FOR INSERT WITH CHECK (
  user_id = public.current_profile_id()
);
CREATE POLICY "owner update favorites" ON public.favorites FOR UPDATE
  USING (user_id = public.current_profile_id() OR public.is_admin_user())
  WITH CHECK (user_id = public.current_profile_id() OR public.is_admin_user());
CREATE POLICY "owner delete favorites" ON public.favorites FOR DELETE USING (
  user_id = public.current_profile_id() OR public.is_admin_user()
);

DROP POLICY IF EXISTS "public select blocked_users" ON public.blocked_users;
DROP POLICY IF EXISTS "authenticated insert blocked_users" ON public.blocked_users;
DROP POLICY IF EXISTS "authenticated update blocked_users" ON public.blocked_users;
DROP POLICY IF EXISTS "owner/admin delete blocked_users" ON public.blocked_users;
DROP POLICY IF EXISTS "owner select blocked_users" ON public.blocked_users;
DROP POLICY IF EXISTS "owner insert blocked_users" ON public.blocked_users;
DROP POLICY IF EXISTS "owner update blocked_users" ON public.blocked_users;
DROP POLICY IF EXISTS "owner delete blocked_users" ON public.blocked_users;

-- Owner sees who they blocked; also allow seeing rows where current user is the blocked party
-- so discovery/swipe/QM can exclude mutual block relationships client-side.
CREATE POLICY "owner select blocked_users" ON public.blocked_users FOR SELECT USING (
  user_id = public.current_profile_id()
  OR blocked_user_id = public.current_profile_id()
  OR public.is_admin_user()
);
CREATE POLICY "owner insert blocked_users" ON public.blocked_users FOR INSERT WITH CHECK (
  user_id = public.current_profile_id()
);
CREATE POLICY "owner update blocked_users" ON public.blocked_users FOR UPDATE
  USING (user_id = public.current_profile_id() OR public.is_admin_user())
  WITH CHECK (user_id = public.current_profile_id() OR public.is_admin_user());
CREATE POLICY "owner delete blocked_users" ON public.blocked_users FOR DELETE USING (
  user_id = public.current_profile_id() OR public.is_admin_user()
);

-- ============================================================================
-- FRIEND REQUESTS ? participant RLS (mutations go through Express + service role)
-- Drop early permissive public/authenticated policies; participants only.
-- ============================================================================
DROP POLICY IF EXISTS "public select friend_requests" ON public.friend_requests;
DROP POLICY IF EXISTS "authenticated insert friend_requests" ON public.friend_requests;
DROP POLICY IF EXISTS "authenticated update friend_requests" ON public.friend_requests;
DROP POLICY IF EXISTS "admin delete friend_requests" ON public.friend_requests;
DROP POLICY IF EXISTS "participants select friend_requests" ON public.friend_requests;
DROP POLICY IF EXISTS "sender insert friend_requests" ON public.friend_requests;
DROP POLICY IF EXISTS "participants update friend_requests" ON public.friend_requests;
DROP POLICY IF EXISTS "participants delete friend_requests" ON public.friend_requests;
DROP POLICY IF EXISTS "admin delete friend_requests hardened" ON public.friend_requests;

CREATE POLICY "participants select friend_requests" ON public.friend_requests FOR SELECT USING (
  sender_id = public.current_profile_id()
  OR receiver_id = public.current_profile_id()
  OR public.is_admin_user()
);
-- Client inserts must set sender_id = self; Express service-role bypasses RLS.
CREATE POLICY "sender insert friend_requests" ON public.friend_requests FOR INSERT WITH CHECK (
  sender_id = public.current_profile_id()
);
-- Receiver may accept/decline; sender may cancel; admin full update.
CREATE POLICY "participants update friend_requests" ON public.friend_requests FOR UPDATE
  USING (
    sender_id = public.current_profile_id()
    OR receiver_id = public.current_profile_id()
    OR public.is_admin_user()
  )
  WITH CHECK (
    sender_id = public.current_profile_id()
    OR receiver_id = public.current_profile_id()
    OR public.is_admin_user()
  );
CREATE POLICY "participants delete friend_requests" ON public.friend_requests FOR DELETE USING (
  sender_id = public.current_profile_id()
  OR receiver_id = public.current_profile_id()
  OR public.is_admin_user()
);

-- ============================================================================
-- MODERATION REPORTS ? reporter/admin scoped (writes preferred via Express)
-- ============================================================================
DROP POLICY IF EXISTS "public select moderation_reports" ON public.moderation_reports;
DROP POLICY IF EXISTS "authenticated insert moderation_reports" ON public.moderation_reports;
DROP POLICY IF EXISTS "authenticated update moderation_reports" ON public.moderation_reports;
DROP POLICY IF EXISTS "admin delete moderation_reports" ON public.moderation_reports;
DROP POLICY IF EXISTS "Users can create moderation reports" ON public.moderation_reports;
DROP POLICY IF EXISTS "reporter select moderation_reports" ON public.moderation_reports;
DROP POLICY IF EXISTS "reporter insert moderation_reports" ON public.moderation_reports;
DROP POLICY IF EXISTS "admin update moderation_reports" ON public.moderation_reports;
DROP POLICY IF EXISTS "admin delete moderation_reports hardened" ON public.moderation_reports;

CREATE POLICY "reporter select moderation_reports" ON public.moderation_reports FOR SELECT USING (
  reporter_id = public.current_profile_id() OR public.is_admin_user()
);
CREATE POLICY "reporter insert moderation_reports" ON public.moderation_reports FOR INSERT WITH CHECK (
  reporter_id = public.current_profile_id()
);
CREATE POLICY "admin update moderation_reports" ON public.moderation_reports FOR UPDATE
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());
CREATE POLICY "admin delete moderation_reports hardened" ON public.moderation_reports
  FOR DELETE USING (public.is_admin_user());

-- ============================================================================
-- CREATOR REVIEWS ? caller/creator scoped (writes preferred via Express)
-- ============================================================================
DROP POLICY IF EXISTS "public select creator_reviews" ON public.creator_reviews;
DROP POLICY IF EXISTS "authenticated insert creator_reviews" ON public.creator_reviews;
DROP POLICY IF EXISTS "authenticated update creator_reviews" ON public.creator_reviews;
DROP POLICY IF EXISTS "admin delete creator_reviews" ON public.creator_reviews;
DROP POLICY IF EXISTS "participants select creator_reviews" ON public.creator_reviews;
DROP POLICY IF EXISTS "caller insert creator_reviews" ON public.creator_reviews;
DROP POLICY IF EXISTS "admin update creator_reviews" ON public.creator_reviews;
DROP POLICY IF EXISTS "admin delete creator_reviews hardened" ON public.creator_reviews;

CREATE POLICY "participants select creator_reviews" ON public.creator_reviews FOR SELECT USING (
  creator_id = public.current_profile_id()
  OR caller_id = public.current_profile_id()
  OR public.is_admin_user()
);
CREATE POLICY "caller insert creator_reviews" ON public.creator_reviews FOR INSERT WITH CHECK (
  caller_id = public.current_profile_id()
);
CREATE POLICY "admin update creator_reviews" ON public.creator_reviews FOR UPDATE
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());
CREATE POLICY "admin delete creator_reviews hardened" ON public.creator_reviews
  FOR DELETE USING (public.is_admin_user());

-- ============================================================================
-- FEED POSTS + LIKES ? public read; owner/admin write (Express preferred)
-- ============================================================================
DROP POLICY IF EXISTS "public select feed_posts" ON public.feed_posts;
DROP POLICY IF EXISTS "authenticated insert feed_posts" ON public.feed_posts;
DROP POLICY IF EXISTS "authenticated update feed_posts" ON public.feed_posts;
DROP POLICY IF EXISTS "admin delete feed_posts" ON public.feed_posts;
DROP POLICY IF EXISTS "owner insert feed_posts" ON public.feed_posts;
DROP POLICY IF EXISTS "owner update feed_posts" ON public.feed_posts;
DROP POLICY IF EXISTS "owner delete feed_posts" ON public.feed_posts;

CREATE POLICY "public select feed_posts" ON public.feed_posts FOR SELECT USING (true);
CREATE POLICY "owner insert feed_posts" ON public.feed_posts FOR INSERT WITH CHECK (
  creator_id = public.current_profile_id() OR public.is_admin_user()
);
CREATE POLICY "owner update feed_posts" ON public.feed_posts FOR UPDATE
  USING (creator_id = public.current_profile_id() OR public.is_admin_user())
  WITH CHECK (creator_id = public.current_profile_id() OR public.is_admin_user());
CREATE POLICY "owner delete feed_posts" ON public.feed_posts FOR DELETE USING (
  creator_id = public.current_profile_id() OR public.is_admin_user()
);

DROP POLICY IF EXISTS "owner select feed_post_likes" ON public.feed_post_likes;
DROP POLICY IF EXISTS "owner insert feed_post_likes" ON public.feed_post_likes;
DROP POLICY IF EXISTS "owner delete feed_post_likes" ON public.feed_post_likes;

CREATE POLICY "owner select feed_post_likes" ON public.feed_post_likes FOR SELECT USING (
  user_id = public.current_profile_id() OR public.is_admin_user()
);
CREATE POLICY "owner insert feed_post_likes" ON public.feed_post_likes FOR INSERT WITH CHECK (
  user_id = public.current_profile_id()
);
CREATE POLICY "owner delete feed_post_likes" ON public.feed_post_likes FOR DELETE USING (
  user_id = public.current_profile_id() OR public.is_admin_user()
);

-- ============================================================================
-- Message conversation soft-hide clears (clear chat for actor only)
-- ============================================================================
DROP POLICY IF EXISTS "owner select message_conversation_clears" ON public.message_conversation_clears;
DROP POLICY IF EXISTS "owner upsert message_conversation_clears" ON public.message_conversation_clears;
DROP POLICY IF EXISTS "owner insert message_conversation_clears" ON public.message_conversation_clears;
DROP POLICY IF EXISTS "owner update message_conversation_clears" ON public.message_conversation_clears;
DROP POLICY IF EXISTS "owner delete message_conversation_clears" ON public.message_conversation_clears;
CREATE POLICY "owner select message_conversation_clears" ON public.message_conversation_clears FOR SELECT USING (
  user_id = public.current_profile_id() OR public.is_admin_user()
);
CREATE POLICY "owner insert message_conversation_clears" ON public.message_conversation_clears FOR INSERT WITH CHECK (
  user_id = public.current_profile_id()
);
CREATE POLICY "owner update message_conversation_clears" ON public.message_conversation_clears FOR UPDATE
  USING (user_id = public.current_profile_id() OR public.is_admin_user())
  WITH CHECK (user_id = public.current_profile_id() OR public.is_admin_user());
CREATE POLICY "owner delete message_conversation_clears" ON public.message_conversation_clears FOR DELETE USING (
  user_id = public.current_profile_id() OR public.is_admin_user()
);

-- ============================================================================
-- CREATOR METRICS (hardened read policies; no client writes)
-- ============================================================================
DROP POLICY IF EXISTS "creator_metrics select own" ON public.creator_metrics;
DROP POLICY IF EXISTS "creator_metrics select agency" ON public.creator_metrics;
DROP POLICY IF EXISTS "creator_metrics select admin" ON public.creator_metrics;
DROP POLICY IF EXISTS "public select creator_metrics" ON public.creator_metrics;
DROP POLICY IF EXISTS "authenticated insert creator_metrics" ON public.creator_metrics;
DROP POLICY IF EXISTS "authenticated update creator_metrics" ON public.creator_metrics;
DROP POLICY IF EXISTS "admin delete creator_metrics" ON public.creator_metrics;

CREATE POLICY "creator_metrics select own" ON public.creator_metrics FOR SELECT USING (
  creator_id = public.current_profile_id() OR public.is_admin_user()
);
CREATE POLICY "creator_metrics select agency" ON public.creator_metrics FOR SELECT USING (
  agency_leader_id = public.current_profile_id()
  OR EXISTS (
    SELECT 1 FROM public.profiles host
    WHERE host.id = creator_metrics.creator_id
      AND (host.team_leader_id = public.current_profile_id() OR host.created_by_id = public.current_profile_id())
  )
);

-- Note: Message hard-delete policies are intentionally omitted.
-- Clear-chat uses soft-hide via message_conversation_clears so the peer retains their copy.
-- Durable inserts/read updates go through Express + service role; client RLS remains participant-scoped.
-- creator_metrics writes are Express + service role only (no INSERT/UPDATE/DELETE policies for authenticated).

-- ============================================================================
-- FINANCIAL MODULE RLS (service-role writes; limited authenticated reads)
-- Mutations for periods/ledger/batches/events/snapshots MUST go through Express + service role.
-- ============================================================================
DROP POLICY IF EXISTS "admin select settlement_periods" ON public.settlement_periods;
DROP POLICY IF EXISTS "admin select financial_ledger" ON public.financial_ledger;
DROP POLICY IF EXISTS "owner select financial_ledger" ON public.financial_ledger;
DROP POLICY IF EXISTS "admin select settlement_batches" ON public.settlement_batches;
DROP POLICY IF EXISTS "payee select settlement_batches" ON public.settlement_batches;
DROP POLICY IF EXISTS "admin select settlement_line_items" ON public.settlement_line_items;
DROP POLICY IF EXISTS "payee select settlement_line_items" ON public.settlement_line_items;
DROP POLICY IF EXISTS "tl select settlement_line_items via batch" ON public.settlement_line_items;
DROP POLICY IF EXISTS "admin select settlement_events" ON public.settlement_events;
DROP POLICY IF EXISTS "payee select settlement_events" ON public.settlement_events;
DROP POLICY IF EXISTS "admin select creator_period_snapshots" ON public.creator_period_snapshots;
DROP POLICY IF EXISTS "owner select creator_period_snapshots" ON public.creator_period_snapshots;
DROP POLICY IF EXISTS "agency select creator_period_snapshots" ON public.creator_period_snapshots;

CREATE POLICY "admin select settlement_periods" ON public.settlement_periods FOR SELECT USING (
  public.is_admin_user()
);

CREATE POLICY "admin select financial_ledger" ON public.financial_ledger FOR SELECT USING (
  public.is_admin_user()
);
-- Phase 10: no owner/payee SELECT on financial_ledger (amounts only via Express admin/TL APIs)

CREATE POLICY "admin select settlement_batches" ON public.settlement_batches FOR SELECT USING (
  public.is_admin_user()
);
CREATE POLICY "payee select settlement_batches" ON public.settlement_batches FOR SELECT USING (
  payee_user_id = public.current_profile_id()
  OR team_leader_id = public.current_profile_id()
);

CREATE POLICY "admin select settlement_line_items" ON public.settlement_line_items FOR SELECT USING (
  public.is_admin_user()
);
-- Phase 10: hosts must NOT SELECT line amounts via RLS (salary-status API strips amounts).
-- Team leaders may read line items for their agency batches (amounts shown on TL Settlements UI).
DROP POLICY IF EXISTS "payee select settlement_line_items" ON public.settlement_line_items;
CREATE POLICY "tl select settlement_line_items via batch" ON public.settlement_line_items FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.settlement_batches b
    WHERE b.id = settlement_line_items.batch_id
      AND (b.team_leader_id = public.current_profile_id() OR b.payee_user_id = public.current_profile_id())
  )
);

CREATE POLICY "admin select settlement_events" ON public.settlement_events FOR SELECT USING (
  public.is_admin_user()
);
CREATE POLICY "payee select settlement_events" ON public.settlement_events FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.settlement_batches b
    WHERE b.id = settlement_events.batch_id
      AND (b.payee_user_id = public.current_profile_id() OR b.team_leader_id = public.current_profile_id())
  )
);

CREATE POLICY "admin select creator_period_snapshots" ON public.creator_period_snapshots FOR SELECT USING (
  public.is_admin_user()
);
CREATE POLICY "owner select creator_period_snapshots" ON public.creator_period_snapshots FOR SELECT USING (
  creator_id = public.current_profile_id()
);
CREATE POLICY "agency select creator_period_snapshots" ON public.creator_period_snapshots FOR SELECT USING (
  agency_leader_id = public.current_profile_id()
);

-- coin_purchases ? owner read own rows; admin read all; mutations via Express service role only
DROP POLICY IF EXISTS "owner select coin_purchases" ON public.coin_purchases;
DROP POLICY IF EXISTS "admin select coin_purchases" ON public.coin_purchases;
CREATE POLICY "owner select coin_purchases" ON public.coin_purchases FOR SELECT USING (
  user_id = public.current_profile_id()
);
CREATE POLICY "admin select coin_purchases" ON public.coin_purchases FOR SELECT USING (
  public.is_admin_user()
);

-- No INSERT/UPDATE/DELETE policies for authenticated clients on Financial Module tables.
-- Express service role bypasses RLS for all settlement mutations.


-- =============================================================================
-- Auth OTPs (Vercel / multi-instance safe ? replaces in-memory otpStore)
-- Service role only; no client policies.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.auth_otps (
  email TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  name TEXT,
  role TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_auth_otps_expires ON public.auth_otps(expires_at);
ALTER TABLE public.auth_otps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny all auth_otps" ON public.auth_otps;
-- No policies for authenticated/anon ? only service_role bypasses RLS.

CREATE TABLE IF NOT EXISTS public.auth_pending_signups (
  email TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  name TEXT,
  role TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.auth_pending_signups ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- EMAIL POLICY + DISPATCH LOG (Admin Email tab ? credentials stay in Vercel env)
-- ============================================================================
ALTER TABLE public.system_configs ADD COLUMN IF NOT EXISTS email_register_enabled BOOLEAN DEFAULT true;
ALTER TABLE public.system_configs ADD COLUMN IF NOT EXISTS email_account_create_enabled BOOLEAN DEFAULT true;
ALTER TABLE public.system_configs ADD COLUMN IF NOT EXISTS email_account_delete_enabled BOOLEAN DEFAULT false;
ALTER TABLE public.system_configs ADD COLUMN IF NOT EXISTS allow_create_without_otp BOOLEAN DEFAULT false;
ALTER TABLE public.system_configs ADD COLUMN IF NOT EXISTS email_show_otp_fallback BOOLEAN DEFAULT false;
-- Admin Email tab templates (subject + html). Placeholders: {{name}}, {{otp}}, {{email}}, {{link}}
ALTER TABLE public.system_configs ADD COLUMN IF NOT EXISTS email_templates_json TEXT DEFAULT '';

CREATE TABLE IF NOT EXISTS public.email_dispatch_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose TEXT NOT NULL DEFAULT 'other',
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  subject TEXT,
  provider TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  error_message TEXT,
  meta JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_dispatch_log_created ON public.email_dispatch_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_dispatch_log_recipient ON public.email_dispatch_log(recipient_email);
ALTER TABLE public.email_dispatch_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny all email_dispatch_log" ON public.email_dispatch_log;
-- No anon/authenticated policies ? service_role only (admin APIs).

-- =============================================================================
-- 19. HIGH-CONCURRENCY PREP (indexes, wallet RPCs, presence durability)
-- =============================================================================
-- Presence: profiles.online_status / last_seen_at are DURABLE for login/logout
-- and significant transitions only. Routine heartbeats MUST use Redis
-- (presence:{userId}, TTL 60-90s) and must NOT update these columns every tick.

ALTER TABLE public.wallet_ledger ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS wallet_ledger_idempotency_key_uidx
  ON public.wallet_ledger (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_auth_id ON public.profiles(auth_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver_sender_created
  ON public.messages(receiver_id, sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_receiver_created
  ON public.messages(receiver_id, created_at DESC);
-- Documented high-concurrency message/discovery indexes (idempotent with §messages / §profiles above)
CREATE INDEX IF NOT EXISTS idx_messages_sender_created ON public.messages(sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_created_at ON public.profiles(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_matches_status ON public.matches(status);
CREATE INDEX IF NOT EXISTS idx_matches_user_b ON public.matches(user_b_id);
CREATE INDEX IF NOT EXISTS idx_matches_last_interaction
  ON public.matches(last_interaction_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_logs_status_started
  ON public.call_logs(status, started_at);
CREATE INDEX IF NOT EXISTS idx_call_logs_receiver ON public.call_logs(receiver_id);
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_type_created
  ON public.wallet_ledger(transaction_type, created_at);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked
  ON public.blocked_users(blocked_user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_favorite_user
  ON public.favorites(favorite_user_id);

DROP TRIGGER IF EXISTS trg_wallet_ledger_no_update ON public.wallet_ledger;
CREATE TRIGGER trg_wallet_ledger_no_update
  BEFORE UPDATE OR DELETE ON public.wallet_ledger
  FOR EACH ROW EXECUTE FUNCTION public.finance_reject_mutation();

REVOKE UPDATE (coin_balance, earnings_coins) ON public.profiles FROM anon, authenticated;
-- Atomic gift spend (FOR UPDATE + ledger + idempotency_key)
CREATE OR REPLACE FUNCTION public.gift_spend_atomic(
    p_sender_id TEXT,
    p_receiver_id TEXT,
    p_tl_id TEXT,
    p_coins INT,
    p_host_coins INT,
    p_tl_coins INT,
    p_idempotency_key TEXT,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB AS $$
DECLARE
    v_sender_balance BIGINT;
    v_host_earnings BIGINT := 0;
    v_tl_earnings BIGINT := 0;
    v_host_earned INT;
    v_tl_earned INT;
    v_key TEXT;
BEGIN
    v_key := NULLIF(TRIM(COALESCE(p_idempotency_key, '')), '');
    IF p_sender_id IS NULL OR p_receiver_id IS NULL OR v_key IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_message', 'sender_id, receiver_id, and idempotency_key required',
            'error_code', 'INVALID_INPUT'
        );
    END IF;

    IF p_coins IS NULL OR p_coins <= 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_message', 'Invalid coins',
            'error_code', 'INVALID_AMOUNT'
        );
    END IF;

    v_host_earned := GREATEST(0, COALESCE(p_host_coins, 0));
    v_tl_earned := GREATEST(0, COALESCE(p_tl_coins, 0));
    IF (v_host_earned + v_tl_earned) > p_coins THEN
        IF v_tl_earned > p_coins THEN
            v_tl_earned := p_coins;
            v_host_earned := 0;
        ELSE
            v_host_earned := p_coins - v_tl_earned;
        END IF;
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.wallet_ledger WHERE idempotency_key = v_key
    ) THEN
        SELECT coin_balance INTO v_sender_balance FROM public.profiles WHERE id = p_sender_id;
        SELECT earnings_coins INTO v_host_earnings FROM public.profiles WHERE id = p_receiver_id;
        IF p_tl_id IS NOT NULL AND p_tl_id <> '' THEN
            SELECT earnings_coins INTO v_tl_earnings FROM public.profiles WHERE id = p_tl_id;
        END IF;
        RETURN jsonb_build_object(
            'success', true,
            'duplicate', true,
            'new_sender_balance', COALESCE(v_sender_balance, 0),
            'new_host_earnings', COALESCE(v_host_earnings, 0),
            'new_tl_earnings', COALESCE(v_tl_earnings, 0),
            'coins_spent', p_coins,
            'host_coins_earned', v_host_earned,
            'tl_coins_earned', v_tl_earned
        );
    END IF;

    SELECT coin_balance INTO v_sender_balance
    FROM public.profiles
    WHERE id = p_sender_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_message', 'Sender not found',
            'error_code', 'SENDER_NOT_FOUND'
        );
    END IF;

    IF v_sender_balance < p_coins THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_message', 'INSUFFICIENT_BALANCE',
            'error_code', 'INSUFFICIENT_BALANCE',
            'new_sender_balance', v_sender_balance
        );
    END IF;

    UPDATE public.profiles
    SET coin_balance = coin_balance - p_coins,
        updated_at = now()
    WHERE id = p_sender_id
    RETURNING coin_balance INTO v_sender_balance;

    INSERT INTO public.wallet_ledger (
        user_id, call_id, transaction_type, amount, balance_after, billing_minute, metadata, idempotency_key
    ) VALUES (
        p_sender_id, v_key, 'GIFT_DEBIT', -p_coins, v_sender_balance, 0,
        COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('kind', 'gift', 'side', 'sender'),
        v_key
    );

    IF v_host_earned > 0 THEN
        UPDATE public.profiles
        SET earnings_coins = COALESCE(earnings_coins, 0) + v_host_earned,
            updated_at = now()
        WHERE id = p_receiver_id
        RETURNING earnings_coins INTO v_host_earnings;

        IF FOUND THEN
            INSERT INTO public.wallet_ledger (
                user_id, call_id, transaction_type, amount, balance_after, billing_minute, metadata
            ) VALUES (
                p_receiver_id, v_key, 'HOST_EARN', v_host_earned, v_host_earnings, 0,
                COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('kind', 'gift', 'side', 'host')
            );
        ELSE
            v_host_earned := 0;
        END IF;
    END IF;

    IF v_tl_earned > 0 AND p_tl_id IS NOT NULL AND p_tl_id <> '' THEN
        UPDATE public.profiles
        SET earnings_coins = COALESCE(earnings_coins, 0) + v_tl_earned,
            updated_at = now()
        WHERE id = p_tl_id
        RETURNING earnings_coins INTO v_tl_earnings;

        IF FOUND THEN
            INSERT INTO public.wallet_ledger (
                user_id, call_id, transaction_type, amount, balance_after, billing_minute, metadata
            ) VALUES (
                p_tl_id, v_key, 'TL_EARN', v_tl_earned, v_tl_earnings, 0,
                COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('kind', 'gift', 'side', 'team_leader')
            );
        ELSE
            v_tl_earned := 0;
            v_tl_earnings := 0;
        END IF;
    ELSE
        v_tl_earned := 0;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'duplicate', false,
        'new_sender_balance', v_sender_balance,
        'new_host_earnings', COALESCE(v_host_earnings, 0),
        'new_tl_earnings', COALESCE(v_tl_earnings, 0),
        'coins_spent', p_coins,
        'host_coins_earned', v_host_earned,
        'tl_coins_earned', v_tl_earned
    );
EXCEPTION WHEN unique_violation THEN
    SELECT coin_balance INTO v_sender_balance FROM public.profiles WHERE id = p_sender_id;
    SELECT earnings_coins INTO v_host_earnings FROM public.profiles WHERE id = p_receiver_id;
    IF p_tl_id IS NOT NULL AND p_tl_id <> '' THEN
        SELECT earnings_coins INTO v_tl_earnings FROM public.profiles WHERE id = p_tl_id;
    END IF;
    RETURN jsonb_build_object(
        'success', true,
        'duplicate', true,
        'new_sender_balance', COALESCE(v_sender_balance, 0),
        'new_host_earnings', COALESCE(v_host_earnings, 0),
        'new_tl_earnings', COALESCE(v_tl_earnings, 0),
        'coins_spent', p_coins,
        'host_coins_earned', GREATEST(0, COALESCE(p_host_coins, 0)),
        'tl_coins_earned', GREATEST(0, COALESCE(p_tl_coins, 0))
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Atomic coin purchase credit
CREATE OR REPLACE FUNCTION public.complete_coin_purchase_atomic(
    p_user_id TEXT,
    p_amount_coins INT,
    p_idempotency_key TEXT,
    p_purchase_id UUID DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB AS $$
DECLARE
    v_balance BIGINT;
    v_key TEXT;
    v_ledger_id UUID;
    v_coins INT;
BEGIN
    v_key := NULLIF(TRIM(COALESCE(p_idempotency_key, '')), '');
    IF p_user_id IS NULL OR v_key IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_message', 'user_id and idempotency_key required',
            'error_code', 'INVALID_INPUT'
        );
    END IF;

    v_coins := GREATEST(0, COALESCE(p_amount_coins, 0));
    IF v_coins <= 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_message', 'amount_coins must be positive',
            'error_code', 'INVALID_AMOUNT'
        );
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.wallet_ledger
        WHERE idempotency_key = v_key AND transaction_type = 'PURCHASE'
    ) THEN
        SELECT id, balance_after INTO v_ledger_id, v_balance
        FROM public.wallet_ledger
        WHERE idempotency_key = v_key AND transaction_type = 'PURCHASE'
        LIMIT 1;
        SELECT coin_balance INTO v_balance FROM public.profiles WHERE id = p_user_id;
        RETURN jsonb_build_object(
            'success', true,
            'duplicate', true,
            'coin_balance', COALESCE(v_balance, 0),
            'wallet_ledger_id', v_ledger_id
        );
    END IF;

    SELECT coin_balance INTO v_balance
    FROM public.profiles
    WHERE id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_message', 'Profile not found',
            'error_code', 'NOT_FOUND'
        );
    END IF;

    UPDATE public.profiles
    SET coin_balance = COALESCE(coin_balance, 0) + v_coins,
        updated_at = now()
    WHERE id = p_user_id
    RETURNING coin_balance INTO v_balance;

    INSERT INTO public.wallet_ledger (
        user_id, call_id, transaction_type, amount, balance_after, billing_minute, metadata, idempotency_key
    ) VALUES (
        p_user_id, v_key, 'PURCHASE', v_coins, v_balance, 0,
        COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('kind', 'purchase'),
        v_key
    )
    RETURNING id INTO v_ledger_id;

    IF p_purchase_id IS NOT NULL THEN
        UPDATE public.coin_purchases
        SET status = 'completed',
            wallet_ledger_id = v_ledger_id,
            completed_at = now()
        WHERE id = p_purchase_id
          AND status = 'pending';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'duplicate', false,
        'coin_balance', v_balance,
        'wallet_ledger_id', v_ledger_id
    );
EXCEPTION WHEN unique_violation THEN
    SELECT coin_balance INTO v_balance FROM public.profiles WHERE id = p_user_id;
    SELECT id INTO v_ledger_id FROM public.wallet_ledger
    WHERE idempotency_key = v_key AND transaction_type = 'PURCHASE' LIMIT 1;
    RETURN jsonb_build_object(
        'success', true,
        'duplicate', true,
        'coin_balance', COALESCE(v_balance, 0),
        'wallet_ledger_id', v_ledger_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.gift_spend_atomic(TEXT, TEXT, TEXT, INT, INT, INT, TEXT, JSONB) TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.complete_coin_purchase_atomic(TEXT, INT, TEXT, UUID, JSONB) TO postgres, service_role;

-- =============================================================================
-- OFFICE RBAC (Minglecall staff only — not TL / male / female / host marketplace roles)
-- profiles.role stays 'admin' for console access; office_role_id scopes features.
-- Legacy admins with office_role_id NULL keep full (super) access.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.office_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    is_super BOOLEAN NOT NULL DEFAULT false,
    is_system BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.office_role_permissions (
    role_id UUID NOT NULL REFERENCES public.office_roles(id) ON DELETE CASCADE,
    permission_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (role_id, permission_key)
);

CREATE INDEX IF NOT EXISTS idx_office_role_permissions_key
  ON public.office_role_permissions(permission_key);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS office_role_id UUID REFERENCES public.office_roles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_office_role_id ON public.profiles(office_role_id);

COMMENT ON TABLE public.office_roles IS
  'Staff roles for Admin Control Center (Accounts, Manager, etc.). Marketplace roles unchanged.';
COMMENT ON TABLE public.office_role_permissions IS
  'Feature permission keys granted to an office role (see shared/officeRbac/features.ts).';
COMMENT ON COLUMN public.profiles.office_role_id IS
  'When role=admin: scopes Control Center features. NULL = legacy full admin.';

ALTER TABLE public.office_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.office_role_permissions ENABLE ROW LEVEL SECURITY;

-- Deny-by-default for clients; mutations via service-role backend only.
DROP POLICY IF EXISTS "office_roles_no_client" ON public.office_roles;
CREATE POLICY "office_roles_no_client" ON public.office_roles
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "office_role_permissions_no_client" ON public.office_role_permissions;
CREATE POLICY "office_role_permissions_no_client" ON public.office_role_permissions
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

INSERT INTO public.office_roles (key, label, description, is_super, is_system)
VALUES
  (
    'super_admin',
    'Super Admin',
    'Full Admin Control Center access. Cannot be deleted.',
    true,
    true
  ),
  (
    'accounts',
    'Accounts',
    'Finance, salary batches, funding, and payout operations.',
    false,
    true
  ),
  (
    'manager',
    'Manager',
    'People ops, analytics, creator ops, and CMS — no infra destructive actions.',
    false,
    true
  )
ON CONFLICT (key) DO NOTHING;

-- Seed Accounts permissions (idempotent)
INSERT INTO public.office_role_permissions (role_id, permission_key)
SELECT r.id, p.permission_key
FROM public.office_roles r
CROSS JOIN (
  VALUES
    ('finance-module'),
    ('finance-module:overview'),
    ('finance-module:salary_batches'),
    ('finance-module:live_ledger'),
    ('finance-module:platform'),
    ('finance-module:team_leaders'),
    ('finance-module:hosts'),
    ('finance-module:funding'),
    ('finance-module:batches'),
    ('finance-module:settlement'),
    ('finance-module:period'),
    ('financials'),
    ('payouts'),
    ('cms-payout-cards'),
    ('analytics'),
    ('analytics:finance')
) AS p(permission_key)
WHERE r.key = 'accounts'
ON CONFLICT DO NOTHING;

-- Seed Manager permissions
INSERT INTO public.office_role_permissions (role_id, permission_key)
SELECT r.id, p.permission_key
FROM public.office_roles r
CROSS JOIN (
  VALUES
    ('analytics'),
    ('monitoring'),
    ('users'),
    ('leaders'),
    ('creator-ops'),
    ('countries'),
    ('gifts'),
    ('skus'),
    ('cms'),
    ('cms-navigation'),
    ('email'),
    ('api-health')
) AS p(permission_key)
WHERE r.key = 'manager'
ON CONFLICT DO NOTHING;
