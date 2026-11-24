import { describe, expect, it } from '@jest/globals';
import { buildSitemap } from '@copalibre/routing';
import { buildSitemapEntries, mapWithConcurrency, NON_PRIMARY_LOCALES } from './public-routes.js';

const ORIGIN = 'https://copalibre.test';
const UUID = '01a205fd-1c2b-7d3e-8f40-5a6b7c8d9e0f';

describe('buildSitemapEntries club routes', () => {
  it('lists the organization club page of every aliased club, in every locale', () => {
    const entries = buildSitemapEntries([
      {
        organizationAlias: 'liga-mendocina',
        clubAliases: ['club-hispano', 'Bad Alias', UUID],
        tournaments: [],
      },
    ]);
    const xml = buildSitemap(ORIGIN, entries);

    expect(xml).toContain('<loc>https://copalibre.test/liga-mendocina/clubs/club-hispano</loc>');
    for (const locale of NON_PRIMARY_LOCALES) {
      expect(xml).toContain(
        `<loc>https://copalibre.test/${locale}/liga-mendocina/clubs/club-hispano</loc>`,
      );
    }
    expect(xml).not.toContain('Bad Alias');
    expect(xml).not.toContain(UUID);
  });

  it('lists the club index and every aliased club page with each locale variant', () => {
    const entries = buildSitemapEntries([
      {
        organizationAlias: 'liga-mendocina',
        tournaments: [
          { alias: 'apertura-2026', clubAliases: ['andes-talleres', 'casa-de-italia'] },
        ],
      },
    ]);
    const xml = buildSitemap(ORIGIN, entries);

    expect(xml).toContain(
      '<loc>https://copalibre.test/liga-mendocina/tournaments/apertura-2026/clubs</loc>',
    );
    expect(xml).toContain(
      '<loc>https://copalibre.test/liga-mendocina/tournaments/apertura-2026/clubs/andes-talleres</loc>',
    );
    expect(xml).toContain(
      '<loc>https://copalibre.test/liga-mendocina/tournaments/apertura-2026/clubs/casa-de-italia</loc>',
    );
    for (const locale of NON_PRIMARY_LOCALES) {
      expect(xml).toContain(
        `<loc>https://copalibre.test/${locale}/liga-mendocina/tournaments/apertura-2026/clubs/andes-talleres</loc>`,
      );
      expect(xml).toContain(
        `<loc>https://copalibre.test/${locale}/liga-mendocina/tournaments/apertura-2026/clubs</loc>`,
      );
    }
  });

  it('skips clubs whose alias is missing, malformed or a UUID', () => {
    const entries = buildSitemapEntries([
      {
        organizationAlias: 'liga-mendocina',
        tournaments: [
          {
            alias: 'apertura-2026',
            clubAliases: [undefined as unknown as string, 'Bad Alias', UUID, 'ok-club'],
          },
        ],
      },
    ]);
    const xml = buildSitemap(ORIGIN, entries);

    expect(xml).toContain('/apertura-2026/clubs/ok-club</loc>');
    expect(xml).not.toContain(UUID);
    expect(xml).not.toContain('Bad Alias');
    expect(xml.match(/\/clubs\/[^<]+<\/loc>/g)).toHaveLength(1 + NON_PRIMARY_LOCALES.length);
  });

  it('advertises no club routes for a tournament without aliased clubs', () => {
    const entries = buildSitemapEntries([
      { organizationAlias: 'liga-mendocina', tournaments: [{ alias: 'apertura-2026' }] },
    ]);
    const xml = buildSitemap(ORIGIN, entries);

    expect(xml).toContain(
      '<loc>https://copalibre.test/liga-mendocina/tournaments/apertura-2026</loc>',
    );
    expect(xml).not.toContain('/clubs');
  });
});

describe('mapWithConcurrency', () => {
  it('keeps the input order and never has more calls in flight than the limit', async () => {
    let inFlight = 0;
    let peak = 0;
    const results = await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async (value) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return value * 10;
    });

    expect(results).toEqual([10, 20, 30, 40, 50, 60, 70]);
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1);
  });

  it('returns nothing for an empty list and runs one call at a time at limit one', async () => {
    expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([]);

    let inFlight = 0;
    let peak = 0;
    await mapWithConcurrency(['a', 'b', 'c'], 1, async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      inFlight -= 1;
    });
    expect(peak).toBe(1);
  });
});
