import { Router } from 'express';
import { randomUUID } from 'crypto';
import type { ServerRuntime } from '../runtimeTypes';
import { requireAuth } from '../middleware/auth';
import { getSupabaseAdmin, isSupabaseAdminConfigured, upsertProfileAdmin } from '../supabaseAdmin';
import { loadGiftSharePercents } from '../finance/walletLedgerWrite';
import {
  computeGiftCoinSplit,
  DEFAULT_TIP_COINS,
  isGiftEligibleHostRole,
  TIP_CATALOG_COINS,
} from '../../shared/finance/economyGift';

const MAX_CAPTION = 2000;
const MAX_MEDIA_URL = 2048;

function authUserId(req: any): string {
  return String(req.profileId || req.user?.id || '');
}

function sendError(res: any, status: number, message: string, code: string) {
  return res.status(status).json({ success: false, error: { message, code } });
}

function sanitizeText(value: unknown, maxLen: number): string {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim()
    .slice(0, maxLen);
}

function isAllowedMomentMediaUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed || trimmed.length > MAX_MEDIA_URL) return false;
  if (trimmed.startsWith('blob:') || trimmed.startsWith('data:')) return false;

  if (trimmed.startsWith('/api/storage/media?key=')) {
    try {
      const q = new URL(trimmed, 'http://localhost').searchParams.get('key') || '';
      return q.includes('uploads/');
    } catch {
      return false;
    }
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const path = decodeURIComponent(parsed.pathname || '');
    if (
      path.includes('/uploads/moment/') ||
      path.includes('/uploads/gallery/') ||
      path.includes('/uploads/chat_media/')
    ) {
      return true;
    }
    if (parsed.searchParams.get('key')?.includes('uploads/')) return true;
    // Allow common CDN image hosts used by existing seed/demo posts
    if (/\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(path)) return true;
    return false;
  } catch {
    return false;
  }
}

function mapFeedPost(row: any, isLiked: boolean) {
  return {
    id: row.id,
    creatorId: row.creator_id,
    creatorName: row.creator_name,
    creatorAvatar: row.creator_avatar || '',
    creatorCountry: row.creator_country || undefined,
    mediaUrl: row.media_url,
    mediaType: row.media_type === 'video' ? 'video' : 'image',
    caption: row.caption || '',
    likes: Number(row.likes || 0),
    commentsCount: Number(row.comments_count || 0),
    isLiked: Boolean(isLiked),
    createdAt: row.created_at,
  };
}

async function loadLikedPostIds(client: any, userId: string, postIds: string[]) {
  if (!userId || postIds.length === 0) return new Set<string>();
  const { data, error } = await client
    .from('feed_post_likes')
    .select('post_id')
    .eq('user_id', userId)
    .in('post_id', postIds);
  if (error) {
    console.error('[feed] likes lookup:', error.message);
    return new Set<string>();
  }
  return new Set((data || []).map((r: any) => String(r.post_id)));
}

function isEligibleTipHost(profile: any): boolean {
  return isGiftEligibleHostRole(profile?.role);
}

