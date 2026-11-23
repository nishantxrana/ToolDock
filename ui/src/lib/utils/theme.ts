import { useSyncExternalStore } from 'react';

/** What the user picked. "system" follows the OS and is stored as the absence of a value. */
export type ThemePreference = 'light' | 'dark' | 'system';
/** What is actually on screen. */
export type ResolvedTheme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'tooldock-theme';
const THEME_COLOR: Record<ResolvedTheme, string> = { light: '#f3f4f6', dark: '#111216' };
const media = () => window.matchMedia('(prefers-color-scheme: dark)');

function readStored(): ThemePreference {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

let preference: ThemePreference = typeof window === 'undefined' ? 'system' : readStored();
const listeners = new Set<() => void>();

export function resolveTheme(pref: ThemePreference = preference): ResolvedTheme {
  if (pref !== 'system') return pref;
  return media().matches ? 'dark' : 'light';
}

function paint() {
  const resolved = resolveTheme();
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', THEME_COLOR[resolved]);
  listeners.forEach((l) => l());
}

/** UI preference only (not a credential), so it is fine to persist. */
export function setThemePreference(next: ThemePreference): void {
  preference = next;
  try {
    if (next === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // storage blocked - the choice still applies for this tab
  }
  paint();
}

/** Call once before React mounts. Index.html has already set the class to avoid a flash. */
export function initTheme(): void {
  paint();
  media().addEventListener('change', () => {
    if (preference === 'system') paint();
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** React binding: current preference + resolved theme, re-rendering on change. */
export function useTheme() {
  const pref = useSyncExternalStore(subscribe, () => preference);
  const resolved = useSyncExternalStore(subscribe, () => resolveTheme());
  return { preference: pref, resolved, setPreference: setThemePreference };
}
