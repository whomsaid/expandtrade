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

export async function cachedGet(url, { params, ttlMs = 60000 } = {}) {
  const bizKey = workspaceContext.businessId || localStorage.getItem('biztrade_business_id') || '';
  const key = `${bizKey}:${url}:${params ? JSON.stringify(params) : ''}`;
  const existing = clientResponseCache.get(key);
  if (existing && existing.expiresAt > Date.now()) {
    return existing.data;
  }
  const { data } = await api.get(url, params ? { params } : undefined);
  clientResponseCache.set(key, {
    expiresAt: Date.now() + ttlMs,
    data,
  });
  return data;
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
  return config;
});

api.interceptors.response.use(
  (response) => response,
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

    if (status === 401 && !url.includes('/auth/login') && !url.includes('/auth/register') && !url.includes('/auth/reset-password')) {
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

    const message =
      error.response?.data?.error ||
      (isTimeout ? i18n.t('common.requestTimeout') : isNetwork ? i18n.t('common.networkError') : error.message) ||
      i18n.t('common.requestFailed');
    const err = new Error(message);
    err.status = status;
    err.code = error.response?.data?.code || error.code;
    err.isTimeout = isTimeout;
    err.isNetwork = isNetwork;
    return Promise.reject(err);
  }
);
