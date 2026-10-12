/**
 * Admin routes for Vercel CJS router (infra, delete-user, CMS seed, overrides).
 */
const {
  send,
  clean,
  readJsonBody,
  requireAuth,
  isAdminRole,
  mapProfileRow,
  getSupabaseEnv,
  createServiceClient,
  getEmailEnvStatus,
  getEmailPolicy,
  saveEmailPolicy,
  getEmailTemplates,
  saveEmailTemplates,
  DEFAULT_EMAIL_TEMPLATES,
  testEmailConnection,
  sendTransactionalEmail,
  isSmtpConfigured,
  getPasswordPolicyError,
} = require('./helpers');
const { granularResetDb, isFactoryResetAllowed } = require('./granularResetDb');
const { listServerDiagnosticModules, runServerDiagnostic } = require('./systemDiagnostics');
const { listK6SmokeScenarios, runK6Smoke } = require('./k6Smoke');
const {
  OFFICE_FEATURES,
  allPermissionKeys,
  sanitizePermissionKeys,
  mapRoleRow,
  resolveActorAccess,
  actorHasPermission,
  actorCanManageRbac,
  permissionForAdminPath,
  slugKey,
} = require('./officeRbacLib.cjs');

function livekitEnv() {
  return {
    wsUrl: clean(process.env.LIVEKIT_URL),
    apiKey: clean(process.env.LIVEKIT_API_KEY),
    apiSecret: clean(process.env.LIVEKIT_API_SECRET),
  };
}

function r2Env() {
  return {
    accountId: clean(process.env.R2_ACCOUNT_ID),
    accessKeyId: clean(process.env.R2_ACCESS_KEY_ID),
    secretAccessKey: clean(process.env.R2_SECRET_ACCESS_KEY),
    bucketName: clean(process.env.R2_BUCKET_NAME) || 'datingappbucket',
    publicUrl: clean(process.env.R2_PUBLIC_URL).replace(/\/$/, ''),
  };
}

function livekitHttpHost(wsUrl) {
  const u = clean(wsUrl);
  if (!u) return '';
  return u.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:');
}

/** Subscribe briefly and broadcast a signaling payload (Realtime replaces Express /ws). */
async function broadcastAdminSignal(client, payload, userIds) {
  const delivery = { presence: false, users: [], errors: [] };
  const ids = Array.from(
    new Set((userIds || []).map((id) => String(id || '').trim()).filter(Boolean))
  );

  const subscribeAndSend = async (topic) => {
    const channel = client.channel(topic, {
      config: { broadcast: { self: false, ack: false } },
    });
    await new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(done, 4000);
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') done();
      });
    });
    const status = await channel.send({
      type: 'broadcast',
      event: 'signal',
      payload,
    });
    await new Promise((r) => setTimeout(r, 250));
    try {
      await client.removeChannel(channel);
    } catch {
      /* ignore */
    }
    return status !== 'error';
  };

  try {
    delivery.presence = await subscribeAndSend('app-presence');
  } catch (e) {
    delivery.errors.push(`presence: ${(e && e.message) || 'broadcast failed'}`);
  }

  for (const uid of ids) {
    try {
      const ok = await subscribeAndSend(`user:${uid}`);
      if (ok) delivery.users.push(uid);
      else delivery.errors.push(`user:${uid}: send error`);
    } catch (e) {
      delivery.errors.push(`user:${uid}: ${(e && e.message) || 'broadcast failed'}`);
    }
  }
  return delivery;
}

async function deleteLivekitRoom(roomName) {
  const lk = livekitEnv();
  const host = livekitHttpHost(lk.wsUrl);
  if (!host || !lk.apiKey || !lk.apiSecret || lk.apiKey === 'devkey' || lk.apiSecret === 'secret') {
    return { ok: false, skipped: true, reason: 'LiveKit env not configured' };
  }
  try {
    const { RoomServiceClient } = require('livekit-server-sdk');
    const svc = new RoomServiceClient(host, lk.apiKey, lk.apiSecret);
    await svc.deleteRoom(String(roomName));
    return { ok: true, skipped: false, roomName: String(roomName) };
  } catch (e) {
    // Room already gone is fine for killswitch
    const msg = (e && e.message) || 'deleteRoom failed';
    if (/not found|does not exist|404/i.test(msg)) {
      return { ok: true, skipped: false, roomName: String(roomName), alreadyGone: true };
    }
    return { ok: false, skipped: false, reason: msg };
  }
}

async function requireAdmin(req) {
  const auth = await requireAuth(req);
  if (auth.ok === false) return auth;
  if (!isAdminRole(auth.role, auth.email)) {
    return {
      ok: false,
      status: 403,
      error: { message: 'Admin role required.', code: 'FORBIDDEN' },
    };
  }
  return auth;
}

/** Admin + optional office feature permission (legacy office_role_id NULL = super). */
async function requireAdminFeature(req, featureKey) {
  const auth = await requireAdmin(req);
  if (auth.ok === false) return auth;
  if (!featureKey) return auth;
  const client = createServiceClient();
  if (!client) {
    // Fail open only when DB unavailable would already break the route; treat as forbidden for gated features
    return {
      ok: false,
      status: 503,
      error: { message: 'Supabase not configured', code: 'SUPABASE_NOT_CONFIGURED' },
    };
  }
  try {
    const access = await resolveActorAccess(client, auth);
    if (!actorHasPermission(access, featureKey)) {
      return {
        ok: false,
        status: 403,
        error: {
          message: 'You do not have permission for this admin feature.',
          code: 'OFFICE_PERMISSION_DENIED',
        },
      };
    }
  } catch (e) {
    // Missing office_* tables → legacy full admin (same as /me)
    const msg = String((e && e.message) || '');
    if (/office_roles|office_role_permissions|office_role_id|does not exist|42P01/i.test(msg)) {
      return auth;
    }
    return {
      ok: false,
      status: 500,
      error: { message: 'Permission check failed', code: 'OFFICE_RBAC_ERROR' },
    };
  }
  return auth;
}

