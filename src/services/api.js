import axios from 'axios';
import i18n from '../i18n.js';

const workspaceContext = {
  token: '',
  businessId: '',
  branchId: '',
};

export function setApiWorkspaceContext({ token, businessId, branchId } = {}) {
  if (token !== undefined) {
    workspaceContext.token = token ? String(token) : '';
  }
  if (businessId !== undefined) {
    workspaceContext.businessId = businessId ? String(businessId) : '';
  }
  if (branchId !== undefined) {
    workspaceContext.branchId = branchId ? String(branchId) : '';
  }
}

export function clearApiWorkspaceContext() {
  workspaceContext.token = '';
  workspaceContext.businessId = '';
  workspaceContext.branchId = '';
}

export const api = axios.create({
  baseURL: '/api',
  timeout: 30_000,
  headers: {
    'Content-Type': 'application/json',
  },
});

const clientResponseCache = new Map();
const inFlightGets = new Map();
const clientTelemetry = {
  cacheHits: 0,
  cacheMisses: 0,
  dedupSaved: 0,
  networkRequests: 0,
  latenciesMs: [],
};

function recordClientLatency(ms) {
  if (!Number.isFinite(ms) || ms < 0) return;
  clientTelemetry.networkRequests += 1;
  clientTelemetry.latenciesMs.push(Math.round(ms * 100) / 100);
  if (clientTelemetry.latenciesMs.length > 100) {
    clientTelemetry.latenciesMs.shift();
  }
}

export function getClientTelemetry() {
  const arr = clientTelemetry.latenciesMs;
  const avgRoundTripMs = arr.length
    ? Math.round((arr.reduce((sum, v) => sum + v, 0) / arr.length) * 100) / 100
    : 0;
  const lastRoundTripMs = arr.length ? arr[arr.length - 1] : 0;
  const totalLookups = clientTelemetry.cacheHits + clientTelemetry.cacheMisses;
  const clientCacheHitPct = totalLookups > 0 ? Math.round((clientTelemetry.cacheHits / totalLookups) * 1000) / 10 : 0;
  return {
    cacheHits: clientTelemetry.cacheHits,
    cacheMisses: clientTelemetry.cacheMisses,
    dedupSaved: clientTelemetry.dedupSaved,
    clientCacheEntries: clientResponseCache.size,
    clientCacheHitPct,
    networkRequests: clientTelemetry.networkRequests,
    avgRoundTripMs,
    lastRoundTripMs,
  };
}

export function resetClientTelemetry() {
  clientTelemetry.cacheHits = 0;
  clientTelemetry.cacheMisses = 0;
  clientTelemetry.dedupSaved = 0;
  clientTelemetry.networkRequests = 0;
  clientTelemetry.latenciesMs = [];
}

export async function cachedGet(url, { params, ttlMs = 60000 } = {}) {
  const bizKey = workspaceContext.businessId || localStorage.getItem('biztrade_business_id') || '';
  const key = `${bizKey}:${url}:${params ? JSON.stringify(params) : ''}`;
  const existing = clientResponseCache.get(key);
  if (existing && existing.expiresAt > Date.now()) {
    clientTelemetry.cacheHits += 1;
    return existing.data;
  }
  if (inFlightGets.has(key)) {
    clientTelemetry.dedupSaved += 1;
    return inFlightGets.get(key);
  }
  clientTelemetry.cacheMisses += 1;
  const promise = api
    .get(url, params ? { params } : undefined)
    .then(({ data }) => {
      clientResponseCache.set(key, {
        expiresAt: Date.now() + ttlMs,
        data,
      });
      return data;
    })
    .finally(() => {
      inFlightGets.delete(key);
    });
  inFlightGets.set(key, promise);
  return promise;
}

export function invalidateApiCache(prefix = '') {
  if (!prefix) {
    clientResponseCache.clear();
    return;
  }
  for (const key of clientResponseCache.keys()) {
    if (key.includes(prefix)) {
      clientResponseCache.delete(key);
    }
  }
}

