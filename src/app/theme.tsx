/**
 * Theme, motion and contrast preferences (Phase 3A).
 *
 * The palette is applied as `data-nova-theme` on <html>, which the inline boot
 * script in index.html sets before first paint. This provider is the single
 * writer afterwards, so React state and the DOM can never disagree.
 *
 * Storage is best-effort (private mode / blocked storage must not break the
 * app). Settings (Phase 3C) will persist the same keys to the user profile and
 * hydrate them here.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type ThemePreference = 'dark' | 'light' | 'system';
export type ResolvedTheme = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'nova_theme';
export const MOTION_STORAGE_KEY = 'nova_motion';
export const CONTRAST_STORAGE_KEY = 'nova_contrast';

const THEME_COLOR: Record<ResolvedTheme, string> = {
  dark: '#08090D',
  light: '#F7F8FB',
};

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* blocked storage — the preference still applies for this session */
  }
}

function systemPrefersLight(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: light)').matches;
}

function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === 'light') return 'light';
  if (preference === 'dark') return 'dark';
  return systemPrefersLight() ? 'light' : 'dark';
}

function initialPreference(): ThemePreference {
  const stored = readStored(THEME_STORAGE_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
}

interface ThemeContextValue {
  preference: ThemePreference;
  theme: ResolvedTheme;
  setPreference: (next: ThemePreference) => void;
  toggleTheme: () => void;
  reducedMotion: boolean;
  setReducedMotion: (next: boolean) => void;
  highContrast: boolean;
  setHighContrast: (next: boolean) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(initialPreference);
  const [theme, setTheme] = useState<ResolvedTheme>(() => resolveTheme(initialPreference()));
  const [reducedMotion, setReducedMotionState] = useState<boolean>(() => readStored(MOTION_STORAGE_KEY) === 'reduced');
  const [highContrast, setHighContrastState] = useState<boolean>(() => readStored(CONTRAST_STORAGE_KEY) === 'high');

  // Keep the resolved theme in sync with the OS while preference is "system".
  useEffect(() => {
    if (preference !== 'system' || typeof window === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => setTheme(query.matches ? 'light' : 'dark');
    onChange();
    if (query.addEventListener) query.addEventListener('change', onChange);
    else query.addListener(onChange);
    return () => {
      if (query.removeEventListener) query.removeEventListener('change', onChange);
      else query.removeListener(onChange);
    };
  }, [preference]);

  // Apply to the document.
  useEffect(() => {
    const resolved = resolveTheme(preference);
    setTheme(resolved);
    document.documentElement.setAttribute('data-nova-theme', resolved);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', THEME_COLOR[resolved]);
  }, [preference]);

  useEffect(() => {
    document.documentElement.setAttribute('data-nova-motion', reducedMotion ? 'reduced' : 'full');
  }, [reducedMotion]);

  useEffect(() => {
    document.documentElement.setAttribute('data-nova-contrast', highContrast ? 'high' : 'normal');
  }, [highContrast]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    writeStored(THEME_STORAGE_KEY, next);
  }, []);

  const toggleTheme = useCallback(() => {
    // A toggle always produces an explicit preference, never "system": asking
    // for the other palette means the other palette.
    const resolved = document.documentElement.getAttribute('data-nova-theme');
    setPreference(resolved === 'light' ? 'dark' : 'light');
  }, [setPreference]);

  const setReducedMotion = useCallback((next: boolean) => {
    setReducedMotionState(next);
    writeStored(MOTION_STORAGE_KEY, next ? 'reduced' : 'full');
  }, []);

  const setHighContrast = useCallback((next: boolean) => {
    setHighContrastState(next);
    writeStored(CONTRAST_STORAGE_KEY, next ? 'high' : 'normal');
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      preference,
      theme,
      setPreference,
      toggleTheme,
      reducedMotion,
      setReducedMotion,
      highContrast,
      setHighContrast,
    }),
    [preference, theme, setPreference, toggleTheme, reducedMotion, setReducedMotion, highContrast, setHighContrast],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    // Non-fatal fallback: render with the palette already on <html>.
    const fallbackTheme = (typeof document !== 'undefined'
      ? (document.documentElement.getAttribute('data-nova-theme') as ResolvedTheme | null)
      : null) || 'dark';
    return {
      preference: 'system',
      theme: fallbackTheme,
      setPreference: () => {},
      toggleTheme: () => {},
      reducedMotion: false,
      setReducedMotion: () => {},
      highContrast: false,
      setHighContrast: () => {},
    };
  }
  return context;
}
