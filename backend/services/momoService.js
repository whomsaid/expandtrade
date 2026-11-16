import crypto from 'node:crypto';
import { env } from '../config/env.js';

export function normalizeRwandaMsisdn(phone) {
  const digits = String(phone || '').replace(/[^\d]/g, '');
  if (!digits) return '';
  if (digits.startsWith('250') && digits.length === 12) return digits;
  if (digits.startsWith('07') && digits.length === 10) return `250${digits.slice(1)}`;
  if (digits.startsWith('7') && digits.length === 9) return `250${digits}`;
  return digits;
}

export function isValidMobileMoneyPhone(phone) {
  const clean = String(phone || '').trim();
  return /^\+?[0-9\s-]{9,18}$/.test(clean) && normalizeRwandaMsisdn(clean).length >= 10;
}

export function resolveProviderConfig(provider, businessAccount = null) {
  if (provider === 'airtel_money') {
    const clientId = String(businessAccount?.airtel_client_id || env.airtelMoney.clientId || '').trim();
    const clientSecret = String(businessAccount?.airtel_client_secret || env.airtelMoney.clientSecret || '').trim();
    const environment = String(businessAccount?.airtel_environment || env.airtelMoney.env || 'staging').trim();
    return {
      provider: 'airtel_money',
      configured: Boolean(clientId && clientSecret),
      baseUrl: env.airtelMoney.baseUrl,
      clientId,
      clientSecret,
      country: env.airtelMoney.country || 'RW',
      currency: env.airtelMoney.currency || 'RWF',
      environment,
      callbackUrl: env.airtelMoney.callbackUrl || '',
      webhookSecret: env.airtelMoney.webhookSecret || '',
    };
  }

  const subscriptionKey = String(businessAccount?.mtn_subscription_key || env.mtnMomo.subscriptionKey || '').trim();
  const apiUser = String(businessAccount?.mtn_api_user || env.mtnMomo.apiUser || '').trim();
  const apiKey = String(businessAccount?.mtn_api_key || env.mtnMomo.apiKey || '').trim();
  const targetEnv = String(businessAccount?.mtn_environment || env.mtnMomo.targetEnv || 'sandbox').trim();
  return {
    provider: 'mtn_momo',
    configured: Boolean(subscriptionKey && apiUser && apiKey),
    baseUrl: env.mtnMomo.baseUrl,
    subscriptionKey,
    apiUser,
    apiKey,
    targetEnv,
    callbackUrl: env.mtnMomo.callbackUrl || '',
    webhookSecret: env.mtnMomo.webhookSecret || '',
  };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { rawText: text };
    }
    return { ok: res.ok, status: res.status, data: json, rawText: text };
  } finally {
    clearTimeout(timer);
  }
}

async function getMtnAccessToken(cfg) {
  const basic = Buffer.from(`${cfg.apiUser}:${cfg.apiKey}`).toString('base64');
  const tokenRes = await fetchWithTimeout(`${cfg.baseUrl}/disbursement/token/`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Ocp-Apim-Subscription-Key': cfg.subscriptionKey,
    },
  });
  if (!tokenRes.ok || !tokenRes.data?.access_token) {
    throw new Error(
      tokenRes.data?.message || tokenRes.data?.error || `MTN MoMo OAuth token error (HTTP ${tokenRes.status})`
    );
  }
  return tokenRes.data.access_token;
}

