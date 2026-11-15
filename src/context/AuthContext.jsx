import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { api } from '../services/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('bizflow_token') || '');
  const [user, setUser] = useState(null);
  const [memberships, setMemberships] = useState([]);
  const [activeBusinessId, setActiveBusinessId] = useState(() => {
    const saved = localStorage.getItem('bizflow_business_id');
    return saved ? Number(saved) : null;
  });
  const [activeBranchId, setActiveBranchId] = useState(() => {
    const saved = localStorage.getItem('bizflow_branch_id');
    return saved ? Number(saved) : null;
  });
  const [workspace, setWorkspace] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [language, setLanguage] = useState(() => localStorage.getItem('bizflow_lang') || 'en');
  const [socket, setSocket] = useState(null);
  const [loading, setLoading] = useState(Boolean(localStorage.getItem('bizflow_token')));
  const logoutPromiseRef = useRef(null);

  const loadWorkspace = useCallback(async (bizId, branchIdOverride = null) => {
    if (!bizId) {
      localStorage.removeItem('bizflow_business_id');
      localStorage.removeItem('bizflow_branch_id');
      setActiveBusinessId(null);
      setActiveBranchId(null);
      setWorkspace(null);
      return;
    }
    localStorage.setItem('bizflow_business_id', String(bizId));
    if (branchIdOverride) {
      localStorage.setItem('bizflow_branch_id', String(branchIdOverride));
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
      if (nextBranch) localStorage.setItem('bizflow_branch_id', String(nextBranch));
      if (data.settings?.language) {
        setLanguage(data.settings.language);
      }
    } catch {
      setWorkspace(null);
    }
  }, []);

  const refreshNotifications = useCallback(async () => {
    if (!localStorage.getItem('bizflow_token')) return;
    try {
      const { data } = await api.get('/notifications');
      setNotifications(data.notifications || []);
    } catch {
      // ignore silently
    }
  }, []);

  const refreshMe = useCallback(async () => {
    if (!localStorage.getItem('bizflow_token')) {
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get('/auth/me');
      setUser(data.user);
      setMemberships(data.memberships || []);
      if (data.user?.avatar_url && !data.user?.must_change_password) {
        const savedBiz = Number(localStorage.getItem('bizflow_business_id'));
        const matched = (data.memberships || []).find((m) => m.business_id === savedBiz);
        const targetBiz = matched ? matched.business_id : data.memberships?.[0]?.business_id || null;
        await loadWorkspace(targetBiz);
        await refreshNotifications();
      } else {
        setWorkspace(null);
        setNotifications([]);
      }
      return data;
    } catch {
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
  }, [loadWorkspace, refreshNotifications]);

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
    window.addEventListener('bizflow:unauthorized', onUnauthorized);
    return () => window.removeEventListener('bizflow:unauthorized', onUnauthorized);
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
    localStorage.setItem('bizflow_token', data.token);
    setToken(data.token);
    setUser(data.user);
    setMemberships(data.memberships || []);
    if (data.user?.avatar_url && !data.user?.must_change_password) {
      const firstBiz = data.memberships?.[0]?.business_id || null;
      await loadWorkspace(firstBiz);
      await refreshNotifications();
    } else {
      setWorkspace(null);
      setNotifications([]);
    }
    return data;
  };

  const completeSession = async (newToken, newUser, newMemberships = []) => {
    localStorage.setItem('bizflow_token', newToken);
    setToken(newToken);
    setUser(newUser);
    setMemberships(newMemberships);
    if (newUser?.avatar_url && !newUser?.must_change_password) {
      const firstBiz = newMemberships?.[0]?.business_id || null;
      await loadWorkspace(firstBiz);
      await refreshNotifications();
    }
  };

  const logout = async () => {
    if (logoutPromiseRef.current) {
      return logoutPromiseRef.current;
    }
    const run = (async () => {
      try {
        if (localStorage.getItem('bizflow_token')) {
          await api.post('/auth/logout');
        }
      } catch {
        // ignore network/session expiry errors during cleanup
      } finally {
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
    localStorage.removeItem('bizflow_branch_id');
    await loadWorkspace(Number(bizId));
  };

  const switchBranch = async (branchId) => {
    await loadWorkspace(activeBusinessId, Number(branchId));
  };

  const changeLanguage = (lang) => {
    setLanguage(lang);
    localStorage.setItem('bizflow_lang', lang);
  };

  const hasPermission = (permKey) => {
    if (!workspace?.membership) return false;
    if (['business_owner', 'business_admin'].includes(workspace.membership.role_code)) return true;
    return Boolean(workspace.permissions?.includes(permKey));
  };

  const updateUserFields = useCallback((fields) => {
    setUser((prev) => (prev ? { ...prev, ...fields } : prev));
  }, []);

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
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
