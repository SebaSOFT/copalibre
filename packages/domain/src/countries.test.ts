import { ISO_3166_ALPHA_2_CODES, isValidCountryCode } from './countries.js';

describe('ISO_3166_ALPHA_2_CODES', () => {
  it('carries only uppercase two-letter codes, each once', () => {
    for (const code of ISO_3166_ALPHA_2_CODES) {
      expect(code).toMatch(/^[A-Z]{2}$/);
    }
    expect(new Set(ISO_3166_ALPHA_2_CODES).size).toBe(ISO_3166_ALPHA_2_CODES.length);
  });

  it('includes well-known codes', () => {
    expect(ISO_3166_ALPHA_2_CODES).toEqual(
      expect.arrayContaining(['AR', 'BR', 'US', 'GB', 'DE', 'ES', 'FR', 'JP', 'CN']),
    );
  });
});

describe('isValidCountryCode', () => {
  it('accepts a real code', () => {
    expect(isValidCountryCode('AR')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isValidCountryCode('ar')).toBe(true);
  });

  it('refuses an unassigned or malformed code', () => {
    expect(isValidCountryCode('ZZ')).toBe(false);
    expect(isValidCountryCode('USA')).toBe(false);
    expect(isValidCountryCode('')).toBe(false);
  });
});
