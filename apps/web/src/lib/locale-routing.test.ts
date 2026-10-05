import { swapLocale } from './locale-routing.js';

describe('swapLocale', () => {
  it('adds a non-English locale to the root path', () => {
    expect(swapLocale('/', 'es')).toBe('/es');
  });

  it('removes a locale prefix for canonical English paths', () => {
    expect(swapLocale('/es', 'en')).toBe('/');
    expect(swapLocale('/es/tournaments', 'en')).toBe('/tournaments');
  });

  it('replaces an existing locale prefix instead of accumulating another one', () => {
    expect(swapLocale('/es/tournaments', 'fr')).toBe('/fr/tournaments');
    expect(swapLocale('/es/es/tournaments', 'fr')).toBe('/fr/tournaments');
  });

  it('adds a locale to an unprefixed path', () => {
    expect(swapLocale('/tournaments/apertura', 'pt')).toBe('/pt/tournaments/apertura');
  });

  it('keeps the same locale path stable', () => {
    expect(swapLocale('/es/tournaments/apertura', 'es')).toBe('/es/tournaments/apertura');
  });

  it('preserves trailing slashes on non-root paths', () => {
    expect(swapLocale('/tournaments/', 'fr')).toBe('/fr/tournaments/');
  });
});
