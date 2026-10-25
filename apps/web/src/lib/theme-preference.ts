export const THEME_STORAGE_KEY = 'cl-theme';

export type ThemePreference = 'dark' | 'light' | 'system';

export function isThemePreference(value: string | null | undefined): value is ThemePreference {
  return value === 'dark' || value === 'light' || value === 'system';
}

export function readThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

export function applyThemePreference(preference: ThemePreference): void {
  if (typeof document !== 'undefined') {
    if (preference === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', preference);
  }

  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // The current page still follows the choice when storage is unavailable.
  }
}
