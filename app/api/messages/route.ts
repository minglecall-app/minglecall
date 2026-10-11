import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createServiceClient } from '../../../lib/nextAuth';
import { checkRateLimit, isRedisConfigured } from '../../../lib/redis';
import { broadcastChatMessage } from '../../../lib/realtimeBroadcast';

export const runtime = 'nodejs';
export const maxDuration = 20;

const PAGE_SIZE = 30;

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.ok === false) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }
  const client = createServiceClient();
  if (!client) {
    return NextResponse.json({ success: false, error: { message: 'Supabase not configured' } }, { status: 503 });
  }
  const otherUserId = String(req.nextUrl.searchParams.get('otherUserId') || '').trim();
  const cursor = String(req.nextUrl.searchParams.get('cursor') || '').trim();
  if (!otherUserId) {
    return NextResponse.json(
      { success: false, error: { message: 'otherUserId required', code: 'BAD_REQUEST' } },
      { status: 400 }
    );
  }

  let q = client
    .from('messages')
    .select('*')
    .or(
      `and(sender_id.eq.${auth.profileId},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${auth.profileId})`
    )
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE);

  if (cursor) {
    q = q.lt('created_at', cursor);
  }

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ success: false, error: { message: error.message } }, { status: 500 });
  }
  const messages = data || [];
  const nextCursor =
    messages.length === PAGE_SIZE ? messages[messages.length - 1]?.created_at || null : null;

  return NextResponse.json({
    success: true,
    messages,
    nextCursor,
    pageSize: PAGE_SIZE,
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.ok === false) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }
  if (isRedisConfigured()) {
    const ok = await checkRateLimit(auth.profileId, 'messages', 60, 60);
    if (!ok) {
      return NextResponse.json(
        { success: false, error: { message: 'Rate limit exceeded', code: 'RATE_LIMIT' } },
        { status: 429 }
      );
    }
  }

  const client = createServiceClient();
  if (!client) {
    return NextResponse.json({ success: false, error: { message: 'Supabase not configured' } }, { status: 503 });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const receiverId = String(body?.receiverId || '');
  const text = String(body?.text || '').slice(0, 4000);
  const mediaUrl = body?.mediaUrl ? String(body.mediaUrl).slice(0, 2048) : null;
  const type = String(body?.type || (mediaUrl ? 'image' : 'text'));
  const clientTempId = body?.clientTempId || null;

  if (!receiverId) {
    return NextResponse.json(
      { success: false, error: { message: 'receiverId required', code: 'BAD_REQUEST' } },
      { status: 400 }
    );
  }

  const { data: blocked } = await client
    .from('blocked_users')
    .select('user_id')
    .or(
      `and(user_id.eq.${auth.profileId},blocked_user_id.eq.${receiverId}),and(user_id.eq.${receiverId},blocked_user_id.eq.${auth.profileId})`
    )
    .limit(1);
  if (blocked && blocked.length) {
    return NextResponse.json(
      { success: false, error: { message: 'Blocked', code: 'BLOCKED' } },
      { status: 403 }
    );
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
    return NextResponse.json({ success: false, error: { message: error.message } }, { status: 500 });
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

  // Durable insert succeeded — fan out on targeted user/conversation broadcast topics
  try {
    await broadcastChatMessage(client, message, [auth.profileId, receiverId]);
  } catch (e: any) {
    console.warn('[api/messages] realtime broadcast failed (message still durable)', e?.message);
  }

  return NextResponse.json({
    success: true,
    message,
  });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
