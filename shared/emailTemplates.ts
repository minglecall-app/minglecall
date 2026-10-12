/**
 * Admin-editable email templates shared by Express + Vercel email senders.
 * Placeholders: {{name}}, {{otp}}, {{email}}, {{link}}
 */

export type EmailTemplateKey =
  | 'otp_register'
  | 'otp_signin'
  | 'password_reset'
  | 'account_create'
  | 'account_delete'
  | 'connection_test';

export type EmailTemplate = {
  subject: string;
  html: string;
};

export type EmailTemplatesMap = Record<EmailTemplateKey, EmailTemplate>;

export const EMAIL_TEMPLATE_KEYS: EmailTemplateKey[] = [
  'otp_register',
  'otp_signin',
  'password_reset',
  'account_create',
  'account_delete',
  'connection_test',
];

export const EMAIL_TEMPLATE_LABELS: Record<EmailTemplateKey, string> = {
  otp_register: 'Registration OTP (6-digit)',
  otp_signin: 'Sign-in OTP',
  password_reset: 'Password reset OTP',
  account_create: 'Account created (admin / agency)',
  account_delete: 'Account deleted notice',
  connection_test: 'Admin connection test',
};

const DEFAULT_OTP_HTML = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#0f172a;color:#f8fafc;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:540px;background:#1e293b;border-radius:16px;border:1px solid #334155;overflow:hidden;">
        <tr><td style="padding:28px 32px;text-align:center;background:linear-gradient(135deg,#e11d48,#be123c);">
          <h1 style="margin:0;color:#fff;font-size:24px;font-weight:800;">MingleCall</h1>
          <p style="margin:8px 0 0;color:#ffe4e6;font-size:13px;">Account Verification</p>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 16px;font-size:16px;color:#e2e8f0;">Hello <strong style="color:#fff;">{{name}}</strong>,</p>
          <p style="margin:0 0 24px;font-size:15px;color:#94a3b8;">Use your 6-digit verification code below:</p>
          <div style="background:#0f172a;border:2px dashed #f43f5e;border-radius:12px;padding:24px;text-align:center;margin:24px 0;">
            <div style="font-size:12px;letter-spacing:2px;color:#fb7185;font-weight:700;margin-bottom:8px;">YOUR 6-DIGIT OTP</div>
            <div style="font-size:36px;font-weight:800;letter-spacing:8px;color:#fff;font-family:monospace;">{{otp}}</div>
            <div style="font-size:12px;color:#64748b;margin-top:8px;">Valid for 10 minutes</div>
          </div>
          <div style="text-align:center;margin:24px 0 8px;">
            <a href="{{link}}" style="display:inline-block;background:#f43f5e;color:#fff;font-weight:600;font-size:14px;text-decoration:none;padding:12px 28px;border-radius:8px;">Confirm Email</a>
          </div>
          <p style="margin:24px 0 0;font-size:12px;color:#64748b;text-align:center;">If you did not request this, ignore this email.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

export const DEFAULT_EMAIL_TEMPLATES: EmailTemplatesMap = {
  otp_register: {
    subject: 'Your 6-Digit Verification Code: {{otp}} - MingleCall',
    html: DEFAULT_OTP_HTML,
  },
  otp_signin: {
    subject: 'Your sign-in code: {{otp}} - MingleCall',
    html: DEFAULT_OTP_HTML.replace('Account Verification', 'Sign-in Code'),
  },
  password_reset: {
    subject: 'Password reset code: {{otp}} - MingleCall',
    html: DEFAULT_OTP_HTML.replace('Account Verification', 'Password Reset').replace(
      'Use your 6-digit verification code below:',
      'Use this code to reset your password:'
    ),
  },
  account_create: {
    subject: 'Your MingleCall account is ready',
    html: `<p>Hello <strong>{{name}}</strong>,</p><p>Your account (<strong>{{email}}</strong>) was created. You can sign in with the password you were given.</p><p><a href="{{link}}">Open MingleCall</a></p>`,
  },
  account_delete: {
    subject: 'Your MingleCall account was deleted',
    html: `<p>Hello <strong>{{name}}</strong>,</p><p>Your account (<strong>{{email}}</strong>) has been permanently deleted.</p>`,
  },
  connection_test: {
    subject: 'MingleCall email connection test ({{otp}})',
    html: `<p>Hello <strong>{{name}}</strong>,</p><p>This is a connection test from the Admin Email tab.</p><p>Test code: <strong>{{otp}}</strong></p>`,
  },
};

export function parseEmailTemplatesJson(raw: unknown): EmailTemplatesMap {
  const base: EmailTemplatesMap = JSON.parse(JSON.stringify(DEFAULT_EMAIL_TEMPLATES));
  if (!raw || typeof raw !== 'string' || !raw.trim()) return base;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return base;
    for (const key of EMAIL_TEMPLATE_KEYS) {
      const row = (parsed as any)[key];
      if (row && typeof row === 'object') {
        if (typeof row.subject === 'string' && row.subject.trim()) base[key].subject = row.subject;
        if (typeof row.html === 'string' && row.html.trim()) base[key].html = row.html;
      }
    }
  } catch {
    // keep defaults
  }
  return base;
}

export function renderEmailTemplate(
  template: EmailTemplate,
  vars: { name?: string; otp?: string; email?: string; link?: string }
): EmailTemplate {
  const replace = (input: string) =>
    input
      .replace(/\{\{\s*name\s*\}\}/gi, vars.name || 'User')
      .replace(/\{\{\s*otp\s*\}\}/gi, vars.otp || '')
      .replace(/\{\{\s*email\s*\}\}/gi, vars.email || '')
      .replace(/\{\{\s*link\s*\}\}/gi, vars.link || '#');
  return {
    subject: replace(template.subject),
    html: replace(template.html),
  };
}
