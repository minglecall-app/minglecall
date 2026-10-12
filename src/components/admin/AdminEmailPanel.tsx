import React, { useCallback, useEffect, useState } from 'react';
import {
  Mail,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Send,
  Shield,
  Server,
  ToggleLeft,
  ToggleRight,
  AlertTriangle,
  Inbox,
  ExternalLink,
  Loader2,
  FileText,
  RotateCcw,
} from 'lucide-react';
import { authFetch } from '../../utils/apiClient';
import {
  DEFAULT_EMAIL_TEMPLATES,
  EMAIL_TEMPLATE_KEYS,
  EMAIL_TEMPLATE_LABELS,
  type EmailTemplateKey,
  type EmailTemplatesMap,
} from '../../../shared/emailTemplates';

type EmailPolicy = {
  emailRegisterEnabled: boolean;
  emailAccountCreateEnabled: boolean;
  emailAccountDeleteEnabled: boolean;
  allowCreateWithoutOtp: boolean;
  emailShowOtpFallback: boolean;
};

type EmailEnv = {
  source?: string;
  resendConfigured?: boolean;
  resendApiKeyPreview?: string;
  smtpConfigured?: boolean;
  smtpHost?: string;
  smtpPort?: string;
  smtpUser?: string;
  smtpFrom?: string;
  smtpFromResolved?: string;
  smtpPassConfigured?: boolean;
  configured?: boolean;
  vercel?: boolean;
  message?: string;
};

type EmailLog = {
  id: string;
  purpose: string;
  recipient_email: string;
  recipient_name?: string | null;
  subject?: string | null;
  provider?: string | null;
  status: string;
  error_message?: string | null;
  created_at: string;
};

const DEFAULT_POLICY: EmailPolicy = {
  emailRegisterEnabled: true,
  emailAccountCreateEnabled: true,
  emailAccountDeleteEnabled: false,
  allowCreateWithoutOtp: false,
  emailShowOtpFallback: false,
};

function ToggleRow({
  label,
  description,
  enabled,
  onChange,
  danger,
}: {
  label: string;
  description: string;
  enabled: boolean;
  onChange: (v: boolean) => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      className={`w-full flex items-start justify-between gap-4 p-4 rounded-xl border text-left transition-colors ${
        enabled
          ? danger
            ? 'border-amber-500/40 bg-amber-500/10'
            : 'border-emerald-500/30 bg-emerald-500/10'
          : 'border-slate-700 bg-slate-900/60 hover:bg-slate-800/80'
      }`}
    >
      <div className="min-w-0">
        <div className="text-sm font-semibold text-white">{label}</div>
        <div className="text-xs text-slate-400 mt-1 leading-relaxed">{description}</div>
      </div>
      <div className="shrink-0 mt-0.5">
        {enabled ? (
          <ToggleRight className={`w-8 h-8 ${danger ? 'text-amber-400' : 'text-emerald-400'}`} />
        ) : (
          <ToggleLeft className="w-8 h-8 text-slate-500" />
        )}
      </div>
    </button>
  );
}

