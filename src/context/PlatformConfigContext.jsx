import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { cachedGet, invalidateApiCache } from '../services/api.js';

const DEFAULT_FEATURE_FLAGS = {
  pos_enabled: true,
  marketplace_orders_enabled: true,
  jobs_portal_enabled: true,
  ai_assistant_enabled: true,
  video_ads_enabled: true,
  customer_registration_enabled: true,
  beta_analytics_enabled: false,
};

const DEFAULT_CONFIG = {
  platform_name: 'BizTrade Africa',
  platform_logo_url: '',
  support_email: 'allofme140@gmail.com',
  support_phone: '',
  platform_location: 'KN 4 Ave, Kigali, Rwanda',
  social_facebook_url: '',
  social_instagram_url: '',
  social_x_url: '',
  social_linkedin_url: '',
  developer_name: 'Xavine Hakim',
  developer_role: 'Full Stack Developer',
  developer_bio: '',
  developer_email: 'allofme140@gmail.com',
  developer_portfolio_url: 'https://xavineanoited.vercel.app/',
  developer_github_url: '',
  developer_linkedin_url: '',
  default_currency: 'RWF',
  default_tax_rate: '18',
  allow_customer_reviews: '1',
  require_email_verification: '1',
  development_mode: '0',
  development_banner_message: '',
  feature_flags_json: JSON.stringify(DEFAULT_FEATURE_FLAGS),
  development_last_confirmed_at: '',
  maintenance_mode: '0',
  maintenance_message: '',
  allow_business_onboarding: '1',
  allow_customer_registration: '1',
};

const STORAGE_KEY = 'biztrade_platform_config_v1';

function readStoredConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

function parseFeatureFlags(raw) {
  if (!raw) return { ...DEFAULT_FEATURE_FLAGS };
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return { ...DEFAULT_FEATURE_FLAGS, ...(parsed && typeof parsed === 'object' ? parsed : {}) };
  } catch {
    return { ...DEFAULT_FEATURE_FLAGS };
  }
}

const PlatformConfigContext = createContext({
  config: DEFAULT_CONFIG,
  featureFlags: DEFAULT_FEATURE_FLAGS,
  isDevelopmentMode: false,
  isMaintenanceMode: false,
  loading: false,
  refreshPlatformConfig: async () => {},
});

export function PlatformConfigProvider({ children }) {
  const [config, setConfig] = useState(readStoredConfig);
  const [loading, setLoading] = useState(false);

  const refreshPlatformConfig = useCallback(async (force = false) => {
    try {
      if (force) invalidateApiCache('/public/platform-config');
      const data = await cachedGet('/public/platform-config', { ttlMs: 30_000 });
      if (data?.config) {
        const merged = { ...DEFAULT_CONFIG, ...data.config };
        setConfig(merged);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        } catch {
          // ignore storage quota errors
        }
      }
    } catch {
      // Keep cached/default config if network request fails transiently
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshPlatformConfig();
  }, [refreshPlatformConfig]);

  const featureFlags = useMemo(() => parseFeatureFlags(config.feature_flags_json), [config.feature_flags_json]);
  const isDevelopmentMode = String(config.development_mode) === '1';
  const isMaintenanceMode = String(config.maintenance_mode) === '1';

  return (
    <PlatformConfigContext.Provider
      value={{
        config,
        featureFlags,
        isDevelopmentMode,
        isMaintenanceMode,
        loading,
        refreshPlatformConfig: () => refreshPlatformConfig(true),
      }}
    >
      {children}
    </PlatformConfigContext.Provider>
  );
}

export function usePlatformConfig() {
  return useContext(PlatformConfigContext);
}
