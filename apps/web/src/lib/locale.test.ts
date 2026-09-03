import { getLocalePrefix, getLocaleHomePath, resolvePathLocale } from './locale.js';

describe('locale helpers', () => {
  describe('getLocalePrefix', () => {
    it('returns empty string for primary English locale', () => {
      expect(getLocalePrefix('en')).toBe('');
      expect(getLocalePrefix('')).toBe('');
    });

    it('returns slash-prefixed locale for non-primary locales', () => {
      expect(getLocalePrefix('es')).toBe('/es');
      expect(getLocalePrefix('fr')).toBe('/fr');
      expect(getLocalePrefix('pt')).toBe('/pt');
      expect(getLocalePrefix('it')).toBe('/it');
      expect(getLocalePrefix('de')).toBe('/de');
      expect(getLocalePrefix('ru')).toBe('/ru');
      expect(getLocalePrefix('zh')).toBe('/zh');
    });
  });

  describe('getLocaleHomePath', () => {
    it('returns root slash for primary English locale', () => {
      expect(getLocaleHomePath('en')).toBe('/');
    });

    it('returns prefixed root slash for non-primary locales', () => {
      expect(getLocaleHomePath('es')).toBe('/es/');
      expect(getLocaleHomePath('fr')).toBe('/fr/');
      expect(getLocaleHomePath('de')).toBe('/de/');
    });
  });

  describe('resolvePathLocale', () => {
    it('resolves Spanish locale from prefixed path', () => {
      expect(resolvePathLocale('/es/unknown-page')).toBe('es');
      expect(resolvePathLocale('/es/some/nested/missing')).toBe('es');
      expect(resolvePathLocale('/es')).toBe('es');
      expect(resolvePathLocale('/es/')).toBe('es');
    });

    it('resolves other supported non-primary locales', () => {
      expect(resolvePathLocale('/fr/nonexistent')).toBe('fr');
      expect(resolvePathLocale('/pt/nonexistent')).toBe('pt');
      expect(resolvePathLocale('/it/nonexistent')).toBe('it');
      expect(resolvePathLocale('/de/nonexistent')).toBe('de');
      expect(resolvePathLocale('/ru/nonexistent')).toBe('ru');
      expect(resolvePathLocale('/zh/nonexistent')).toBe('zh');
    });

    it('falls back to English for unprefixed or unrecognized paths', () => {
      expect(resolvePathLocale('/')).toBe('en');
      expect(resolvePathLocale('/missing-page')).toBe('en');
      expect(resolvePathLocale('/liga-mendocina/unknown')).toBe('en');
      expect(resolvePathLocale('/ja/not-supported')).toBe('en');
      expect(resolvePathLocale('some/relative/path')).toBe('en');
    });
  });
});
