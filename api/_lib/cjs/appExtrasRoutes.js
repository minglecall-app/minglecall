/**
 * Creator + rewards routes for Vercel CJS router (minimal production-safe).
 */
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const {
  send,
  clean,
  readJsonBody,
  requireAuth,
  isAdminRole,
  createServiceClient,
  sendOtpEmailVercel,
  generateSixDigitOtp,
  isSmtpConfigured,
} = require('./helpers');

function setupHmacSecret() {
  return (
    clean(process.env.SETUP_MASTER_KEY) ||
    clean(process.env.SUPABASE_SERVICE_ROLE_KEY) ||
    'minglecall-setup'
  );
}

function issueSetupToken() {
  const exp = Date.now() + 2 * 60 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ setup: 1, exp }), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', setupHmacSecret()).update(payload).digest('base64url');
  return `setup_${payload}.${sig}`;
}

function verifySetupToken(token) {
  const raw = String(token || '').trim();
  if (!raw.startsWith('setup_')) return false;
  const body = raw.slice('setup_'.length);
  const dot = body.lastIndexOf('.');
  if (dot <= 0) return false;
  const payload = body.slice(0, dot);
  const sig = body.slice(dot + 1);
  const expected = crypto.createHmac('sha256', setupHmacSecret()).update(payload).digest('base64url');
  if (sig.length !== expected.length) return false;
  let ok = 0;
  for (let i = 0; i < sig.length; i++) ok |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (ok !== 0) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return Boolean(parsed && parsed.setup && Number(parsed.exp) > Date.now());
  } catch {
    return false;
  }
}

async function requireSetupOrAdmin(req) {
  const setupHeader =
    req.headers['x-setup-token'] || req.headers['X-Setup-Token'] || '';
  if (verifySetupToken(setupHeader)) return { ok: true, mode: 'setup-token' };
  const auth = await requireAuth(req);
  if (auth.ok === false) {
    return {
      ok: false,
      status: 401,
      error: {
        message: 'Setup session or admin JWT required.',
        code: 'SETUP_AUTH_REQUIRED',
      },
    };
  }
  if (!isAdminRole(auth.role, auth.email)) {
    return {
      ok: false,
      status: 403,
      error: { message: 'Admin role required.', code: 'FORBIDDEN' },
    };
  }
  return { ok: true, mode: 'admin', auth };
}

async function comparePasswordFlexible(password, hash) {
  if (!password || !hash) return false;
  try {
    const bcrypt = require('bcryptjs');
    if (await bcrypt.compare(password, hash)) return true;
  } catch (_) {}
  if (String(hash).startsWith('sha256:')) {
    const dig = crypto.createHash('sha256').update(password).digest('hex');
    return hash === `sha256:${dig}`;
  }
  return false;
}

