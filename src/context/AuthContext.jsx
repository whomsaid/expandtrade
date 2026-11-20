import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import i18n, { normalizeLanguage } from '../i18n.js';
import {
  api,
  clearApiWorkspaceContext,
  invalidateApiCache,
  setApiWorkspaceContext,
} from '../services/api.js';

const AuthContext = createContext(null);

function resolveTargetBusinessId(membershipsList = [], preferredId = null) {
  if (!Array.isArray(membershipsList) || membershipsList.length === 0) return null;
  const saved = Number(
    preferredId ||
      localStorage.getItem('biztrade_business_id') ||
      localStorage.getItem('bizflow_business_id') ||
      0
  );
  const matched = membershipsList.find((m) => Number(m.business_id) === saved);
  return Number((matched || membershipsList[0]).business_id) || null;
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => {
    const t = localStorage.getItem('biztrade_token') || localStorage.getItem('bizflow_token') || '';
    if (t) setApiWorkspaceContext({ token: t });
    return t;
  });
  const [user, setUser] = useState(null);
  const [memberships, setMemberships] = useState([]);
  const [activeBusinessId, setActiveBusinessId] = useState(() => {
    const saved = localStorage.getItem('biztrade_business_id') || localStorage.getItem('bizflow_business_id');
    const id = saved ? Number(saved) : null;
    if (id) setApiWorkspaceContext({ businessId: id });
    return id;
  });
  const [activeBranchId, setActiveBranchId] = useState(() => {
    const saved = localStorage.getItem('biztrade_branch_id') || localStorage.getItem('bizflow_branch_id');
    const id = saved ? Number(saved) : null;
    if (id) setApiWorkspaceContext({ branchId: id });
    return id;
  });
  const [workspace, setWorkspace] = useState(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [sessions, setSessions] = useState([]);
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

  const syncWorkspaceIds = useCallback((bizId, branchId = null) => {
    const numericBiz = bizId ? Number(bizId) : null;
    const numericBranch = branchId ? Number(branchId) : null;

    if (!numericBiz) {
      localStorage.removeItem('biztrade_business_id');
      localStorage.removeItem('biztrade_branch_id');
      localStorage.removeItem('bizflow_business_id');
      localStorage.removeItem('bizflow_branch_id');
      setApiWorkspaceContext({ businessId: '', branchId: '' });
      setActiveBusinessId(null);
      setActiveBranchId(null);
      return;
    }

    localStorage.setItem('biztrade_business_id', String(numericBiz));
    setApiWorkspaceContext({ businessId: numericBiz });
    setActiveBusinessId(numericBiz);

    if (numericBranch) {
      localStorage.setItem('biztrade_branch_id', String(numericBranch));
      setApiWorkspaceContext({ branchId: numericBranch });
      setActiveBranchId(numericBranch);
    } else if (branchId === null) {
      localStorage.removeItem('biztrade_branch_id');
      localStorage.removeItem('bizflow_branch_id');
      setApiWorkspaceContext({ branchId: '' });
      setActiveBranchId(null);
    }
  }, []);

  const loadWorkspace = useCallback(
    async (bizId, branchIdOverride = null) => {
      if (!bizId) {
        syncWorkspaceIds(null, null);
        setWorkspace(null);
        return null;
      }

      const numericBiz = Number(bizId);
      const numericBranch = branchIdOverride ? Number(branchIdOverride) : null;
      // Set business header synchronously BEFORE firing any workspace requests
      syncWorkspaceIds(numericBiz, numericBranch || undefined);
      setWorkspaceLoading(true);
      try {
        const { data } = await api.get('/businesses/current', {
          headers: {
            'x-business-id': String(numericBiz),
            ...(numericBranch ? { 'x-branch-id': String(numericBranch) } : {}),
          },
        });
        setWorkspace(data);
        const resolvedBizId = Number(data?.business?.id || numericBiz);
        const resolvedBranch = Number(data?.activeBranchId || data?.branches?.[0]?.id || numericBranch || 0) || null;
        syncWorkspaceIds(resolvedBizId, resolvedBranch);
        return data;
      } catch {
        // Keep activeBusinessId intact if user has a valid assigned membership so subsequent retries keep x-business-id
        setWorkspace(null);
        return null;
      } finally {
        setWorkspaceLoading(false);
      }
    },
    [syncWorkspaceIds]
  );

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
      clearApiWorkspaceContext();
      setLoading(false);
      return null;
    }
    localStorage.setItem('biztrade_token', activeToken);
    setApiWorkspaceContext({ token: activeToken });
    try {
      const { data } = await api.get('/auth/me');
      const membershipsList = data.memberships || [];
      setUser(data.user);
      setSessions(data.sessions || []);
      if (data.user?.preferred_language) {
        applyLanguageLocally(data.user.preferred_language);
      }
      setMemberships(membershipsList);

      if (!data.user?.must_change_password) {
        const targetBiz = resolveTargetBusinessId(membershipsList);
        if (targetBiz) {
          syncWorkspaceIds(targetBiz, undefined);
        }
        setLoading(false);
        await Promise.all([loadWorkspace(targetBiz), refreshNotifications()]);
      } else {
        syncWorkspaceIds(null, null);
        setWorkspace(null);
        setNotifications([]);
        setLoading(false);
      }
      return data;
    } catch {
      clearApiWorkspaceContext();
      localStorage.removeItem('biztrade_token');
      localStorage.removeItem('biztrade_business_id');
      localStorage.removeItem('biztrade_branch_id');
      localStorage.removeItem('bizflow_token');
      localStorage.removeItem('bizflow_business_id');
      localStorage.removeItem('bizflow_branch_id');
      setToken('');
      setUser(null);
      setSessions([]);
      setMemberships([]);
      setActiveBusinessId(null);
      setActiveBranchId(null);
      setWorkspace(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, [applyLanguageLocally, loadWorkspace, refreshNotifications, syncWorkspaceIds]);

  useEffect(() => {
    refreshMe();
  }, [refreshMe]);

  useEffect(() => {
    const onUnauthorized = () => {
      clearApiWorkspaceContext();
      setToken('');
      setUser(null);
      setSessions([]);
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
    setApiWorkspaceContext({ token: data.token });
    setToken(data.token);
    setUser(data.user);
    if (data.user?.preferred_language) {
      applyLanguageLocally(data.user.preferred_language);
    }
    const membershipsList = data.memberships || [];
    setMemberships(membershipsList);
    invalidateApiCache();

    if (!data.user?.must_change_password) {
      const targetBiz = resolveTargetBusinessId(membershipsList);
      if (targetBiz) {
        syncWorkspaceIds(targetBiz, undefined);
        await loadWorkspace(targetBiz);
      } else {
        syncWorkspaceIds(null, null);
        setWorkspace(null);
      }
      refreshNotifications();
    } else {
      syncWorkspaceIds(null, null);
      setWorkspace(null);
      setNotifications([]);
    }
    return data;
  };

  const completeSession = async (newToken, newUser, newMemberships = []) => {
    localStorage.setItem('biztrade_token', newToken);
    setApiWorkspaceContext({ token: newToken });
    setToken(newToken);
    setUser(newUser);
    if (newUser?.preferred_language) {
      applyLanguageLocally(newUser.preferred_language);
    }
    setMemberships(newMemberships);
    invalidateApiCache();

    if (!newUser?.must_change_password) {
      const targetBiz = resolveTargetBusinessId(newMemberships);
      if (targetBiz) {
        syncWorkspaceIds(targetBiz, undefined);
        await loadWorkspace(targetBiz);
      } else {
        syncWorkspaceIds(null, null);
        setWorkspace(null);
      }
      refreshNotifications();
    } else {
      syncWorkspaceIds(null, null);
      setWorkspace(null);
    }
  };

  const logout = async () => {
    if (logoutPromiseRef.current) {
      return logoutPromiseRef.current;
    }
    const activeToken =
      token || localStorage.getItem('biztrade_token') || localStorage.getItem('bizflow_token') || '';

    // Clear client workspace, storage, cache, and socket synchronously for instant logout UX
    clearApiWorkspaceContext();
    invalidateApiCache();
    localStorage.removeItem('biztrade_token');
    localStorage.removeItem('biztrade_business_id');
    localStorage.removeItem('biztrade_branch_id');
    localStorage.removeItem('bizflow_token');
    localStorage.removeItem('bizflow_business_id');
    localStorage.removeItem('bizflow_branch_id');
    if (socket) {
      socket.disconnect();
      setSocket(null);
    }
    setToken('');
    setUser(null);
    setSessions([]);
    setMemberships([]);
    setActiveBusinessId(null);
    setActiveBranchId(null);
    setWorkspace(null);
    setNotifications([]);

    if (!activeToken) return Promise.resolve();

    const revokePromise = fetch('/api/auth/logout', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${activeToken}`,
        'Content-Type': 'application/json',
      },
      keepalive: true,
    })
      .catch(() => {})
      .finally(() => {
        logoutPromiseRef.current = null;
      });
    logoutPromiseRef.current = revokePromise;
    return Promise.resolve();
  };

  const switchBusiness = async (bizId) => {
    const numericBiz = Number(bizId);
    if (!numericBiz) return;
    invalidateApiCache();
    localStorage.removeItem('biztrade_branch_id');
    localStorage.removeItem('bizflow_branch_id');
    await loadWorkspace(numericBiz, null);
  };

  const switchBranch = async (branchId) => {
    invalidateApiCache();
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
        sessions,
        memberships,
        activeBusinessId,
        activeBranchId,
        workspace,
        workspaceLoading,
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
