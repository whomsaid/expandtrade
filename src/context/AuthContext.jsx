import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import i18n, { normalizeLanguage } from '../i18n.js';
import { api } from '../services/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('biztrade_token') || localStorage.getItem('bizflow_token') || '');
  const [user, setUser] = useState(null);
  const [memberships, setMemberships] = useState([]);
  const [activeBusinessId, setActiveBusinessId] = useState(() => {
    const saved = localStorage.getItem('biztrade_business_id') || localStorage.getItem('bizflow_business_id');
    return saved ? Number(saved) : null;
  });
  const [activeBranchId, setActiveBranchId] = useState(() => {
    const saved = localStorage.getItem('biztrade_branch_id') || localStorage.getItem('bizflow_branch_id');
    return saved ? Number(saved) : null;
  });
  const [workspace, setWorkspace] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [language, setLanguage] = useState(() =>
    normalizeLanguage(localStorage.getItem('biztrade_lang') || localStorage.getItem('bizflow_lang') || i18n.language || 'en')
  );
  const [socket, setSocket] = useState(null);
  const [loading, setLoading] = useState(Boolean(localStorage.getItem('biztrade_token') || localStorage.getItem('bizflow_token')));
  const logoutPromiseRef = useRef(null);

  const applyLanguageLocally = useCallback((lang) => {
    const next = normalizeLanguage(lang);
    setLanguage(next);
    localStorage.setItem('biztrade_lang', next);
    if (i18n.language !== next) {
      i18n.changeLanguage(next);
    }
    if (typeof document !== 'undefined') {
      document.documentElement.lang = next;
    }
    return next;
  }, []);

  const loadWorkspace = useCallback(async (bizId, branchIdOverride = null) => {
    if (!bizId) {
      localStorage.removeItem('biztrade_business_id');
      localStorage.removeItem('biztrade_branch_id');
      localStorage.removeItem('bizflow_business_id');
      localStorage.removeItem('bizflow_branch_id');
      setActiveBusinessId(null);
      setActiveBranchId(null);
      setWorkspace(null);
      return;
    }
    localStorage.setItem('biztrade_business_id', String(bizId));
    if (branchIdOverride) {
      localStorage.setItem('biztrade_branch_id', String(branchIdOverride));
    }
    try {
      const { data } = await api.get('/businesses/current', {
        headers: {
          'x-business-id': String(bizId),
          ...(branchIdOverride ? { 'x-branch-id': String(branchIdOverride) } : {}),
        },
      });
      setWorkspace(data);
      setActiveBusinessId(bizId);
      const nextBranch = data.activeBranchId || data.branches?.[0]?.id || null;
      setActiveBranchId(nextBranch);
      if (nextBranch) localStorage.setItem('biztrade_branch_id', String(nextBranch));
    } catch {
      setWorkspace(null);
    }
  }, []);

  const refreshNotifications = useCallback(async () => {
    if (!(localStorage.getItem('biztrade_token') || localStorage.getItem('bizflow_token'))) return;
    try {
      const { data } = await api.get('/notifications');
      setNotifications(data.notifications || []);
    } catch {
      // ignore silently
    }
  }, []);

  const refreshMe = useCallback(async () => {
    const activeToken = localStorage.getItem('biztrade_token') || localStorage.getItem('bizflow_token');
    if (!activeToken) {
      setLoading(false);
      return;
    }
    localStorage.setItem('biztrade_token', activeToken);
    try {
      const { data } = await api.get('/auth/me');
      setUser(data.user);
      if (data.user?.preferred_language) {
        applyLanguageLocally(data.user.preferred_language);
      }
      setMemberships(data.memberships || []);
      setLoading(false);
      if (!data.user?.must_change_password) {
        const savedBiz = Number(localStorage.getItem('biztrade_business_id') || localStorage.getItem('bizflow_business_id'));
        const matched = (data.memberships || []).find((m) => m.business_id === savedBiz);
        const targetBiz = matched ? matched.business_id : data.memberships?.[0]?.business_id || null;
        await Promise.all([loadWorkspace(targetBiz), refreshNotifications()]);
      } else {
        setWorkspace(null);
        setNotifications([]);
      }
      return data;
    } catch {
      localStorage.removeItem('biztrade_token');
      localStorage.removeItem('biztrade_business_id');
      localStorage.removeItem('biztrade_branch_id');
      localStorage.removeItem('bizflow_token');
      localStorage.removeItem('bizflow_business_id');
      localStorage.removeItem('bizflow_branch_id');
      setToken('');
      setUser(null);
      setMemberships([]);
      setWorkspace(null);
    } finally {
      setLoading(false);
    }
  }, [applyLanguageLocally, loadWorkspace, refreshNotifications]);

  useEffect(() => {
    refreshMe();
  }, [refreshMe]);

  useEffect(() => {
    const onUnauthorized = () => {
      setToken('');
      setUser(null);
      setMemberships([]);
      setActiveBusinessId(null);
      setActiveBranchId(null);
      setWorkspace(null);
      setNotifications([]);
    };
    window.addEventListener('biztrade:unauthorized', onUnauthorized);
    return () => window.removeEventListener('biztrade:unauthorized', onUnauthorized);
  }, []);

  useEffect(() => {
    if (!token) {
      if (socket) socket.disconnect();
      setSocket(null);
      return;
    }
    const client = io({
      auth: { token },
      transports: ['websocket', 'polling'],
    });
    client.on('notification:new', (notif) => {
      setNotifications((prev) => [notif, ...prev]);
    });
    setSocket(client);
    return () => {
      client.disconnect();
    };
  }, [token]);

  useEffect(() => {
    if (socket && activeBusinessId) {
      socket.emit('business:join', activeBusinessId);
    }
  }, [socket, activeBusinessId]);

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('biztrade_token', data.token);
    setToken(data.token);
    setUser(data.user);
    if (data.user?.preferred_language) {
      applyLanguageLocally(data.user.preferred_language);
    }
    setMemberships(data.memberships || []);
    if (!data.user?.must_change_password) {
      const firstBiz = data.memberships?.[0]?.business_id || null;
      await Promise.all([loadWorkspace(firstBiz), refreshNotifications()]);
    } else {
      setWorkspace(null);
      setNotifications([]);
    }
    return data;
  };

  const completeSession = async (newToken, newUser, newMemberships = []) => {
    localStorage.setItem('biztrade_token', newToken);
    setToken(newToken);
    setUser(newUser);
    if (newUser?.preferred_language) {
      applyLanguageLocally(newUser.preferred_language);
    }
    setMemberships(newMemberships);
    if (!newUser?.must_change_password) {
      const firstBiz = newMemberships?.[0]?.business_id || null;
      await Promise.all([loadWorkspace(firstBiz), refreshNotifications()]);
    }
  };

  const logout = async () => {
    if (logoutPromiseRef.current) {
      return logoutPromiseRef.current;
    }
    const run = (async () => {
      try {
        if (localStorage.getItem('biztrade_token') || localStorage.getItem('bizflow_token')) {
          await api.post('/auth/logout');
        }
      } catch {
        // ignore network/session expiry errors during cleanup
      } finally {
        localStorage.removeItem('biztrade_token');
        localStorage.removeItem('biztrade_business_id');
        localStorage.removeItem('biztrade_branch_id');
        localStorage.removeItem('bizflow_token');
        localStorage.removeItem('bizflow_business_id');
        localStorage.removeItem('bizflow_branch_id');
        setToken('');
        setUser(null);
        setMemberships([]);
        setActiveBusinessId(null);
        setActiveBranchId(null);
        setWorkspace(null);
        setNotifications([]);
        logoutPromiseRef.current = null;
      }
    })();
    logoutPromiseRef.current = run;
    return run;
  };

  const switchBusiness = async (bizId) => {
    localStorage.removeItem('biztrade_branch_id');
    localStorage.removeItem('bizflow_branch_id');
    await loadWorkspace(Number(bizId));
  };

  const switchBranch = async (branchId) => {
    await loadWorkspace(activeBusinessId, Number(branchId));
  };

  const changeLanguage = useCallback(
    async (lang) => {
      const next = applyLanguageLocally(lang);
      const activeToken = localStorage.getItem('biztrade_token') || localStorage.getItem('bizflow_token');
      if (activeToken) {
        setUser((prev) => (prev ? { ...prev, preferred_language: next } : prev));
        try {
          await api.patch('/auth/language', { preferred_language: next });
        } catch {
          // ignore network error; local selection remains active
        }
      }
      return next;
    },
    [applyLanguageLocally]
  );

  const hasPermission = (permKey) => {
    if (user?.is_platform_admin) return true;
    if (!workspace?.membership) return false;
    if (['business_owner', 'business_admin'].includes(workspace.membership.role_code)) return true;
    return Boolean(workspace.permissions?.includes(permKey));
  };

  const updateUserFields = useCallback((fields) => {
    setUser((prev) => (prev ? { ...prev, ...fields } : prev));
  }, []);

  const savePreferences = useCallback(
    async (patch) => {
      const { data } = await api.put('/auth/preferences', patch);
      if (data?.user) {
        setUser(data.user);
        if (data.user.preferred_language) {
          applyLanguageLocally(data.user.preferred_language);
        }
      } else if (data?.dashboard_preferences) {
        setUser((prev) => (prev ? { ...prev, dashboard_preferences: data.dashboard_preferences } : prev));
      }
      return data;
    },
    [applyLanguageLocally]
  );

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        memberships,
        activeBusinessId,
        activeBranchId,
        workspace,
        notifications,
        language,
        socket,
        loading,
        login,
        logout,
        completeSession,
        refreshMe,
        refreshNotifications,
        loadWorkspace,
        switchBusiness,
        switchBranch,
        changeLanguage,
        hasPermission,
        updateUserFields,
        savePreferences,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
