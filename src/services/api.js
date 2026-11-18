import axios from 'axios';
import i18n from '../i18n.js';

export const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

const clientResponseCache = new Map();

export async function cachedGet(url, { params, ttlMs = 60000 } = {}) {
  const key = `${url}:${params ? JSON.stringify(params) : ''}`;
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
    if (key.startsWith(prefix)) {
      clientResponseCache.delete(key);
    }
  }
}

api.interceptors.request.use((config) => {
  config.headers = config.headers || {};
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }

  const token = localStorage.getItem('biztrade_token') || localStorage.getItem('bizflow_token');
  const businessId = localStorage.getItem('biztrade_business_id') || localStorage.getItem('bizflow_business_id');
  const branchId = localStorage.getItem('biztrade_branch_id') || localStorage.getItem('bizflow_branch_id');

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (businessId) {
    config.headers['x-business-id'] = businessId;
  }
  if (branchId) {
    config.headers['x-branch-id'] = branchId;
  }
  config.headers['Accept-Language'] = i18n.language || 'en';
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const url = error.config?.url || '';
    if (status === 401 && !url.includes('/auth/login') && !url.includes('/auth/register') && !url.includes('/auth/reset-password')) {
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
    const isTimeout = error.code === 'ECONNABORTED';
    const message =
      error.response?.data?.error ||
      (isTimeout ? i18n.t('common.requestTimeout') : error.message) ||
      i18n.t('common.requestFailed');
    const err = new Error(message);
    err.status = status;
    err.code = error.response?.data?.code || error.code;
    return Promise.reject(err);
  }
);
