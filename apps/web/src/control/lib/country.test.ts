import { countryFlag, countryName } from './country.js';

describe('countryName', () => {
  it('resolves a code to its localized name', () => {
    expect(countryName('AR', 'en')).toBe('Argentina');
    expect(countryName('AR', 'es')).toBe('Argentina');
  });

  it('resolves the same code differently across locales', () => {
    expect(countryName('DE', 'en')).toBe('Germany');
    expect(countryName('DE', 'es')).toBe('Alemania');
  });

  it('is case-insensitive on the input code', () => {
    expect(countryName('ar', 'en')).toBe(countryName('AR', 'en'));
  });

  it('falls back to the code itself when the runtime cannot resolve any region name', () => {
    expect(countryName('XX', 'not-a-real-locale-tag')).toBe('XX');
  });
});

describe('countryFlag', () => {
  it('renders the regional-indicator pair for a code', () => {
    expect(countryFlag('AR')).toBe('🇦🇷');
    expect(countryFlag('US')).toBe('🇺🇸');
  });

  it('is case-insensitive', () => {
    expect(countryFlag('ar')).toBe(countryFlag('AR'));
  });

  it('returns the input unchanged for a malformed code', () => {
    expect(countryFlag('XYZ')).toBe('XYZ');
    expect(countryFlag('')).toBe('');
  });
});
