import axios from 'axios';

export const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  config.headers = config.headers || {};
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }

  const token = localStorage.getItem('bizflow_token');
  const businessId = localStorage.getItem('bizflow_business_id');
  const branchId = localStorage.getItem('bizflow_branch_id');

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (businessId) {
    config.headers['x-business-id'] = businessId;
  }
  if (branchId) {
    config.headers['x-branch-id'] = branchId;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const url = error.config?.url || '';
    if (status === 401 && !url.includes('/auth/login') && !url.includes('/auth/register') && !url.includes('/auth/reset-password')) {
      localStorage.removeItem('bizflow_token');
      localStorage.removeItem('bizflow_business_id');
      localStorage.removeItem('bizflow_branch_id');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('bizflow:unauthorized'));
      }
    }
    const message = error.response?.data?.error || error.message || 'Request failed';
    const err = new Error(message);
    err.status = status;
    err.code = error.response?.data?.code;
    return Promise.reject(err);
  }
);
