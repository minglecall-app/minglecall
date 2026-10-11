import { NextResponse } from 'next/server';
import { getRedis } from '../../../lib/redis';

export const runtime = 'nodejs';

export async function POST() {
  const redis = getRedis();
  if (!redis) {
    return NextResponse.json(
      {
        success: false,
        error: {
          message:
            'Redis REST credentials are not configured. Set UPSTASH_REDIS_REST_* or KV_REST_API_*.',
          code: 'REDIS_UNAVAILABLE',
        },
      },
      { status: 503 }
    );
  }
  const data = await redis.get('item');
  return NextResponse.json({ data });
}
