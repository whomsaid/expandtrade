import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, cachedGet, invalidateApiCache } from '../services/api.js';

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

const PlatformConfigContext = createContext({
  config: DEFAULT_CONFIG,
  loading: false,
  refreshPlatformConfig: async () => {},
});

export function PlatformConfigProvider({ children }) {
  const [config, setConfig] = useState(readStoredConfig);
  const [loading, setLoading] = useState(false);

  const refreshPlatformConfig = useCallback(async (force = false) => {
    try {
      if (force) invalidateApiCache('/public/platform-config');
      const data = await cachedGet('/public/platform-config', { ttlMs: 120_000 });
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

  return (
    <PlatformConfigContext.Provider value={{ config, loading, refreshPlatformConfig: () => refreshPlatformConfig(true) }}>
      {children}
    </PlatformConfigContext.Provider>
  );
}

export function usePlatformConfig() {
  return useContext(PlatformConfigContext);
}
