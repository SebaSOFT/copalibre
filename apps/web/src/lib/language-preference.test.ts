import { resolveLanguage } from './language-preference.js';

describe('resolveLanguage (0051)', () => {
  it('prefers an explicit stored preference over everything else', () => {
    expect(
      resolveLanguage({
        storedPreference: 'fr',
        organizationPrimaryLanguage: 'de',
        browserLanguages: ['ru'],
      }),
    ).toBe('fr');
  });

  it("ignores a stored preference that isn't one of the supported codes", () => {
    expect(
      resolveLanguage({
        storedPreference: 'ja',
        organizationPrimaryLanguage: 'de',
        browserLanguages: [],
      }),
    ).toBe('de');
  });

  it('uses the organization primary language when no preference is stored', () => {
    expect(
      resolveLanguage({
        storedPreference: null,
        organizationPrimaryLanguage: 'it',
        browserLanguages: ['ru'],
      }),
    ).toBe('it');
  });

  it('uses the best browser-language match off any organization scope', () => {
    expect(
      resolveLanguage({
        storedPreference: null,
        browserLanguages: ['ja', 'pt-BR', 'en-US'],
      }),
    ).toBe('pt');
  });

  it('falls back to English when nothing else matches', () => {
    expect(
      resolveLanguage({
        storedPreference: null,
        browserLanguages: ['ja', 'ko'],
      }),
    ).toBe('en');
  });

  it('falls back to English with no organization scope and no browser languages at all', () => {
    expect(resolveLanguage({ storedPreference: null, browserLanguages: [] })).toBe('en');
  });
});