async function handleCreator(path, req, res) {
  if (!String(path || '').startsWith('creator/')) return null;
  const auth = await requireAuth(req);
  if (auth.ok === false) return send(res, auth.status, { success: false, error: auth.error });

  if (path === 'creator/metrics' && req.method === 'GET') {
    // Prefer creator_metrics table; fall back to profile fields
    const { data: rows } = await auth.client.from('creator_metrics').select('*').limit(500);
    if (rows && rows.length) {
      const metrics = {};
      for (const r of rows) {
        const id = String(r.creator_id || r.id);
        metrics[id] = {
          creatorId: id,
          creatorName: r.creator_name || '',
          creatorAvatar: r.creator_avatar || '',
          agencyLeaderId: r.agency_leader_id || null,
          agencyName: r.agency_name || null,
          activeOnlineSeconds: Number(r.active_online_seconds || 0),
          activeOnlineHours: Number(r.active_online_hours || 0),
          coinsEarnedFromCalls: Number(r.coins_earned_from_calls || 0),
          coinsEarnedFromGifts: Number(r.coins_earned_from_gifts || 0),
          totalTargetCoins: Number(r.total_target_coins || 0),
          currentStreakDays: Number(r.current_streak_days || 0),
          streakBoostUntil: r.streak_boost_until || null,
          lastActiveDate: r.last_active_date || null,
          isReadyNowActive: Boolean(r.is_ready_now_active),
          readyNowToggledAt: r.ready_now_toggled_at || null,
          responseHealthScore: Number(r.response_health_score ?? 100),
          performanceTier: r.performance_tier || r.performance_tiers || 'bronze',
        };
      }
      return send(res, 200, { success: true, metrics });
    }
    const { data } = await auth.client
      .from('profiles')
      .select(
        'id, name, avatar_url, earnings_coins, is_ready_now_active, ready_now_toggled_at, team_leader_id, agency_name'
      )
      .eq('id', auth.profileId)
      .maybeSingle();
    const metric = {
      creatorId: auth.profileId,
      creatorName: (data && data.name) || '',
      creatorAvatar: (data && data.avatar_url) || '',
      agencyLeaderId: (data && data.team_leader_id) || null,
      agencyName: (data && data.agency_name) || null,
      activeOnlineSeconds: 0,
      activeOnlineHours: 0,
      coinsEarnedFromCalls: Number((data && data.earnings_coins) || 0),
      coinsEarnedFromGifts: 0,
      totalTargetCoins: Number((data && data.earnings_coins) || 0),
      currentStreakDays: 1,
      streakBoostUntil: null,
      lastActiveDate: new Date().toISOString().slice(0, 10),
      isReadyNowActive: Boolean(data && data.is_ready_now_active),
      readyNowToggledAt: data && data.ready_now_toggled_at,
      responseHealthScore: 100,
      performanceTier: 'bronze',
    };
    return send(res, 200, {
      success: true,
      metrics: { [auth.profileId]: metric },
      metric,
    });
  }

  if (path === 'creator/heartbeat' && req.method === 'POST') {
    await readJsonBody(req);
    // Presence lease only — never write profiles.last_seen_at / online_status here
    try {
      const {
        isRedisConfigured,
        setPresence,
      } = require('./redisPresence');
      if (!isRedisConfigured()) {
        return send(res, 503, {
          success: false,
          error: {
            message: 'Presence service unavailable — Redis is not configured',
            code: 'REDIS_UNAVAILABLE',
          },
        });
      }
      await setPresence(auth.profileId, 'online');
    } catch (redisErr) {
      return send(res, 503, {
        success: false,
        error: {
          message: (redisErr && redisErr.message) || 'Redis presence write failed',
          code: 'REDIS_UNAVAILABLE',
        },
      });
    }
    // Optional in-memory-style metrics bump (creator_metrics only — not profiles presence)
    try {
      const { data: cm } = await auth.client
        .from('creator_metrics')
        .select('creator_id, active_online_seconds')
        .eq('creator_id', auth.profileId)
        .maybeSingle();
      if (cm) {
        const secs = Number(cm.active_online_seconds || 0) + 45;
        await auth.client
          .from('creator_metrics')
          .update({
            active_online_seconds: secs,
            active_online_hours: Number((secs / 3600).toFixed(2)),
            last_active_date: new Date().toISOString().slice(0, 10),
          })
          .eq('creator_id', auth.profileId);
      }
    } catch (_) {
      /* optional table */
    }
    const { data: rows } = await auth.client
      .from('creator_metrics')
      .select('*')
      .eq('creator_id', auth.profileId)
      .maybeSingle();
    const metrics = rows
      ? {
          creatorId: auth.profileId,
          activeOnlineSeconds: Number(rows.active_online_seconds || 0),
          activeOnlineHours: Number(rows.active_online_hours || 0),
          isReadyNowActive: Boolean(rows.is_ready_now_active),
          currentStreakDays: Number(rows.current_streak_days || 0),
          responseHealthScore: Number(rows.response_health_score ?? 100),
          performanceTier: rows.performance_tier || 'bronze',
        }
      : null;
    return send(res, 200, { success: true, metrics, redis: true });
  }

  if (path === 'creator/ready-now-toggle' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const { data: current } = await auth.client
      .from('profiles')
      .select('is_ready_now_active')
      .eq('id', auth.profileId)
      .maybeSingle();
    const next =
      body && typeof body.active === 'boolean'
        ? body.active
        : !Boolean(current && current.is_ready_now_active);
    const toggledAt = new Date().toISOString();
    const { data, error } = await auth.client
      .from('profiles')
      .update({
        is_ready_now_active: next,
        ready_now_toggled_at: toggledAt,
        online_status: next ? 'online' : 'offline',
        updated_at: toggledAt,
      })
      .eq('id', auth.profileId)
      .select('is_ready_now_active, ready_now_toggled_at')
      .maybeSingle();
    if (error) return send(res, 500, { success: false, error: error.message });
    try {
      await auth.client
        .from('creator_metrics')
        .upsert(
          {
            creator_id: auth.profileId,
            is_ready_now_active: next,
            ready_now_toggled_at: toggledAt,
          },
          { onConflict: 'creator_id' }
        );
    } catch (_) {
      /* optional */
    }
    const metrics = {
      creatorId: auth.profileId,
      isReadyNowActive: Boolean(data && data.is_ready_now_active),
      readyNowToggledAt: data && data.ready_now_toggled_at,
    };
    return send(res, 200, {
      success: true,
      metrics,
      isReadyNowActive: metrics.isReadyNowActive,
      readyNowToggledAt: metrics.readyNowToggledAt,
    });
  }

  if (path === 'creator/first-call-bonus' && req.method === 'POST') {
    await readJsonBody(req);
    const creatorId = auth.profileId;
    const todayStr = new Date().toISOString().slice(0, 10);
    const { data: cfg } = await auth.client
      .from('system_configs')
      .select('daily_first_call_bonus_coins, daily_first_call_bonus_usd')
      .eq('id', 'default')
      .maybeSingle();
    const bonusCoins = Math.max(
      1,
      Math.round(Number((cfg && cfg.daily_first_call_bonus_coins) || 100) || 100)
    );
    const bonusUSD = Number(
      Number((cfg && cfg.daily_first_call_bonus_usd) || 1).toFixed(2)
    );

    let { data: metrics } = await auth.client
      .from('creator_metrics')
      .select('*')
      .eq('creator_id', creatorId)
      .maybeSingle();

    if (metrics && String(metrics.first_call_bonus_claimed_date || '') === todayStr) {
      return send(res, 200, {
        success: false,
        alreadyClaimed: true,
        awarded: false,
        message: 'Daily first call bonus already claimed today.',
        metrics: {
          creatorId,
          firstCallBonusClaimedDate: todayStr,
          bonusEarnedCoins: Number(metrics.bonus_earned_coins || 0),
          bonusEarnedUSD: Number(metrics.bonus_earned_usd || 0),
        },
      });
    }

    const nextBonusCoins = Number((metrics && metrics.bonus_earned_coins) || 0) + bonusCoins;
    const nextBonusUsd = Number(
      (Number((metrics && metrics.bonus_earned_usd) || 0) + bonusUSD).toFixed(2)
    );
    const upsertPayload = {
      creator_id: creatorId,
      first_call_bonus_claimed_date: todayStr,
      bonus_earned_coins: nextBonusCoins,
      bonus_earned_usd: nextBonusUsd,
      last_active_date: todayStr,
      updated_at: new Date().toISOString(),
    };
    const { data: saved, error: mErr } = await auth.client
      .from('creator_metrics')
      .upsert(upsertPayload, { onConflict: 'creator_id' })
      .select('*')
      .maybeSingle();
    if (mErr) {
      return send(res, 500, { success: false, error: mErr.message, awarded: false });
    }

    const { data: profile } = await auth.client
      .from('profiles')
      .select('earnings_coins')
      .eq('id', creatorId)
      .maybeSingle();
    const newEarnings = Number((profile && profile.earnings_coins) || 0) + bonusCoins;
    await auth.client
      .from('profiles')
      .update({
        earnings_coins: newEarnings,
        updated_at: new Date().toISOString(),
      })
      .eq('id', creatorId);

    return send(res, 200, {
      success: true,
      awarded: true,
      bonusCoins,
      bonusUSD,
      metrics: {
        creatorId,
        firstCallBonusClaimedDate: todayStr,
        bonusEarnedCoins: Number((saved && saved.bonus_earned_coins) || nextBonusCoins),
        bonusEarnedUSD: Number((saved && saved.bonus_earned_usd) || nextBonusUsd),
        isReadyNowActive: Boolean(saved && saved.is_ready_now_active),
      },
    });
  }

  return send(res, 501, {
    success: false,
    error: { message: `Unimplemented creator path: ${path}`, code: 'VERCEL_ROUTE_NOT_IMPLEMENTED' },
  });
}

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function resolveRewardDay(hint) {
  const serverUtc = todayYmd();
  if (!hint || !/^\d{4}-\d{2}-\d{2}$/.test(String(hint))) return serverUtc;
  const hintMs = Date.parse(`${hint}T12:00:00.000Z`);
  const utcMs = Date.parse(`${serverUtc}T12:00:00.000Z`);
  if (!Number.isFinite(hintMs) || !Number.isFinite(utcMs)) return serverUtc;
  return Math.abs(hintMs - utcMs) / 86400000 <= 1 ? String(hint) : serverUtc;
}

