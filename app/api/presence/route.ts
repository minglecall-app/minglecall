import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '../../../lib/nextAuth';
import { isRedisConfigured, mgetPresence } from '../../../lib/redis';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
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

  const idsParam = req.nextUrl.searchParams.get('ids') || '';
  const ids = idsParam.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 200);
  if (!ids.length) {
    return NextResponse.json({ success: true, presence: {}, source: 'redis_empty_ids' });
  }

  try {
    const presence = await mgetPresence(ids);
    return NextResponse.json({ success: true, presence, source: 'redis' });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: {
          message: err?.message || 'Redis presence read failed',
          code: 'REDIS_UNAVAILABLE',
        },
      },
      { status: 503 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
