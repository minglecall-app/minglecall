import { Router } from 'express';
import type { ServerRuntime } from '../runtimeTypes';
import { requireAuth } from '../middleware/auth';
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '../supabaseAdmin';

const MAX_TEXT_LENGTH = 4000;
const MAX_MEDIA_URL_LENGTH = 2048;
const ALLOWED_MESSAGE_TYPES = new Set(['text', 'image', 'video', 'voice', 'gift', 'friend_request']);

function authUserId(req: any): string {
  return String(req.profileId || req.user?.id || '');
}

function sendError(res: any, status: number, message: string, code: string) {
  return res.status(status).json({ success: false, error: { message, code } });
}

function mapMessageRow(row: any, clientTempId?: string | null) {
  return {
    id: row.id,
    senderId: row.sender_id,
    receiverId: row.receiver_id,
    text: row.text || '',
    originalLanguage: row.original_language || 'English',
    translatedText: row.translated_text || undefined,
    targetLanguage: row.target_language || undefined,
    mediaUrl: row.media_url || undefined,
    mediaType: row.media_type || undefined,
    type: row.type,
    giftInfo: row.gift_info || undefined,
    friendRequestInfo: row.friend_request_info || undefined,
    ratingInfo: row.rating_info || undefined,
    isRead: Boolean(row.is_read),
    readAt: row.read_at || undefined,
    createdAt: row.created_at,
    timestamp: row.created_at,
    clientTempId: clientTempId || undefined,
  };
}

function isAllowedMediaUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed || trimmed.length > MAX_MEDIA_URL_LENGTH) return false;
  if (trimmed.startsWith('blob:') || trimmed.startsWith('data:')) return false;

  // App-proxied R2 media
  if (trimmed.startsWith('/api/storage/media?key=')) {
    try {
      const q = new URL(trimmed, 'http://localhost').searchParams.get('key') || '';
      return q.includes('uploads/');
    } catch {
      return false;
    }
  }

  // Absolute http(s) URL — must look like our public media / R2 key path
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const path = decodeURIComponent(parsed.pathname || '');
    if (path.includes('/uploads/chat_media/') || path.includes('/uploads/moment/') || path.includes('/uploads/gallery/')) {
      return true;
    }
    if (parsed.searchParams.get('key')?.includes('uploads/')) return true;
    return false;
  } catch {
    return false;
  }
}

function resolveMessageType(rawType: unknown, hasMedia: boolean): string {
  const candidate = String(rawType || '').trim();
  if (ALLOWED_MESSAGE_TYPES.has(candidate)) return candidate;
  return hasMedia ? 'image' : 'text';
}