async function handleAdmin(path, req, res) {
  if (!String(path || '').startsWith('admin/')) return null;
  if (path === 'admin/create-team-leader') return null; // standalone

  if (path === 'admin/api-health') {
    // handled in router.js — leave null so router inline can catch, or handle here
    return null;
  }

  if (path === 'admin/system-diagnostics') {
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }
    if (req.method !== 'POST') {
      return send(res, 405, {
        success: false,
        error: { message: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' },
      });
    }
    const auth = await requireAdminFeature(req, permissionForAdminPath(path));
    if (auth.ok === false) return send(res, auth.status, { success: false, error: auth.error });
    const body = (await readJsonBody(req)) || {};
    const moduleId = String(body.moduleId || '').trim();
    try {
      const result = await runServerDiagnostic(moduleId, {
        profileId: auth.profileId,
        channel: body.channel,
        nonce: body.nonce,
        token: body.token,
      });
      if (!result) {
        return send(res, 400, {
          success: false,
          error: {
            message: `Unknown diagnostic module. Known: ${listServerDiagnosticModules().join(', ')}`,
            code: 'UNKNOWN_MODULE',
          },
        });
      }
      return send(res, 200, { success: true, data: result });
    } catch (err) {
      console.error('[system-diagnostics]', moduleId, (err && err.message) || err);
      return send(res, 500, {
        success: false,
        error: { message: 'Diagnostic failed', code: 'DIAGNOSTIC_FAILED' },
      });
    }
  }

  if (path === 'admin/k6-smoke') {
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }
    if (req.method !== 'POST') {
      return send(res, 405, {
        success: false,
        error: { message: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' },
      });
    }
    const auth = await requireAdminFeature(req, permissionForAdminPath(path));
    if (auth.ok === false) return send(res, auth.status, { success: false, error: auth.error });
    const body = (await readJsonBody(req)) || {};
    const scenarioId = String(body.scenarioId || '').trim();
    const host =
      (req.headers && (req.headers['x-forwarded-host'] || req.headers.host)) || '';
    const proto =
      (req.headers && req.headers['x-forwarded-proto']) || 'https';
    const authorization =
      (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
    try {
      const result = await runK6Smoke(scenarioId, {
        authorization,
        concurrency: body.concurrency,
        baseUrl: body.baseUrl,
        host: Array.isArray(host) ? host[0] : host,
        proto: Array.isArray(proto) ? proto[0] : proto,
      });
      if (!result) {
        return send(res, 400, {
          success: false,
          error: {
            message: `Unknown k6 smoke scenario. Known: ${listK6SmokeScenarios().join(', ')}`,
            code: 'UNKNOWN_SCENARIO',
          },
        });
      }
      return send(res, 200, { success: true, data: result });
    } catch (err) {
      console.error('[k6-smoke]', scenarioId, (err && err.message) || err);
      return send(res, 500, {
        success: false,
        error: { message: 'k6 smoke failed', code: 'K6_SMOKE_FAILED' },
      });
    }
  }

  if (path === 'admin/infra-config' && (req.method === 'GET' || req.method === 'POST')) {
    const auth = await requireAdminFeature(req, permissionForAdminPath(path));
    if (auth.ok === false) return send(res, auth.status, { success: false, error: auth.error });
    const supabase = getSupabaseEnv();
    const r2 = r2Env();
    const livekit = livekitEnv();
    const supabaseConfigured = Boolean(
      supabase.url &&
        supabase.anonKey &&
        !supabase.url.includes('placeholder') &&
        !supabase.url.includes('your-project')
    );
    const r2Configured = Boolean(
      r2.accountId && r2.accessKeyId && r2.secretAccessKey && r2.bucketName
    );
    const livekitConfigured = Boolean(
      livekit.wsUrl &&
        livekit.apiKey &&
        livekit.apiSecret &&
        livekit.apiKey !== 'devkey' &&
        livekit.apiSecret !== 'secret'
    );
    const onVercel = Boolean(process.env.VERCEL);
    if (req.method === 'GET') {
      return send(res, 200, {
        success: true,
        config: {
          source: 'environment',
          supabaseUrl: supabase.url,
          supabaseAnonKey: supabase.anonKey ? '••••••••' : '',
          supabaseAnonKeyConfigured: Boolean(supabase.anonKey),
          supabaseServiceRoleConfigured: Boolean(supabase.serviceKey),
          supabaseConfigured,
          r2AccountId: r2.accountId ? `${r2.accountId.slice(0, 4)}…` : '',
          r2AccessKeyId: r2.accessKeyId ? `${r2.accessKeyId.slice(0, 4)}…` : '',
          r2SecretAccessKey: r2.secretAccessKey ? '••••••••' : '',
          r2BucketName: r2.bucketName,
          r2PublicUrl: r2.publicUrl,
          r2Configured,
          livekitWsUrl: livekit.wsUrl,
          livekitConfigured,
          vercel: onVercel,
          secretsWritable: false,
        },
        message: onVercel
          ? 'Production (Vercel): credentials are read-only from Vercel Environment Variables. This API never writes a .env file.'
          : 'Credentials are loaded from process environment variables (local .env via Node). This serverless path does not write secrets to disk.',
      });
    }
    await readJsonBody(req);
    return send(res, 200, {
      success: true,
      message: onVercel
        ? 'No secrets were changed. On Vercel, set VITE_SUPABASE_*, SUPABASE_SERVICE_ROLE_KEY, R2_*, and LIVEKIT_* in Project Settings → Environment Variables, then Redeploy. Pool/R2 size sliders here are not persisted.'
        : 'No secrets were changed via this endpoint. Use local Express setup / .env for local secret persistence.',
      config: {
        source: 'environment',
        supabaseConfigured,
        r2Configured,
        livekitConfigured,
        vercel: onVercel,
        secretsWritable: false,
      },
    });
  }

  if (path === 'admin/email' && req.method === 'GET') {
    const auth = await requireAdminFeature(req, permissionForAdminPath(path));
    if (auth.ok === false) return send(res, auth.status, { success: false, error: auth.error });
    const client = auth.client || createServiceClient();
    const env = getEmailEnvStatus();
    const policy = await getEmailPolicy(client);
    const templates = await getEmailTemplates(client);
    let logs = [];
    try {
      const { data } = await client
        .from('email_dispatch_log')
        .select(
          'id, purpose, recipient_email, recipient_name, subject, provider, status, error_message, meta, created_at'
        )
        .order('created_at', { ascending: false })
        .limit(100);
      logs = data || [];
    } catch (e) {
      console.warn('[admin/email] logs notice:', e && e.message);
    }
    return send(res, 200, {
      success: true,
      data: {
        env,
        policy,
        templates,
        defaults: DEFAULT_EMAIL_TEMPLATES,
        logs,
        configured: isSmtpConfigured(),
      },
    });
  }

  if (path === 'admin/email/settings' && req.method === 'POST') {
    const auth = await requireAdminFeature(req, permissionForAdminPath(path));
    if (auth.ok === false) return send(res, auth.status, { success: false, error: auth.error });
    const body = await readJsonBody(req);
    // Never accept API keys / SMTP secrets from the browser
    if (
      body &&
      (body.resendApiKey ||
        body.smtpPass ||
        body.pass ||
        body.SMTP_PASS ||
        body.RESEND_API_KEY)
    ) {
      return send(res, 400, {
        success: false,
        error: {
          message:
            'Email secrets cannot be saved from the Admin UI. Set RESEND_API_KEY / SMTP_* in Vercel → Environment Variables.',
          code: 'ENV_ONLY',
        },
      });
    }
    try {
      const policy = await saveEmailPolicy(auth.client, {
        emailRegisterEnabled: body.emailRegisterEnabled,
        emailAccountCreateEnabled: body.emailAccountCreateEnabled,
        emailAccountDeleteEnabled: body.emailAccountDeleteEnabled,
        allowCreateWithoutOtp: body.allowCreateWithoutOtp,
        emailShowOtpFallback: body.emailShowOtpFallback,
      });
      return send(res, 200, {
        success: true,
        data: { policy },
        message: 'Email notification policy saved.',
      });
    } catch (e) {
      return send(res, 500, {
        success: false,
        error: { message: (e && e.message) || 'Failed to save email policy', code: 'SAVE_FAILED' },
      });
    }
  }

  if (path === 'admin/email/templates' && req.method === 'POST') {
    const auth = await requireAdminFeature(req, permissionForAdminPath(path));
    if (auth.ok === false) return send(res, auth.status, { success: false, error: auth.error });
    const body = await readJsonBody(req);
    try {
      const templates = await saveEmailTemplates(auth.client, body && body.templates ? body.templates : body);
      return send(res, 200, {
        success: true,
        data: { templates },
        message: 'Email templates saved. OTP and transactional emails will use these.',
      });
    } catch (e) {
      return send(res, 500, {
        success: false,
        error: { message: (e && e.message) || 'Failed to save email templates', code: 'SAVE_FAILED' },
      });
    }
  }

  if (path === 'admin/email/test' && req.method === 'POST') {
    const auth = await requireAdminFeature(req, permissionForAdminPath(path));
    if (auth.ok === false) return send(res, auth.status, { success: false, error: auth.error });
    const body = await readJsonBody(req);
    const result = await testEmailConnection({
      to: body && body.to,
      name: (body && body.name) || 'Admin',
    });
    return send(res, result.ok ? 200 : 502, { success: true, data: result });
  }

  if (path === 'admin/email/logs' && req.method === 'GET') {
    const auth = await requireAdminFeature(req, permissionForAdminPath(path));
    if (auth.ok === false) return send(res, auth.status, { success: false, error: auth.error });
    const { data, error } = await auth.client
      .from('email_dispatch_log')
      .select(
        'id, purpose, recipient_email, recipient_name, subject, provider, status, error_message, meta, created_at'
      )
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) {
      return send(res, 500, { success: false, error: { message: error.message } });
    }
    return send(res, 200, { success: true, data: { logs: data || [] } });
  }

  // Env-only status (replaces secret-pasting email-config for Vercel)
  if (path === 'admin/email-config' && req.method === 'GET') {
    const auth = await requireAdminFeature(req, permissionForAdminPath(path));
    if (auth.ok === false) return send(res, auth.status, { success: false, error: auth.error });
    const env = getEmailEnvStatus();
    const policy = await getEmailPolicy(auth.client);
    return send(res, 200, {
      success: true,
      config: {
        ...env,
        showOtpInForm: policy.emailShowOtpFallback,
        host: env.smtpHost,
        port: Number(env.smtpPort) || 465,
        user: env.smtpUser,
        from: env.smtpFrom,
        secure: env.smtpSecure,
        resendApiKey: env.resendApiKeyPreview,
        configured: env.configured,
      },
    });
  }

  if (path === 'admin/email-config' && req.method === 'POST') {
    const auth = await requireAdminFeature(req, permissionForAdminPath(path));
    if (auth.ok === false) return send(res, auth.status, { success: false, error: auth.error });
    const body = await readJsonBody(req);
    if (body && (body.pass || body.resendApiKey || body.host || body.user)) {
      // Allow only showOtpInForm / policy toggles — ignore secret fields
    }
    try {
      const policy = await saveEmailPolicy(auth.client, {
        emailShowOtpFallback:
          typeof body.showOtpInForm === 'boolean' ? body.showOtpInForm : body.emailShowOtpFallback,
        emailRegisterEnabled: body.emailRegisterEnabled,
        emailAccountCreateEnabled: body.emailAccountCreateEnabled,
        emailAccountDeleteEnabled: body.emailAccountDeleteEnabled,
        allowCreateWithoutOtp: body.allowCreateWithoutOtp,
      });
      const env = getEmailEnvStatus();
      return send(res, 200, {
        success: true,
        message:
          'Email policy updated. SMTP/Resend credentials are read from Vercel environment variables only.',
        config: { ...env, showOtpInForm: policy.emailShowOtpFallback },
        policy,
      });
    } catch (e) {
      return send(res, 500, {
        success: false,
        error: { message: (e && e.message) || 'Failed to update email policy' },
      });
    }
  }

  if (path === 'admin/delete-user' && req.method === 'POST') {
    const auth = await requireAdminFeature(req, permissionForAdminPath(path));
    if (auth.ok === false) return send(res, auth.status, { success: false, error: auth.error });
    const body = await readJsonBody(req);
    const userId = String((body && body.userId) || '').trim();
    if (!userId) return send(res, 400, { success: false, error: 'userId required' });
    const { data: row } = await auth.client.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (!row) return send(res, 404, { success: false, error: 'User not found' });
    const warnings = [];
    let authDeleted = false;
    const authId = row.auth_id || null;

    try {
      const policy = await getEmailPolicy(auth.client);
      if (policy.emailAccountDeleteEnabled && row.email) {
        await sendTransactionalEmail({
          to: row.email,
          name: row.name || 'User',
          purpose: 'account_delete',
          subject: 'Your LiveCall account was deleted',
          html: `<p>Hello <strong>${row.name || 'User'}</strong>,</p><p>Your LiveCall account associated with <strong>${row.email}</strong> has been permanently deleted by an administrator.</p>`,
          meta: { userId },
        });
      }
    } catch (e) {
      warnings.push((e && e.message) || 'Delete notification email failed');
    }

    if (authId) {
      const { error } = await auth.client.auth.admin.deleteUser(authId);
      if (error) warnings.push(error.message);
      else authDeleted = true;
    }
    const { error: delErr } = await auth.client.from('profiles').delete().eq('id', userId);
    if (delErr) {
      return send(res, 500, { success: false, error: delErr.message, data: { warnings } });
    }
    return send(res, 200, {
      success: true,
      data: { authDeleted, profileDeleted: true, r2DeletedCount: 0, warnings },
    });
  }

  if (path === 'admin/override-earning-rate' && req.method === 'POST') {
    const auth = await requireAdminFeature(req, permissionForAdminPath(path));
    if (auth.ok === false) return send(res, auth.status, { success: false, error: auth.error });
    const body = await readJsonBody(req);
    const creatorId = String((body && body.creatorId) || '').trim();
    const rate =
      body && (body.rate === null || body.rate === undefined || Number(body.rate) <= 0)
        ? null
        : Math.max(1, Math.round(Number(body.rate)));
    if (!creatorId) return send(res, 400, { success: false, error: 'creatorId required' });
    const { data, error } = await auth.client
      .from('profiles')
      .update({
        coin_earn_override_rate: rate,
        updated_at: new Date().toISOString(),
      })
      .eq('id', creatorId)
      .select('*')
      .maybeSingle();
    if (error) return send(res, 500, { success: false, error: error.message });
    return send(res, 200, { success: true, user: mapProfileRow(data) });
  }

  if (path === 'admin/active-calls' && req.method === 'GET') {
    const auth = await requireAdminFeature(req, permissionForAdminPath(path));
    if (auth.ok === false) return send(res, auth.status, { success: false, error: auth.error });
    // Vercel has no in-memory activeCalls — return recent in-progress call_logs if any
    const { data } = await auth.client
      .from('call_logs')
      .select('*')
      .in('status', ['ringing', 'connecting', 'active', 'in_progress'])
      .order('started_at', { ascending: false })
      .limit(50);
    return send(res, 200, { success: true, calls: data || [], activeCalls: data || [] });
  }

  if (path === 'admin/terminate-call' && req.method === 'POST') {
    const auth = await requireAdminFeature(req, permissionForAdminPath(path));
    if (auth.ok === false) return send(res, auth.status, { success: false, error: auth.error });
    const body = await readJsonBody(req);
    const callId = String((body && (body.callId || body.id)) || '').trim();
    const reason =
      String((body && body.reason) || '').trim() ||
      'Call terminated by Safety & Compliance Administration.';
    if (!callId) {
      return send(res, 400, { success: false, error: { message: 'callId is required' } });
    }

    let callerId = String((body && body.callerId) || '').trim();
    let receiverId = String((body && body.receiverId) || '').trim();
    const { data: callRow } = await auth.client
      .from('call_logs')
      .select('id, caller_id, receiver_id, status')
      .eq('id', callId)
      .maybeSingle();
    if (callRow) {
      callerId = callerId || String(callRow.caller_id || '');
      receiverId = receiverId || String(callRow.receiver_id || '');
      {
        const endedAt = new Date().toISOString();
        const patch = {
          status: 'terminated',
          ended_at: endedAt,
          end_time: endedAt,
          updated_at: endedAt,
        };
        let { error: termErr } = await auth.client.from('call_logs').update(patch).eq('id', callId);
        if (
          termErr &&
          /updated_at/i.test(String(termErr.message || '')) &&
          /column|schema cache/i.test(String(termErr.message || ''))
        ) {
          const { updated_at: _drop, ...rest } = patch;
          ({ error: termErr } = await auth.client.from('call_logs').update(rest).eq('id', callId));
        }
        if (termErr) console.warn('[admin/terminate-call]', termErr.message);
      }
    }

    const partyIds = [callerId, receiverId].filter(Boolean);
    if (partyIds.length) {
      await auth.client
        .from('profiles')
        .update({ online_status: 'online', updated_at: new Date().toISOString() })
        .in('id', partyIds);
    }

    const payload = {
      type: 'call:ended',
      callId,
      endedBy: 'admin_moderator',
      reason,
      callerId: callerId || undefined,
      receiverId: receiverId || undefined,
      outcome: 'terminated',
      status: 'terminated',
    };
    const signalDelivery = await broadcastAdminSignal(auth.client, payload, partyIds);
    const livekit = await deleteLivekitRoom(callId);

    return send(res, 200, {
      success: true,
      callId,
      message: 'Call successfully terminated by Safety Administration.',
      delivery: {
        realtime: signalDelivery,
        livekit,
      },
    });
  }

  if (path === 'admin/issue-warning' && req.method === 'POST') {
    const auth = await requireAdminFeature(req, permissionForAdminPath(path));
    if (auth.ok === false) return send(res, auth.status, { success: false, error: auth.error });
    const body = await readJsonBody(req);
    const callId = String((body && body.callId) || '').trim();
    const warningText =
      String((body && (body.warningText || body.message)) || '').trim() ||
      'Automated Safety Advisory: Please adhere to community guidelines.';

    let callerId = '';
    let receiverId = '';
    if (callId) {
      const { data: callRow } = await auth.client
        .from('call_logs')
        .select('id, caller_id, receiver_id')
        .eq('id', callId)
        .maybeSingle();
      if (callRow) {
        callerId = String(callRow.caller_id || '');
        receiverId = String(callRow.receiver_id || '');
      }
      try {
        await auth.client.from('moderation_reports').insert({
          reporter_id: auth.profileId,
          reported_user_id: receiverId || callerId || auth.profileId,
          reason: 'admin_call_warning',
          details: JSON.stringify({
            type: 'call:safety_warning',
            callId,
            message: warningText,
            timestamp: new Date().toISOString(),
          }),
          status: 'action_taken',
          action_taken: 'call_safety_warning',
          admin_notes: warningText.slice(0, 500),
        });
      } catch (e) {
        console.warn('[admin/issue-warning] persist skipped:', e && e.message);
      }
    }

    const warningPayload = {
      type: 'call:safety_warning',
      callId,
      message: warningText,
      timestamp: Date.now(),
      callerId: callerId || undefined,
      receiverId: receiverId || undefined,
    };
    const signalDelivery = await broadcastAdminSignal(
      auth.client,
      warningPayload,
      [callerId, receiverId]
    );

    return send(res, 200, {
      success: true,
      message: 'Warning dispatched discreetly.',
      callId: callId || null,
      delivery: { realtime: signalDelivery },
    });
  }

  if (path === 'admin/livekit/spectator-token' && req.method === 'POST') {
    const auth = await requireAdminFeature(req, permissionForAdminPath(path));
    if (auth.ok === false) return send(res, auth.status, { success: false, error: auth.error });
    const body = await readJsonBody(req);
    const roomName = String((body && body.roomName) || '').trim();
    if (!roomName) {
      return send(res, 400, { error: 'roomName is required' });
    }
    const apiKey = clean(process.env.LIVEKIT_API_KEY);
    const apiSecret = clean(process.env.LIVEKIT_API_SECRET);
    const livekitUrl = clean(process.env.LIVEKIT_URL) || 'wss://your-livekit-project.livekit.cloud';
    const adminId = String(auth.profileId || 'root');
    const spectatorIdentity = `spectator_admin_${adminId}_${Math.random().toString(36).substring(2, 6)}`;
    if (!apiKey || !apiSecret || apiKey === 'devkey' || apiSecret === 'secret') {
      return send(res, 200, {
        configured: false,
        token: null,
        spectatorIdentity,
        wsUrl: livekitUrl,
        message: 'LiveKit credentials unconfigured; local simulator stream active.',
      });
    }
    try {
      const { AccessToken } = require('livekit-server-sdk');
      const at = new AccessToken(apiKey, apiSecret, {
        identity: spectatorIdentity,
        name: 'Quality Assurance Spectator',
        ttl: '2h',
        metadata: JSON.stringify({ role: 'silent_spectator', hidden: true }),
      });
      at.addGrant({
        roomJoin: true,
        room: roomName,
        canPublish: false,
        canPublishData: false,
        canSubscribe: true,
        hidden: true,
      });
      const token = await at.toJwt();
      return send(res, 200, {
        configured: true,
        token,
        wsUrl: livekitUrl,
        spectatorIdentity,
        mode: 'silent_spectator',
        discretionLevel: 'strict_zero_presence',
      });
    } catch (err) {
      return send(res, 500, { error: (err && err.message) || 'Failed to generate spectator token' });
    }
  }

  if (path === 'admin/cms/seed-defaults' && req.method === 'POST') {
    const auth = await requireAdminFeature(req, permissionForAdminPath(path));
    if (auth.ok === false) return send(res, auth.status, { success: false, error: auth.error });
    await readJsonBody(req);
    // Idempotent: insert defaults only if tables empty
    try {
      const { count: bannerCount } = await auth.client
        .from('home_banners')
        .select('id', { count: 'exact', head: true });
      if (!bannerCount) {
        await auth.client.from('home_banners').insert([
          {
            title: 'Welcome to MingleCall',
            subtitle: 'Meet people nearby',
            image_url: '',
            sort_order: 0,
            is_active: true,
          },
        ]);
      }
    } catch (e) {
      console.warn('[cms/seed-defaults] banners', e && e.message);
    }
    try {
      const { count: linkCount } = await auth.client
        .from('home_quick_links')
        .select('id', { count: 'exact', head: true });
      if (!linkCount) {
        await auth.client.from('home_quick_links').insert([
          { title: 'Discover', href: '/discover', sort_order: 0, is_active: true },
          { title: 'Rewards', href: '/rewards', sort_order: 1, is_active: true },
        ]);
      }
    } catch (e) {
      console.warn('[cms/seed-defaults] links', e && e.message);
    }
    return send(res, 200, { success: true, message: 'CMS defaults seeded when empty' });
  }

  // CMS PATCH /:id/active and DELETE /:id
  {
    const activeMatch = String(path || '').match(
      /^admin\/cms\/(banners|quick-links)\/([^/]+)\/active$/
    );
    if (activeMatch && req.method === 'PATCH') {
      const auth = await requireAdminFeature(req, permissionForAdminPath(path));
      if (auth.ok === false) return send(res, auth.status, { success: false, error: auth.error });
      const table = activeMatch[1] === 'banners' ? 'home_banners' : 'home_quick_links';
      const id = activeMatch[2];
      const body = await readJsonBody(req);
      if (typeof body?.active !== 'boolean') {
        return send(res, 400, { success: false, error: 'active boolean is required' });
      }
      const { data, error } = await auth.client
        .from(table)
        .update({ active: body.active, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('*')
        .maybeSingle();
      if (error) return send(res, 500, { success: false, error: error.message });
      if (!data) return send(res, 404, { success: false, error: 'Not found' });
      return send(res, 200, { success: true, data });
    }
    const delMatch = String(path || '').match(
      /^admin\/cms\/(banners|policies|quick-links)\/([^/]+)$/
    );
    if (delMatch && req.method === 'DELETE') {
      const auth = await requireAdminFeature(req, permissionForAdminPath(path));
      if (auth.ok === false) return send(res, auth.status, { success: false, error: auth.error });
      const kind = delMatch[1];
      const table =
        kind === 'banners'
          ? 'home_banners'
          : kind === 'policies'
            ? 'cms_policies'
            : 'home_quick_links';
      const id = delMatch[2];
      const { error } = await auth.client.from(table).delete().eq('id', id);
      if (error) return send(res, 500, { success: false, error: error.message });
      return send(res, 200, { success: true });
    }
  }

  if (path === 'admin/cms/nav-items/batch' && (req.method === 'PUT' || req.method === 'POST')) {
    const auth = await requireAdminFeature(req, permissionForAdminPath(path));
    if (auth.ok === false) return send(res, auth.status, { success: false, error: auth.error });
    const body = await readJsonBody(req);
    const audienceRole = String((body && body.audienceRole) || '');
    const bar = String((body && body.bar) || '');
    const slot = body && body.slot ? String(body.slot) : null;
    const items = body && Array.isArray(body.items) ? body.items : null;
    if (!audienceRole || !bar || !items) {
      return send(res, 400, { success: false, error: 'audienceRole, bar, and items[] are required' });
    }
    const rows = items.map((item) => ({
      id: String(item.id),
      audience_role: audienceRole,
      bar,
      slot: slot || item.slot || 'default',
      label: String(item.label || ''),
      icon: String(item.icon || 'Circle'),
      action_type: String(item.actionType || 'tab'),
      action_target: String(item.actionTarget || ''),
      badge: item.badge || 'none',
      meta: item.meta || null,
      order_num: Number(item.order || 0),
      active: item.active !== false,
      parent_id: item.parentId || null,
      updated_at: new Date().toISOString(),
    }));
    let existingQuery = auth.client.from('app_nav_items').select('id, parent_id').eq('audience_role', audienceRole).eq('bar', bar);
    if (slot) existingQuery = existingQuery.eq('slot', slot);
    const existing = await existingQuery;
    if (existing.error) return send(res, 500, { success: false, error: existing.error.message });
    const keep = new Set(rows.map((row) => row.id));
    const removable = (existing.data || []).filter((row) => !keep.has(row.id));
    const childIds = removable.filter((row) => row.parent_id).map((row) => row.id);
    const rootIds = removable.filter((row) => !row.parent_id).map((row) => row.id);
    if (childIds.length) {
      const deletedChildren = await auth.client.from('app_nav_items').delete().in('id', childIds);
      if (deletedChildren.error) return send(res, 500, { success: false, error: deletedChildren.error.message });
    }
    if (rootIds.length) {
      const deletedRoots = await auth.client.from('app_nav_items').delete().in('id', rootIds);
      if (deletedRoots.error) return send(res, 500, { success: false, error: deletedRoots.error.message });
    }
    if (!rows.length) return send(res, 200, { success: true, data: [] });
    const parentRows = rows.filter((row) => !row.parent_id);
    const childRows = rows.filter((row) => row.parent_id);
    if (parentRows.length) {
      const upsertedParents = await auth.client.from('app_nav_items').upsert(parentRows, { onConflict: 'id' });
      if (upsertedParents.error) return send(res, 500, { success: false, error: upsertedParents.error.message });
    }
    if (childRows.length) {
      const upsertedChildren = await auth.client.from('app_nav_items').upsert(childRows, { onConflict: 'id' });
      if (upsertedChildren.error) return send(res, 500, { success: false, error: upsertedChildren.error.message });
    }
    let savedQuery = auth.client.from('app_nav_items').select('*').eq('audience_role', audienceRole).eq('bar', bar);
    if (slot) savedQuery = savedQuery.eq('slot', slot);
    const saved = await savedQuery.order('order_num', { ascending: true });
    if (saved.error) return send(res, 500, { success: false, error: saved.error.message });
    return send(res, 200, { success: true, data: saved.data || [] });
  }

  if (path === 'admin/cms/feedback' && req.method === 'GET') {
    const auth = await requireAdminFeature(req, permissionForAdminPath(path));
    if (auth.ok === false) return send(res, auth.status, { success: false, error: auth.error });
    const { data, error } = await auth.client
      .from('ui_feedback_messages')
      .select('*')
      .order('key', { ascending: true });
    if (error) return send(res, 500, { success: false, error: error.message });
    let defaultsCount = 0;
    try {
      const pathMod = require('path');
      const fs = require('fs');
      const jsonPath = pathMod.join(__dirname, '..', '..', '..', 'shared', 'cms', 'feedbackCatalog.defaults.json');
      if (fs.existsSync(jsonPath)) {
        defaultsCount = JSON.parse(fs.readFileSync(jsonPath, 'utf8')).length;
      }
    } catch (_) {}
    return send(res, 200, {
      success: true,
      data: {
        rows: (data || []).map((row) => ({
          key: row.key,
          kind: row.kind || 'toast',
          category: row.category || 'general',
          title: row.title || '',
          message: row.message || '',
          defaultType: row.default_type || 'info',
          active: row.active !== false,
          updatedAt: row.updated_at ?? null,
        })),
        defaultsCount,
      },
    });
  }

  if (path === 'admin/cms/feedback' && req.method === 'PUT') {
    const auth = await requireAdminFeature(req, permissionForAdminPath(path));
    if (auth.ok === false) return send(res, auth.status, { success: false, error: auth.error });
    const body = (await readJsonBody(req)) || {};
    const key = String(body.key || '').trim();
    if (!key || key.length > 120) {
      return send(res, 400, { success: false, error: 'Valid key is required' });
    }
    const kind = String(body.kind || 'toast');
    const defaultType = String(body.defaultType || body.default_type || 'info');
    const title = String(body.title || '').trim();
    if (!title) return send(res, 400, { success: false, error: 'Title is required' });
    const row = {
      key,
      kind,
      category: String(body.category || 'general').trim() || 'general',
      title,
      message: String(body.message ?? ''),
      default_type: defaultType,
      active: body.active !== false,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await auth.client
      .from('ui_feedback_messages')
      .upsert(row, { onConflict: 'key' })
      .select('*')
      .maybeSingle();
    if (error) return send(res, 500, { success: false, error: error.message });
    return send(res, 200, {
      success: true,
      data: {
        key: data.key,
        kind: data.kind || 'toast',
        category: data.category || 'general',
        title: data.title || '',
        message: data.message || '',
        defaultType: data.default_type || 'info',
        active: data.active !== false,
        updatedAt: data.updated_at ?? null,
      },
    });
  }

  if (path === 'admin/cms/feedback/seed' && req.method === 'POST') {
    const auth = await requireAdminFeature(req, permissionForAdminPath(path));
    if (auth.ok === false) return send(res, auth.status, { success: false, error: auth.error });
    let catalog = [];
    try {
      const pathMod = require('path');
      const fs = require('fs');
      const jsonPath = pathMod.join(__dirname, '..', '..', '..', 'shared', 'cms', 'feedbackCatalog.defaults.json');
      if (fs.existsSync(jsonPath)) catalog = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    } catch (e) {
      return send(res, 500, { success: false, error: 'Default feedback catalog missing' });
    }
    const { data: existing, error: exErr } = await auth.client
      .from('ui_feedback_messages')
      .select('key');
    if (exErr) return send(res, 500, { success: false, error: exErr.message });
    const have = new Set((existing || []).map((r) => String(r.key)));
    const missing = (catalog || [])
      .filter((e) => e && e.key && !have.has(e.key))
      .map((e) => ({
        key: e.key,
        kind: e.kind || 'toast',
        category: e.category || 'general',
        title: e.title || e.key,
        message: e.message || '',
        default_type: e.defaultType || 'info',
        active: true,
        updated_at: new Date().toISOString(),
      }));
    if (!missing.length) {
      return send(res, 200, {
        success: true,
        data: { inserted: 0, total: have.size, message: 'All catalog keys already present' },
      });
    }
    const { error } = await auth.client.from('ui_feedback_messages').insert(missing);
    if (error) return send(res, 500, { success: false, error: error.message });
    return send(res, 200, {
      success: true,
      data: { inserted: missing.length, total: have.size + missing.length },
    });
  }

  if (
    (path === 'admin/cms/banners' ||
      path === 'admin/cms/policies' ||
      path === 'admin/cms/quick-links') &&
    (req.method === 'GET' || req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH')
  ) {
    const auth = await requireAdminFeature(req, permissionForAdminPath(path));
    if (auth.ok === false) return send(res, auth.status, { success: false, error: auth.error });
    const table =
      path === 'admin/cms/banners'
        ? 'home_banners'
        : path === 'admin/cms/policies'
          ? 'cms_policies'
          : 'home_quick_links';
    if (req.method === 'GET') {
      let q = auth.client.from(table).select('*').limit(200);
      // Prefer order_num (canonical) then sort_order
      try {
        q = q.order('order_num', { ascending: true });
      } catch (_) {
        q = auth.client.from(table).select('*').order('sort_order', { ascending: true }).limit(200);
      }
      const { data, error } = await q;
      if (error) return send(res, 200, { success: true, items: [], data: [] });
      return send(res, 200, { success: true, items: data || [], data: data || [] });
    }
    const body = await readJsonBody(req);
    if (body && body.id) {
      const { data, error } = await auth.client
        .from(table)
        .upsert(body)
        .select('*')
        .maybeSingle();
      if (error) return send(res, 500, { success: false, error: error.message });
      return send(res, 200, { success: true, item: data, data });
    }
    const { data, error } = await auth.client.from(table).insert(body || {}).select('*').maybeSingle();
    if (error) return send(res, 500, { success: false, error: error.message });
    return send(res, 200, { success: true, item: data, data });
  }

  if (path === 'admin/schema' && req.method === 'GET') {
    const auth = await requireAdminFeature(req, permissionForAdminPath(path));
    if (auth.ok === false) return send(res, auth.status, { success: false, error: auth.error });
    // Read-only: serve bundled supabase_schema.sql when present in the deployment
    const fs = require('fs');
    const pathMod = require('path');
    const candidates = [
      pathMod.join(process.cwd(), 'supabase_schema.sql'),
      pathMod.join(__dirname, '..', '..', '..', 'supabase_schema.sql'),
      pathMod.join(__dirname, '..', '..', 'supabase_schema.sql'),
    ];
    let sql = '';
    let source = null;
    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) {
          sql = fs.readFileSync(p, 'utf8');
          source = p;
          break;
        }
      } catch (_) {}
    }
    if (!sql) {
      return send(res, 200, {
        success: true,
        sql: '',
        migrationSql: '',
        tablesCount: 0,
        version: 'vercel-readonly',
        source: null,
        message:
          'Schema file not bundled on this Vercel deployment. Use the repo supabase_schema.sql or Supabase SQL editor.',
        generatedAt: new Date().toISOString(),
      });
    }
    const tablesCount = (sql.match(/CREATE TABLE IF NOT EXISTS public\./gi) || []).length;
    return send(res, 200, {
      success: true,
      sql,
      migrationSql: `-- Incremental apply from supabase_schema.sql\n${sql}`,
      tablesCount,
      version: '3.2',
      source: 'supabase_schema.sql',
      generatedAt: new Date().toISOString(),
      pathHint: source,
    });
  }

  if (path === 'admin/factory-reset-status' && req.method === 'GET') {
    const auth = await requireAdminFeature(req, permissionForAdminPath(path));
    if (auth.ok === false) return send(res, auth.status, { success: false, error: auth.error });
    const allowed = isFactoryResetAllowed();
    return send(res, 200, {
      success: true,
      data: {
        allowed,
        available: allowed,
        hint: allowed
          ? 'ALLOW_FACTORY_RESET is enabled. Granular reset performs DB-only wipes on Vercel (no in-memory/WebSocket clearing).'
          : 'Set ALLOW_FACTORY_RESET=true on this deployment to enable DB-only granular reset. Prefer non-prod only.',
        envValue: String(process.env.ALLOW_FACTORY_RESET || ''),
        mode: 'db-only',
      },
      available: allowed,
      message: allowed
        ? 'Factory/granular reset is allowed (DB-only on Vercel).'
        : 'Factory reset is gated. Set ALLOW_FACTORY_RESET=true to enable.',
    });
  }

  if (path === 'admin/granular-reset' && req.method === 'POST') {
    const auth = await requireAdminFeature(req, permissionForAdminPath(path));
    if (auth.ok === false) return send(res, auth.status, { success: false, error: auth.error });
    if (!isFactoryResetAllowed()) {
      return send(res, 403, {
        success: false,
        error: {
          message:
            'Granular/factory reset is disabled. Set ALLOW_FACTORY_RESET=true (non-prod recommended) to enable DB-only reset on Vercel.',
          code: 'FACTORY_RESET_DISABLED',
        },
      });
    }
    const body = await readJsonBody(req);
    const result = await granularResetDb(auth.client, body || {});
    if (!result.success) {
      return send(res, 500, {
        success: false,
        error: { message: result.error || 'Reset failed', code: 'GRANULAR_RESET_FAILED' },
        clearedTables: result.clearedTables,
        warnings: result.warnings || [],
        r2PurgeRequested: Boolean(result.r2PurgeRequested),
        r2Purged: false,
      });
    }
    return send(res, 200, {
      success: true,
      message: result.r2PurgeRequested
        ? 'DB-only granular reset completed. R2 media was NOT deleted.'
        : 'DB-only granular reset completed on Vercel.',
      clearedTables: result.clearedTables,
      warnings: result.warnings || [],
      r2PurgeRequested: Boolean(result.r2PurgeRequested),
      r2Purged: false,
    });
  }

  // -------------------------------------------------------------------------
  // OFFICE RBAC — roles, permissions, office users (Control Center)
  // -------------------------------------------------------------------------
  if (path === 'admin/office-rbac/features' && req.method === 'GET') {
    const auth = await requireAdminFeature(req, permissionForAdminPath(path));
    if (auth.ok === false) return send(res, auth.status, { success: false, error: auth.error });
    return send(res, 200, { success: true, data: { features: OFFICE_FEATURES } });
  }

  if (path === 'admin/office-rbac/me' && req.method === 'GET') {
    const auth = await requireAdminFeature(req, permissionForAdminPath(path));
    if (auth.ok === false) return send(res, auth.status, { success: false, error: auth.error });
    const client = createServiceClient();
    if (!client) {
      return send(res, 503, {
        success: false,
        error: { message: 'Supabase not configured', code: 'SUPABASE_NOT_CONFIGURED' },
      });
    }
    const access = await resolveActorAccess(client, auth);
    return send(res, 200, {
      success: true,
      data: {
        isSuper: access.isSuper,
        permissions: access.permissions,
        officeRoleId: access.officeRoleId,
        role: access.role,
        features: OFFICE_FEATURES,
      },
    });
  }

  if (path === 'admin/office-rbac/roles' && req.method === 'GET') {
    const auth = await requireAdminFeature(req, permissionForAdminPath(path));
    if (auth.ok === false) return send(res, auth.status, { success: false, error: auth.error });
    const client = createServiceClient();
    if (!client) {
      return send(res, 503, {
        success: false,
        error: { message: 'Supabase not configured', code: 'SUPABASE_NOT_CONFIGURED' },
      });
    }
    const access = await resolveActorAccess(client, auth);
    if (access.schemaMissing) {
      return send(res, 503, {
        success: false,
        error: {
          message:
            'Office RBAC tables are missing. In Supabase SQL Editor, run the OFFICE RBAC block at the end of supabase_schema.sql, then refresh.',
          code: 'OFFICE_RBAC_SCHEMA_MISSING',
          detail: access.schemaError || null,
        },
      });
    }
    if (!actorCanManageRbac(access)) {
      return send(res, 403, {
        success: false,
        error: { message: 'Roles & Permissions access required.', code: 'FORBIDDEN' },
      });
    }
    const { data: roles, error } = await client
      .from('office_roles')
      .select('*')
      .order('label', { ascending: true });
    if (error) {
      const schemaMissing = /does not exist|schema cache|42P01|office_roles/i.test(error.message || '');
      return send(res, schemaMissing ? 503 : 500, {
        success: false,
        error: {
          message: schemaMissing
            ? 'Office RBAC tables are missing. In Supabase SQL Editor, run the OFFICE RBAC block at the end of supabase_schema.sql, then refresh.'
            : error.message,
          code: schemaMissing ? 'OFFICE_RBAC_SCHEMA_MISSING' : 'ROLES_LOAD_FAILED',
        },
      });
    }
    const ids = (roles || []).map((r) => r.id);
    const { data: perms } = ids.length
      ? await client.from('office_role_permissions').select('role_id, permission_key').in('role_id', ids)
      : { data: [] };
    const byRole = new Map();
    for (const p of perms || []) {
      const list = byRole.get(p.role_id) || [];
      list.push(String(p.permission_key));
      byRole.set(p.role_id, list);
    }
    return send(res, 200, {
      success: true,
      data: {
        roles: (roles || []).map((r) =>
          mapRoleRow(r, r.is_super ? allPermissionKeys() : byRole.get(r.id) || [])
        ),
        features: OFFICE_FEATURES,
      },
    });
  }

  if (path === 'admin/office-rbac/roles' && req.method === 'POST') {
    const auth = await requireAdminFeature(req, permissionForAdminPath(path));
    if (auth.ok === false) return send(res, auth.status, { success: false, error: auth.error });
    const client = createServiceClient();
    if (!client) {
      return send(res, 503, {
        success: false,
        error: { message: 'Supabase not configured', code: 'SUPABASE_NOT_CONFIGURED' },
      });
    }
    const access = await resolveActorAccess(client, auth);
    if (!actorCanManageRbac(access)) {
      return send(res, 403, {
        success: false,
        error: { message: 'Roles & Permissions access required.', code: 'FORBIDDEN' },
      });
    }
    const body = await readJsonBody(req);
    const label = clean(body.label);
    let key = clean(body.key).toLowerCase() || slugKey(label);
    const description = clean(body.description);
    if (!label || !key) {
      return send(res, 400, {
        success: false,
        error: { message: 'Label (and key) required.', code: 'INVALID' },
      });
    }
    if (!/^[a-z][a-z0-9_]{1,47}$/.test(key)) {
      return send(res, 400, {
        success: false,
        error: { message: 'Key must be snake_case letters/numbers.', code: 'INVALID_KEY' },
      });
    }
    const now = new Date().toISOString();
    const { data: created, error } = await client
      .from('office_roles')
      .insert({
        key,
        label,
        description,
        is_super: false,
        is_system: false,
        created_at: now,
        updated_at: now,
      })
      .select('*')
      .single();
    if (error) {
      const status = /duplicate|unique/i.test(error.message) ? 409 : 500;
      return send(res, status, {
        success: false,
        error: { message: error.message, code: status === 409 ? 'KEY_EXISTS' : 'CREATE_FAILED' },
      });
    }
    const permissions = sanitizePermissionKeys(body.permissions);
    if (permissions.length) {
      await client.from('office_role_permissions').insert(
        permissions.map((permission_key) => ({ role_id: created.id, permission_key }))
      );
    }
    return send(res, 200, {
      success: true,
      data: { role: mapRoleRow(created, permissions) },
    });
  }

  const roleIdMatch = path.match(/^admin\/office-rbac\/roles\/([^/]+)$/);
  if (roleIdMatch && (req.method === 'PUT' || req.method === 'DELETE')) {
    const auth = await requireAdminFeature(req, permissionForAdminPath(path));
    if (auth.ok === false) return send(res, auth.status, { success: false, error: auth.error });
    const client = createServiceClient();
    if (!client) {
      return send(res, 503, {
        success: false,
        error: { message: 'Supabase not configured', code: 'SUPABASE_NOT_CONFIGURED' },
      });
    }
    const access = await resolveActorAccess(client, auth);
    if (!actorCanManageRbac(access)) {
      return send(res, 403, {
        success: false,
        error: { message: 'Roles & Permissions access required.', code: 'FORBIDDEN' },
      });
    }
    const roleId = String(roleIdMatch[1] || '').trim();
    const { data: existing } = await client
      .from('office_roles')
      .select('*')
      .eq('id', roleId)
      .maybeSingle();
    if (!existing) {
      return send(res, 404, {
        success: false,
        error: { message: 'Role not found', code: 'NOT_FOUND' },
      });
    }

    if (req.method === 'DELETE') {
      if (existing.is_system || existing.is_super) {
        return send(res, 400, {
          success: false,
          error: { message: 'System / super roles cannot be deleted.', code: 'SYSTEM_ROLE' },
        });
      }
      const { error } = await client.from('office_roles').delete().eq('id', roleId);
      if (error) {
        return send(res, 500, {
          success: false,
          error: { message: error.message, code: 'DELETE_FAILED' },
        });
      }
      return send(res, 200, { success: true, data: { deleted: true } });
    }

    const body = await readJsonBody(req);
    const label = clean(body.label) || existing.label;
    const description =
      body.description !== undefined ? clean(body.description) : String(existing.description || '');
    const { data: updated, error } = await client
      .from('office_roles')
      .update({ label, description, updated_at: new Date().toISOString() })
      .eq('id', roleId)
      .select('*')
      .single();
    if (error) {
      return send(res, 500, {
        success: false,
        error: { message: error.message, code: 'UPDATE_FAILED' },
      });
    }
    let permissions;
    if (Array.isArray(body.permissions)) {
      if (existing.is_super) {
        permissions = allPermissionKeys();
      } else {
        permissions = sanitizePermissionKeys(body.permissions);
        await client.from('office_role_permissions').delete().eq('role_id', roleId);
        if (permissions.length) {
          await client.from('office_role_permissions').insert(
            permissions.map((permission_key) => ({ role_id: roleId, permission_key }))
          );
        }
      }
    } else {
      const { data: perms } = await client
        .from('office_role_permissions')
        .select('permission_key')
        .eq('role_id', roleId);
      permissions = existing.is_super
        ? allPermissionKeys()
        : (perms || []).map((p) => String(p.permission_key));
    }
    return send(res, 200, {
      success: true,
      data: { role: mapRoleRow(updated, permissions) },
    });
  }

  if (path === 'admin/office-rbac/users' && req.method === 'GET') {
    const auth = await requireAdminFeature(req, permissionForAdminPath(path));
    if (auth.ok === false) return send(res, auth.status, { success: false, error: auth.error });
    const client = createServiceClient();
    if (!client) {
      return send(res, 503, {
        success: false,
        error: { message: 'Supabase not configured', code: 'SUPABASE_NOT_CONFIGURED' },
      });
    }
    const access = await resolveActorAccess(client, auth);
    if (!actorCanManageRbac(access)) {
      return send(res, 403, {
        success: false,
        error: { message: 'Roles & Permissions access required.', code: 'FORBIDDEN' },
      });
    }
    const { data: users, error } = await client
      .from('profiles')
      .select('id, name, email, role, office_role_id, created_at, updated_at, is_banned')
      .eq('role', 'admin')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) {
      return send(res, 500, {
        success: false,
        error: { message: error.message, code: 'USERS_LOAD_FAILED' },
      });
    }
    const { data: roles } = await client.from('office_roles').select('id, key, label, is_super');
    const roleById = new Map((roles || []).map((r) => [String(r.id), r]));
    return send(res, 200, {
      success: true,
      data: {
        users: (users || []).map((u) => {
          const or = u.office_role_id ? roleById.get(String(u.office_role_id)) : null;
          return {
            id: String(u.id),
            name: u.name || null,
            email: u.email || null,
            role: 'admin',
            officeRoleId: u.office_role_id ? String(u.office_role_id) : null,
            officeRoleKey: or?.key || null,
            officeRoleLabel: or ? or.label : u.office_role_id ? 'Unknown role' : 'Legacy Super Admin',
            isSuper: !u.office_role_id || or?.is_super === true,
            isBanned: u.is_banned === true,
            createdAt: u.created_at || null,
            updatedAt: u.updated_at || null,
          };
        }),
      },
    });
  }

  if (path === 'admin/office-rbac/users' && req.method === 'POST') {
    const auth = await requireAdminFeature(req, permissionForAdminPath(path));
    if (auth.ok === false) return send(res, auth.status, { success: false, error: auth.error });
    const client = createServiceClient();
    if (!client) {
      return send(res, 503, {
        success: false,
        error: { message: 'Supabase not configured', code: 'SUPABASE_NOT_CONFIGURED' },
      });
    }
    const access = await resolveActorAccess(client, auth);
    if (!actorCanManageRbac(access)) {
      return send(res, 403, {
        success: false,
        error: { message: 'Roles & Permissions access required.', code: 'FORBIDDEN' },
      });
    }
    const body = await readJsonBody(req);
    const name = clean(body.name);
    const email = clean(body.email).toLowerCase();
    const password = typeof body.password === 'string' ? body.password : '';
    const officeRoleId = clean(body.officeRoleId || body.office_role_id);
    if (!name || !email || !email.includes('@')) {
      return send(res, 400, {
        success: false,
        error: { message: 'Name and valid email required.', code: 'INVALID' },
      });
    }
    const pwError = getPasswordPolicyError(password);
    if (pwError) {
      return send(res, 400, {
        success: false,
        error: { message: pwError, code: 'PASSWORD_POLICY' },
      });
    }
    if (!officeRoleId) {
      return send(res, 400, {
        success: false,
        error: { message: 'Office role is required.', code: 'ROLE_REQUIRED' },
      });
    }
    const { data: officeRole } = await client
      .from('office_roles')
      .select('id, key, label, is_super')
      .eq('id', officeRoleId)
      .maybeSingle();
    if (!officeRole) {
      return send(res, 400, {
        success: false,
        error: { message: 'Office role not found.', code: 'ROLE_NOT_FOUND' },
      });
    }

    const { data: existingProfile } = await client
      .from('profiles')
      .select('id, email')
      .ilike('email', email)
      .maybeSingle();
    if (existingProfile?.id) {
      return send(res, 409, {
        success: false,
        error: {
          message: `A profile already exists for ${email}.`,
          code: 'EMAIL_EXISTS',
        },
      });
    }

    const { data: createdAuth, error: createErr } = await client.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        role: 'admin',
        gender: 'other',
        name,
        full_name: name,
      },
    });
    if (createErr || !createdAuth?.user?.id) {
      const msg = (createErr && createErr.message) || 'Failed to create Auth user';
      const code = /already/i.test(msg) ? 'EMAIL_EXISTS' : 'AUTH_CREATE_FAILED';
      return send(res, code === 'EMAIL_EXISTS' ? 409 : 500, {
        success: false,
        error: { message: msg, code },
      });
    }

    const authUserId = createdAuth.user.id;
    const now = new Date().toISOString();
    const profileRow = {
      id: authUserId,
      auth_id: authUserId,
      name,
      email,
      gender: 'other',
      gender_locked: true,
      role: 'admin',
      office_role_id: officeRole.id,
      age: 30,
      nationality: 'United States',
      country_code: 'US',
      bio: `Office staff — ${officeRole.label}`,
      interests: [],
      tags: ['Office', officeRole.label],
      spoken_languages: ['English'],
      avatar_url:
        'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&q=80&w=400',
      gallery: [],
      is_verified: true,
      is_onboarded: true,
      agreed_to_terms: true,
      online_status: 'offline',
      coin_balance: 0,
      hourly_coin_rate: 0,
      earnings_coins: 0,
      has_password_set: true,
      created_at: now,
      updated_at: now,
    };
    const { error: upsertErr } = await client.from('profiles').upsert(profileRow, {
      onConflict: 'id',
    });
    if (upsertErr) {
      try {
        await client.auth.admin.deleteUser(authUserId);
      } catch (_) {
        /* ignore */
      }
      return send(res, 500, {
        success: false,
        error: {
          message: upsertErr.message || 'Failed to create office user profile',
          code: 'PROFILE_UPSERT_FAILED',
        },
      });
    }
    await client
      .from('profiles')
      .update({
        role: 'admin',
        office_role_id: officeRole.id,
        auth_id: authUserId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', authUserId);

    return send(res, 200, {
      success: true,
      data: {
        user: {
          id: authUserId,
          name,
          email,
          role: 'admin',
          officeRoleId: String(officeRole.id),
          officeRoleKey: officeRole.key,
          officeRoleLabel: officeRole.label,
          isSuper: officeRole.is_super === true,
        },
      },
      message: `Office user ${name} created. They can sign in with ${email}.`,
    });
  }

  const assignMatch = path.match(/^admin\/office-rbac\/users\/([^/]+)$/);
  if (assignMatch && req.method === 'PATCH') {
    const auth = await requireAdminFeature(req, permissionForAdminPath(path));
    if (auth.ok === false) return send(res, auth.status, { success: false, error: auth.error });
    const client = createServiceClient();
    if (!client) {
      return send(res, 503, {
        success: false,
        error: { message: 'Supabase not configured', code: 'SUPABASE_NOT_CONFIGURED' },
      });
    }
    const access = await resolveActorAccess(client, auth);
    if (!actorCanManageRbac(access)) {
      return send(res, 403, {
        success: false,
        error: { message: 'Roles & Permissions access required.', code: 'FORBIDDEN' },
      });
    }
    const userId = String(assignMatch[1] || '').trim();
    const body = await readJsonBody(req);
    const officeRoleId =
      body.officeRoleId === null || body.office_role_id === null
        ? null
        : clean(body.officeRoleId || body.office_role_id) || null;

    const { data: target } = await client
      .from('profiles')
      .select('id, role, email')
      .eq('id', userId)
      .maybeSingle();
    if (!target || String(target.role) !== 'admin') {
      return send(res, 404, {
        success: false,
        error: { message: 'Office user not found', code: 'NOT_FOUND' },
      });
    }
    if (officeRoleId) {
      const { data: officeRole } = await client
        .from('office_roles')
        .select('id')
        .eq('id', officeRoleId)
        .maybeSingle();
      if (!officeRole) {
        return send(res, 400, {
          success: false,
          error: { message: 'Office role not found.', code: 'ROLE_NOT_FOUND' },
        });
      }
    }
    const { error } = await client
      .from('profiles')
      .update({
        office_role_id: officeRoleId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);
    if (error) {
      return send(res, 500, {
        success: false,
        error: { message: error.message, code: 'UPDATE_FAILED' },
      });
    }
    return send(res, 200, {
      success: true,
      data: { userId, officeRoleId },
    });
  }

  return send(res, 501, {
    success: false,
    error: {
      message: `Unimplemented admin path: ${path}`,
      code: 'VERCEL_ROUTE_NOT_IMPLEMENTED',
    },
  });
}

module.exports = { handleAdmin };
