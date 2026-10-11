import { NextRequest, NextResponse } from 'next/server';
import { AccessToken } from 'livekit-server-sdk';
import { requireAuth, createServiceClient } from '../../../../lib/nextAuth';
import { getCallState, isRedisConfigured } from '../../../../lib/redis';

export const runtime = 'nodejs';
export const maxDuration = 15;

const OPEN_STATUSES = new Set(['ringing', 'active', 'accepted', 'in_call', 'connecting']);

function getLiveKitEnv() {
  const clean = (v: string) => v.trim().replace(/^["']|["']$/g, '');
  return {
    wsUrl: clean(process.env.LIVEKIT_URL || ''),
    apiKey: clean(process.env.LIVEKIT_API_KEY || ''),
    apiSecret: clean(process.env.LIVEKIT_API_SECRET || ''),
  };
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.ok === false) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  const { wsUrl, apiKey, apiSecret } = getLiveKitEnv();
  if (!wsUrl || !apiKey || !apiSecret) {
    return NextResponse.json(
      { success: false, error: { message: 'LiveKit not configured', code: 'NO_LIVEKIT' } },
      { status: 503 }
    );
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const roomName = String(body?.roomName || body?.callId || '').trim();
  const callId = String(body?.callId || roomName).trim();
  if (!roomName) {
    return NextResponse.json(
      { success: false, error: { message: 'roomName or callId required', code: 'BAD_REQUEST' } },
      { status: 400 }
    );
  }

  const isAdminTest = roomName.startsWith('admin_test_room_') && auth.role === 'admin';
  let authorized = isAdminTest;
  let resolvedRoom = roomName;

  if (!authorized && isRedisConfigured()) {
    const state = await getCallState(callId);
    if (state) {
      const ids = [state.callerId, state.receiverId].map((x) => String(x || ''));
      authorized = ids.includes(auth.profileId) || ids.includes(auth.userId);
    }
  }

  if (!authorized) {
    const client = createServiceClient();
    if (!client) {
      return NextResponse.json(
        { success: false, error: { message: 'Supabase not configured', code: 'NO_SUPABASE' } },
        { status: 503 }
      );
    }
    const { data: row } = await client
      .from('call_logs')
      .select('id, caller_id, receiver_id, host_id, status')
      .eq('id', callId)
      .maybeSingle();
    if (row) {
      const st = String(row.status || '').toLowerCase();
      if (st && !OPEN_STATUSES.has(st)) {
        return NextResponse.json(
          { success: false, error: { message: 'This call has already ended.', code: 'CALL_ENDED' } },
          { status: 409 }
        );
      }
      const ids = [row.caller_id, row.receiver_id, row.host_id].map((x) => String(x || ''));
      authorized = ids.includes(auth.profileId) || ids.includes(auth.userId);
      if (authorized && row.id) resolvedRoom = String(row.id);
    }
  }

  if (!authorized) {
    return NextResponse.json(
      { success: false, error: { message: 'Not a call participant', code: 'FORBIDDEN' } },
      { status: 403 }
    );
  }

  const at = new AccessToken(apiKey, apiSecret, {
    identity: auth.profileId,
    name: auth.email || auth.profileId,
    ttl: '2h',
  });
  at.addGrant({
    roomJoin: true,
    room: resolvedRoom,
    canPublish: true,
    canSubscribe: true,
  });
  const token = await at.toJwt();

  return NextResponse.json({
    success: true,
    token,
    url: wsUrl,
    roomName: resolvedRoom,
    identity: auth.profileId,
  });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
