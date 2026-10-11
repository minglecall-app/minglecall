import {
  sendJson,
  requireAuthFromBearer,
  createServiceClient,
  type VercelReq,
  type VercelRes,
} from '../../vercelAuth';

const PAGE_SIZE = 40;

export default async function handler(req: VercelReq, res: VercelRes) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== 'GET') {
    return sendJson(res, 405, { success: false, error: { message: 'Method not allowed' } });
  }

  const auth = await requireAuthFromBearer(req);
  if (auth.ok === false) {
    return sendJson(res, auth.status, { success: false, error: auth.error });
  }

  const url = new URL(req.url || '', 'http://localhost');
  const parts = url.pathname.split('/').filter(Boolean);
  // /api/messages/conversation/:otherUserId
  const otherUserId = decodeURIComponent(parts[parts.length - 1] || '');
  if (!otherUserId || otherUserId === 'conversation') {
    return sendJson(res, 400, { success: false, error: { message: 'otherUserId required' } });
  }

  const client = createServiceClient();
  if (!client) {
    return sendJson(res, 503, { success: false, error: { message: 'Supabase not configured' } });
  }

  const cursor = String(url.searchParams.get('cursor') || '').trim();
  let limit = Number(url.searchParams.get('limit') || PAGE_SIZE);
  if (!Number.isFinite(limit) || limit <= 0) limit = PAGE_SIZE;
  limit = Math.min(Math.floor(limit), 50);

  let q = client
    .from('messages')
    .select('*')
    .or(
      `and(sender_id.eq.${auth.profileId},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${auth.profileId})`
    )
    .order('created_at', { ascending: false })
    .limit(limit);

  if (cursor) {
    q = q.lt('created_at', cursor);
  }

  const { data, error } = await q;

  if (error) {
    return sendJson(res, 500, { success: false, error: { message: error.message } });
  }

  const newestFirst = data || [];
  const nextCursor =
    newestFirst.length === limit ? newestFirst[newestFirst.length - 1]?.created_at || null : null;
  const messages = newestFirst
    .slice()
    .reverse()
    .map((row: any) => ({
      id: row.id,
      senderId: row.sender_id,
      receiverId: row.receiver_id,
      text: row.text || '',
      mediaUrl: row.media_url || undefined,
      type: row.type,
      isRead: Boolean(row.is_read),
      createdAt: row.created_at,
      timestamp: row.created_at,
    }));

  return sendJson(res, 200, {
    success: true,
    messages,
    nextCursor,
    pageSize: limit,
  });
}