export function createFeedRouter(runtime: ServerRuntime) {
  const router = Router();
  const { serverUsers, broadcastUsers, recordCreatorEarnCoins } = runtime;

  /** GET /api/v1/feed?limit=&cursor= */
  router.get('/', requireAuth, async (req, res) => {
    try {
      if (!isSupabaseAdminConfigured()) {
        return sendError(res, 503, 'Feed backend unavailable', 'NO_ADMIN');
      }
      const viewerId = authUserId(req);
      const limit = Math.min(Math.max(Number(req.query?.limit) || 50, 1), 100);
      const cursor = sanitizeText(req.query?.cursor, 64) || null;

      const client = getSupabaseAdmin()!;
      let query = client
        .from('feed_posts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (cursor) {
        query = query.lt('created_at', cursor);
      }

      const { data, error } = await query;
      if (error) {
        console.error('[feed/list]', error.message);
        return sendError(res, 500, 'Failed to load feed', 'LOAD_FAILED');
      }

      const rows = data || [];
      const liked = await loadLikedPostIds(
        client,
        viewerId,
        rows.map((r: any) => String(r.id))
      );
      const posts = rows.map((r: any) => mapFeedPost(r, liked.has(String(r.id))));
      const nextCursor =
        rows.length === limit ? rows[rows.length - 1]?.created_at || null : null;

      return res.json({
        success: true,
        data: { posts, nextCursor },
      });
    } catch (err: any) {
      console.error('[feed/list] exception:', err);
      return sendError(res, 500, err?.message || 'Failed to load feed', 'LOAD_FAILED');
    }
  });

  /** GET /api/v1/feed/user/:userId */
  router.get('/user/:userId', requireAuth, async (req, res) => {
    try {
      if (!isSupabaseAdminConfigured()) {
        return sendError(res, 503, 'Feed backend unavailable', 'NO_ADMIN');
      }
      const viewerId = authUserId(req);
      const userId = sanitizeText(req.params.userId, 128);
      if (!userId) return sendError(res, 400, 'userId required', 'INVALID_USER');

      const limit = Math.min(Math.max(Number(req.query?.limit) || 50, 1), 100);
      const client = getSupabaseAdmin()!;
      const { data, error } = await client
        .from('feed_posts')
        .select('*')
        .eq('creator_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('[feed/user]', error.message);
        return sendError(res, 500, 'Failed to load user moments', 'LOAD_FAILED');
      }

      const rows = data || [];
      const liked = await loadLikedPostIds(
        client,
        viewerId,
        rows.map((r: any) => String(r.id))
      );

      return res.json({
        success: true,
        data: {
          posts: rows.map((r: any) => mapFeedPost(r, liked.has(String(r.id)))),
        },
      });
    } catch (err: any) {
      console.error('[feed/user] exception:', err);
      return sendError(res, 500, err?.message || 'Failed to load user moments', 'LOAD_FAILED');
    }
  });

  /** POST /api/v1/feed  { mediaUrl, mediaType?, caption? } */
  router.post('/', requireAuth, async (req, res) => {
    try {
      if (!isSupabaseAdminConfigured()) {
        return sendError(res, 503, 'Feed backend unavailable', 'NO_ADMIN');
      }
      const creatorId = authUserId(req);
      if (!creatorId) return sendError(res, 401, 'Unauthorized', 'UNAUTHORIZED');

      const mediaUrl = sanitizeText(req.body?.mediaUrl, MAX_MEDIA_URL);
      const caption = sanitizeText(req.body?.caption, MAX_CAPTION);
      const mediaType = String(req.body?.mediaType || 'image').trim() === 'video' ? 'video' : 'image';

      if (!mediaUrl || !isAllowedMomentMediaUrl(mediaUrl)) {
        return sendError(res, 400, 'Valid moment mediaUrl is required', 'INVALID_MEDIA');
      }

      const client = getSupabaseAdmin()!;
      const { data: creator, error: creatorErr } = await client
        .from('profiles')
        .select('id, name, avatar_url, country_code, nationality')
        .eq('id', creatorId)
        .maybeSingle();
      if (creatorErr) throw creatorErr;
      if (!creator) return sendError(res, 404, 'Creator profile not found', 'CREATOR_NOT_FOUND');

      const postId = `post_${randomUUID()}`;
      const creatorCountry = [creator.country_code, creator.nationality].filter(Boolean).join(' ').trim();

      const { data, error } = await client
        .from('feed_posts')
        .insert({
          id: postId,
          creator_id: creatorId,
          creator_name: creator.name || 'Creator',
          creator_avatar: creator.avatar_url || null,
          media_url: mediaUrl,
          media_type: mediaType,
          caption,
          likes: 0,
          comments_count: 0,
        })
        .select('*')
        .single();

      if (error || !data) {
        console.error('[feed/create]', error?.message);
        return sendError(res, 500, 'Failed to create moment', 'CREATE_FAILED');
      }

      const post = mapFeedPost(
        { ...data, creator_country: creatorCountry || undefined },
        false
      );

      return res.status(201).json({ success: true, data: { post } });
    } catch (err: any) {
      console.error('[feed/create] exception:', err);
      return sendError(res, 500, err?.message || 'Failed to create moment', 'CREATE_FAILED');
    }
  });

  /** POST /api/v1/feed/:postId/like — toggle like */
  router.post('/:postId/like', requireAuth, async (req, res) => {
    try {
      if (!isSupabaseAdminConfigured()) {
        return sendError(res, 503, 'Feed backend unavailable', 'NO_ADMIN');
      }
      const userId = authUserId(req);
      const postId = sanitizeText(req.params.postId, 128);
      if (!userId) return sendError(res, 401, 'Unauthorized', 'UNAUTHORIZED');
      if (!postId) return sendError(res, 400, 'postId required', 'INVALID_POST');

      const client = getSupabaseAdmin()!;
      const { data: post, error: postErr } = await client
        .from('feed_posts')
        .select('id, likes')
        .eq('id', postId)
        .maybeSingle();
      if (postErr) throw postErr;
      if (!post) return sendError(res, 404, 'Post not found', 'NOT_FOUND');

      const { data: existing } = await client
        .from('feed_post_likes')
        .select('post_id')
        .eq('post_id', postId)
        .eq('user_id', userId)
        .maybeSingle();

      let liked = false;
      let likes = Number(post.likes || 0);

      if (existing) {
        const { error: delErr } = await client
          .from('feed_post_likes')
          .delete()
          .eq('post_id', postId)
          .eq('user_id', userId);
        if (delErr) {
          console.error('[feed/unlike]', delErr.message);
          return sendError(res, 500, 'Failed to unlike', 'UNLIKE_FAILED');
        }
        likes = Math.max(0, likes - 1);
        liked = false;
      } else {
        const { error: insErr } = await client.from('feed_post_likes').insert({
          post_id: postId,
          user_id: userId,
        });
        if (insErr) {
          // Race: already liked
          if (String(insErr.code) === '23505') {
            liked = true;
          } else {
            console.error('[feed/like]', insErr.message);
            return sendError(res, 500, 'Failed to like', 'LIKE_FAILED');
          }
        } else {
          likes = likes + 1;
          liked = true;
        }
      }

      const { error: updErr } = await client
        .from('feed_posts')
        .update({ likes })
        .eq('id', postId);
      if (updErr) {
        console.error('[feed/like count]', updErr.message);
      }

      return res.json({
        success: true,
        data: { postId, liked, likes },
      });
    } catch (err: any) {
      console.error('[feed/like] exception:', err);
      return sendError(res, 500, err?.message || 'Failed to toggle like', 'LIKE_FAILED');
    }
  });

  /** DELETE /api/v1/feed/:postId */
  router.delete('/:postId', requireAuth, async (req, res) => {
    try {
      if (!isSupabaseAdminConfigured()) {
        return sendError(res, 503, 'Feed backend unavailable', 'NO_ADMIN');
      }
      const userId = authUserId(req);
      const postId = sanitizeText(req.params.postId, 128);
      if (!userId) return sendError(res, 401, 'Unauthorized', 'UNAUTHORIZED');
      if (!postId) return sendError(res, 400, 'postId required', 'INVALID_POST');

      const client = getSupabaseAdmin()!;
      const { data: post, error: postErr } = await client
        .from('feed_posts')
        .select('id, creator_id')
        .eq('id', postId)
        .maybeSingle();
      if (postErr) throw postErr;
      if (!post) return sendError(res, 404, 'Post not found', 'NOT_FOUND');

      const profile = (req as any).profile as { role?: string } | undefined;
      const isAdmin = profile?.role === 'admin';
      if (String(post.creator_id) !== userId && !isAdmin) {
        return sendError(res, 403, 'You can only delete your own moments', 'FORBIDDEN');
      }

      const { error } = await client.from('feed_posts').delete().eq('id', postId);
      if (error) {
        console.error('[feed/delete]', error.message);
        return sendError(res, 500, 'Failed to delete moment', 'DELETE_FAILED');
      }

      return res.json({ success: true, data: { deleted: true, postId } });
    } catch (err: any) {
      console.error('[feed/delete] exception:', err);
      return sendError(res, 500, err?.message || 'Failed to delete moment', 'DELETE_FAILED');
    }
  });

  /**
   * POST /api/v1/feed/:postId/tip
   * Body: { coins?, idempotencyKey? } — coins must be from TIP_CATALOG_COINS (default 20).
   * Debit/credit via gift_spend_atomic only.
   */
  router.post('/:postId/tip', requireAuth, async (req, res) => {
    try {
      if (!isSupabaseAdminConfigured()) {
        return sendError(res, 503, 'Feed backend unavailable', 'NO_ADMIN');
      }
      const senderId = authUserId(req);
      const postId = sanitizeText(req.params.postId, 128);
      if (!senderId) return sendError(res, 401, 'Unauthorized', 'UNAUTHORIZED');
      if (!postId) return sendError(res, 400, 'postId required', 'INVALID_POST');

      if (
        req.body?.hostCoinsEarned != null ||
        req.body?.tlCoinsEarned != null ||
        req.body?.hostEarnings != null
      ) {
        return sendError(
          res,
          400,
          'Client must not supply hostCoinsEarned or tlCoinsEarned',
          'CLIENT_EARN_FORBIDDEN'
        );
      }

      let tipCoins = Number(req.body?.coins);
      if (!Number.isFinite(tipCoins) || tipCoins <= 0) tipCoins = DEFAULT_TIP_COINS;
      tipCoins = Math.round(tipCoins);
      if (!(TIP_CATALOG_COINS as readonly number[]).includes(tipCoins)) {
        return sendError(
          res,
          400,
          `Tip amount must be one of: ${TIP_CATALOG_COINS.join(', ')}`,
          'INVALID_TIP_AMOUNT'
        );
      }

      const clientIdem =
        typeof req.body?.idempotencyKey === 'string'
          ? sanitizeText(req.body.idempotencyKey, 200)
          : '';
      const idempotencyKey = clientIdem || `tip:${postId}:${senderId}:${tipCoins}`;

      const client = getSupabaseAdmin()!;
      const { data: post, error: postErr } = await client
        .from('feed_posts')
        .select('id, creator_id')
        .eq('id', postId)
        .maybeSingle();
      if (postErr) throw postErr;
      if (!post) return sendError(res, 404, 'Post not found', 'NOT_FOUND');

      const creatorId = String(post.creator_id);
      if (creatorId === senderId) {
        return sendError(res, 400, 'You cannot tip your own moment', 'SELF_TIP');
      }

      const { data: creator, error: creatorErr } = await client
        .from('profiles')
        .select('id, name, role, team_leader_id, created_by_id, earnings_coins')
        .eq('id', creatorId)
        .maybeSingle();
      if (creatorErr) throw creatorErr;
      if (!creator) return sendError(res, 404, 'Creator not found', 'CREATOR_NOT_FOUND');

      const shares = await loadGiftSharePercents(client);
      const eligible = isEligibleTipHost(creator);
      const tlId = eligible ? creator.team_leader_id || creator.created_by_id || null : null;
      const split = computeGiftCoinSplit({
        giftCost: tipCoins,
        hostSharePercent: shares.host,
        tlSharePercent: shares.tl,
        hasTeamLeader: Boolean(tlId),
        hostEligible: eligible,
      });

      const { data: rpcRaw, error: rpcErr } = await client.rpc('gift_spend_atomic', {
        p_sender_id: senderId,
        p_receiver_id: creatorId,
        p_tl_id: tlId ? String(tlId) : null,
        p_coins: tipCoins,
        p_host_coins: split.hostCoins,
        p_tl_coins: split.tlCoins,
        p_idempotency_key: idempotencyKey,
        p_metadata: {
          kind: 'moment_tip',
          postId,
          tipCoins,
          hostSharePercent: split.hostSharePercent,
          tlSharePercent: split.tlSharePercent,
          platformCoins: split.platformCoins,
        },
      });

      if (rpcErr) {
        console.error('[feed/tip] RPC error:', rpcErr.message);
        return sendError(res, 500, 'Tip billing failed', 'TIP_RPC_FAILED');
      }

      const rpcResult = typeof rpcRaw === 'string' ? JSON.parse(rpcRaw) : rpcRaw;
      if (!rpcResult?.success) {
        const code = rpcResult?.error_code || 'TIP_FAILED';
        const status = code === 'INSUFFICIENT_BALANCE' ? 400 : 500;
        return res.status(status).json({
          success: false,
          error: {
            message: rpcResult?.error_message || 'Tip failed',
            code,
          },
        });
      }

      const newSenderBalance = Number(rpcResult.new_sender_balance || 0);
      const newHostEarnings = Number(rpcResult.new_host_earnings || 0);
      const newTlEarnings = Number(rpcResult.new_tl_earnings || 0);
      const hostCoinsEarned = Number(rpcResult.host_coins_earned ?? split.hostCoins) || 0;
      const tlCoinsEarned = Number(rpcResult.tl_coins_earned ?? split.tlCoins) || 0;

      const memSender = serverUsers.get(senderId);
      if (memSender) {
        memSender.coinBalance = newSenderBalance;
        serverUsers.set(senderId, memSender);
        upsertProfileAdmin(memSender).catch(() => {});
      }
      const memHost = serverUsers.get(creatorId);
      if (memHost && hostCoinsEarned > 0) {
        memHost.earningsCoins = newHostEarnings;
        memHost.totalGiftsReceivedCount = (memHost.totalGiftsReceivedCount || 0) + 1;
        serverUsers.set(creatorId, memHost);
        upsertProfileAdmin(memHost).catch(() => {});
      }
      if (tlId && tlCoinsEarned > 0) {
        const memTl = serverUsers.get(String(tlId));
        if (memTl) {
          memTl.earningsCoins = newTlEarnings;
          serverUsers.set(String(tlId), memTl);
          upsertProfileAdmin(memTl).catch(() => {});
        }
      }

      if (eligible && hostCoinsEarned > 0 && !rpcResult.duplicate) {
        recordCreatorEarnCoins?.(creatorId, { giftCoins: hostCoinsEarned });
      }

      try {
        broadcastUsers?.();
      } catch {
        /* optional */
      }

      return res.json({
        success: true,
        data: {
          postId,
          creatorId,
          tipCoins,
          senderBalance: newSenderBalance,
          hostEarnings: newHostEarnings,
          hostCoinsEarned,
          tlCoinsEarned,
          tlId: tlId || undefined,
          tlEarnings: tlId ? newTlEarnings : undefined,
          duplicate: Boolean(rpcResult.duplicate),
        },
      });
    } catch (err: any) {
      console.error('[feed/tip] exception:', err);
      return sendError(res, 500, err?.message || 'Failed to tip', 'TIP_FAILED');
    }
  });

  return router;
}
