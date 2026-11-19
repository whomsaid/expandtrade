import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

let cachedTransporter = null;
let cachedConfigKey = '';

const PLACEHOLDER_VALUES = new Set([
  '',
  'your_app_password',
  'your_smtp_password',
  'changeme',
  'password',
  'my_smtp_password',
  'replace_me',
]);

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function isSmtpConfigured() {
  const host = String(env.smtp.host || '').trim();
  const user = String(env.smtp.user || '').trim();
  const pass = String(env.smtp.pass || '').trim();
  return Boolean(host && user && pass && !PLACEHOLDER_VALUES.has(pass.toLowerCase()));
}

function getTransporter() {
  if (!isSmtpConfigured()) {
    return null;
  }

  const host = String(env.smtp.host || '').trim();
  const port = Number(env.smtp.port || 587);
  const secure = Boolean(env.smtp.secure || port === 465);
  const user = String(env.smtp.user || '').trim();
  const pass = String(env.smtp.pass || '').trim();
  const configKey = `${host}:${port}:${secure}:${user}`;

  if (!cachedTransporter || cachedConfigKey !== configKey) {
    cachedTransporter = nodemailer.createTransport({
      host,
      port,
      secure,
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 12000,
      tls: {
        rejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== 'false',
      },
      auth: { user, pass },
    });
    cachedConfigKey = configKey;
  }

  return cachedTransporter;
}

export function resetMailTransporter() {
  if (cachedTransporter && typeof cachedTransporter.close === 'function') {
    try {
      cachedTransporter.close();
    } catch {
      // ignore pool close errors
    }
  }
  cachedTransporter = null;
  cachedConfigKey = '';
}

export async function verifySmtpConnection() {
  const configured = isSmtpConfigured();
  if (!configured) {
    return {
      configured: false,
      verified: false,
      provider: env.smtp.provider || 'smtp',
      host: env.smtp.host || null,
      port: Number(env.smtp.port || 587),
      from: env.smtp.from,
      error: 'SMTP credentials are not configured in backend environment variables (SMTP_HOST, SMTP_USER, SMTP_PASS).',
    };
  }

  const mailer = getTransporter();
  try {
    await mailer.verify();
    return {
      configured: true,
      verified: true,
      provider: env.smtp.provider || 'smtp',
      host: env.smtp.host,
      port: Number(env.smtp.port || 587),
      from: env.smtp.from,
    };
  } catch (err) {
    return {
      configured: true,
      verified: false,
      provider: env.smtp.provider || 'smtp',
      host: env.smtp.host,
      port: Number(env.smtp.port || 587),
      from: env.smtp.from,
      error: err.message,
    };
  }
}

