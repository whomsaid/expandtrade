import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

let transporter = null;

const PLACEHOLDER_PASSWORDS = new Set(['', 'your_app_password', 'your_smtp_password', 'changeme', 'password']);

function getTransporter() {
  const pass = String(env.smtp.pass || '').trim();
  if (!env.smtp.host || !env.smtp.user || !pass || PLACEHOLDER_PASSWORDS.has(pass)) {
    return null;
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      connectionTimeout: 4000,
      greetingTimeout: 4000,
      socketTimeout: 5000,
      auth: { user: env.smtp.user, pass },
    });
  }
  return transporter;
}

export async function sendMail({ to, subject, text, html, replyTo }) {
  const mailer = getTransporter();
  if (!mailer) {
    console.log(`[Mail Fallback] To: ${to}${replyTo ? ` | Reply-To: ${replyTo}` : ''} | Subject: ${subject} | Body: ${text}`);
    return { delivered: false, devLogged: true };
  }
  try {
    await mailer.sendMail({
      from: env.smtp.from,
      to,
      ...(replyTo ? { replyTo } : {}),
      subject,
      text,
      html,
    });
    return { delivered: true };
  } catch (err) {
    console.warn(`[Mail Fallback] SMTP delivery failed (${err.message}). Logging message instead.`);
    console.log(`[Mail Fallback] To: ${to}${replyTo ? ` | Reply-To: ${replyTo}` : ''} | Subject: ${subject} | Body: ${text}`);
    return { delivered: false, devLogged: true, error: err.message };
  }
}