async function assertReceiverExists(client: any, receiverId: string) {
  const { data, error } = await client
    .from('profiles')
    .select('id, is_banned, banned_until')
    .eq('id', receiverId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function loadSenderProfile(client: any, senderId: string) {
  const { data, error } = await client
    .from('profiles')
    .select('id, is_banned, banned_until, spoken_languages')
    .eq('id', senderId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function isProfileSuspended(profile: { is_banned?: boolean | null; banned_until?: string | null } | null): boolean {
  if (!profile) return true;
  if (!profile.is_banned) return false;
  if (!profile.banned_until) return true;
  const until = new Date(profile.banned_until).getTime();
  if (Number.isNaN(until)) return true;
  return until > Date.now();
}

async function isBlockedEitherWay(client: any, userId: string, otherUserId: string) {
  const { data, error } = await client
    .from('blocked_users')
    .select('user_id, blocked_user_id')
    .or(
      `and(user_id.eq.${userId},blocked_user_id.eq.${otherUserId}),and(user_id.eq.${otherUserId},blocked_user_id.eq.${userId})`
    )
    .limit(1);
  if (error) throw error;
  return Boolean(data && data.length > 0);
}

/**
 * Clear semantics: soft-hide for the acting user only.
 * Upserts message_conversation_clears(user_id, other_user_id, cleared_at).
 * Messages remain visible to the other participant; hydrate filters created_at <= cleared_at.
 */
export function createMessagesRouter(runtime: ServerRuntime) {
  const router = Router();

  /** POST /api/messages — durable send */
  router.post('/', requireAuth, async (req, res) => {
    try {
      if (!isSupabaseAdminConfigured()) {
        return sendError(res, 503, 'Messages backend unavailable', 'NO_ADMIN');
      }

      const senderId = authUserId(req);
      if (!senderId) return sendError(res, 401, 'Unauthorized', 'UNAUTHORIZED');

      const receiverId = String(req.body?.receiverId || '').trim();
      const textRaw = typeof req.body?.text === 'string' ? req.body.text : '';
      const text = textRaw.trim();
      const mediaUrlRaw = typeof req.body?.mediaUrl === 'string' ? req.body.mediaUrl.trim() : '';
      const mediaType = typeof req.body?.mediaType === 'string' ? req.body.mediaType.trim() : null;
      const clientTempId =
        typeof req.body?.clientTempId === 'string' && req.body.clientTempId.trim()
          ? req.body.clientTempId.trim().slice(0, 80)
          : null;
      const originalLanguage =
        typeof req.body?.originalLanguage === 'string' && req.body.originalLanguage.trim()
          ? req.body.originalLanguage.trim().slice(0, 64)
          : null;

      if (!receiverId || receiverId === senderId) {
        return sendError(res, 400, 'Invalid receiverId', 'INVALID_RECEIVER');
      }

      const hasMedia = Boolean(mediaUrlRaw);
      if (!text && !hasMedia) {
        return sendError(res, 400, 'Message text or mediaUrl is required', 'EMPTY_MESSAGE');
      }
      if (text.length > MAX_TEXT_LENGTH) {
        return sendError(res, 400, `Text exceeds ${MAX_TEXT_LENGTH} characters`, 'TEXT_TOO_LONG');
      }
      if (hasMedia && !isAllowedMediaUrl(mediaUrlRaw)) {
        return sendError(res, 400, 'mediaUrl is not an allowed app media URL', 'INVALID_MEDIA_URL');
      }

      const client = getSupabaseAdmin()!;
      const [sender, receiver] = await Promise.all([
        loadSenderProfile(client, senderId),
        assertReceiverExists(client, receiverId),
      ]);

      if (!sender) {
        return sendError(res, 403, 'Sender profile not found', 'SENDER_NOT_FOUND');
      }
      if (isProfileSuspended(sender)) {
        return sendError(res, 403, 'Your account is suspended and cannot send messages', 'SENDER_SUSPENDED');
      }
      if (!receiver) {
        return sendError(res, 404, 'Receiver not found', 'RECEIVER_NOT_FOUND');
      }
      if (isProfileSuspended(receiver)) {
        return sendError(res, 403, 'This user is unavailable', 'RECEIVER_UNAVAILABLE');
      }

      if (await isBlockedEitherWay(client, senderId, receiverId)) {
        return sendError(res, 403, 'Messaging is blocked for this conversation', 'BLOCKED');
      }

      const messageType = resolveMessageType(req.body?.type, hasMedia);
      const spoken =
        Array.isArray(sender.spoken_languages) && sender.spoken_languages.length > 0
          ? String(sender.spoken_languages[0])
          : 'English';

      const insertPayload: Record<string, unknown> = {
        sender_id: senderId,
        receiver_id: receiverId,
        text: text || (hasMedia ? '📷 Photo' : null),
        original_language: originalLanguage || spoken,
        translated_text: null,
        target_language: null,
        media_url: hasMedia ? mediaUrlRaw : null,
        media_type: hasMedia ? mediaType || 'image' : null,
        type: messageType,
        is_read: false,
        // created_at defaults to now() — never trust client timestamps
      };

      const { data, error } = await client.from('messages').insert(insertPayload).select('*').single();
      if (error || !data) {
        console.error('[messages/send]', error?.message);
        return sendError(res, 500, 'Failed to send message', 'SEND_FAILED');
      }

      const mapped = mapMessageRow(data, clientTempId);

      // Local Express WS (dev dual-run) + targeted Supabase Realtime Broadcast
      try {
        runtime.sendToUser?.(receiverId, { type: 'chat:message', message: mapped });
        runtime.sendToUser?.(senderId, { type: 'chat:message', message: mapped });
      } catch (notifyErr: any) {
        console.warn('[messages/send] WS notify failed:', notifyErr?.message || notifyErr);
      }
      try {
        // CJS helper — persist-first targeted Broadcast on user:{id} + conversation:{pair}
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { broadcastChatMessage } = await import('../../lib/realtimeBroadcast');
        await broadcastChatMessage(client, mapped, [senderId, receiverId]);
      } catch (broadcastErr: any) {
        console.warn(
          '[messages/send] realtime broadcast failed (message still durable)',
          broadcastErr?.message || broadcastErr
        );
      }

      return res.status(201).json({
        success: true,
        data: { message: mapped },
      });
    } catch (err: any) {
      console.error('[messages/send] exception:', err);
      return sendError(res, 500, err?.message || 'Failed to send message', 'SEND_FAILED');
    }
  });

  /** GET /api/messages/conversation/:otherUserId?cursor=&limit= — cursor page (max 50) */
  router.get('/conversation/:otherUserId', requireAuth, async (req, res) => {
    try {
      if (!isSupabaseAdminConfigured()) {
        return sendError(res, 503, 'Messages backend unavailable', 'NO_ADMIN');
      }
      const me = authUserId(req);
      const otherUserId = String(req.params.otherUserId || '').trim();
      if (!me || !otherUserId || otherUserId === me) {
        return sendError(res, 400, 'Invalid otherUserId', 'INVALID_OTHER');
      }

      const cursor = String(req.query?.cursor || '').trim();
      let limit = Number(req.query?.limit || 40);
      if (!Number.isFinite(limit) || limit <= 0) limit = 40;
      limit = Math.min(Math.floor(limit), 50);

      const client = getSupabaseAdmin()!;
      let clearedAt: string | null = null;
      try {
        const { data: clearRow } = await client
          .from('message_conversation_clears')
          .select('cleared_at')
          .eq('user_id', me)
          .eq('other_user_id', otherUserId)
          .maybeSingle();
        clearedAt = clearRow?.cleared_at ? String(clearRow.cleared_at) : null;
      } catch {
        /* optional table */
      }

      let q = client
        .from('messages')
        .select('*')
        .or(
          `and(sender_id.eq.${me},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${me})`
        )
        .order('created_at', { ascending: false })
        .limit(limit);
      if (clearedAt) q = q.gt('created_at', clearedAt);
      if (cursor) q = q.lt('created_at', cursor);

      const { data, error } = await q;
      if (error) {
        return sendError(res, 500, error.message || 'Failed to load messages', 'LOAD_FAILED');
      }

      const newestFirst = data || [];
      const nextCursor =
        newestFirst.length === limit
          ? newestFirst[newestFirst.length - 1]?.created_at || null
          : null;
      const messages = newestFirst
        .slice()
        .reverse()
        .map((row) => mapMessageRow(row));

      return res.json({
        success: true,
        messages,
        nextCursor,
        pageSize: limit,
      });
    } catch (err: any) {
      return sendError(res, 500, err?.message || 'Failed to load messages', 'LOAD_FAILED');
    }
  });

  /** POST /api/messages/read { otherUserId } — mark inbound messages read in DB */
  router.post('/read', requireAuth, async (req, res) => {
    try {
      if (!isSupabaseAdminConfigured()) {
        return sendError(res, 503, 'Messages backend unavailable', 'NO_ADMIN');
      }

      const me = authUserId(req);
      const otherUserId = String(req.body?.otherUserId || '').trim();
      if (!me) return sendError(res, 401, 'Unauthorized', 'UNAUTHORIZED');
      if (!otherUserId || otherUserId === me) {
        return sendError(res, 400, 'Invalid otherUserId', 'INVALID_OTHER');
      }

      const client = getSupabaseAdmin()!;
      const nowIso = new Date().toISOString();
      const { data, error } = await client
        .from('messages')
        .update({ is_read: true, read_at: nowIso })
        .eq('receiver_id', me)
        .eq('sender_id', otherUserId)
        .eq('is_read', false)
        .select('id');

      if (error) {
        console.error('[messages/read]', error.message);
        return sendError(res, 500, 'Failed to mark messages read', 'READ_FAILED');
      }

      return res.json({
        success: true,
        data: {
          otherUserId,
          updatedIds: (data || []).map((r: any) => r.id),
          updatedCount: (data || []).length,
          readAt: nowIso,
        },
      });
    } catch (err: any) {
      console.error('[messages/read] exception:', err);
      return sendError(res, 500, err?.message || 'Failed to mark messages read', 'READ_FAILED');
    }
  });

  /** DELETE /api/messages/conversation/:otherUserId — soft-hide conversation for me */
  router.delete('/conversation/:otherUserId', requireAuth, async (req, res) => {
    try {
      if (!isSupabaseAdminConfigured()) {
        return sendError(res, 503, 'Messages backend unavailable', 'NO_ADMIN');
      }

      const me = authUserId(req);
      const otherUserId = String(req.params.otherUserId || '').trim();
      if (!me) return sendError(res, 401, 'Unauthorized', 'UNAUTHORIZED');
      if (!otherUserId || otherUserId === me) {
        return sendError(res, 400, 'Invalid otherUserId', 'INVALID_OTHER');
      }

      const client = getSupabaseAdmin()!;
      const clearedAt = new Date().toISOString();
      const { error } = await client.from('message_conversation_clears').upsert(
        {
          user_id: me,
          other_user_id: otherUserId,
          cleared_at: clearedAt,
        },
        { onConflict: 'user_id,other_user_id' }
      );

      if (error) {
        console.error('[messages/clear]', error.message);
        return sendError(res, 500, 'Failed to clear conversation', 'CLEAR_FAILED');
      }

      return res.json({
        success: true,
        data: {
          otherUserId,
          clearedAt,
          semantics: 'soft_hide_for_actor',
        },
      });
    } catch (err: any) {
      console.error('[messages/clear] exception:', err);
      return sendError(res, 500, err?.message || 'Failed to clear conversation', 'CLEAR_FAILED');
    }
  });

  /** POST /api/messages/clear { otherUserId } — alias for soft-hide clear */
  router.post('/clear', requireAuth, async (req, res) => {
    try {
      if (!isSupabaseAdminConfigured()) {
        return sendError(res, 503, 'Messages backend unavailable', 'NO_ADMIN');
      }

      const me = authUserId(req);
      const otherUserId = String(req.body?.otherUserId || '').trim();
      if (!me) return sendError(res, 401, 'Unauthorized', 'UNAUTHORIZED');
      if (!otherUserId || otherUserId === me) {
        return sendError(res, 400, 'Invalid otherUserId', 'INVALID_OTHER');
      }

      const client = getSupabaseAdmin()!;
      const clearedAt = new Date().toISOString();
      const { error } = await client.from('message_conversation_clears').upsert(
        {
          user_id: me,
          other_user_id: otherUserId,
          cleared_at: clearedAt,
        },
        { onConflict: 'user_id,other_user_id' }
      );

      if (error) {
        console.error('[messages/clear]', error.message);
        return sendError(res, 500, 'Failed to clear conversation', 'CLEAR_FAILED');
      }

      return res.json({
        success: true,
        data: {
          otherUserId,
          clearedAt,
          semantics: 'soft_hide_for_actor',
        },
      });
    } catch (err: any) {
      console.error('[messages/clear] exception:', err);
      return sendError(res, 500, err?.message || 'Failed to clear conversation', 'CLEAR_FAILED');
    }
  });

  return router;
}
