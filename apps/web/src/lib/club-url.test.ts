import { describe, expect, it } from '@jest/globals';
import { RouteError } from '@copalibre/routing';
import { clubIndexUrl, clubPageUrl, isValidClubAlias, optionalClubPageUrl } from './club-url.js';

describe('isValidClubAlias', () => {
  it('accepts valid kebab-case club aliases', () => {
    expect(isValidClubAlias('club-hispano')).toBe(true);
    expect(isValidClubAlias('a')).toBe(true);
    expect(isValidClubAlias('a'.repeat(64))).toBe(true);
    expect(isValidClubAlias('uvt-2026')).toBe(true);
  });

  it('rejects UUIDs, empty values, whitespace, slashes, and overly long aliases', () => {
    expect(isValidClubAlias('01936f4a-0001-7000-8000-000000000001')).toBe(false);
    expect(isValidClubAlias('')).toBe(false);
    expect(isValidClubAlias(undefined)).toBe(false);
    expect(isValidClubAlias(null)).toBe(false);
    expect(isValidClubAlias('club hispano')).toBe(false);
    expect(isValidClubAlias('club/hispano')).toBe(false);
    expect(isValidClubAlias('Club-Hispano')).toBe(false);
    expect(isValidClubAlias('-club')).toBe(false);
    expect(isValidClubAlias('a'.repeat(65))).toBe(false);
  });
});

describe('clubIndexUrl', () => {
  it('builds the tournament club index path with and without locale prefixes', () => {
    expect(
      clubIndexUrl({
        organizationAlias: 'liga-mendocina',
        tournamentAlias: 'apertura-2026',
      }),
    ).toBe('/liga-mendocina/tournaments/apertura-2026/clubs');

    expect(
      clubIndexUrl({
        organizationAlias: 'liga-mendocina',
        tournamentAlias: 'apertura-2026',
        localePrefix: '/es',
      }),
    ).toBe('/es/liga-mendocina/tournaments/apertura-2026/clubs');

    expect(
      clubIndexUrl({
        organizationAlias: 'liga-mendocina',
        tournamentAlias: 'apertura-2026',
        localePrefix: '/',
      }),
    ).toBe('/liga-mendocina/tournaments/apertura-2026/clubs');
  });
});

describe('clubPageUrl', () => {
  it('builds alias paths with an optional locale prefix', () => {
    expect(
      clubPageUrl({
        organizationAlias: 'liga-mendocina',
        tournamentAlias: 'apertura-2026',
        clubAlias: 'club-hispano',
      }),
    ).toBe('/liga-mendocina/tournaments/apertura-2026/clubs/club-hispano');

    expect(
      clubPageUrl({
        organizationAlias: 'liga-mendocina',
        tournamentAlias: 'apertura-2026',
        clubAlias: 'club-hispano',
        localePrefix: '/fr',
      }),
    ).toBe('/fr/liga-mendocina/tournaments/apertura-2026/clubs/club-hispano');
  });

  it('refuses a UUID or malformed club alias', () => {
    expect(() =>
      clubPageUrl({
        organizationAlias: 'liga-mendocina',
        tournamentAlias: 'apertura-2026',
        clubAlias: '01936f4a-0001-7000-8000-000000000001',
      }),
    ).toThrow(RouteError);

    expect(() =>
      clubPageUrl({
        organizationAlias: 'liga-mendocina',
        tournamentAlias: 'apertura-2026',
        clubAlias: 'bad/alias',
      }),
    ).toThrow(RouteError);
  });
});

describe('optionalClubPageUrl', () => {
  it('returns the URL when all aliases are valid and undefined otherwise', () => {
    expect(
      optionalClubPageUrl({
        organizationAlias: 'liga-mendocina',
        tournamentAlias: 'apertura-2026',
        clubAlias: 'club-hispano',
        localePrefix: '/pt',
      }),
    ).toBe('/pt/liga-mendocina/tournaments/apertura-2026/clubs/club-hispano');

    expect(
      optionalClubPageUrl({
        organizationAlias: 'liga-mendocina',
        tournamentAlias: 'apertura-2026',
        clubAlias: undefined,
      }),
    ).toBeUndefined();

    expect(
      optionalClubPageUrl({
        organizationAlias: 'liga-mendocina',
        tournamentAlias: 'apertura-2026',
        clubAlias: '01936f4a-0001-7000-8000-000000000001',
      }),
    ).toBeUndefined();

    expect(
      optionalClubPageUrl({
        organizationAlias: 'bad org',
        tournamentAlias: 'apertura-2026',
        clubAlias: 'club-hispano',
      }),
    ).toBeUndefined();
  });
});
