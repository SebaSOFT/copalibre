import { describe, expect, it } from '@jest/globals';
import { tvLanguage } from './tv-language.js';

describe('tvLanguage', () => {
  it('lets the query win over the organization', () => {
    expect(tvLanguage('de', 'es')).toBe('de');
  });

  it('uses the organization language when the query names none', () => {
    expect(tvLanguage(null, 'es')).toBe('es');
  });

  it('ignores a language the platform does not support', () => {
    expect(tvLanguage('xx', 'es')).toBe('es');
    expect(tvLanguage(null, 'xx')).toBe('en');
  });

  it('falls back to English with neither', () => {
    expect(tvLanguage(null)).toBe('en');
  });
});
