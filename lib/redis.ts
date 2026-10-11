/**
 * Upstash Redis — server-only. Never import from client components.
 * Keys: presence:{userId}, profile:{userId}, rate:{userId}:{endpoint}, call:{callId}
 */
import { Redis } from '@upstash/redis';

let redis: Redis | null | undefined;

export function isRedisConfigured(): boolean {
  const url = (process.env.UPSTASH_REDIS_REST_URL || '').trim();
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN || '').trim();
  return Boolean(url && token);
}

export function getRedis(): Redis | null {
  if (redis !== undefined) return redis;
  if (!isRedisConfigured()) {
    redis = null;
    return null;
  }
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!.trim(),
    token: process.env.UPSTASH_REDIS_REST_TOKEN!.trim(),
  });
  return redis;
}

export const PRESENCE_TTL_SEC = 75;
export const PROFILE_CACHE_TTL_SEC = 60;
export const RATE_LIMIT_WINDOW_SEC = 60;

export type PresenceStatus = 'online' | 'busy' | 'offline';

export function presenceKey(userId: string): string {
  return `presence:${userId}`;
}

export function profileCacheKey(userId: string): string {
  return `profile:${userId}`;
}

export function rateLimitKey(userId: string, endpoint: string): string {
  return `rate:${userId}:${endpoint}`;
}

export function callStateKey(callId: string): string {
  return `call:${callId}`;
}

export class RedisUnavailableError extends Error {
  code = 'REDIS_UNAVAILABLE';
  constructor(message = 'Redis presence store unavailable') {
    super(message);
    this.name = 'RedisUnavailableError';
  }
}

/** Heartbeat / presence writes — Redis only. Throws if unconfigured or unreachable. */
export async function setPresence(
  userId: string,
  status: PresenceStatus,
  ttlSec: number = PRESENCE_TTL_SEC
): Promise<true> {
  const client = getRedis();
  if (!client || !userId) {
    throw new RedisUnavailableError('UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not configured');
  }
  try {
    await client.set(presenceKey(userId), status, { ex: ttlSec });
    return true;
  } catch (err: any) {
    throw new RedisUnavailableError(err?.message || 'Redis SET failed');
  }
}

export async function deletePresence(userId: string): Promise<void> {
  const client = getRedis();
  if (!client || !userId) {
    throw new RedisUnavailableError('UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not configured');
  }
  try {
    await client.del(presenceKey(userId));
  } catch (err: any) {
    throw new RedisUnavailableError(err?.message || 'Redis DEL failed');
  }
}

export async function getPresence(userId: string): Promise<PresenceStatus | null> {
  const client = getRedis();
  if (!client || !userId) return null;
  const v = await client.get<string>(presenceKey(userId));
  if (v === 'online' || v === 'busy' || v === 'offline') return v;
  return null;
}

/** Batch presence for visible user IDs only (never full directory). */
export async function mgetPresence(
  userIds: string[]
): Promise<Record<string, PresenceStatus>> {
  const client = getRedis();
  const out: Record<string, PresenceStatus> = {};
  if (!client) {
    throw new RedisUnavailableError(
      'UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not configured'
    );
  }
  if (!userIds.length) return out;
  const ids = Array.from(new Set(userIds.map((id) => String(id || '').trim()).filter(Boolean))).slice(
    0,
    200
  );
  if (!ids.length) return out;
  try {
    const keys = ids.map(presenceKey);
    const values = await client.mget<(string | null)[]>(...keys);
    ids.forEach((id, i) => {
      const v = values?.[i];
      if (v === 'online' || v === 'busy' || v === 'offline') out[id] = v;
      else out[id] = 'offline';
    });
    return out;
  } catch (err: any) {
    if (err instanceof RedisUnavailableError) throw err;
    throw new RedisUnavailableError(err?.message || 'Redis MGET failed');
  }
}

export async function setCallState(
  callId: string,
  state: Record<string, unknown>,
  ttlSec: number = 4 * 60 * 60
): Promise<void> {
  const client = getRedis();
  if (!client || !callId) return;
  await client.set(callStateKey(callId), JSON.stringify(state), { ex: ttlSec });
}

export async function getCallState(callId: string): Promise<Record<string, unknown> | null> {
  const client = getRedis();
  if (!client || !callId) return null;
  const raw = await client.get<string>(callStateKey(callId));
  if (!raw) return null;
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : (raw as Record<string, unknown>);
  } catch {
    return null;
  }
}

export async function deleteCallState(callId: string): Promise<void> {
  const client = getRedis();
  if (!client || !callId) return;
  await client.del(callStateKey(callId));
}

/** Simple fixed-window rate limit. Returns true if allowed. */
export async function checkRateLimit(
  userId: string,
  endpoint: string,
  max: number,
  windowSec: number = RATE_LIMIT_WINDOW_SEC
): Promise<boolean> {
  const client = getRedis();
  if (!client || !userId) return true;
  const key = rateLimitKey(userId, endpoint);
  const n = await client.incr(key);
  if (n === 1) await client.expire(key, windowSec);
  return n <= max;
}
