import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../services/api.js';

const DEFAULT_CONFIG = {
  platform_name: 'BizFlow Africa',
  platform_logo_url: '',
  support_email: 'support@bizflow.africa',
  support_phone: '',
  platform_location: 'KN 4 Ave, Kigali, Rwanda',
  social_facebook_url: '',
  social_instagram_url: '',
  social_x_url: '',
  social_linkedin_url: '',
  developer_name: '',
  developer_role: 'Full Stack Developer',
  developer_bio: '',
  developer_email: '',
  developer_portfolio_url: '',
  developer_github_url: '',
  developer_linkedin_url: '',
};

const PlatformConfigContext = createContext({
  config: DEFAULT_CONFIG,
  loading: true,
  refreshPlatformConfig: async () => {},
});

export function PlatformConfigProvider({ children }) {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);

  const refreshPlatformConfig = useCallback(async () => {
    try {
      const res = await api.get('/public/platform-config');
      if (res.data?.config) {
        setConfig({ ...DEFAULT_CONFIG, ...res.data.config });
      }
    } catch {
      // Keep safe defaults if config request fails transiently
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshPlatformConfig();
  }, [refreshPlatformConfig]);

  return (
    <PlatformConfigContext.Provider value={{ config, loading, refreshPlatformConfig }}>
      {children}
    </PlatformConfigContext.Provider>
  );
}

export function usePlatformConfig() {
  return useContext(PlatformConfigContext);
}
