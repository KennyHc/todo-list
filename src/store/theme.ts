import { create } from 'zustand';

export type ThemePref = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const KEY = 'theme';
/** Mirrors --bg for each theme, for the browser/PWA chrome. */
const THEME_COLOR: Record<ResolvedTheme, string> = { light: '#F7F8FA', dark: '#0B0D12' };

const isPref = (v: unknown): v is ThemePref => v === 'system' || v === 'light' || v === 'dark';

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return isPref(v) ? v : 'system';
  } catch {
    return 'system';
  }
}

const media = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

export const resolveTheme = (pref: ThemePref): ResolvedTheme =>
  pref === 'system' ? (media()?.matches ? 'dark' : 'light') : pref;

function apply(pref: ThemePref) {
  const theme = resolveTheme(pref);
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
}

type ThemeState = { pref: ThemePref; setPref: (pref: ThemePref) => void };

export const useThemeStore = create<ThemeState>()((set) => ({
  pref: readPref(),
  setPref: (pref) => {
    try {
      localStorage.setItem(KEY, pref);
    } catch {
      /* storage unavailable: the choice just won't persist */
    }
    set({ pref });
    apply(pref);
  },
}));

/** Apply the stored preference and keep 'system' in sync with the OS. Call once at startup. */
export function initTheme() {
  apply(useThemeStore.getState().pref);
  media()?.addEventListener('change', () => {
    if (useThemeStore.getState().pref === 'system') apply('system');
  });
}
