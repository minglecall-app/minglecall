/**
 * REST credentials for @upstash/redis.
 * Order: Upstash names, then Vercel KV REST names, then https REDIS_URL / KV_URL.
 * A rediss:// KV_URL or REDIS_URL is the TCP endpoint and is not used by the REST client.
 */

const REDIS_ENV_KEYS = [
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'KV_REST_API_URL',
  'KV_REST_API_TOKEN',
  'KV_REST_API_READ_ONLY_TOKEN',
  'KV_URL',
  'REDIS_URL',
];

function cleanEnv(value) {
  return String(value || '')
    .trim()
    .replace(/^["']|["']$/g, '');
}

function httpUrl(value) {
  const url = cleanEnv(value);
  return /^https?:\/\//i.test(url) ? url : '';
}

function isRedissUrl(value) {
  return /^rediss?:\/\//i.test(cleanEnv(value));
}

/** Which Redis-related env keys are present (names only — never values). */
function inspectRedisEnv() {
  const present = {};
  for (const key of REDIS_ENV_KEYS) {
    present[key] = Boolean(cleanEnv(process.env[key]));
  }
  const tcpOnly =
    !httpUrl(process.env.UPSTASH_REDIS_REST_URL) &&
    !httpUrl(process.env.KV_REST_API_URL) &&
    !httpUrl(process.env.REDIS_URL) &&
    !httpUrl(process.env.KV_URL) &&
    (isRedissUrl(process.env.KV_URL) || isRedissUrl(process.env.REDIS_URL));

  const hasWriteToken = Boolean(
    cleanEnv(process.env.UPSTASH_REDIS_REST_TOKEN) || cleanEnv(process.env.KV_REST_API_TOKEN)
  );
  const hasReadOnlyOnly =
    !hasWriteToken && Boolean(cleanEnv(process.env.KV_REST_API_READ_ONLY_TOKEN));

  return {
    present,
    tcpOnly,
    hasWriteToken,
    hasReadOnlyOnly,
    vercelEnv: cleanEnv(process.env.VERCEL_ENV) || null,
    onVercel: Boolean(process.env.VERCEL),
  };
}

function configHint(inspect) {
  const parts = [];
  if (inspect.tcpOnly) {
    parts.push(
      'Found KV_URL/REDIS_URL as rediss:// (TCP only). Heartbeat needs the HTTPS REST URL: KV_REST_API_URL or UPSTASH_REDIS_REST_URL.'
    );
  }
  if (inspect.hasReadOnlyOnly) {
    parts.push(
      'Only KV_REST_API_READ_ONLY_TOKEN is set. Presence heartbeats require KV_REST_API_TOKEN (read-write) or UPSTASH_REDIS_REST_TOKEN.'
    );
  }
  if (!inspect.onVercel && !inspect.present.KV_REST_API_URL && !inspect.present.UPSTASH_REDIS_REST_URL) {
    parts.push(
      'This process is not on Vercel. Run `vercel env pull .env.local` (or copy KV_REST_API_URL + KV_REST_API_TOKEN into local env) and restart the server.'
    );
  }
  if (inspect.onVercel && inspect.vercelEnv) {
    parts.push(
      `Running as Vercel env="${inspect.vercelEnv}". Confirm KV_* / UPSTASH_* are enabled for that environment (Production / Preview / Development), then redeploy.`
    );
  }
  if (!parts.length) {
    parts.push(
      'Set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN, or KV_REST_API_URL + KV_REST_API_TOKEN.'
    );
  }
  return parts.join(' ');
}

function getRedisRestCredentials() {
  const upstashUrl = httpUrl(process.env.UPSTASH_REDIS_REST_URL);
  const kvRestUrl = httpUrl(process.env.KV_REST_API_URL);
  const redisHttpUrl = httpUrl(process.env.REDIS_URL);
  const kvHttpUrl = httpUrl(process.env.KV_URL);
  const upstashToken = cleanEnv(process.env.UPSTASH_REDIS_REST_TOKEN);
  const kvToken = cleanEnv(process.env.KV_REST_API_TOKEN);

  const url = upstashUrl || kvRestUrl || redisHttpUrl || kvHttpUrl;
  const token = upstashToken || kvToken;

  let urlSource = null;
  if (upstashUrl) urlSource = 'UPSTASH_REDIS_REST_URL';
  else if (kvRestUrl) urlSource = 'KV_REST_API_URL';
  else if (redisHttpUrl) urlSource = 'REDIS_URL';
  else if (kvHttpUrl) urlSource = 'KV_URL';

  return {
    url,
    token,
    urlSource,
    tokenSource: upstashToken
      ? 'UPSTASH_REDIS_REST_TOKEN'
      : kvToken
        ? 'KV_REST_API_TOKEN'
        : null,
    inspect: inspectRedisEnv(),
  };
}

function REDIS_NOT_CONFIGURED_MESSAGE() {
  return configHint(inspectRedisEnv());
}

const REDIS_NOT_CONFIGURED =
  'Redis REST credentials are not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN, or KV_REST_API_URL and KV_REST_API_TOKEN.';

module.exports = {
  getRedisRestCredentials,
  inspectRedisEnv,
  configHint,
  REDIS_NOT_CONFIGURED,
  REDIS_NOT_CONFIGURED_MESSAGE,
  REDIS_ENV_KEYS,
};
