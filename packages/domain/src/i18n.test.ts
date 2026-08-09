import { isSupportedLanguage, SUPPORTED_LANGUAGES } from './i18n.js';

describe('isSupportedLanguage (0051)', () => {
  it.each(SUPPORTED_LANGUAGES)('accepts the supported code "%s"', (code) => {
    expect(isSupportedLanguage(code)).toBe(true);
  });

  it('rejects a display label instead of a code', () => {
    expect(isSupportedLanguage('Español')).toBe(false);
  });

  it('rejects an unsupported language code', () => {
    expect(isSupportedLanguage('ja')).toBe(false);
  });

  it('rejects non-string values', () => {
    expect(isSupportedLanguage(undefined)).toBe(false);
    expect(isSupportedLanguage(null)).toBe(false);
    expect(isSupportedLanguage(42)).toBe(false);
  });
});