export function AdminEmailPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingTemplates, setSavingTemplates] = useState(false);
  const [testing, setTesting] = useState(false);
  const [verifyingKey, setVerifyingKey] = useState(false);
  const [env, setEnv] = useState<EmailEnv>({});
  const [policy, setPolicy] = useState<EmailPolicy>(DEFAULT_POLICY);
  const [templates, setTemplates] = useState<EmailTemplatesMap>(
    () => JSON.parse(JSON.stringify(DEFAULT_EMAIL_TEMPLATES))
  );
  const [activeTemplate, setActiveTemplate] = useState<EmailTemplateKey>('otp_register');
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [testTo, setTestTo] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<string | null>(null);
  const [verifyOk, setVerifyOk] = useState<boolean | null>(null);

  const apiErrorMessage = (data: any, fallback: string, status?: number) => {
    const raw = data?.error;
    const msg =
      typeof raw === 'string' ? raw : typeof raw?.message === 'string' ? raw.message : fallback;
    if (status === 401 || raw?.code === 'UNAUTHORIZED') {
      return `${msg} Tip: sign out/in, then confirm Vercel VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY match the same project.`;
    }
    return msg;
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch('/api/admin/email');
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(apiErrorMessage(data, `Failed to load email status (${res.status})`, res.status));
      }
      setEnv(data.data?.env || {});
      setPolicy({ ...DEFAULT_POLICY, ...(data.data?.policy || {}) });
      if (data.data?.templates) {
        setTemplates({
          ...JSON.parse(JSON.stringify(DEFAULT_EMAIL_TEMPLATES)),
          ...data.data.templates,
        });
      }
      setLogs(Array.isArray(data.data?.logs) ? data.data.logs : []);
    } catch (e: any) {
      setError(e?.message || 'Could not load email admin data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const savePolicy = async (next: EmailPolicy) => {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await authFetch('/api/admin/email/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(
          typeof data?.error === 'string'
            ? data.error
            : data?.error?.message || 'Failed to save email policy'
        );
      }
      setPolicy({ ...DEFAULT_POLICY, ...(data.data?.policy || next) });
      setMessage('Email notification policy saved.');
    } catch (e: any) {
      setError(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const saveTemplates = async () => {
    setSavingTemplates(true);
    setMessage(null);
    setError(null);
    try {
      const res = await authFetch('/api/admin/email/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templates }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(
          typeof data?.error === 'string'
            ? data.error
            : data?.error?.message || 'Failed to save templates'
        );
      }
      if (data.data?.templates) setTemplates(data.data.templates);
      setMessage('Email templates saved. Registration OTP and other mail will use these.');
    } catch (e: any) {
      setError(e?.message || 'Failed to save templates');
    } finally {
      setSavingTemplates(false);
    }
  };

  const resetActiveTemplate = () => {
    setTemplates((prev) => ({
      ...prev,
      [activeTemplate]: JSON.parse(JSON.stringify(DEFAULT_EMAIL_TEMPLATES[activeTemplate])),
    }));
  };

  /** Probe RESEND_API_KEY only (GET /domains) — no recipient required. */
  const verifyResendKey = async () => {
    setVerifyingKey(true);
    setVerifyResult(null);
    setVerifyOk(null);
    setError(null);
    try {
      const res = await authFetch('/api/admin/email/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401 || res.status === 403) {
        setVerifyOk(false);
        setVerifyResult(apiErrorMessage(data, 'Authentication failed', res.status));
        return;
      }
      const result = data?.data || data;
      const ok = Boolean(result?.ok);
      setVerifyOk(ok);
      setVerifyResult(
        result?.message ||
          (ok ? 'Resend API key accepted.' : 'Resend / SMTP verification failed')
      );
    } catch (e: any) {
      setVerifyOk(false);
      setVerifyResult(e?.message || 'Verify failed');
    } finally {
      setVerifyingKey(false);
    }
  };

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    setError(null);
    try {
      const res = await authFetch('/api/admin/email/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testTo.trim() || undefined, name: 'Admin' }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401 || res.status === 403) {
        setTestResult(apiErrorMessage(data, 'Authentication failed', res.status));
        return;
      }
      const result = data?.data || data;
      setTestResult(result?.message || (result?.ok ? 'Connection OK' : 'Connection failed'));
      if (result?.ok) await load();
    } catch (e: any) {
      setTestResult(e?.message || 'Test failed');
    } finally {
      setTesting(false);
    }
  };

  const updateToggle = (key: keyof EmailPolicy, value: boolean) => {
    const next = { ...policy, [key]: value };
    setPolicy(next);
    void savePolicy(next);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400 gap-2">
        <Loader2 className="w-5 h-5 animate-spin" />
        Loading email configuration…
      </div>
    );
  }

  const current = templates[activeTemplate];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Mail className="w-5 h-5 text-pink-400" />
            Email
          </h2>
          <p className="text-sm text-slate-400 mt-1 max-w-2xl">
            Manage OTP / transactional templates used by the app. Credentials stay in Vercel env (
            <code className="text-pink-300/90">RESEND_API_KEY</code>,{' '}
            <code className="text-pink-300/90">SMTP_*</code>).
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {message && (
        <div className="flex items-center gap-2 text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          {message}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
          <XCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-slate-700 bg-slate-900/50 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-white font-semibold">
            <FileText className="w-4 h-4 text-amber-400" />
            Email templates
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={resetActiveTemplate}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset this template
            </button>
            <button
              type="button"
              disabled={savingTemplates}
              onClick={() => void saveTemplates()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-pink-600 hover:bg-pink-500 disabled:opacity-50 text-white text-xs font-semibold"
            >
              {savingTemplates ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Save templates
            </button>
          </div>
        </div>
        <p className="text-xs text-slate-400">
          Placeholders:{' '}
          <code className="text-amber-300">{'{{name}}'}</code>,{' '}
          <code className="text-amber-300">{'{{otp}}'}</code>,{' '}
          <code className="text-amber-300">{'{{email}}'}</code>,{' '}
          <code className="text-amber-300">{'{{link}}'}</code>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {EMAIL_TEMPLATE_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTemplate(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activeTemplate === key
                  ? 'bg-amber-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {EMAIL_TEMPLATE_LABELS[key]}
            </button>
          ))}
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-1.5">
              Subject
            </label>
            <input
              value={current.subject}
              onChange={(e) =>
                setTemplates((prev) => ({
                  ...prev,
                  [activeTemplate]: { ...prev[activeTemplate], subject: e.target.value },
                }))
              }
              className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-pink-500/40"
            />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-1.5">
              HTML body
            </label>
            <textarea
              value={current.html}
              onChange={(e) =>
                setTemplates((prev) => ({
                  ...prev,
                  [activeTemplate]: { ...prev[activeTemplate], html: e.target.value },
                }))
              }
              rows={14}
              className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:ring-2 focus:ring-pink-500/40"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-slate-700 bg-slate-900/50 p-5 space-y-4">
          <div className="flex items-center gap-2 text-white font-semibold">
            <Server className="w-4 h-4 text-cyan-400" />
            Provider status (from env)
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-400">Resend API</span>
              <span className={env.resendConfigured ? 'text-emerald-400 font-medium' : 'text-rose-400'}>
                {env.resendConfigured ? `Configured (${env.resendApiKeyPreview || '••••'})` : 'Not set'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-400">SMTP</span>
              <span className={env.smtpConfigured ? 'text-emerald-400 font-medium' : 'text-slate-500'}>
                {env.smtpConfigured
                  ? `${env.smtpHost}:${env.smtpPort} · ${env.smtpUser || 'user'}`
                  : 'Not set'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-400">From (env)</span>
              <span className="text-slate-200 font-mono text-xs truncate max-w-[60%]">
                {env.smtpFrom || '—'}
              </span>
            </div>
            {env.smtpFromResolved && env.smtpFromResolved !== env.smtpFrom ? (
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-400">From (used)</span>
                <span className="text-emerald-300 font-mono text-xs truncate max-w-[60%]">
                  {env.smtpFromResolved}
                </span>
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-400">Runtime</span>
              <span className="text-slate-300">{env.vercel ? 'Vercel' : 'Local / Express'}</span>
            </div>
          </div>
          <a
            href="https://vercel.com/docs/projects/environment-variables"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300"
          >
            Open Vercel env docs <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        <div className="rounded-2xl border border-slate-700 bg-slate-900/50 p-5 space-y-4">
          <div className="flex items-center gap-2 text-white font-semibold">
            <Send className="w-4 h-4 text-pink-400" />
            Resend / SMTP connection
          </div>
          <p className="text-xs text-slate-400">
            <strong className="text-slate-300">Verify API key</strong> checks{' '}
            <code className="text-pink-300/90">RESEND_API_KEY</code> against Resend (no email sent).{' '}
            <strong className="text-slate-300">Send test email</strong> uses the connection-test template.
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={verifyingKey}
              onClick={() => void verifyResendKey()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 disabled:opacity-50 text-white text-sm font-semibold"
            >
              {verifyingKey ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Shield className="w-4 h-4 text-emerald-400" />
              )}
              Verify Resend API key
            </button>
          </div>
          {verifyResult && (
            <div
              className={`text-xs rounded-lg px-3 py-2 border ${
                verifyOk
                  ? 'text-emerald-200 bg-emerald-500/10 border-emerald-500/30'
                  : 'text-rose-200 bg-rose-500/10 border-rose-500/30'
              }`}
            >
              {verifyResult}
            </div>
          )}

          <div className="border-t border-slate-800 pt-4 space-y-3">
            <input
              type="email"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="recipient@example.com"
              className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-pink-500/40"
            />
            <button
              type="button"
              disabled={testing || !testTo.trim().includes('@')}
              onClick={() => void runTest()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-pink-600 hover:bg-pink-500 disabled:opacity-50 text-white text-sm font-semibold"
            >
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Send test email
            </button>
          </div>

          {!env.configured && (
            <div className="flex items-start gap-2 text-xs text-amber-300/90">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              Set <code>RESEND_API_KEY</code> (recommended) or <code>SMTP_HOST</code>/
              <code>SMTP_USER</code>/<code>SMTP_PASS</code> in Vercel Production env, then Redeploy.
            </div>
          )}
          {testResult && (
            <div className="text-xs text-slate-300 bg-slate-950/80 border border-slate-700 rounded-lg px-3 py-2">
              {testResult}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-700 bg-slate-900/50 p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-white font-semibold">
            <ToggleRight className="w-4 h-4 text-emerald-400" />
            Notification &amp; OTP policy
          </div>
          {saving && <span className="text-xs text-slate-400">Saving…</span>}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <ToggleRow
            label="Email on user register (OTP)"
            description="Send 6-digit verification emails during public signup."
            enabled={policy.emailRegisterEnabled}
            onChange={(v) => updateToggle('emailRegisterEnabled', v)}
          />
          <ToggleRow
            label="Email on account create"
            description="Send welcome / notice emails when admins or agencies create accounts."
            enabled={policy.emailAccountCreateEnabled}
            onChange={(v) => updateToggle('emailAccountCreateEnabled', v)}
          />
          <ToggleRow
            label="Email on account delete"
            description="Notify the user by email when an admin permanently deletes their account."
            enabled={policy.emailAccountDeleteEnabled}
            onChange={(v) => updateToggle('emailAccountDeleteEnabled', v)}
          />
          <ToggleRow
            label="Allow create without email OTP"
            description="Public signup can complete without verifying a code. Use only for staging."
            enabled={policy.allowCreateWithoutOtp}
            onChange={(v) => updateToggle('allowCreateWithoutOtp', v)}
            danger
          />
          <ToggleRow
            label="Show OTP in form on delivery failure"
            description="If the provider cannot deliver, surface the code in the signup UI."
            enabled={policy.emailShowOtpFallback}
            onChange={(v) => updateToggle('emailShowOtpFallback', v)}
          />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-700 bg-slate-900/50 p-5 space-y-3">
        <div className="flex items-center gap-2 text-white font-semibold">
          <Inbox className="w-4 h-4 text-indigo-400" />
          Sent email log
        </div>
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-950/80 text-slate-400 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Purpose</th>
                <th className="px-3 py-2 font-medium">Recipient</th>
                <th className="px-3 py-2 font-medium">Subject</th>
                <th className="px-3 py-2 font-medium">Provider</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                    No email dispatches logged yet.
                  </td>
                </tr>
              ) : (
                logs.map((row) => (
                  <tr key={row.id} className="text-slate-300 hover:bg-slate-800/40">
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-400">
                      {row.created_at ? new Date(row.created_at).toLocaleString() : '—'}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{row.purpose}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-white">{row.recipient_email}</div>
                      {row.recipient_name ? (
                        <div className="text-xs text-slate-500">{row.recipient_name}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 max-w-[220px] truncate" title={row.subject || ''}>
                      {row.subject || '—'}
                    </td>
                    <td className="px-3 py-2 text-xs">{row.provider || '—'}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                          row.status === 'sent'
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : row.status === 'failed'
                              ? 'bg-rose-500/15 text-rose-300'
                              : 'bg-slate-500/20 text-slate-300'
                        }`}
                        title={row.error_message || undefined}
                      >
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