api.interceptors.request.use((config) => {
  config.headers = config.headers || {};
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    delete config.headers['Content-Type'];
    // Never enforce an arbitrary timeout on file or chunked video uploads
    config.timeout = 0;
  } else if (config.noTimeout) {
    config.timeout = 0;
  }

  const token =
    workspaceContext.token ||
    localStorage.getItem('biztrade_token') ||
    localStorage.getItem('bizflow_token');
  const businessId =
    config.headers['x-business-id'] ||
    workspaceContext.businessId ||
    localStorage.getItem('biztrade_business_id') ||
    localStorage.getItem('bizflow_business_id');
  const branchId =
    config.headers['x-branch-id'] ||
    workspaceContext.branchId ||
    localStorage.getItem('biztrade_branch_id') ||
    localStorage.getItem('bizflow_branch_id');

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (businessId) {
    config.headers['x-business-id'] = String(businessId);
  }
  if (branchId) {
    config.headers['x-branch-id'] = String(branchId);
  }
  config.headers['Accept-Language'] = i18n.language || 'en';
  config._startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return config;
});

function sanitizeFriendlyError(rawMessage, status, hasBackendMessage, { isTimeout, isNetwork }) {
  if (isTimeout) return i18n.t('common.requestTimeout');
  if (isNetwork) return i18n.t('common.networkError');

  const text = String(rawMessage || '').trim();
  const looksTechnical =
    !text ||
    /^Request failed with status code \d+/i.test(text) ||
    /(SQLITE_|ER_[A-Z0-9_]+|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|SyntaxError|TypeError|ReferenceError|SELECT\s+.*FROM|INSERT\s+INTO|UPDATE\s+.*SET)/i.test(text);

  if (looksTechnical || (status >= 500 && !hasBackendMessage)) {
    return i18n.t('common.serverErrorFriendly', {
      defaultValue: 'Something went wrong while processing your request. Please try again in a moment.',
    });
  }
  return text;
}

api.interceptors.response.use(
  (response) => {
    if (response?.config?._startTime && !String(response.config.url || '').includes('/admin/diagnostics/')) {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      recordClientLatency(now - response.config._startTime);
    }
    return response;
  },
  async (error) => {
    if (axios.isCancel(error) || error.code === 'ERR_CANCELED') {
      const canceled = new Error('Request cancelled');
      canceled.code = 'ERR_CANCELED';
      canceled.isCanceled = true;
      return Promise.reject(canceled);
    }

    const config = error.config || {};
    const status = error.response?.status;
    const url = config.url || '';
    const method = String(config.method || '').toLowerCase();
    const isTimeout =
      error.code === 'ECONNABORTED' ||
      error.code === 'ETIMEDOUT' ||
      (typeof error.message === 'string' && error.message.toLowerCase().includes('timeout'));
    const isNetwork = !error.response && !isTimeout;

    // Safe automatic single retry ONLY for idempotent GET requests that experienced transient failure
    if (
      method === 'get' &&
      !config._retried &&
      !config.skipRetry &&
      !config.signal?.aborted &&
      (isTimeout || isNetwork || status === 502 || status === 503)
    ) {
      config._retried = true;
      await new Promise((r) => setTimeout(r, 450));
      if (!config.signal?.aborted) {
        return api.request(config);
      }
    }

    if (status === 401 && !url.includes('/auth/login') && !url.includes('/auth/register') && !url.includes('/auth/reset-password') && !url.includes('/auth/registration/')) {
      clearApiWorkspaceContext();
      localStorage.removeItem('biztrade_token');
      localStorage.removeItem('biztrade_business_id');
      localStorage.removeItem('biztrade_branch_id');
      localStorage.removeItem('bizflow_token');
      localStorage.removeItem('bizflow_business_id');
      localStorage.removeItem('bizflow_branch_id');
      clientResponseCache.clear();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('biztrade:unauthorized'));
      }
    }

    const backendMsg = error.response?.data?.error;
    const message = sanitizeFriendlyError(backendMsg || error.message, status, Boolean(backendMsg), {
      isTimeout,
      isNetwork,
    });
    const err = new Error(message);
    err.status = status;
    err.code = error.response?.data?.code || error.code;
    err.data = error.response?.data || null;
    err.isTimeout = isTimeout;
    err.isNetwork = isNetwork;
    return Promise.reject(err);
  }
);
