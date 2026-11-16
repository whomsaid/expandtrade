import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../services/api.js';
import { useAuth } from './AuthContext.jsx';

const ThemeContext = createContext(null);
const STORAGE_KEY = 'biztrade_theme';
const LEGACY_STORAGE_KEY = 'bizflow_theme';
const VALID_THEMES = ['light', 'dark', 'system'];

function normalizeTheme(val) {
  return VALID_THEMES.includes(val) ? val : 'system';
}

function getSystemIsDark() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function ThemeProvider({ children }) {
  const { user, token, updateUserFields } = useAuth();
  const [themePreference, setThemePreference] = useState(() =>
    normalizeTheme(
      typeof window !== 'undefined'
        ? localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY)
        : 'system'
    )
  );
  const [systemIsDark, setSystemIsDark] = useState(getSystemIsDark);
  const [savingTheme, setSavingTheme] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e) => setSystemIsDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Restore saved DB preference when authenticated user loads
  useEffect(() => {
    if (user?.theme_preference) {
      const dbPref = normalizeTheme(user.theme_preference);
      setThemePreference(dbPref);
      localStorage.setItem(STORAGE_KEY, dbPref);
    }
  }, [user?.id, user?.theme_preference]);

  const resolvedTheme = useMemo(() => {
    if (themePreference === 'dark') return 'dark';
    if (themePreference === 'light') return 'light';
    return systemIsDark ? 'dark' : 'light';
  }, [themePreference, systemIsDark]);

  useEffect(() => {
    const root = document.documentElement;
    const isDark = resolvedTheme === 'dark';
    root.classList.toggle('dark', isDark);
    root.dataset.theme = resolvedTheme;
  }, [resolvedTheme]);

  const setTheme = useCallback(
    async (nextTheme) => {
      const normalized = normalizeTheme(nextTheme);
      setThemePreference(normalized);
      localStorage.setItem(STORAGE_KEY, normalized);

      if (token && user) {
        updateUserFields?.({ theme_preference: normalized });
        setSavingTheme(true);
        try {
          await api.patch('/auth/theme', { theme_preference: normalized });
        } catch {
          // Keep applied theme in UI & localStorage even on transient failure
        } finally {
          setSavingTheme(false);
        }
      }
    },
    [token, user, updateUserFields]
  );

  return (
    <ThemeContext.Provider
      value={{
        themePreference,
        resolvedTheme,
        savingTheme,
        setTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
