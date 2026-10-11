/**
 * REST credentials for @upstash/redis.
 * Order: Upstash names, then Vercel KV names, then REDIS_URL when it is an https URL.
 * A rediss:// REDIS_URL is the TCP endpoint and is not used by the REST client.
 */
function cleanEnv(value) {
  return String(value || '')
    .trim()
    .replace(/^["']|["']$/g, '');
}

function httpUrl(value) {
  const url = cleanEnv(value);
  return /^https?:\/\//i.test(url) ? url : '';
}

function getRedisRestCredentials() {
  const upstashUrl = httpUrl(process.env.UPSTASH_REDIS_REST_URL);
  const kvUrl = httpUrl(process.env.KV_REST_API_URL);
  const redisUrl = httpUrl(process.env.REDIS_URL);
  const upstashToken = cleanEnv(process.env.UPSTASH_REDIS_REST_TOKEN);
  const kvToken = cleanEnv(process.env.KV_REST_API_TOKEN);

  const url = upstashUrl || kvUrl || redisUrl;
  const token = upstashToken || kvToken;
  return {
    url,
    token,
    urlSource: upstashUrl ? 'UPSTASH_REDIS_REST_URL' : kvUrl ? 'KV_REST_API_URL' : redisUrl ? 'REDIS_URL' : null,
    tokenSource: upstashToken ? 'UPSTASH_REDIS_REST_TOKEN' : kvToken ? 'KV_REST_API_TOKEN' : null,
  };
}

const REDIS_NOT_CONFIGURED =
  'Redis REST credentials are not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN, or KV_REST_API_URL and KV_REST_API_TOKEN.';

module.exports = {
  getRedisRestCredentials,
  REDIS_NOT_CONFIGURED,
};
