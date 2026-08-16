import { describe, expect, it } from '@jest/globals';
import { localizedText } from './localized-label.js';

describe('localizedText', () => {
  it('returns a plain string unchanged', () => {
    expect(localizedText('Standings', 'es')).toBe('Standings');
  });

  it('picks the requested language from a localized label', () => {
    expect(localizedText({ en: 'Standings', es: 'Posiciones' }, 'es')).toBe('Posiciones');
  });

  it('falls back to English when the requested language is not declared', () => {
    expect(localizedText({ en: 'Standings' }, 'fr')).toBe('Standings');
  });

  it('resolves a region-qualified locale to its base language', () => {
    expect(localizedText({ en: 'Standings', es: 'Posiciones' }, 'es-AR')).toBe('Posiciones');
  });
});
