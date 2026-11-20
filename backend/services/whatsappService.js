import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { normalizePhoneE164 } from '../utils/phone.js';

export function isWhatsAppConfigured() {
  return Boolean(env.whatsapp.accessToken && env.whatsapp.phoneNumberId);
}

export function getWhatsAppStatusSummary() {
  return {
    configured: isWhatsAppConfigured(),
    webhookVerifyConfigured: Boolean(env.whatsapp.verifyToken),
    webhookSignatureEnforced: Boolean(env.whatsapp.appSecret),
    authTemplateName: env.whatsapp.authTemplateName || 'biztrade_otp_verification',
    apiVersion: env.whatsapp.apiVersion || 'v21.0',
  };
}

export function verifyWhatsAppWebhookSignature(rawBody, signatureHeader) {
  if (!env.whatsapp.appSecret) {
    // Allow only in non-production if secret not configured; in production enforce secret
    return env.nodeEnv !== 'production';
  }
  const header = String(signatureHeader || '').trim();
  if (!header.startsWith('sha256=') || !rawBody) {
    return false;
  }
  const expected = `sha256=${crypto
    .createHmac('sha256', env.whatsapp.appSecret)
    .update(rawBody)
    .digest('hex')}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function isOptOutMessage(text = '') {
  const normalized = String(text || '')
    .trim()
    .toUpperCase()
    .replace(/[.!?]+$/, '');
  return ['STOP', 'STOP ALL', 'UNSUBSCRIBE', 'OPTOUT', 'OPT OUT', 'CANCEL'].includes(normalized);
}

export function isOptInMessage(text = '') {
  const normalized = String(text || '')
    .trim()
    .toUpperCase()
    .replace(/[.!?]+$/, '');
  return ['START', 'SUBSCRIBE', 'OPTIN', 'OPT IN', 'UNSTOP'].includes(normalized);
}

async function callWhatsAppGraph(payload) {
  const version = env.whatsapp.apiVersion || 'v21.0';
  const phoneNumberId = env.whatsapp.phoneNumberId;
  const url = `https://graph.facebook.com/${encodeURIComponent(version)}/${encodeURIComponent(phoneNumberId)}/messages`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.whatsapp.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(12_000),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const apiErr = data?.error || {};
    const errCode = String(apiErr.code || res.status);
    const noWhatsApp = errCode === '131026' || errCode === '131049' || errCode === '131030';
    return {
      delivered: false,
      errorCode: errCode,
      hasWhatsapp: errCode === '131026' ? 'no' : undefined,
      reason: noWhatsApp ? 'RECIPIENT_NOT_ON_WHATSAPP' : 'WHATSAPP_DELIVERY_FAILED',
      error: noWhatsApp
        ? 'This phone number does not appear to be registered on WhatsApp or cannot receive WhatsApp messages.'
        : apiErr.error_user_msg || apiErr.message || `WhatsApp Cloud API error (${res.status}).`,
    };
  }

  return {
    delivered: true,
    messageId: data?.messages?.[0]?.id || null,
    status: 'sent',
  };
}

export async function sendWhatsAppText({ to, body }) {
  const phoneCheck = normalizePhoneE164(to);
  if (!phoneCheck.valid) {
    return { delivered: false, reason: 'INVALID_PHONE_NUMBER', error: phoneCheck.error };
  }
  if (!isWhatsAppConfigured()) {
    return {
      delivered: false,
      reason: 'WHATSAPP_NOT_CONFIGURED',
      error: 'Official Meta WhatsApp Business API credentials are not configured.',
    };
  }
  try {
    return await callWhatsAppGraph({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phoneCheck.digits,
      type: 'text',
      text: {
        preview_url: false,
        body: String(body || '').slice(0, 4096),
      },
    });
  } catch (err) {
    return {
      delivered: false,
      reason: 'WHATSAPP_DELIVERY_FAILED',
      error:
        err?.name === 'TimeoutError'
          ? 'WhatsApp service took too long to respond. Please try again.'
          : err?.message || 'Unable to send WhatsApp message.',
    };
  }
}

export async function sendWhatsAppTemplate({
  to,
  templateName,
  languageCode = 'en',
  bodyParams = [],
  buttonUrlParam = '',
}) {
  const phoneCheck = normalizePhoneE164(to);
  if (!phoneCheck.valid) {
    return { delivered: false, reason: 'INVALID_PHONE_NUMBER', error: phoneCheck.error };
  }
  if (!isWhatsAppConfigured()) {
    return {
      delivered: false,
      reason: 'WHATSAPP_NOT_CONFIGURED',
      error: 'Official Meta WhatsApp Business API credentials are not configured.',
    };
  }

  const components = [];
  if (bodyParams.length > 0) {
    components.push({
      type: 'body',
      parameters: bodyParams.map((text) => ({ type: 'text', text: String(text) })),
    });
  }
  if (buttonUrlParam) {
    components.push({
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: String(buttonUrlParam) }],
    });
  }

  try {
    const result = await callWhatsAppGraph({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phoneCheck.digits,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(components.length ? { components } : {}),
      },
    });

    // If template doesn't expect a URL button param (error 132012 / 132000), retry body-only once
    if (!result.delivered && buttonUrlParam && (result.errorCode === '132012' || result.errorCode === '132000')) {
      return await callWhatsAppGraph({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phoneCheck.digits,
        type: 'template',
        template: {
          name: templateName,
          language: { code: languageCode },
          ...(bodyParams.length
            ? {
                components: [
                  {
                    type: 'body',
                    parameters: bodyParams.map((text) => ({ type: 'text', text: String(text) })),
                  },
                ],
              }
            : {}),
        },
      });
    }

    return result;
  } catch (err) {
    return {
      delivered: false,
      reason: 'WHATSAPP_DELIVERY_FAILED',
      error:
        err?.name === 'TimeoutError'
          ? 'WhatsApp service took too long to respond. Please try again.'
          : err?.message || 'Unable to send WhatsApp template.',
    };
  }
}

export async function sendWhatsAppOtp({ to, otpCode }) {
  return sendWhatsAppTemplate({
    to,
    templateName: env.whatsapp.authTemplateName || 'biztrade_otp_verification',
    languageCode: env.whatsapp.authTemplateLang || 'en',
    bodyParams: [otpCode],
    buttonUrlParam: otpCode,
  });
}
