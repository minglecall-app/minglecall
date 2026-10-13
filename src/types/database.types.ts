export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          auth_id: string | null;
          name: string;
          email: string | null;
          phone: string | null;
          gender: 'male' | 'female' | 'other';
          gender_locked: boolean;
          age: number | null;
          dob: string | null;
          nationality: string | null;
          country_code: string;
          bio: string | null;
          extended_bio: string | null;
          location_city: string | null;
          zodiac: string | null;
          interests: string[];
          interested_in: string[];
          tags: string[];
          spoken_languages: string[];
          avatar_url: string | null;
          gallery: string[];
          gallery_videos: Json;
          intro_video_url: string | null;
          verification_video_url: string | null;
          is_verified: boolean;
          is_onboarded: boolean;
          agreed_to_terms: boolean;
          agreed_to_adult_terms: boolean;
          agreed_to_host_terms: boolean;
          kyc_status: 'unsubmitted' | 'pending' | 'verified' | 'rejected';
          kyc_documents: Json | null;
          online_status: 'online' | 'busy' | 'offline' | 'in_call';
          role: 'male_user' | 'female_user' | 'female_creator' | 'female_host' | 'other_user' | 'admin' | 'team_leader' | 'agency_manager';
          coin_balance: number;
          hourly_coin_rate: number;
          earnings_coins: number;
          total_lifetime_earned_usd: number;
          latitude: number | null;
          longitude: number | null;
          allow_mock_location: boolean;
          is_using_mock_location: boolean;
          mock_location_city: string | null;
          mock_location_country: string | null;
          total_calls_hosted: number;
          total_call_minutes: number;
          total_gifts_received_count: number;
          rating_score: number;
          total_reviews_count: number;
          acceptance_rate_percent: number;
          is_banned: boolean;
          ban_reason: string | null;
          banned_until: string | null;
          banned_by_id: string | null;
          banned_by_role: string | null;
          team_leader_id: string | null;
          created_by_id: string | null;
          agency_name: string | null;
          coin_earn_override_rate: number | null;
          commission_percent: number | null;
          team_leader_note: string | null;
          password_hash: string | null;
          has_password_set: boolean | null;
          active_session_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          auth_id?: string | null;
          name: string;
          email?: string | null;
          phone?: string | null;
          gender: 'male' | 'female' | 'other';
          gender_locked?: boolean;
          age?: number | null;
          dob?: string | null;
          nationality?: string | null;
          country_code?: string;
          bio?: string | null;
          extended_bio?: string | null;
          location_city?: string | null;
          zodiac?: string | null;
          interests?: string[];
          interested_in?: string[];
          tags?: string[];
          spoken_languages?: string[];
          avatar_url?: string | null;
          gallery?: string[];
          gallery_videos?: Json;
          intro_video_url?: string | null;
          verification_video_url?: string | null;
          is_verified?: boolean;
          is_onboarded?: boolean;
          agreed_to_terms?: boolean;
          agreed_to_adult_terms?: boolean;
          agreed_to_host_terms?: boolean;
          kyc_status?: 'unsubmitted' | 'pending' | 'verified' | 'rejected';
          kyc_documents?: Json | null;
          online_status?: 'online' | 'busy' | 'offline' | 'in_call';
          role?: 'male_user' | 'female_user' | 'female_creator' | 'female_host' | 'other_user' | 'admin' | 'team_leader' | 'agency_manager';
          coin_balance?: number;
          hourly_coin_rate?: number;
          earnings_coins?: number;
          total_lifetime_earned_usd?: number;
          latitude?: number | null;
          longitude?: number | null;
          allow_mock_location?: boolean;
          is_using_mock_location?: boolean;
          mock_location_city?: string | null;
          mock_location_country?: string | null;
          total_calls_hosted?: number;
          total_call_minutes?: number;
          total_gifts_received_count?: number;
          rating_score?: number;
          total_reviews_count?: number;
          acceptance_rate_percent?: number;
          is_banned?: boolean;
          ban_reason?: string | null;
          banned_until?: string | null;
          banned_by_id?: string | null;
          banned_by_role?: string | null;
          team_leader_id?: string | null;
          created_by_id?: string | null;
          agency_name?: string | null;
          coin_earn_override_rate?: number | null;
          commission_percent?: number | null;
          team_leader_note?: string | null;
          password_hash?: string | null;
          has_password_set?: boolean | null;
          active_session_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
      };
      matches: {
        Row: {
          id: string;
          user_a_id: string;
          user_b_id: string;
          status: 'pending' | 'matched' | 'rejected' | 'unmatched';
          initiated_by: string;
          matched_at: string | null;
          last_interaction_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_a_id: string;
          user_b_id: string;
          status?: 'pending' | 'matched' | 'rejected' | 'unmatched';
          initiated_by: string;
          matched_at?: string | null;
          last_interaction_at?: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['matches']['Insert']>;
      };
      messages: {
        Row: {
          id: string;
          match_id: string | null;
          sender_id: string;
          receiver_id: string;
          text: string | null;
          original_language: string | null;
          translated_text: string | null;
          target_language: string | null;
          media_url: string | null;
          media_type: 'image' | 'video' | 'audio' | 'file' | null;
          media_storage_key: string | null;
          type: 'text' | 'image' | 'voice' | 'gift' | 'friend_request';
          gift_info: Json | null;
          friend_request_info: Json | null;
          is_read: boolean;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          match_id?: string | null;
          sender_id: string;
          receiver_id: string;
          text?: string | null;
          original_language?: string | null;
          translated_text?: string | null;
          target_language?: string | null;
          media_url?: string | null;
          media_type?: 'image' | 'video' | 'audio' | 'file' | null;
          media_storage_key?: string | null;
          type?: 'text' | 'image' | 'voice' | 'gift' | 'friend_request';
          gift_info?: Json | null;
          friend_request_info?: Json | null;
          is_read?: boolean;
          read_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['messages']['Insert']>;
      };
      message_conversation_clears: {
        Row: {
          user_id: string;
          other_user_id: string;
          cleared_at: string;
        };
        Insert: {
          user_id: string;
          other_user_id: string;
          cleared_at?: string;
        };
        Update: Partial<Database['public']['Tables']['message_conversation_clears']['Insert']>;
      };
      call_logs: {
        Row: {
          id: string;
          caller_id: string;
          receiver_id: string;
          start_time: string;
          end_time: string | null;
          duration_seconds: number;
          coins_spent: number;
          coins_earned: number;
          was_friend_call: boolean;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          caller_id: string;
          receiver_id: string;
          start_time: string;
          end_time?: string | null;
          duration_seconds?: number;
          coins_spent?: number;
          coins_earned?: number;
          was_friend_call?: boolean;
          status?: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['call_logs']['Insert']>;
      };
      payout_requests: {
        Row: {
          id: string;
          user_id: string;
          amount_coins: number;
          amount_usd: number;
          payout_method: string;
          /** Canonical schema column (JSONB). Legacy clients sometimes mapped this as account_details. */
          payout_details: Json;
          status: 'pending' | 'approved' | 'rejected' | 'processing' | 'completed';
          /** Canonical schema column. Legacy clients sometimes mapped this as admin_note. */
          admin_notes: string | null;
          kyc_verified: boolean;
          team_leader_id: string | null;
          team_leader_name: string | null;
          request_date: string;
          processed_date: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          amount_coins: number;
          amount_usd: number;
          payout_method: string;
          payout_details: Json;
          status?: 'pending' | 'approved' | 'rejected' | 'processing' | 'completed';
          admin_notes?: string | null;
          kyc_verified?: boolean;
          team_leader_id?: string | null;
          team_leader_name?: string | null;
          request_date?: string;
          processed_date?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['payout_requests']['Insert']>;
      };
      cms_policies: {
        Row: {
          id: string;
          slug: string;
          title: string;
          category: string;
          content: string;
          summary: string | null;
          effective_date: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          title: string;
          category?: string;
          content: string;
          summary?: string | null;
          effective_date?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['cms_policies']['Insert']>;
      };
      system_configs: {
        Row: {
          id: string;
          coin_burn_rate_per_min: number;
          coin_burn_rate_friend_per_min: number;
          female_host_share_percent?: number;
          female_host_target_share_percent?: number;
          team_leader_share_percent?: number;
          gift_female_host_share_percent?: number;
          gift_team_leader_share_percent?: number;
          enable_virtual_gifts?: boolean;
          virtual_gifts_json?: Json | null;
          female_earning_rate_per_min: number;
          coin_usd_peg: number;
          coin_to_usd_ratio: number;
          female_payout_ratio_usd: number;
          min_payout_threshold_usd: number;
          r2_bucket_name: string;
          r2_max_image_size_mb: number;
          r2_max_video_size_mb: number;
          r2_profile_video_quota_mb: number;
          r2_allowed_mime_types: string[];
          r2_cdn_cache_ttl_seconds: number;
          smtp_host?: string;
          smtp_port?: number;
          smtp_user?: string;
          smtp_pass?: string;
          smtp_from?: string;
          smtp_show_otp?: boolean;
          resend_api_key?: string;
          auto_moderation_sensitivity: 'low' | 'medium' | 'high' | 'strict';
          nsfw_filter_enabled: boolean;
          ai_nudity_shield_enabled: boolean;
          screen_recording_protection: boolean;
          free_daily_login_coins: number;
          banned_keywords: string[];
          abuse_report_auto_suspend_threshold: number;
          db_max_pool_size: number;
          db_idle_timeout_seconds: number;
          db_statement_timeout_ms: number;
          db_query_caching_enabled: boolean;
          feature_realtime_chat_enabled: boolean;
          feature_r2_direct_upload_enabled: boolean;
          feature_video_calling_enabled: boolean;
          feature_geo_discovery_enabled: boolean;
          feature_maintenance_mode: boolean;
          show_dev_persona_bar?: boolean;
          enable_regular_female_coin_earning?: boolean;
          allowed_country_codes?: string[];
          flag_sizes_json?: string;
          discovery_card_layout_json?: string;
          daily_streak_rewards_json?: string;
          daily_missions_config_json?: string;
          creator_target_cycle?: string;
          creator_target_bronze_hours?: number;
          creator_target_bronze_coins?: number;
          creator_target_bronze_bonus_usd?: number;
          creator_target_silver_hours?: number;
          creator_target_silver_coins?: number;
          creator_target_silver_bonus_usd?: number;
          creator_target_gold_hours?: number;
          creator_target_gold_coins?: number;
          creator_target_gold_bonus_usd?: number;
          /** UTC HH:mm for Financial Module period close (default 00:00). */
          period_close_utc_time?: string;
          finance_cron_cadence?: string;
          finance_cron_last_run_at?: string | null;
          /** When true, period-end settlement batches are the intended cash-out path. */
          settlement_enabled?: boolean;
          peak_hours_start?: string;
          peak_hours_end?: string;
          peak_hours_enabled?: boolean;
          call_ring_timeout_seconds?: number;
          daily_first_call_bonus_coins?: number;
          daily_first_call_bonus_usd?: number;
          daily_first_call_min_duration_sec?: number;
          streak_target_days?: number;
          streak_boost_duration_days?: number;
          min_daily_active_hours_for_streak?: number;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['system_configs']['Row']>;
        Update: Partial<Database['public']['Tables']['system_configs']['Row']>;
      };
      settlement_periods: {
        Row: {
          id: string;
          cycle_type: 'weekly' | 'monthly';
          period_start: string;
          period_end: string;
          close_scheduled_at: string;
          closed_at: string | null;
          status: 'open' | 'closing' | 'closed' | 'failed';
          config_snapshot: Json;
          close_error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          cycle_type: 'weekly' | 'monthly';
          period_start: string;
          period_end: string;
          close_scheduled_at: string;
          closed_at?: string | null;
          status?: 'open' | 'closing' | 'closed' | 'failed';
          config_snapshot?: Json;
          close_error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['settlement_periods']['Insert']>;
      };
      financial_ledger: {
        Row: {
          id: string;
          created_at: string;
          period_id: string | null;
          entry_type:
            | 'PLATFORM_EARN'
            | 'HOST_EARN'
            | 'TL_EARN'
            | 'TARGET_BONUS'
            | 'TARGET_SHARE_TRUEUP'
            | 'SETTLEMENT_ACCRUAL'
            | 'SETTLEMENT_PAID'
            | 'REVERSAL';
          user_id: string | null;
          team_leader_id: string | null;
          counterparty_role: 'platform' | 'host' | 'team_leader' | null;
          amount_coins: number;
          amount_usd: number;
          fx_ratio: number;
          source_ref_type: string | null;
          source_ref_id: string | null;
          metadata: Json;
        };
        Insert: {
          id?: string;
          created_at?: string;
          period_id?: string | null;
          entry_type:
            | 'PLATFORM_EARN'
            | 'HOST_EARN'
            | 'TL_EARN'
            | 'TARGET_BONUS'
            | 'TARGET_SHARE_TRUEUP'
            | 'SETTLEMENT_ACCRUAL'
            | 'SETTLEMENT_PAID'
            | 'REVERSAL';
          user_id?: string | null;
          team_leader_id?: string | null;
          counterparty_role?: 'platform' | 'host' | 'team_leader' | null;
          amount_coins: number;
          amount_usd: number;
          fx_ratio: number;
          source_ref_type?: string | null;
          source_ref_id?: string | null;
          metadata?: Json;
        };
        Update: Partial<Database['public']['Tables']['financial_ledger']['Insert']>;
      };
      settlement_batches: {
        Row: {
          id: string;
          period_id: string;
          batch_kind: 'team_leader_bundle' | 'direct_host';
          team_leader_id: string | null;
          payee_user_id: string;
          status: 'pending_admin_pay' | 'admin_paid' | 'tl_confirmed' | 'cancelled';
          total_host_salary_usd: number;
          total_tl_commission_usd: number;
          total_due_usd: number;
          total_host_salary_coins: number;
          total_tl_commission_coins: number;
          currency: string;
          payment_reference: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          period_id: string;
          batch_kind: 'team_leader_bundle' | 'direct_host';
          team_leader_id?: string | null;
          payee_user_id: string;
          status?: 'pending_admin_pay' | 'admin_paid' | 'tl_confirmed' | 'cancelled';
          total_host_salary_usd?: number;
          total_tl_commission_usd?: number;
          total_due_usd?: number;
          total_host_salary_coins?: number;
          total_tl_commission_coins?: number;
          currency?: string;
          payment_reference?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['settlement_batches']['Insert']>;
      };
      settlement_line_items: {
        Row: {
          id: string;
          batch_id: string;
          payee_user_id: string;
          payee_role: 'host' | 'team_leader';
          amount_coins: number;
          amount_usd: number;
          component: 'call_earnings' | 'gift_earnings' | 'target_bonus' | 'target_share_trueup' | 'tl_commission' | 'other';
          breakdown: Json;
          host_salary_status: 'pending' | 'paid';
          created_at: string;
        };
        Insert: {
          id?: string;
          batch_id: string;
          payee_user_id: string;
          payee_role: 'host' | 'team_leader';
          amount_coins: number;
          amount_usd: number;
          component: 'call_earnings' | 'gift_earnings' | 'target_bonus' | 'target_share_trueup' | 'tl_commission' | 'other';
          breakdown?: Json;
          host_salary_status?: 'pending' | 'paid';
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['settlement_line_items']['Insert']>;
      };
      settlement_events: {
        Row: {
          id: string;
          batch_id: string | null;
          period_id: string | null;
          event_type: 'created' | 'admin_marked_paid' | 'tl_confirmed' | 'cancelled' | 'note';
          actor_user_id: string;
          note: string | null;
          payload: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          batch_id?: string | null;
          period_id?: string | null;
          event_type: 'created' | 'admin_marked_paid' | 'tl_confirmed' | 'cancelled' | 'note';
          actor_user_id: string;
          note?: string | null;
          payload?: Json;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['settlement_events']['Insert']>;
      };
      creator_period_snapshots: {
        Row: {
          id: string;
          period_id: string;
          creator_id: string;
          agency_leader_id: string | null;
          active_online_seconds: number;
          active_online_hours: number;
          coins_earned_from_calls: number;
          coins_earned_from_gifts: number;
          total_target_coins: number;
          performance_tier: 'bronze' | 'silver' | 'gold';
          bonus_earned_coins: number;
          bonus_earned_usd: number;
          current_streak_days: number;
          response_health_score: number;
          metrics_snapshot: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          period_id: string;
          creator_id: string;
          agency_leader_id?: string | null;
          active_online_seconds?: number;
          active_online_hours?: number;
          coins_earned_from_calls?: number;
          coins_earned_from_gifts?: number;
          total_target_coins?: number;
          performance_tier?: 'bronze' | 'silver' | 'gold';
          bonus_earned_coins?: number;
          bonus_earned_usd?: number;
          current_streak_days?: number;
          response_health_score?: number;
          metrics_snapshot?: Json;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['creator_period_snapshots']['Insert']>;
      };
      moderation_reports: {
        Row: {
          id: string;
          reporter_id: string;
          reported_user_id: string;
          reason: string;
          details: string | null;
          evidence_snapshot_url: string | null;
          status: 'pending' | 'investigating' | 'action_taken' | 'dismissed';
          action_taken: string | null;
          admin_notes: string | null;
          resolved_by: string | null;
          resolved_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          reporter_id: string;
          reported_user_id: string;
          reason: string;
          details?: string | null;
          evidence_snapshot_url?: string | null;
          status?: 'pending' | 'investigating' | 'action_taken' | 'dismissed';
          action_taken?: string | null;
          admin_notes?: string | null;
          resolved_by?: string | null;
          resolved_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['moderation_reports']['Insert']>;
      };
      feed_posts: {
        Row: {
          id: string;
          creator_id: string;
          creator_name: string;
          creator_avatar: string | null;
          media_url: string;
          media_type: 'image' | 'video';
          caption: string | null;
          likes: number;
          comments_count: number;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['feed_posts']['Row']>;
        Update: Partial<Database['public']['Tables']['feed_posts']['Row']>;
      };
      coin_packages: {
        Row: {
          id: string;
          title: string;
          coins: number;
          bonus_coins: number;
          price_usd: number;
          discount_price_usd: number | null;
          approx_call_minutes: number | null;
          saving_label: string | null;
          badge_tag: string | null;
          popular: boolean;
          order_num: number;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['coin_packages']['Row']>;
        Update: Partial<Database['public']['Tables']['coin_packages']['Row']>;
      };
      currency_configs: {
        Row: {
          code: string;
          name: string;
          symbol: string;
          rate_from_usd: number;
          enabled: boolean;
          order_num: number;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['currency_configs']['Row']>;
        Update: Partial<Database['public']['Tables']['currency_configs']['Row']>;
      };
      favorites: {
        Row: {
          user_id: string;
          favorite_user_id: string;
          created_at: string;
        };
        Insert: Database['public']['Tables']['favorites']['Row'];
        Update: Partial<Database['public']['Tables']['favorites']['Row']>;
      };
      blocked_users: {
        Row: {
          user_id: string;
          blocked_user_id: string;
          reason: string | null;
          created_at: string;
        };
        Insert: Database['public']['Tables']['blocked_users']['Row'];
        Update: Partial<Database['public']['Tables']['blocked_users']['Row']>;
      };
      creator_goals: {
        Row: {
          creator_id: string;
          title: string;
          current_coins: number;
          target_coins: number;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['creator_goals']['Row']>;
        Update: Partial<Database['public']['Tables']['creator_goals']['Row']>;
      };
      user_daily_rewards: {
        Row: {
          user_id: string;
          last_login_date: string;
          streak_count: number;
          streak_claimed_date: string | null;
          tasks_date: string;
          task_chat_friends: string[];
          task_chat_claimed: boolean;
          task_quick_matches: number;
          task_quick_match_claimed: boolean;
          task_video_call_seconds: number;
          task_video_call_claimed: boolean;
          task_moment_interactions: number;
          task_moment_claimed: boolean;
          task_gift_count: number;
          task_gift_claimed: boolean;
          master_chest_claimed: boolean;
          total_coins_earned: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          last_login_date?: string;
          streak_count?: number;
          streak_claimed_date?: string | null;
          tasks_date?: string;
          task_chat_friends?: string[];
          task_chat_claimed?: boolean;
          task_quick_matches?: number;
          task_quick_match_claimed?: boolean;
          task_video_call_seconds?: number;
          task_video_call_claimed?: boolean;
          task_moment_interactions?: number;
          task_moment_claimed?: boolean;
          task_gift_count?: number;
          task_gift_claimed?: boolean;
          master_chest_claimed?: boolean;
          total_coins_earned?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['user_daily_rewards']['Insert']>;
      };
    };
  };
}
