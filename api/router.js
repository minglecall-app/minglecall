/**
 * Vercel catch-all API router — plain CommonJS (Hobby-safe).
 *
 * Root cause of prior FUNCTION_INVOCATION_FAILED: TypeScript/ESM router under
 * api/package.json "type":"commonjs". This file stays CommonJS and never imports
 * Express or server.ts.
 *
 * Standalone (not routed here): health, ping, r2-test, storage/test-connection,
 * livekit/config, livekit/token, admin/create-team-leader, users.
 */
const { send } = require('./_lib/cjs/helpers');
const { handleAuth } = require('./_lib/cjs/authRoutes');
const { handleTeamleader } = require('./_lib/cjs/teamleaderRoutes');
const { handleCore } = require('./_lib/cjs/coreRoutes');
const { handleV1 } = require('./_lib/cjs/v1Routes');
const { handleStorage } = require('./_lib/cjs/storageRoutes');
const { handleAdmin } = require('./_lib/cjs/adminRoutes');
const { handleAppExtras } = require('./_lib/cjs/appExtrasRoutes');
const { handleFinance } = require('./_lib/cjs/financeRoutes');
const { handlePayout } = require('./_lib/cjs/payoutRoutes');

const AVAILABLE = [
  'POST /api/auth/*',
  'GET|POST /api/teamleader/*',
  'GET|POST /api/presence, POST /api/presence/heartbeat',
  'POST /api/messages, /api/messages/read; GET|DELETE /api/messages/conversation/:id',
  'POST /api/calls/sync, /api/calls/burn; GET /api/calls/wallet-ledger, /api/calls/incoming',
  'POST /api/gifts/send',
  'POST /api/users/sync-all, /api/users/me/delete',
  'POST /api/supabase/* (update-status|profile|upsert|user-statuses|bulk)',
  'ALL /api/v1/matches|favorites|friends|blocks|feed|reviews|reports|admin/reports',
  'GET|POST|PATCH /api/v1/finance/* (periods, ledger, batches, funding, jobs, host/TL)',
  'GET /api/storage/config|media; POST /api/storage/presigned-url|upload|delete',
  'GET|POST|PATCH|DELETE /api/admin/* (schema bundled; granular-reset if ALLOW_FACTORY_RESET; CMS; spectator-token)',
  'GET|PUT /api/admin/payout/templates; GET /api/payout/templates; GET|PUT|DELETE /api/payout/cards/*',
  'GET|POST /api/creator/* (incl. first-call-bonus), /api/rewards/* (claims live)',
  'GET /api/setup/status; POST setup auth + connectivity tests; save-all blocked on Vercel',
  'GET /api/livekit/status; standalone livekit/config|token',
  'standalone: health, ping, r2-test, users, create-team-leader',
];

function pathAfterApi(req) {
  const q = req.query && (req.query.path != null ? req.query.path : req.query.__p);
  if (typeof q === 'string' && q.trim()) {
    return q.replace(/^\/+/, '').replace(/\/+$/, '');
  }
  if (Array.isArray(q) && q.length > 0) {
    return q.map(String).join('/').replace(/^\/+/, '').replace(/\/+$/, '');
  }
  try {
    const pathname = new URL(req.url || '', 'http://localhost').pathname;
    if (pathname === '/api/router' || pathname === '/api/router/') return '';
    return pathname.replace(/^\/api\/?/, '').replace(/\/+$/, '');
  } catch {
    return String(req.url || '')
      .split('?')[0]
      .replace(/^\/api\/?/, '')
      .replace(/\/+$/, '');
  }
}

const STANDALONE = new Set([
  'health',
  'ping',
  'r2-test',
  'storage/test-connection',
  'livekit/config',
  'livekit/token',
  'admin/create-team-leader',
  'users',
  'users/index',
  'router',
]);

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    const path = pathAfterApi(req);

    if (!path || STANDALONE.has(path)) {
      return send(res, 501, {
        success: false,
        error: {
          message: 'Route should be handled by a standalone function.',
          code: 'STANDALONE_ROUTE',
          path,
        },
        vercel: { availableRoutes: AVAILABLE },
      });
    }

    // Dispatch: first non-null handler wins (handlers return null when path unmatched)
    // handleFinance before handleV1 so /api/v1/finance/* is not swallowed as unimplemented social v1.
    const chain = [
      handleAuth,
      handleTeamleader,
      handleCore,
      handleFinance,
      handlePayout,
      handleV1,
      handleStorage,
      handleAdmin,
      handleAppExtras,
    ];
    for (const fn of chain) {
      const result = await fn(path, req, res);
      if (result !== null) return result;
    }

    if (path === 'admin/api-health') {
      return send(res, 200, {
        success: true,
        mode: 'vercel-cjs-router',
        checks: [
          { id: 'router', ok: true, detail: 'CommonJS router booted' },
          {
            id: 'supabase',
            ok: Boolean(
              (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL) &&
                process.env.SUPABASE_SERVICE_ROLE_KEY
            ),
          },
          {
            id: 'livekit',
            ok: Boolean(
              process.env.LIVEKIT_URL &&
                process.env.LIVEKIT_API_KEY &&
                process.env.LIVEKIT_API_SECRET
            ),
          },
          {
            id: 'r2',
            ok: Boolean(
              process.env.R2_ACCOUNT_ID &&
                process.env.R2_ACCESS_KEY_ID &&
                process.env.R2_SECRET_ACCESS_KEY
            ),
          },
        ],
        availableRoutes: AVAILABLE,
      });
    }

    return send(res, 501, {
      success: false,
      error: {
        message: 'This API route is not implemented on the Vercel CJS router yet.',
        code: 'VERCEL_ROUTE_NOT_IMPLEMENTED',
        path,
      },
      vercel: { availableRoutes: AVAILABLE, signaling: 'supabase-realtime' },
    });
  } catch (err) {
    console.error('[api/router]', err);
    if (!res.headersSent) {
      return send(res, 500, {
        success: false,
        error: {
          message: (err && err.message) || 'Internal server error',
          code: 'VERCEL_API_ERROR',
        },
      });
    }
  }
};
