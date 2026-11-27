import { afterEach, describe, expect, it } from '@jest/globals';
import {
  applyThemePreference,
  readThemePreference,
  THEME_STORAGE_KEY,
} from './theme-preference.js';

describe('per-device theme preference', () => {
  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('defaults to system and ignores values outside the three supported choices', () => {
    expect(readThemePreference()).toBe('system');
    localStorage.setItem(THEME_STORAGE_KEY, 'sepia');
    expect(readThemePreference()).toBe('system');
  });

  it.each(['dark', 'light', 'system'] as const)(
    'persists %s and applies it to the document',
    (preference) => {
      applyThemePreference(preference);

      expect(readThemePreference()).toBe(preference);
      if (preference === 'system') {
        expect(document.documentElement.getAttribute('data-theme')).toBeNull();
      } else {
        expect(document.documentElement.getAttribute('data-theme')).toBe(preference);
      }
    },
  );
});
