import { isLocalizedLabel, resolveLabel } from './i18n-label.js';

describe('resolveLabel', () => {
  it('treats a plain string as English-only for every requested language', () => {
    expect(resolveLabel('Goal', 'en')).toBe('Goal');
    expect(resolveLabel('Goal', 'es')).toBe('Goal');
    expect(resolveLabel('Goal', 'zh')).toBe('Goal');
  });

  it('returns the requested language when present', () => {
    const label = { en: 'Goal', es: 'Gol' };
    expect(resolveLabel(label, 'es')).toBe('Gol');
    expect(resolveLabel(label, 'en')).toBe('Goal');
  });

  it('falls back to English when the requested language is missing', () => {
    const label = { en: 'Goal', es: 'Gol' };
    expect(resolveLabel(label, 'fr')).toBe('Goal');
    expect(resolveLabel(label, 'zh')).toBe('Goal');
  });
});

describe('isLocalizedLabel', () => {
  it('accepts an object with a required en key and other supported languages', () => {
    expect(isLocalizedLabel({ en: 'Goal', es: 'Gol' })).toBe(true);
    expect(isLocalizedLabel({ en: 'Goal' })).toBe(true);
  });

  it('refuses an object missing en', () => {
    expect(isLocalizedLabel({ es: 'Gol' })).toBe(false);
  });

  it('refuses an object with an unsupported language key', () => {
    expect(isLocalizedLabel({ en: 'Goal', xx: 'Nope' })).toBe(false);
  });

  it('refuses a plain string, an array, and null', () => {
    expect(isLocalizedLabel('Goal')).toBe(false);
    expect(isLocalizedLabel(['Goal'])).toBe(false);
    expect(isLocalizedLabel(null)).toBe(false);
  });
});
