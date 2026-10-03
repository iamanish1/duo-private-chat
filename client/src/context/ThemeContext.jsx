import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'duo-theme';
const ThemeContext = createContext(null);
const THEME_COLORS = { light: '#f6f1ec', dark: '#131010' };

function readPreference() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return ['light', 'dark', 'system'].includes(value) ? value : 'system';
  } catch {
    return 'system';
  }
}

export function ThemeProvider({ children }) {
  const [preference, setPreference] = useState(readPreference);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e) => setSystemDark(e.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const resolved = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', resolved === 'dark');
    root.style.colorScheme = resolved;
    // A single explicit theme-color so the browser chrome follows the app, not the OS.
    document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
      meta.setAttribute('content', THEME_COLORS[resolved]);
    });
  }, [resolved]);

  const value = useMemo(
    () => ({
      preference,
      resolved,
      setPreference: (next) => {
        setPreference(next);
        try {
          localStorage.setItem(STORAGE_KEY, next);
        } catch {
          // Preference still applies for this session.
        }
      },
    }),
    [preference, resolved],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
