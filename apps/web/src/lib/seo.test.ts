import { describe, it, expect } from '@jest/globals';
import {
  buildHreflangAlternates,
  serializeJsonLd,
  isCanonicalPathValidForLocale,
  assertCanonicalPathLocalePrefix,
  stripLocalePrefix,
} from './seo.js';
import { buildSitemapEntries, type OrgWithTournaments } from './public-routes.js';
import { selectDisciplineBackground } from './discipline-background.js';
import { SUPPORTED_LANGUAGES } from '@copalibre/domain';

describe('SEO and structured data utilities', () => {
  describe('serializeJsonLd', () => {
    it('serializes a tournament SportsEvent structured data block', () => {
      const json = serializeJsonLd({
        '@type': 'SportsEvent',
        name: 'Torneo Apertura 2026',
        url: 'https://copalibre.example/liga-orbital/tournaments/apertura-2026',
        startDate: '2026-03-01T10:00:00Z',
        description: 'Torneo oficial de Apertura 2026',
      });
      const parsed = JSON.parse(json);
      expect(parsed).toEqual({
        '@context': 'https://schema.org',
        '@type': 'SportsEvent',
        name: 'Torneo Apertura 2026',
        url: 'https://copalibre.example/liga-orbital/tournaments/apertura-2026',
        startDate: '2026-03-01T10:00:00Z',
        description: 'Torneo oficial de Apertura 2026',
      });
    });

    it('serializes a match SportsEvent structured data block', () => {
      const json = serializeJsonLd({
        '@type': 'SportsEvent',
        name: 'Talleres vs San Martín — Torneo Apertura',
        url: 'https://copalibre.example/liga-orbital/tournaments/apertura-2026/stages/1/matches/1',
        startDate: '2026-03-01T14:30:00Z',
      });
      const parsed = JSON.parse(json);
      expect(parsed).toEqual({
        '@context': 'https://schema.org',
        '@type': 'SportsEvent',
        name: 'Talleres vs San Martín — Torneo Apertura',
        url: 'https://copalibre.example/liga-orbital/tournaments/apertura-2026/stages/1/matches/1',
        startDate: '2026-03-01T14:30:00Z',
      });
    });

    it('serializes an organization SportsOrganization structured data block with logo', () => {
      const json = serializeJsonLd({
        '@type': 'SportsOrganization',
        name: 'Liga Orbital',
        url: 'https://copalibre.example/liga-orbital',
        logo: 'https://copalibre.example/organizations/liga-orbital/emblem',
      });
      const parsed = JSON.parse(json);
      expect(parsed).toEqual({
        '@context': 'https://schema.org',
        '@type': 'SportsOrganization',
        name: 'Liga Orbital',
        url: 'https://copalibre.example/liga-orbital',
        logo: 'https://copalibre.example/organizations/liga-orbital/emblem',
      });
    });
  });

  describe('discipline background & og:image resolution', () => {
    it('returns undefined when no discipline images exist', () => {
      expect(selectDisciplineBackground([])).toBeUndefined();
      expect(selectDisciplineBackground(undefined)).toBeUndefined();
    });

    it('resolves background image when discipline image is present', () => {
      const bg = selectDisciplineBackground([
        {
          key: 'modules/football/1.1.0/football-01.jpg',
        },
      ]);
      expect(bg).toBeDefined();
      expect(bg?.url).toContain('football-01.jpg');
    });
  });

  describe('buildHreflangAlternates', () => {
    it('builds alternates for a single locale variant', () => {
      const alternates = buildHreflangAlternates(
        'https://copalibre.example',
        '/liga-orbital',
        'en',
        ['en'],
      );
      expect(alternates).toEqual([
        { hreflang: 'en', href: 'https://copalibre.example/liga-orbital' },
        { hreflang: 'x-default', href: 'https://copalibre.example/liga-orbital' },
      ]);
    });

    it('builds alternates for two locale variants', () => {
      const alternates = buildHreflangAlternates(
        'https://copalibre.example',
        '/es/liga-orbital',
        'es',
        ['en', 'es'],
      );
      expect(alternates).toEqual([
        { hreflang: 'en', href: 'https://copalibre.example/liga-orbital' },
        { hreflang: 'es', href: 'https://copalibre.example/es/liga-orbital' },
        { hreflang: 'x-default', href: 'https://copalibre.example/liga-orbital' },
      ]);
    });

    it('builds alternates for all eight supported languages plus x-default', () => {
      const alternates = buildHreflangAlternates(
        'https://copalibre.example',
        '/liga-orbital/tournaments/apertura-2026',
        'en',
        SUPPORTED_LANGUAGES,
      );
      expect(alternates).toHaveLength(9);
      expect(alternates[0]).toEqual({
        hreflang: 'en',
        href: 'https://copalibre.example/liga-orbital/tournaments/apertura-2026',
      });
      expect(alternates.find((a) => a.hreflang === 'es')).toEqual({
        hreflang: 'es',
        href: 'https://copalibre.example/es/liga-orbital/tournaments/apertura-2026',
      });
      expect(alternates.find((a) => a.hreflang === 'x-default')).toEqual({
        hreflang: 'x-default',
        href: 'https://copalibre.example/liga-orbital/tournaments/apertura-2026',
      });
    });

    it('handles site root path properly', () => {
      const alternates = buildHreflangAlternates('https://copalibre.example', '/', 'en', [
        'en',
        'es',
      ]);
      expect(alternates).toEqual([
        { hreflang: 'en', href: 'https://copalibre.example/' },
        { hreflang: 'es', href: 'https://copalibre.example/es' },
        { hreflang: 'x-default', href: 'https://copalibre.example/' },
      ]);
    });
  });

  describe('canonical-path locale prefix validation', () => {
    it('validates correct canonical paths for primary and non-primary locales', () => {
      expect(isCanonicalPathValidForLocale('/liga-orbital', 'en')).toBe(true);
      expect(isCanonicalPathValidForLocale('/', 'en')).toBe(true);
      expect(isCanonicalPathValidForLocale('/es/liga-orbital', 'es')).toBe(true);
      expect(isCanonicalPathValidForLocale('/es', 'es')).toBe(true);
    });

    it('rejects canonical paths that contradict the requested locale', () => {
      // Non-primary locale requested but canonical path lacks prefix
      expect(isCanonicalPathValidForLocale('/liga-orbital', 'es')).toBe(false);
      // Primary locale requested but canonical path has non-primary prefix
      expect(isCanonicalPathValidForLocale('/es/liga-orbital', 'en')).toBe(false);
      // Wrong non-primary prefix
      expect(isCanonicalPathValidForLocale('/fr/liga-orbital', 'es')).toBe(false);
    });

    it('assertCanonicalPathLocalePrefix throws on mismatched paths', () => {
      expect(() => {
        assertCanonicalPathLocalePrefix('/liga-orbital', 'es');
      }).toThrow('does not match requested non-primary locale "es" prefix');

      expect(() => {
        assertCanonicalPathLocalePrefix('/es/liga-orbital', 'es');
      }).not.toThrow();
    });

    it('stripLocalePrefix removes leading supported locale segment', () => {
      expect(stripLocalePrefix('/es/liga-orbital/tournaments/open-cup')).toBe(
        '/liga-orbital/tournaments/open-cup',
      );
      expect(stripLocalePrefix('/liga-orbital/tournaments/open-cup')).toBe(
        '/liga-orbital/tournaments/open-cup',
      );
      expect(stripLocalePrefix('/es')).toBe('/');
    });
  });

  describe('buildSitemapEntries', () => {
    it('generates routes for published organizations and tournaments including all locale variants', () => {
      const fixtureData: OrgWithTournaments[] = [
        {
          organizationAlias: 'liga-orbital',
          tournaments: [{ alias: 'apertura-2026' }],
        },
        {
          organizationAlias: 'liga-vacia',
          tournaments: [],
        },
      ];

      const entries = buildSitemapEntries(fixtureData);

      // liga-orbital: 1 org root + 7 non-primary org locales = 8
      // + 1 tournament root + 7 non-primary tournament locales = 8
      // liga-vacia: 1 org root + 7 non-primary org locales = 8
      // total = 8 + 8 + 8 = 24 entries
      expect(entries).toHaveLength(24);

      // Check organization routes
      expect(
        entries.some(
          (e) =>
            e.input.organizationAlias === 'liga-orbital' &&
            !e.input.locale &&
            !e.input.tournamentAlias,
        ),
      ).toBe(true);
      expect(
        entries.some(
          (e) =>
            e.input.organizationAlias === 'liga-orbital' &&
            e.input.locale === 'es' &&
            !e.input.tournamentAlias,
        ),
      ).toBe(true);

      // Check tournament routes
      expect(
        entries.some(
          (e) =>
            e.input.organizationAlias === 'liga-orbital' &&
            e.input.tournamentAlias === 'apertura-2026' &&
            !e.input.locale,
        ),
      ).toBe(true);
      expect(
        entries.some(
          (e) =>
            e.input.organizationAlias === 'liga-orbital' &&
            e.input.tournamentAlias === 'apertura-2026' &&
            e.input.locale === 'es',
        ),
      ).toBe(true);

      // Check zero-tournament organization still listed
      expect(
        entries.some(
          (e) =>
            e.input.organizationAlias === 'liga-vacia' &&
            !e.input.locale &&
            !e.input.tournamentAlias,
        ),
      ).toBe(true);
      expect(
        entries.some(
          (e) =>
            e.input.organizationAlias === 'liga-vacia' &&
            e.input.locale === 'fr' &&
            !e.input.tournamentAlias,
        ),
      ).toBe(true);
    });
  });
});