async function getAirtelAccessToken(cfg) {
  const tokenRes = await fetchWithTimeout(`${cfg.baseUrl}/auth/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      grant_type: 'client_credentials',
    }),
  });
  if (!tokenRes.ok || !tokenRes.data?.access_token) {
    throw new Error(
      tokenRes.data?.message || tokenRes.data?.error_description || `Airtel Money OAuth token error (HTTP ${tokenRes.status})`
    );
  }
  return tokenRes.data.access_token;
}

/**
 * Initiates a real Mobile Money disbursement via MTN MoMo or Airtel Money.
 * NEVER fabricates a successful payment.
 * Transitions to 'processing' ONLY if the official provider API accepts the transfer request.
 */
export async function initiateMobileMoneyDisbursement({
  provider,
  businessAccount,
  referenceId,
  externalReference,
  amount,
  currencyCode = 'RWF',
  payeePhone,
  payeeName,
  note = 'Employee Salary Payment',
}) {
  const cfg = resolveProviderConfig(provider, businessAccount);
  const msisdn = normalizeRwandaMsisdn(payeePhone);
  if (!msisdn) {
    return {
      ok: false,
      configured: cfg.configured,
      status: 'failed',
      providerStatus: 'INVALID_PHONE',
      error: 'Employee mobile-money phone number is invalid.',
    };
  }

  if (!cfg.configured) {
    return {
      ok: false,
      configured: false,
      status: 'failed',
      providerStatus: 'PROVIDER_NOT_CONFIGURED',
      error:
        provider === 'airtel_money'
          ? 'Airtel Money Rwanda API credentials are not configured on the server or business payment account.'
          : 'MTN Mobile Money Rwanda API credentials are not configured on the server or business payment account.',
    };
  }

  try {
    if (provider === 'airtel_money') {
      const token = await getAirtelAccessToken(cfg);
      const payload = {
        payee: {
          msisdn: msisdn.startsWith('250') ? msisdn.slice(3) : msisdn,
          wallet_type: 'SALARY',
        },
        reference: externalReference,
        transaction: {
          amount: Number(amount),
          id: referenceId,
          type: 'B2C',
        },
      };
      const headers = {
        'Content-Type': 'application/json',
        Accept: '*/*',
        Authorization: `Bearer ${token}`,
        'X-Country': cfg.country,
        'X-Currency': currencyCode || cfg.currency,
      };
      const res = await fetchWithTimeout(`${cfg.baseUrl}/standard/v1/disbursements/`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      const txStatus = res.data?.data?.transaction?.status || res.data?.status?.code || '';
      const txId = res.data?.data?.transaction?.id || referenceId;
      if (!res.ok || res.data?.status?.success === false) {
        return {
          ok: false,
          configured: true,
          status: 'failed',
          providerStatus: String(txStatus || `HTTP_${res.status}`),
          providerTransactionId: txId,
          error: res.data?.status?.message || res.data?.message || `Airtel disbursement failed (HTTP ${res.status})`,
          raw: res.data,
        };
      }
      return {
        ok: true,
        configured: true,
        status: 'processing',
        providerStatus: String(txStatus || 'TIP'),
        providerTransactionId: txId,
        raw: res.data,
      };
    }

    // MTN Mobile Money Rwanda Disbursement Transfer
    const token = await getMtnAccessToken(cfg);
    const effectiveCurrency = cfg.targetEnv === 'sandbox' ? 'EUR' : currencyCode || 'RWF';
    const headers = {
      Authorization: `Bearer ${token}`,
      'X-Reference-Id': referenceId,
      'X-Target-Environment': cfg.targetEnv,
      'Ocp-Apim-Subscription-Key': cfg.subscriptionKey,
      'Content-Type': 'application/json',
    };
    if (cfg.callbackUrl) {
      headers['X-Callback-Url'] = cfg.callbackUrl;
    }

    const res = await fetchWithTimeout(`${cfg.baseUrl}/disbursement/v1_0/transfer`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        amount: String(Math.round(Number(amount))),
        currency: effectiveCurrency,
        externalId: externalReference,
        payee: {
          partyIdType: 'MSISDN',
          partyId: msisdn,
        },
        payerMessage: `BizTrade Africa Payroll - ${externalReference}`,
        payeeNote: `${note} (${payeeName})`.slice(0, 120),
      }),
    });

    if (!res.ok) {
      return {
        ok: false,
        configured: true,
        status: 'failed',
        providerStatus: `HTTP_${res.status}`,
        providerTransactionId: referenceId,
        error: res.data?.message || res.data?.code || `MTN MoMo rejected disbursement (HTTP ${res.status})`,
        raw: res.data,
      };
    }

    return {
      ok: true,
      configured: true,
      status: 'processing',
      providerStatus: 'PENDING',
      providerTransactionId: referenceId,
      raw: res.data || { accepted: true, status: res.status },
    };
  } catch (err) {
    return {
      ok: false,
      configured: true,
      status: 'failed',
      providerStatus: 'GATEWAY_ERROR',
      providerTransactionId: referenceId,
      error: err.name === 'AbortError' ? 'Mobile Money gateway timed out. Verify transaction status before retrying.' : err.message,
    };
  }
}

/**
 * Queries the real Mobile Money provider API to verify current transaction state.
 */
export async function queryMobileMoneyTransferStatus({ provider, businessAccount, referenceId }) {
  const cfg = resolveProviderConfig(provider, businessAccount);
  if (!cfg.configured) {
    return {
      ok: false,
      configured: false,
      status: 'failed',
      providerStatus: 'PROVIDER_NOT_CONFIGURED',
      error: 'Mobile Money API credentials are not configured.',
    };
  }

  try {
    if (provider === 'airtel_money') {
      const token = await getAirtelAccessToken(cfg);
      const res = await fetchWithTimeout(`${cfg.baseUrl}/standard/v1/disbursements/${encodeURIComponent(referenceId)}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Country': cfg.country,
          'X-Currency': cfg.currency,
        },
      });
      if (!res.ok) {
        return {
          ok: false,
          configured: true,
          status: 'processing',
          providerStatus: `HTTP_${res.status}`,
          error: res.data?.message || 'Unable to fetch Airtel transaction status',
          raw: res.data,
        };
      }
      const pStatus = String(res.data?.data?.transaction?.status || '').toUpperCase();
      let mapped = 'processing';
      if (pStatus === 'TS' || pStatus === 'SUCCESS' || pStatus === 'SUCCESSFUL') mapped = 'paid';
      else if (pStatus === 'TF' || pStatus === 'FAILED' || pStatus === 'REJECTED') mapped = 'failed';

      return {
        ok: true,
        configured: true,
        status: mapped,
        providerStatus: pStatus || 'UNKNOWN',
        error: mapped === 'failed' ? res.data?.data?.transaction?.message || res.data?.status?.message || 'Transfer failed at Airtel Money' : null,
        raw: res.data,
      };
    }

    const token = await getMtnAccessToken(cfg);
    const res = await fetchWithTimeout(`${cfg.baseUrl}/disbursement/v1_0/transfer/${encodeURIComponent(referenceId)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Target-Environment': cfg.targetEnv,
        'Ocp-Apim-Subscription-Key': cfg.subscriptionKey,
      },
    });
    if (!res.ok) {
      return {
        ok: false,
        configured: true,
        status: 'processing',
        providerStatus: `HTTP_${res.status}`,
        error: res.data?.message || 'Unable to verify MTN transfer status',
        raw: res.data,
      };
    }
    const pStatus = String(res.data?.status || '').toUpperCase();
    let mapped = 'processing';
    if (pStatus === 'SUCCESSFUL') mapped = 'paid';
    else if (pStatus === 'FAILED' || pStatus === 'REJECTED' || pStatus === 'TIMEOUT') mapped = 'failed';

    return {
      ok: true,
      configured: true,
      status: mapped,
      providerStatus: pStatus || 'PENDING',
      providerFinancialTxId: res.data?.financialTransactionId || null,
      error: mapped === 'failed' ? res.data?.reason || 'Transfer failed at MTN Mobile Money' : null,
      raw: res.data,
    };
  } catch (err) {
    return {
      ok: false,
      configured: true,
      status: 'processing',
      providerStatus: 'STATUS_CHECK_ERROR',
      error: err.message,
    };
  }
}

export function verifyWebhookSignature(provider, req) {
  const secret = provider === 'airtel_money' ? env.airtelMoney.webhookSecret : env.mtnMomo.webhookSecret;
  if (!secret) {
    // Allow callback only in non-production if explicit secret isn't set, otherwise enforce strict signature check
    return env.nodeEnv !== 'production';
  }
  const providedSecret = String(req.headers['x-callback-secret'] || req.headers['x-webhook-secret'] || '').trim();
  if (providedSecret && providedSecret.length === secret.length) {
    if (crypto.timingSafeEqual(Buffer.from(providedSecret), Buffer.from(secret))) {
      return true;
    }
  }
  const sig = String(req.headers['x-signature'] || req.headers['x-momo-signature'] || '').trim();
  if (sig) {
    const hmac = crypto.createHmac('sha256', secret).update(JSON.stringify(req.body || {})).digest('hex');
    if (sig.length === hmac.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(hmac))) {
      return true;
    }
  }
  return false;
}