export function renderEmailLayout({ title, preheader = '', bodyHtml, footerNote = '' }) {
  const safeTitle = escapeHtml(title);
  const safePreheader = escapeHtml(preheader);
  const safeFooter = escapeHtml(
    footerNote || 'BizTrade Africa · Multi-Tenant Business & Commercial Platform'
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle}</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  ${safePreheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${safePreheader}</div>` : ''}
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f1f5f9;padding:28px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:580px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="background-color:#0B192C;padding:22px 28px;border-bottom:3px solid #0284C7;">
              <div style="font-size:18px;font-weight:700;letter-spacing:-0.01em;color:#ffffff;">BizTrade Africa</div>
              <div style="font-size:12px;color:#94a3b8;margin-top:4px;">Commercial Operations &amp; Account Security</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <h1 style="margin:0 0 14px 0;font-size:20px;line-height:1.3;font-weight:700;color:#0B192C;">${safeTitle}</h1>
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px;background-color:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.5;color:#64748b;">
              ${safeFooter}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildOtpVerificationEmail({ fullName = '', otpCode, expiresMinutes = 10, purposeLabel = 'email verification' }) {
  const greeting = fullName ? `Hello ${escapeHtml(fullName)},` : 'Hello,';
  const safeOtp = escapeHtml(otpCode);
  const safePurpose = escapeHtml(purposeLabel);
  const subject = `BizTrade Africa Verification Code: ${otpCode}`;

  const text = [
    fullName ? `Hello ${fullName},` : 'Hello,',
    '',
    `Your BizTrade Africa one-time code for ${purposeLabel} is: ${otpCode}`,
    `This code expires in ${expiresMinutes} minutes and can only be used once.`,
    'If you did not request this code, please ignore this email.',
  ].join('\n');

  const html = renderEmailLayout({
    title: 'Verify Your Email Address',
    preheader: `Your BizTrade Africa verification code is ${otpCode}`,
    bodyHtml: `
      <p style="margin:0 0 14px 0;font-size:14px;line-height:1.6;color:#334155;">${greeting}</p>
      <p style="margin:0 0 18px 0;font-size:14px;line-height:1.6;color:#334155;">
        Use the single-use verification code below to complete your ${safePurpose} on BizTrade Africa:
      </p>
      <div style="margin:20px 0;padding:18px 20px;background-color:#f8fafc;border:1px solid #cbd5e1;border-radius:10px;text-align:center;">
        <div style="font-size:32px;font-weight:800;letter-spacing:0.22em;font-family:'Courier New',Courier,monospace;color:#0B192C;">${safeOtp}</div>
      </div>
      <p style="margin:0 0 10px 0;font-size:13px;line-height:1.6;color:#475569;">
        This code expires in <strong>${Number(expiresMinutes)} minutes</strong> and will be invalidated immediately once verified or superseded.
      </p>
      <p style="margin:0;font-size:12px;line-height:1.6;color:#64748b;">
        If you did not initiate this request, you can safely disregard this message.
      </p>
    `,
  });

  return { subject, text, html };
}

export function buildPasswordResetEmail({ fullName = '', resetToken, expiresMinutes = 60 }) {
  const greeting = fullName ? `Hello ${escapeHtml(fullName)},` : 'Hello,';
  const safeToken = escapeHtml(resetToken);
  const resetUrl = `${String(env.appUrl || '').replace(/\/+$/, '')}/forgot-password`;
  const subject = 'BizTrade Africa Password Recovery';

  const text = [
    fullName ? `Hello ${fullName},` : 'Hello,',
    '',
    `Use this recovery token on ${resetUrl} to reset your password:`,
    resetToken,
    '',
    `This token expires in ${expiresMinutes} minutes and can only be used once.`,
  ].join('\n');

  const html = renderEmailLayout({
    title: 'Password Recovery Request',
    preheader: 'Use your single-use recovery token to set a new BizTrade Africa password.',
    bodyHtml: `
      <p style="margin:0 0 14px 0;font-size:14px;line-height:1.6;color:#334155;">${greeting}</p>
      <p style="margin:0 0 16px 0;font-size:14px;line-height:1.6;color:#334155;">
        We received a request to reset your BizTrade Africa account password. Copy the single-use recovery token below and enter it on the password recovery screen:
      </p>
      <div style="margin:18px 0;padding:14px 16px;background-color:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;font-family:'Courier New',Courier,monospace;font-size:13px;word-break:break-all;color:#0B192C;">
        ${safeToken}
      </div>
      <p style="margin:0 0 10px 0;font-size:13px;line-height:1.6;color:#475569;">
        For security, all previous sessions are revoked once your password is reset. This token expires in <strong>${Number(expiresMinutes)} minutes</strong>.
      </p>
    `,
  });

  return { subject, text, html };
}

export function buildInvitationEmail({ fullName = '', businessName, roleName, activationPath, isBusinessAdmin = false }) {
  const greeting = fullName ? `Hello ${escapeHtml(fullName)},` : 'Hello,';
  const fullUrl = `${String(env.appUrl || '').replace(/\/+$/, '')}${activationPath}`;
  const safeBiz = escapeHtml(businessName);
  const safeRole = escapeHtml(roleName);
  const safeUrl = escapeHtml(fullUrl);
  const subject = isBusinessAdmin
    ? `Business Admin assignment for ${businessName} — BizTrade Africa`
    : `Invitation to join ${businessName} on BizTrade Africa`;

  const text = `${fullName ? `Hello ${fullName}, ` : ''}you have been assigned as ${roleName} for ${businessName}. Open ${fullUrl} to set your password and activate your workspace account. For security, passwords are never sent via email.`;

  const html = renderEmailLayout({
    title: isBusinessAdmin ? 'Business Admin Workspace Invitation' : 'Team Workspace Invitation',
    preheader: `Activate your ${roleName} access for ${businessName} on BizTrade Africa.`,
    bodyHtml: `
      <p style="margin:0 0 14px 0;font-size:14px;line-height:1.6;color:#334155;">${greeting}</p>
      <p style="margin:0 0 16px 0;font-size:14px;line-height:1.6;color:#334155;">
        You have been invited to join <strong>${safeBiz}</strong> with the role <strong>${safeRole}</strong> on BizTrade Africa.
      </p>
      <p style="margin:22px 0;">
        <a href="${safeUrl}" style="display:inline-block;padding:12px 22px;background-color:#0B192C;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;border-radius:8px;">
          Activate Account &amp; Set Password
        </a>
      </p>
      <p style="margin:0 0 8px 0;font-size:12px;line-height:1.6;color:#64748b;">
        Or paste this secure activation link in your browser:
      </p>
      <p style="margin:0;font-size:12px;word-break:break-all;color:#0284C7;">${safeUrl}</p>
    `,
  });

  return { subject, text, html };
}

export function buildNotificationEmail({ title, message, replyNote = '' }) {
  const safeTitle = escapeHtml(title);
  const safeMsg = escapeHtml(message).replace(/\n/g, '<br/>');
  const safeReply = replyNote ? `<p style="margin:14px 0 0 0;font-size:12px;color:#64748b;">${escapeHtml(replyNote)}</p>` : '';
  return renderEmailLayout({
    title: safeTitle,
    preheader: title,
    bodyHtml: `
      <div style="font-size:14px;line-height:1.6;color:#334155;">${safeMsg}</div>
      ${safeReply}
    `,
  });
}

export async function sendMail({ to, subject, text, html, replyTo }) {
  if (!to || !subject) {
    return { delivered: false, reason: 'INVALID_PARAMETERS', error: 'Recipient and subject are required.' };
  }

  const mailer = getTransporter();
  if (!mailer) {
    console.warn(`[Mail] Delivery skipped for ${to}: SMTP server not configured in environment variables.`);
    return {
      delivered: false,
      reason: 'SMTP_NOT_CONFIGURED',
      error: 'Email server is not configured. Configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM in backend environment.',
    };
  }

  try {
    const info = await mailer.sendMail({
      from: env.smtp.from,
      to,
      ...(replyTo ? { replyTo } : {}),
      subject,
      text,
      html: html || buildNotificationEmail({ title: subject, message: text || '' }),
    });

    const accepted = Array.isArray(info?.accepted) ? info.accepted : [];
    const delivered = accepted.length > 0;
    if (!delivered) {
      console.warn(`[Mail] SMTP server did not accept recipient ${to}:`, info?.rejected);
      return {
        delivered: false,
        reason: 'SMTP_REJECTED',
        error: 'Email recipient was rejected by the SMTP server.',
        rejected: info?.rejected || [],
      };
    }

    return {
      delivered: true,
      messageId: info.messageId || null,
      accepted,
    };
  } catch (err) {
    console.error(`[Mail] SMTP delivery error for ${to}:`, err.message);
    return {
      delivered: false,
      reason: 'SMTP_SEND_FAILED',
      error: err.message,
    };
  }
}
