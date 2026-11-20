import { env } from '../config/env.js';
import { normalizePhoneE164 } from '../utils/phone.js';

function resolveSmsProvider() {
  const configured = (env.sms.provider || '').toLowerCase();
  const hasTwilio = Boolean(
    env.sms.twilioAccountSid && env.sms.twilioAuthToken && env.sms.twilioFromNumber
  );
  const hasAt = Boolean(env.sms.atApiKey && env.sms.atUsername);

  if (configured === 'twilio') return { provider: 'twilio', configured: hasTwilio };
  if (configured === 'africastalking' || configured === 'at') {
    return { provider: 'africastalking', configured: hasAt };
  }
  if (hasTwilio) return { provider: 'twilio', configured: true };
  if (hasAt) return { provider: 'africastalking', configured: true };
  return { provider: configured || 'unconfigured', configured: false };
}

export function isSmsConfigured() {
  return resolveSmsProvider().configured;
}

export function getSmsProviderStatus() {
  const { provider, configured } = resolveSmsProvider();
  return { provider, configured };
}

async function sendViaTwilio(toE164, message) {
  const sid = env.sms.twilioAccountSid;
  const token = env.sms.twilioAuthToken;
  const from = env.sms.twilioFromNumber;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`;

  const body = new URLSearchParams({
    To: toE164,
    From: from,
    Body: message,
  });

  const auth = Buffer.from(`${sid}:${token}`).toString('base64');
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
    signal: AbortSignal.timeout(12_000),
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      delivered: false,
      provider: 'twilio',
      reason: 'SMS_DELIVERY_FAILED',
      error: payload?.message || `Twilio rejected SMS request (${res.status}).`,
    };
  }

  return {
    delivered: true,
    provider: 'twilio',
    messageId: payload?.sid || null,
    status: payload?.status || 'queued',
  };
}

async function sendViaAfricasTalking(toE164, message) {
  const isSandbox = env.sms.atEnv === 'sandbox' || env.sms.atUsername === 'sandbox';
  const baseUrl = isSandbox
    ? 'https://api.sandbox.africastalking.com/version1/messaging'
    : 'https://api.africastalking.com/version1/messaging';

  const params = new URLSearchParams({
    username: env.sms.atUsername,
    to: toE164,
    message,
  });
  if (env.sms.atSenderId) {
    params.set('from', env.sms.atSenderId);
  }

  const res = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      apiKey: env.sms.atApiKey,
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
    signal: AbortSignal.timeout(12_000),
  });

  const payload = await res.json().catch(() => ({}));
  const recipient = payload?.SMSMessageData?.Recipients?.[0];
  const statusCode = Number(recipient?.statusCode || 0);
  if (!res.ok || (recipient && statusCode !== 100 && statusCode !== 101 && statusCode !== 102)) {
    return {
      delivered: false,
      provider: 'africastalking',
      reason: 'SMS_DELIVERY_FAILED',
      error:
        recipient?.status ||
        payload?.SMSMessageData?.Message ||
        `Africa's Talking SMS delivery failed (${res.status}).`,
    };
  }

  return {
    delivered: true,
    provider: 'africastalking',
    messageId: recipient?.messageId || null,
    status: recipient?.status || 'Sent',
  };
}

export async function sendSms({ to, message }) {
  const phoneCheck = normalizePhoneE164(to);
  if (!phoneCheck.valid) {
    return {
      delivered: false,
      reason: 'INVALID_PHONE_NUMBER',
      error: phoneCheck.error,
    };
  }

  const { provider, configured } = resolveSmsProvider();
  if (!configured) {
    return {
      delivered: false,
      provider,
      reason: 'SMS_NOT_CONFIGURED',
      error:
        'SMS delivery is not currently available because no SMS provider credentials (Twilio or Africa\'s Talking) are configured.',
    };
  }

  try {
    if (provider === 'twilio') {
      return await sendViaTwilio(phoneCheck.e164, message);
    }
    if (provider === 'africastalking') {
      return await sendViaAfricasTalking(phoneCheck.e164, message);
    }
    return {
      delivered: false,
      provider,
      reason: 'SMS_NOT_CONFIGURED',
      error: 'Unsupported SMS provider configured.',
    };
  } catch (err) {
    return {
      delivered: false,
      provider,
      reason: 'SMS_DELIVERY_FAILED',
      error: err?.name === 'TimeoutError'
        ? 'The SMS provider took too long to respond. Please try again or use another verification method.'
        : err?.message || 'Unable to send SMS message.',
    };
  }
}

export async function sendSmsOtp({ to, otpCode, expiresMinutes = 5 }) {
  const message = `BizTrade Africa verification code: ${otpCode}. Expires in ${expiresMinutes} minutes. Do not share this code with anyone.`;
  return sendSms({ to, message });
}
