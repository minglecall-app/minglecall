import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/nextAuth';
import {
  isRedisConfigured,
  setPresence,
  deletePresence,
  mgetPresence,
  RedisUnavailableError,
  type PresenceStatus,
} from '../../../../lib/redis';

export const runtime = 'nodejs';
export const maxDuration = 15;

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.ok === false) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  if (!isRedisConfigured()) {
    return NextResponse.json(
      {
        success: false,
        error: {
          message: 'Presence service unavailable — Redis is not configured',
          code: 'REDIS_UNAVAILABLE',
        },
      },
      { status: 503 }
    );
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const statusRaw = String(body?.status || 'online').toLowerCase();
  const writeStatus: PresenceStatus =
    statusRaw === 'offline'
      ? 'offline'
      : statusRaw === 'busy' || statusRaw === 'in_call'
        ? 'busy'
        : 'online';

  try {
    if (writeStatus === 'offline') {
      await deletePresence(auth.profileId);
    } else {
      await setPresence(auth.profileId, writeStatus);
    }
  } catch (err: any) {
    const msg = err instanceof RedisUnavailableError || err?.code === 'REDIS_UNAVAILABLE';
    return NextResponse.json(
      {
        success: false,
        error: {
          message: err?.message || 'Redis presence write failed',
          code: 'REDIS_UNAVAILABLE',
        },
      },
      { status: 503 }
    );
  }

  const peerIds = Array.isArray(body?.peerIds)
    ? body.peerIds.map((id: unknown) => String(id || '').trim()).filter(Boolean).slice(0, 200)
    : [];
  let presence: Record<string, PresenceStatus> = {};
  try {
    if (peerIds.length) {
      presence = await mgetPresence(peerIds);
    }
  } catch {
    /* peer map is best-effort; self status still returned */
  }
  presence[auth.profileId] = writeStatus;

  return NextResponse.json({
    success: true,
    userId: auth.profileId,
    status: writeStatus,
    presence,
    redis: true,
  });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
