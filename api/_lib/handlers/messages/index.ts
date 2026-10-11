import {
  sendJson,
  readJsonBody,
  requireAuthFromBearer,
  createServiceClient,
  type VercelReq,
  type VercelRes,
} from '../../vercelAuth';
import { mapProfileRow } from '../../authHelpers';

export default async function handler(req: VercelReq, res: VercelRes) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const auth = await requireAuthFromBearer(req);
  if (auth.ok === false) {
    return sendJson(res, auth.status, { success: false, error: auth.error });
  }

  const client = createServiceClient();
  if (!client) {
    return sendJson(res, 503, { success: false, error: { message: 'Supabase not configured' } });
  }

  if (req.method === 'POST') {
    const body = await readJsonBody(req);
    const receiverId = String(body?.receiverId || '');
    const text = String(body?.text || '').slice(0, 4000);
    const mediaUrl = body?.mediaUrl ? String(body.mediaUrl).slice(0, 2048) : null;
    const type = String(body?.type || (mediaUrl ? 'image' : 'text'));
    const clientTempId = body?.clientTempId || null;

    if (!receiverId) {
      return sendJson(res, 400, { success: false, error: { message: 'receiverId required', code: 'BAD_REQUEST' } });
    }

    const { data: blocked } = await client
      .from('blocked_users')
      .select('user_id')
      .or(
        `and(user_id.eq.${auth.profileId},blocked_user_id.eq.${receiverId}),and(user_id.eq.${receiverId},blocked_user_id.eq.${auth.profileId})`
      )
      .limit(1);
    if (blocked && blocked.length) {
      return sendJson(res, 403, { success: false, error: { message: 'Blocked', code: 'BLOCKED' } });
    }

    const row = {
      sender_id: auth.profileId,
      receiver_id: receiverId,
      text,
      type,
      media_url: mediaUrl,
      media_type: body?.mediaType || undefined,
      is_read: false,
      created_at: new Date().toISOString(),
    };

    const { data, error } = await client.from('messages').insert(row as any).select('*').maybeSingle();
    if (error) {
      return sendJson(res, 500, { success: false, error: { message: error.message } });
    }

    const message = {
      id: data.id,
      senderId: data.sender_id,
      receiverId: data.receiver_id,
      text: data.text || '',
      mediaUrl: data.media_url || undefined,
      type: data.type,
      isRead: Boolean(data.is_read),
      createdAt: data.created_at,
      timestamp: data.created_at,
      clientTempId: clientTempId || undefined,
    };

    try {
      const { broadcastChatMessage } = await import('../../../../lib/realtimeBroadcast');
      await broadcastChatMessage(client, message, [auth.profileId, receiverId]);
    } catch (e: any) {
      console.warn('[messages] realtime broadcast failed (durable ok)', e?.message);
    }

    return sendJson(res, 200, {
      success: true,
      message,
    });
  }

  return sendJson(res, 405, { success: false, error: { message: 'Method not allowed' } });
}
