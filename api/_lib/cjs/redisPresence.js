/**
 * Upstash Redis presence helpers for Vercel CJS router.
 * Heartbeats write here only — never profiles.last_seen_at / online_status.
 */
const { Redis } = require('@upstash/redis');

const PRESENCE_TTL_SEC = 75;
let redis;

function getRedis() {
  if (redis !== undefined) return redis;
  const url = String(process.env.UPSTASH_REDIS_REST_URL || '').trim();
  const token = String(process.env.UPSTASH_REDIS_REST_TOKEN || '').trim();
  if (!url || !token) {
    redis = null;
    return null;
  }
  redis = new Redis({ url, token });
  return redis;
}

function isRedisConfigured() {
  return Boolean(getRedis());
}

class RedisUnavailableError extends Error {
  constructor(message) {
    super(message || 'Redis presence store unavailable');
    this.name = 'RedisUnavailableError';
    this.code = 'REDIS_UNAVAILABLE';
  }
}

function presenceKey(userId) {
  return `presence:${String(userId)}`;
}

function callStateKey(callId) {
  return `call:${String(callId)}`;
}

async function setPresence(userId, status, ttlSec = PRESENCE_TTL_SEC) {
  const client = getRedis();
  if (!client || !userId) {
    throw new RedisUnavailableError(
      'UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not configured'
    );
  }
  const s = status === 'busy' || status === 'offline' ? status : 'online';
  try {
    await client.set(presenceKey(userId), s, { ex: ttlSec });
    return true;
  } catch (err) {
    throw new RedisUnavailableError((err && err.message) || 'Redis SET failed');
  }
}

async function deletePresence(userId) {
  const client = getRedis();
  if (!client || !userId) {
    throw new RedisUnavailableError(
      'UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not configured'
    );
  }
  try {
    await client.del(presenceKey(userId));
  } catch (err) {
    throw new RedisUnavailableError((err && err.message) || 'Redis DEL failed');
  }
}

async function mgetPresence(userIds) {
  const client = getRedis();
  const out = {};
  if (!client) {
    throw new RedisUnavailableError(
      'UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not configured'
    );
  }
  const ids = Array.from(
    new Set((userIds || []).map((id) => String(id || '').trim()).filter(Boolean))
  ).slice(0, 200);
  if (!ids.length) return out;
  try {
    const values = await client.mget(...ids.map(presenceKey));
    ids.forEach((id, i) => {
      const v = values && values[i];
      out[id] = v === 'online' || v === 'busy' || v === 'offline' ? v : 'offline';
    });
    return out;
  } catch (err) {
    throw new RedisUnavailableError((err && err.message) || 'Redis MGET failed');
  }
}

async function setCallState(callId, state, ttlSec = 4 * 60 * 60) {
  const client = getRedis();
  if (!client || !callId) return;
  await client.set(callStateKey(callId), JSON.stringify(state), { ex: ttlSec });
}

async function getCallState(callId) {
  const client = getRedis();
  if (!client || !callId) return null;
  const raw = await client.get(callStateKey(callId));
  if (!raw) return null;
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}

async function deleteCallState(callId) {
  const client = getRedis();
  if (!client || !callId) return;
  await client.del(callStateKey(callId));
}

function isRedisUnavailableError(err) {
  return (
    err &&
    (err.code === 'REDIS_UNAVAILABLE' ||
      err.name === 'RedisUnavailableError' ||
      err instanceof RedisUnavailableError)
  );
}

module.exports = {
  PRESENCE_TTL_SEC,
  RedisUnavailableError,
  isRedisUnavailableError,
  isRedisConfigured,
  setPresence,
  deletePresence,
  mgetPresence,
  setCallState,
  getCallState,
  deleteCallState,
};