function shiftRewardDay(day, delta) {
  const d = new Date(`${day}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function mapDailyRewardsRow(db) {
  if (!db) return null;
  return {
    userId: db.user_id,
    lastLoginDate: db.last_login_date,
    streakCount: Number(db.streak_count || 1),
    streakClaimedDate: db.streak_claimed_date ?? null,
    tasksDate: db.tasks_date,
    taskChatFriends: Array.isArray(db.task_chat_friends) ? db.task_chat_friends : [],
    taskChatClaimed: Boolean(db.task_chat_claimed),
    taskQuickMatches: Number(db.task_quick_matches || 0),
    taskQuickMatchClaimed: Boolean(db.task_quick_match_claimed),
    taskVideoCallSeconds: Number(db.task_video_call_seconds || 0),
    taskVideoCallClaimed: Boolean(db.task_video_call_claimed),
    taskMomentInteractions: Number(db.task_moment_interactions || 0),
    taskMomentClaimed: Boolean(db.task_moment_claimed),
    taskGiftCount: Number(db.task_gift_count || 0),
    taskGiftClaimed: Boolean(db.task_gift_claimed),
    masterChestClaimed: Boolean(db.master_chest_claimed),
    totalCoinsEarned: Number(db.total_coins_earned || 0),
    createdAt: db.created_at,
    updatedAt: db.updated_at,
  };
}

function blankDailyRewardsRow(userId, rewardDay) {
  return {
    user_id: userId,
    last_login_date: rewardDay,
    streak_count: 1,
    streak_claimed_date: null,
    tasks_date: rewardDay,
    task_chat_friends: [],
    task_chat_claimed: false,
    task_quick_matches: 0,
    task_quick_match_claimed: false,
    task_video_call_seconds: 0,
    task_video_call_claimed: false,
    task_moment_interactions: 0,
    task_moment_claimed: false,
    task_gift_count: 0,
    task_gift_claimed: false,
    master_chest_claimed: false,
    total_coins_earned: 0,
    updated_at: new Date().toISOString(),
  };
}

async function ensureRewardsRollover(client, userId, rewardDay) {
  const { data: row, error } = await client
    .from('user_daily_rewards')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!row) {
    const payload = blankDailyRewardsRow(userId, rewardDay);
    const { data, error: insErr } = await client
      .from('user_daily_rewards')
      .upsert(payload, { onConflict: 'user_id' })
      .select('*')
      .maybeSingle();
    if (insErr) return { success: false, error: insErr.message };
    return { success: true, data };
  }
  const yesterday = shiftRewardDay(rewardDay, -1);
  let changed = false;
  const next = { ...row };
  if (String(next.tasks_date) !== rewardDay) {
    next.tasks_date = rewardDay;
    next.task_chat_friends = [];
    next.task_chat_claimed = false;
    next.task_quick_matches = 0;
    next.task_quick_match_claimed = false;
    next.task_video_call_seconds = 0;
    next.task_video_call_claimed = false;
    next.task_moment_interactions = 0;
    next.task_moment_claimed = false;
    next.task_gift_count = 0;
    next.task_gift_claimed = false;
    next.master_chest_claimed = false;
    changed = true;
  }
  if (String(next.last_login_date) === yesterday) {
    if (String(next.streak_claimed_date) === yesterday) {
      next.streak_count = Number(next.streak_count || 1) >= 7 ? 1 : Number(next.streak_count || 1) + 1;
    }
    next.last_login_date = rewardDay;
    changed = true;
  } else if (String(next.last_login_date) !== rewardDay) {
    next.streak_count = 1;
    next.last_login_date = rewardDay;
    changed = true;
  }
  if (!changed) return { success: true, data: row };
  next.updated_at = new Date().toISOString();
  const { data, error: updErr } = await client
    .from('user_daily_rewards')
    .upsert(next, { onConflict: 'user_id' })
    .select('*')
    .maybeSingle();
  if (updErr) return { success: false, error: updErr.message };
  return { success: true, data };
}

async function loadRewardConfig(client) {
  const DEFAULT_STREAK = [10, 15, 20, 25, 35, 50, 100];
  const DEFAULT_MISSIONS = {
    chatFriends: { target: 3, reward: 25 },
    quickMatches: { target: 10, reward: 30 },
    videoCall: { target: 60, reward: 35 },
    momentInteract: { target: 3, reward: 15 },
    sendGift: { target: 1, reward: 20 },
    masterChest: { target: 4, reward: 50 },
  };
  let { data, error } = await client
    .from('system_configs')
    .select('daily_streak_rewards_json, daily_missions_config_json, free_daily_login_coins')
    .eq('id', 'default')
    .maybeSingle();
  if (error) {
    ({ data } = await client
      .from('system_configs')
      .select('daily_streak_rewards_json, daily_missions_config_json')
      .eq('id', 'default')
      .maybeSingle());
  }
  let streak = DEFAULT_STREAK;
  let missions = { ...DEFAULT_MISSIONS };
  try {
    const raw = data && data.daily_streak_rewards_json;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed) && parsed.length) streak = parsed;
  } catch (_) {}
  try {
    const raw = data && data.daily_missions_config_json;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (parsed && typeof parsed === 'object') missions = { ...missions, ...parsed };
  } catch (_) {}
  const loginCoins = Math.max(0, Math.round(Number(data && data.free_daily_login_coins) || 20));
  return { streakRewards: streak, missions, loginCoins };
}

function evaluateMission(row, missionKey, missions) {
  if (missionKey === 'chat_friends') {
    if (row.task_chat_claimed) return { ok: false, code: 'ALREADY_CLAIMED', message: 'Mission already claimed' };
    const target = Number(missions.chatFriends?.target || 3);
    if ((row.task_chat_friends?.length || 0) < target) {
      return { ok: false, code: 'INCOMPLETE', message: 'Mission progress incomplete' };
    }
    return { ok: true, coins: Number(missions.chatFriends?.reward || 25) };
  }
  if (missionKey === 'quick_matches') {
    if (row.task_quick_match_claimed) return { ok: false, code: 'ALREADY_CLAIMED', message: 'Mission already claimed' };
    if (Number(row.task_quick_matches || 0) < Number(missions.quickMatches?.target || 10)) {
      return { ok: false, code: 'INCOMPLETE', message: 'Mission progress incomplete' };
    }
    return { ok: true, coins: Number(missions.quickMatches?.reward || 30) };
  }
  if (missionKey === 'video_call') {
    if (row.task_video_call_claimed) return { ok: false, code: 'ALREADY_CLAIMED', message: 'Mission already claimed' };
    if (Number(row.task_video_call_seconds || 0) < Number(missions.videoCall?.target || 60)) {
      return { ok: false, code: 'INCOMPLETE', message: 'Mission progress incomplete' };
    }
    return { ok: true, coins: Number(missions.videoCall?.reward || 35) };
  }
  if (missionKey === 'moment_interact') {
    if (row.task_moment_claimed) return { ok: false, code: 'ALREADY_CLAIMED', message: 'Mission already claimed' };
    if (Number(row.task_moment_interactions || 0) < Number(missions.momentInteract?.target || 3)) {
      return { ok: false, code: 'INCOMPLETE', message: 'Mission progress incomplete' };
    }
    return { ok: true, coins: Number(missions.momentInteract?.reward || 15) };
  }
  if (missionKey === 'send_gift') {
    if (row.task_gift_claimed) return { ok: false, code: 'ALREADY_CLAIMED', message: 'Mission already claimed' };
    if (Number(row.task_gift_count || 0) < Number(missions.sendGift?.target || 1)) {
      return { ok: false, code: 'INCOMPLETE', message: 'Mission progress incomplete' };
    }
    return { ok: true, coins: Number(missions.sendGift?.reward || 20) };
  }
  return { ok: false, code: 'INVALID_MISSION', message: 'Invalid mission' };
}

const MISSION_BILLING = {
  streak: 1,
  chat_friends: 2,
  quick_matches: 3,
  video_call: 4,
  moment_interact: 5,
  send_gift: 6,
  master_chest: 7,
};

async function claimRewardAtomic(client, params) {
  const billingKey =
    params.claimKind === 'streak'
      ? 'streak'
      : params.claimKind === 'master_chest'
        ? 'master_chest'
        : String(params.missionKey || '');
  const billingMinute = MISSION_BILLING[billingKey] || 0;
  const ledgerType =
    params.claimKind === 'streak'
      ? 'REWARD_STREAK'
      : params.claimKind === 'master_chest'
        ? 'REWARD_MASTER_CHEST'
        : 'REWARD_MISSION';
  const coins = Math.max(0, Math.floor(params.coins));

  const { data: rpcData, error: rpcErr } = await client.rpc('claim_daily_reward_atomic', {
    p_user_id: params.userId,
    p_claim_kind: params.claimKind,
    p_mission_key: params.missionKey,
    p_reward_day: params.rewardDay,
    p_coins: coins,
    p_ledger_type: ledgerType,
    p_billing_minute: billingMinute,
    p_metadata: {
      missionKey: params.missionKey,
      rewardDay: params.rewardDay,
      claimKind: params.claimKind,
    },
  });

  if (!rpcErr && rpcData) {
    const result = typeof rpcData === 'string' ? JSON.parse(rpcData) : rpcData;
    const refreshed = await client
      .from('user_daily_rewards')
      .select('*')
      .eq('user_id', params.userId)
      .maybeSingle();
    if (result && result.success) {
      return {
        success: true,
        coinsAwarded: Number(result.coins_awarded || coins),
        coinBalance: Number(result.coin_balance || 0),
        record: refreshed.data,
        duplicate: Boolean(result.duplicate),
      };
    }
    return {
      success: false,
      error: (result && result.error_message) || 'Claim rejected',
      code: (result && result.error_code) || 'CLAIM_FAILED',
      coinBalance: result && result.coin_balance != null ? Number(result.coin_balance) : null,
      record: refreshed.data,
    };
  }

  // Fallback when RPC missing: conditional flag + balance credit
  const ensured = await ensureRewardsRollover(client, params.userId, params.rewardDay);
  if (!ensured.success || !ensured.data) {
    return { success: false, error: ensured.error || 'Load failed', code: 'LOAD_FAILED' };
  }
  const row = ensured.data;
  const patch = {
    updated_at: new Date().toISOString(),
    total_coins_earned: Number(row.total_coins_earned || 0) + coins,
  };
  let q = client.from('user_daily_rewards').update(patch).eq('user_id', params.userId);
  if (params.claimKind === 'streak') {
    if (String(row.streak_claimed_date) === params.rewardDay) {
      return { success: false, code: 'ALREADY_CLAIMED', error: 'Already claimed', record: row };
    }
    patch.streak_claimed_date = params.rewardDay;
    q = client
      .from('user_daily_rewards')
      .update(patch)
      .eq('user_id', params.userId)
      .or(`streak_claimed_date.is.null,streak_claimed_date.neq.${params.rewardDay}`);
  } else if (params.claimKind === 'master_chest') {
    if (row.master_chest_claimed) {
      return { success: false, code: 'ALREADY_CLAIMED', error: 'Already claimed', record: row };
    }
    patch.master_chest_claimed = true;
    q = client
      .from('user_daily_rewards')
      .update(patch)
      .eq('user_id', params.userId)
      .eq('master_chest_claimed', false);
  } else {
    const map = {
      chat_friends: 'task_chat_claimed',
      quick_matches: 'task_quick_match_claimed',
      video_call: 'task_video_call_claimed',
      moment_interact: 'task_moment_claimed',
      send_gift: 'task_gift_claimed',
    };
    const col = map[params.missionKey];
    if (!col) return { success: false, code: 'INVALID_MISSION', error: 'Invalid mission' };
    if (row[col]) {
      return { success: false, code: 'ALREADY_CLAIMED', error: 'Already claimed', record: row };
    }
    patch[col] = true;
    q = client.from('user_daily_rewards').update(patch).eq('user_id', params.userId).eq(col, false);
  }
  const { data: updatedRows, error: updErr } = await q.select('*');
  if (updErr) return { success: false, error: updErr.message, code: 'UPDATE_FAILED' };
  if (!updatedRows || !updatedRows.length) {
    return { success: false, code: 'ALREADY_CLAIMED', error: 'Already claimed', record: row };
  }
  const { data: prof } = await client
    .from('profiles')
    .select('coin_balance')
    .eq('id', params.userId)
    .maybeSingle();
  const newBal = Number((prof && prof.coin_balance) || 0) + coins;
  await client
    .from('profiles')
    .update({ coin_balance: newBal, updated_at: new Date().toISOString() })
    .eq('id', params.userId);
  try {
    await client.from('wallet_ledger').insert({
      user_id: params.userId,
      transaction_type: ledgerType,
      amount: coins,
      balance_after: newBal,
      call_id: `daily_reward:${params.rewardDay}`,
      billing_minute: billingMinute,
      metadata: { claimKind: params.claimKind, missionKey: params.missionKey },
    });
  } catch (_) {}
  return {
    success: true,
    coinsAwarded: coins,
    coinBalance: newBal,
    record: updatedRows[0],
  };
}

async function handleRewards(path, req, res) {
  if (!String(path || '').startsWith('rewards/')) return null;
  const auth = await requireAuth(req);
  if (auth.ok === false) return send(res, auth.status, { success: false, error: auth.error });
  const client = auth.client;
  const me = auth.profileId;

  if (
    (path === 'rewards/get' || path === 'rewards/progress' || path === 'rewards/update') &&
    (req.method === 'GET' || req.method === 'POST')
  ) {
    const body = req.method === 'POST' ? await readJsonBody(req) : {};
    const day = resolveRewardDay((body && body.rewardDay) || '');
    const ensured = await ensureRewardsRollover(client, me, day);
    if (!ensured.success) {
      return send(res, 500, {
        success: false,
        error: { message: ensured.error || 'Failed to load rewards', code: 'LOAD_FAILED' },
      });
    }
    // progress increments (capped)
    if (path === 'rewards/progress' && req.method === 'POST') {
      const { missions } = await loadRewardConfig(client);
      const type = String((body && body.type) || '');
      const row = { ...ensured.data };
      if (type === 'chat_friend' && !row.task_chat_claimed) {
        const rid = String((body && body.receiverId) || '');
        const friends = Array.isArray(row.task_chat_friends) ? [...row.task_chat_friends] : [];
        if (rid && rid !== me && !friends.includes(rid)) friends.push(rid);
        row.task_chat_friends = friends.slice(0, Math.max(Number(missions.chatFriends?.target || 3) * 2, 10));
      } else if (type === 'quick_match' && !row.task_quick_match_claimed) {
        row.task_quick_matches = Math.min(
          Math.max(Number(missions.quickMatches?.target || 10) * 2, 20),
          Number(row.task_quick_matches || 0) + 1
        );
      } else if (type === 'video_call' && !row.task_video_call_claimed) {
        const add = Math.max(0, Math.min(600, Math.floor(Number((body && body.seconds) || 0))));
        row.task_video_call_seconds = Math.min(
          Math.max(Number(missions.videoCall?.target || 60) * 3, 3600),
          Number(row.task_video_call_seconds || 0) + add
        );
      } else if (type === 'moment' && !row.task_moment_claimed) {
        row.task_moment_interactions = Number(row.task_moment_interactions || 0) + 1;
      } else if (type === 'gift' && !row.task_gift_claimed) {
        row.task_gift_count = Number(row.task_gift_count || 0) + 1;
      }
      row.updated_at = new Date().toISOString();
      const { data, error } = await client
        .from('user_daily_rewards')
        .upsert(row, { onConflict: 'user_id' })
        .select('*')
        .maybeSingle();
      if (error) {
        return send(res, 400, {
          success: false,
          error: { message: error.message, code: 'PROGRESS_FAILED' },
        });
      }
      return send(res, 200, { success: true, data: { record: mapDailyRewardsRow(data) } });
    }
    return send(res, 200, {
      success: true,
      data: { record: mapDailyRewardsRow(ensured.data), rewardDay: day },
    });
  }

  if (path === 'rewards/claim-streak' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const day = resolveRewardDay((body && body.rewardDay) || '');
    const { streakRewards, loginCoins } = await loadRewardConfig(client);
    const ensured = await ensureRewardsRollover(client, me, day);
    if (!ensured.success || !ensured.data) {
      return send(res, 500, {
        success: false,
        error: { message: ensured.error || 'Load failed', code: 'LOAD_FAILED' },
      });
    }
    const row = ensured.data;
    if (String(row.streak_claimed_date) === day) {
      return send(res, 409, {
        success: false,
        error: { message: 'Streak already claimed today', code: 'ALREADY_CLAIMED' },
        data: {
          coinsAwarded: 0,
          record: mapDailyRewardsRow(row),
          coinBalance: null,
          alreadyClaimed: true,
        },
      });
    }
    const dayIndex = Math.min(Math.max(0, Number(row.streak_count || 1) - 1), 6);
    const coins = Number(streakRewards[dayIndex] ?? loginCoins ?? 20);
    const claim = await claimRewardAtomic(client, {
      userId: me,
      claimKind: 'streak',
      missionKey: null,
      rewardDay: day,
      coins,
    });
    if (!claim.success) {
      const code = claim.code || 'CLAIM_FAILED';
      return send(res, code === 'ALREADY_CLAIMED' ? 409 : 400, {
        success: false,
        error: { message: claim.error || 'Claim failed', code },
        data: {
          coinsAwarded: 0,
          record: mapDailyRewardsRow(claim.record || row),
          coinBalance: claim.coinBalance ?? null,
          alreadyClaimed: code === 'ALREADY_CLAIMED',
        },
      });
    }
    return send(res, 200, {
      success: true,
      data: {
        coinsAwarded: claim.coinsAwarded ?? coins,
        record: mapDailyRewardsRow(claim.record),
        coinBalance: claim.coinBalance,
        alreadyClaimed: Boolean(claim.duplicate),
      },
    });
  }

  if (path === 'rewards/claim-mission' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const missionKey = String((body && body.missionKey) || '');
    const day = resolveRewardDay((body && body.rewardDay) || '');
    const { missions } = await loadRewardConfig(client);
    const ensured = await ensureRewardsRollover(client, me, day);
    if (!ensured.success || !ensured.data) {
      return send(res, 500, {
        success: false,
        error: { message: ensured.error || 'Load failed', code: 'LOAD_FAILED' },
      });
    }
    const eligibility = evaluateMission(ensured.data, missionKey, missions);
    if (!eligibility.ok) {
      return send(res, eligibility.code === 'ALREADY_CLAIMED' ? 409 : 400, {
        success: false,
        error: { message: eligibility.message, code: eligibility.code },
        data: {
          coinsAwarded: 0,
          record: mapDailyRewardsRow(ensured.data),
          coinBalance: null,
          alreadyClaimed: eligibility.code === 'ALREADY_CLAIMED',
        },
      });
    }
    const claim = await claimRewardAtomic(client, {
      userId: me,
      claimKind: 'mission',
      missionKey,
      rewardDay: day,
      coins: eligibility.coins,
    });
    if (!claim.success) {
      const code = claim.code || 'CLAIM_FAILED';
      return send(res, code === 'ALREADY_CLAIMED' ? 409 : 400, {
        success: false,
        error: { message: claim.error || 'Claim failed', code },
        data: {
          coinsAwarded: 0,
          record: mapDailyRewardsRow(claim.record || ensured.data),
          coinBalance: claim.coinBalance ?? null,
          alreadyClaimed: code === 'ALREADY_CLAIMED',
        },
      });
    }
    return send(res, 200, {
      success: true,
      data: {
        coinsAwarded: claim.coinsAwarded ?? eligibility.coins,
        record: mapDailyRewardsRow(claim.record),
        coinBalance: claim.coinBalance,
        alreadyClaimed: Boolean(claim.duplicate),
      },
    });
  }

  if (path === 'rewards/claim-master-chest' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const day = resolveRewardDay((body && body.rewardDay) || '');
    const { missions } = await loadRewardConfig(client);
    const ensured = await ensureRewardsRollover(client, me, day);
    if (!ensured.success || !ensured.data) {
      return send(res, 500, {
        success: false,
        error: { message: ensured.error || 'Load failed', code: 'LOAD_FAILED' },
      });
    }
    const row = ensured.data;
    if (row.master_chest_claimed) {
      return send(res, 409, {
        success: false,
        error: { message: 'Master chest already claimed today', code: 'ALREADY_CLAIMED' },
        data: {
          coinsAwarded: 0,
          record: mapDailyRewardsRow(row),
          coinBalance: null,
          alreadyClaimed: true,
        },
      });
    }
    const claimedCount = [
      row.task_chat_claimed,
      row.task_quick_match_claimed,
      row.task_video_call_claimed,
      row.task_moment_claimed,
      row.task_gift_claimed,
    ].filter(Boolean).length;
    const masterTarget = Number(missions.masterChest?.target || 4);
    if (claimedCount < masterTarget) {
      return send(res, 400, {
        success: false,
        error: {
          message: `Complete at least ${masterTarget} daily missions first`,
          code: 'LOCKED',
        },
      });
    }
    const coins = Number(missions.masterChest?.reward || 50);
    const claim = await claimRewardAtomic(client, {
      userId: me,
      claimKind: 'master_chest',
      missionKey: null,
      rewardDay: day,
      coins,
    });
    if (!claim.success) {
      const code = claim.code || 'CLAIM_FAILED';
      return send(res, code === 'ALREADY_CLAIMED' ? 409 : 400, {
        success: false,
        error: { message: claim.error || 'Claim failed', code },
        data: {
          coinsAwarded: 0,
          record: mapDailyRewardsRow(claim.record || row),
          coinBalance: claim.coinBalance ?? null,
          alreadyClaimed: code === 'ALREADY_CLAIMED',
        },
      });
    }
    return send(res, 200, {
      success: true,
      data: {
        coinsAwarded: claim.coinsAwarded ?? coins,
        record: mapDailyRewardsRow(claim.record),
        coinBalance: claim.coinBalance,
        alreadyClaimed: Boolean(claim.duplicate),
      },
    });
  }

  return send(res, 501, {
    success: false,
    error: { message: `Unimplemented rewards path: ${path}`, code: 'VERCEL_ROUTE_NOT_IMPLEMENTED' },
  });
}

async function handleSetup(path, req, res) {
  if (!String(path || '').startsWith('setup')) return null;
  const env = (k) => clean(process.env[k]);

  if ((path === 'setup/status' || path === 'setup') && req.method === 'GET') {
    const supabaseUrl = env('VITE_SUPABASE_URL') || env('SUPABASE_URL');
    const livekitKey = env('LIVEKIT_API_KEY');
    const livekitSecret = env('LIVEKIT_API_SECRET');
    const livekitOk = Boolean(
      env('LIVEKIT_URL') && livekitKey && livekitSecret && livekitKey !== 'devkey' && livekitSecret !== 'secret'
    );
    const r2Ok = Boolean(
      env('R2_ACCOUNT_ID') && env('R2_ACCESS_KEY_ID') && env('R2_SECRET_ACCESS_KEY') && env('R2_BUCKET_NAME')
    );
    return send(res, 200, {
      success: true,
      readOnly: true,
      isEnvWritable: false,
      isLocked: false,
      nodeVersion: process.version,
      platform: process.platform,
      uptimeSeconds: Math.floor(process.uptime()),
      memoryMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
      message:
        'Setup save cannot write .env on Vercel. Set Environment Variables in the Vercel dashboard, then redeploy. Connection tests still work.',
      services: {
        database: Boolean(supabaseUrl && env('SUPABASE_SERVICE_ROLE_KEY')),
        livekit: livekitOk,
        r2Storage: r2Ok,
        smtp: isSmtpConfigured(),
      },
      envValues: {
        supabaseUrl,
        supabaseAnonKey: env('VITE_SUPABASE_ANON_KEY') || env('SUPABASE_ANON_KEY'),
        livekitUrl: env('LIVEKIT_URL'),
        livekitApiKey: livekitKey ? '••••configured••••' : '',
        r2AccountId: env('R2_ACCOUNT_ID') ? '••••configured••••' : '',
        r2AccessKeyId: env('R2_ACCESS_KEY_ID') ? '••••configured••••' : '',
        r2BucketName: env('R2_BUCKET_NAME'),
        r2PublicUrl: env('R2_PUBLIC_URL'),
        smtpHost: env('SMTP_HOST') ? '••••configured••••' : '',
        smtpPort: env('SMTP_PORT'),
        smtpUser: env('SMTP_USER') ? '••••configured••••' : '',
        smtpFrom: env('SMTP_FROM'),
        smtpSecure: String(env('SMTP_SECURE') || '').toLowerCase() === 'true',
      },
      configured: {
        supabaseService: Boolean(env('SUPABASE_SERVICE_ROLE_KEY')),
        livekitSecret: Boolean(livekitSecret),
        r2Secret: Boolean(env('R2_SECRET_ACCESS_KEY')),
        smtp: Boolean(env('SMTP_HOST') || env('RESEND_API_KEY')),
      },
    });
  }

  if (path === 'setup/auth' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const password = String((body && body.password) || '');
    const cleanEmail = String((body && body.email) || 'admin@livecall.com')
      .toLowerCase()
      .trim();
    let isValid = false;
    const masterKey = env('SETUP_MASTER_KEY');
    if (masterKey && password === masterKey) isValid = true;

    if (!isValid) {
      const client = createServiceClient();
      if (client) {
        const { data: profile } = await client
          .from('profiles')
          .select('id, email, role, password_hash')
          .ilike('email', cleanEmail)
          .maybeSingle();
        if (profile && isAdminRole(profile.role, profile.email)) {
          isValid = await comparePasswordFlexible(password, profile.password_hash);
        }
        if (!isValid) {
          const { data: admins } = await client
            .from('profiles')
            .select('id, email, role, password_hash')
            .eq('role', 'admin')
            .limit(5);
          for (const a of admins || []) {
            if (await comparePasswordFlexible(password, a.password_hash)) {
              isValid = true;
              break;
            }
          }
        }
      }
    }

    if (!isValid) {
      return send(res, 401, {
        success: false,
        error:
          'Incorrect master password. Set SETUP_MASTER_KEY or use the admin account password.',
      });
    }
    return send(res, 200, {
      success: true,
      token: issueSetupToken(),
      message: 'Master authentication successful! Installer unlocked.',
      readOnly: true,
    });
  }

  if (path === 'setup/test-db' && req.method === 'POST') {
    const gate = await requireSetupOrAdmin(req);
    if (gate.ok === false) return send(res, gate.status, { success: false, error: gate.error });
    const body = await readJsonBody(req);
    const url = clean((body && body.supabaseUrl) || env('VITE_SUPABASE_URL') || env('SUPABASE_URL'));
    const key = clean((body && body.serviceRoleKey) || env('SUPABASE_SERVICE_ROLE_KEY'));
    if (!url || !key || url.includes('your-project-ref')) {
      return send(res, 200, { success: false, message: 'Supabase URL and Service Key are required.' });
    }
    try {
      const client = createClient(url, key, { auth: { persistSession: false } });
      const { error, count } = await client.from('profiles').select('id', { count: 'exact', head: true });
      if (error) {
        if (
          error.code === '42P01' ||
          String(error.message || '').includes('relation "public.profiles" does not exist')
        ) {
          return send(res, 200, {
            success: true,
            message:
              'Supabase PostgreSQL connected successfully! (Tables not yet migrated; auto-schema ready).',
            tableCount: 0,
          });
        }
        return send(res, 200, { success: false, message: `Database error: ${error.message}` });
      }
      return send(res, 200, {
        success: true,
        message: `Supabase PostgreSQL connected and authenticated! (${count ?? 0} profiles found in database).`,
        tableCount: count ?? 0,
      });
    } catch (err) {
      return send(res, 500, {
        success: false,
        message: `Connection failed: ${(err && err.message) || 'Unknown network error'}`,
      });
    }
  }

  if (path === 'setup/test-livekit' && req.method === 'POST') {
    const gate = await requireSetupOrAdmin(req);
    if (gate.ok === false) return send(res, gate.status, { success: false, error: gate.error });
    const body = await readJsonBody(req);
    const url = clean((body && body.wsUrl) || env('LIVEKIT_URL'));
    const key = clean((body && body.apiKey) || env('LIVEKIT_API_KEY'));
    const secret = clean((body && body.apiSecret) || env('LIVEKIT_API_SECRET'));
    if (!url || !key || !secret || key === 'devkey' || secret === 'secret') {
      return send(res, 400, {
        success: false,
        message: 'Valid LiveKit WebSocket URL, API Key, and Secret are required.',
      });
    }
    try {
      const { AccessToken } = require('livekit-server-sdk');
      const at = new AccessToken(key, secret, {
        identity: 'installer_tester',
        name: 'LiveKit Diagnostic Ping',
        ttl: '10m',
      });
      at.addGrant({ roomJoin: true, room: 'diagnostic_test_room' });
      const testJwt = await at.toJwt();
      return send(res, 200, {
        success: true,
        message: 'LiveKit credentials verified & JWT access token generated successfully!',
        wsUrl: url,
        tokenPreview: String(testJwt).substring(0, 30) + '...',
      });
    } catch (err) {
      return send(res, 500, {
        success: false,
        message: `LiveKit Error: ${(err && err.message) || 'Token generation failed'}`,
      });
    }
  }

  if (path === 'setup/test-r2' && req.method === 'POST') {
    const gate = await requireSetupOrAdmin(req);
    if (gate.ok === false) return send(res, gate.status, { success: false, error: gate.error });
    const body = await readJsonBody(req);
    const accountId = clean((body && body.accountId) || env('R2_ACCOUNT_ID'));
    const accessKeyId = clean((body && body.accessKeyId) || env('R2_ACCESS_KEY_ID'));
    const secretAccessKey = clean((body && body.secretAccessKey) || env('R2_SECRET_ACCESS_KEY'));
    const bucketName = clean((body && body.bucketName) || env('R2_BUCKET_NAME')) || 'datingappbucket';
    if (!accountId || !accessKeyId || !secretAccessKey) {
      return send(res, 200, {
        success: false,
        message: 'R2 accountId, accessKeyId, and secretAccessKey are required.',
      });
    }
    try {
      const { createHmac, createHash } = require('crypto');
      const started = Date.now();
      const host = `${accountId}.r2.cloudflarestorage.com`;
      const region = 'auto';
      const service = 's3';
      const method = 'GET';
      const canonicalUri = `/${bucketName}`;
      const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
      const dateStamp = amzDate.slice(0, 8);
      const queryParams = { 'list-type': '2', 'max-keys': '1' };
      const canonicalQuerystring = Object.keys(queryParams)
        .sort()
        .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k])}`)
        .join('&');
      const payloadHash = 'UNSIGNED-PAYLOAD';
      const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
      const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
      const canonicalRequest = [
        method,
        canonicalUri,
        canonicalQuerystring,
        canonicalHeaders,
        signedHeaders,
        payloadHash,
      ].join('\n');
      const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
      const stringToSign = [
        'AWS4-HMAC-SHA256',
        amzDate,
        credentialScope,
        createHash('sha256').update(canonicalRequest, 'utf8').digest('hex'),
      ].join('\n');
      const hmac = (key, data) => createHmac('sha256', key).update(data, 'utf8').digest();
      const kDate = hmac('AWS4' + secretAccessKey, dateStamp);
      const kRegion = hmac(kDate, region);
      const kService = hmac(kRegion, service);
      const kSigning = hmac(kService, 'aws4_request');
      const signature = createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');
      const authorization =
        `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, ` +
        `SignedHeaders=${signedHeaders}, Signature=${signature}`;
      const url = `https://${host}${canonicalUri}?${canonicalQuerystring}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'x-amz-content-sha256': payloadHash,
          'x-amz-date': amzDate,
          Authorization: authorization,
        },
      });
      if (!response.ok) {
        const detail = (await response.text().catch(() => '')).slice(0, 300);
        return send(res, 200, {
          success: false,
          message: `R2 ListObjects failed (${response.status}): ${detail || response.statusText}`,
          corsHelp:
            'Ensure R2 API tokens have Object Read permission and the bucket name is correct.',
        });
      }
      return send(res, 200, {
        success: true,
        message: 'Cloudflare R2 connectivity OK (ListObjectsV2 succeeded).',
        bucket: bucketName,
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        latencyMs: Date.now() - started,
      });
    } catch (err) {
      return send(res, 200, {
        success: false,
        message: (err && err.message) || 'R2 storage test failed',
        corsHelp:
          'Ensure R2 API tokens have Object Read permission and the bucket name is correct.',
      });
    }
  }

  if (path === 'setup/test-smtp' && req.method === 'POST') {
    const gate = await requireSetupOrAdmin(req);
    if (gate.ok === false) return send(res, gate.status, { success: false, error: gate.error });
    const body = await readJsonBody(req);
    const toEmail =
      clean((body && body.targetEmail) || (body && body.user) || '') || 'admin@livecall.com';
    const testOtp = generateSixDigitOtp();
    try {
      const sendResult = await sendOtpEmailVercel({
        to: toEmail,
        name: 'Server Setup Tester',
        otpCode: testOtp,
      });
      const ok = Boolean(sendResult && (sendResult.delivered || sendResult.success));
      return send(res, 200, {
        success: ok,
        message: (sendResult && sendResult.message) || (ok ? 'Test email sent' : 'Email send failed'),
        testOtp: ok ? testOtp : undefined,
      });
    } catch (err) {
      return send(res, 500, {
        success: false,
        message: (err && err.message) || 'SMTP test failed',
      });
    }
  }

  if (path === 'setup/save-all' && req.method === 'POST') {
    await readJsonBody(req);
    return send(res, 403, {
      success: false,
      error: {
        message:
          'Setup save cannot mutate Vercel env at runtime. Set variables in Vercel → Settings → Environment Variables, then redeploy.',
        code: 'SETUP_READONLY_ON_VERCEL',
      },
      errorMessage:
        'Setup save cannot mutate Vercel env at runtime. Set variables in Vercel → Settings → Environment Variables, then redeploy.',
    });
  }

  if (String(path).startsWith('setup/') && req.method === 'POST') {
    return send(res, 403, {
      success: false,
      error: {
        message: 'This setup mutation is not available on Vercel serverless.',
        code: 'SETUP_READONLY_ON_VERCEL',
      },
    });
  }
  return send(res, 405, { success: false, error: { message: 'Method not allowed' } });
}

async function handleLivekitExtras(path, req, res) {
  if (path === 'livekit/status' && req.method === 'GET') {
    const apiKey = clean(process.env.LIVEKIT_API_KEY);
    const apiSecret = clean(process.env.LIVEKIT_API_SECRET);
    const livekitUrl = clean(process.env.LIVEKIT_URL);
    const configured = Boolean(
      apiKey && apiSecret && apiKey !== 'devkey' && apiSecret !== 'secret'
    );
    return send(res, 200, {
      configured,
      wsUrl: livekitUrl || null,
    });
  }
  return null;
}

async function handleAppExtras(path, req, res) {
  let r = await handleSetup(path, req, res);
  if (r !== null) return r;
  r = await handleLivekitExtras(path, req, res);
  if (r !== null) return r;
  r = await handleCreator(path, req, res);
  if (r !== null) return r;
  r = await handleRewards(path, req, res);
  if (r !== null) return r;
  return null;
}

module.exports = { handleAppExtras };
