import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';

const redis = Redis.fromEnv();

export async function POST() {
  const data = await redis.get('item');
  return NextResponse.json({ data });
}
