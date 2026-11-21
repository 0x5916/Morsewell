import { UI_STORAGE_KEYS } from '#lib/storageKeys.ts';

export type Theme = 'auto' | 'light' | 'dark';
export type Palette = 'neutral' | 'warm' | 'cool';

export const themePreference = $state<{ value: Theme; palette: Palette }>({
  value: 'auto',
  palette: 'neutral'
});

function readPreference(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storePreference(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // The choice still applies to this page when storage is unavailable.
  }
}

export function readStoredTheme(): Theme {
  const value = readPreference(UI_STORAGE_KEYS.theme);
  return value === 'light' || value === 'dark' ? value : 'auto';
}

export function readStoredPalette(): Palette {
  const value = readPreference(UI_STORAGE_KEYS.palette);
  return value === 'warm' || value === 'cool' ? value : 'neutral';
}

function applyTheme(theme: Theme): void {
  themePreference.value = theme;
  if (theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

function applyPalette(palette: Palette): void {
  themePreference.palette = palette;
  if (palette === 'neutral') delete document.documentElement.dataset.palette;
  else document.documentElement.dataset.palette = palette;
}

export function restoreAppearance(): void {
  if (typeof document === 'undefined') return;
  applyTheme(readStoredTheme());
  applyPalette(readStoredPalette());
}

export function setTheme(theme: Theme): void {
  if (typeof window === 'undefined') return;
  storePreference(UI_STORAGE_KEYS.theme, theme);
  applyTheme(theme);
}

export function setPalette(palette: Palette): void {
  if (typeof window === 'undefined') return;
  storePreference(UI_STORAGE_KEYS.palette, palette);
  applyPalette(palette);
}
