import { describe, expect, it } from '@jest/globals';
import { buildSitemap } from '@copalibre/routing';
import { buildSitemapEntries, NON_PRIMARY_LOCALES } from './public-routes.js';

const ORIGIN = 'https://copalibre.test';
const UUID = '01a205fd-1c2b-7d3e-8f40-5a6b7c8d9e0f';

describe('buildSitemapEntries club routes', () => {
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

  it('emits only the club index for a tournament without aliased clubs', () => {
    const entries = buildSitemapEntries([
      { organizationAlias: 'liga-mendocina', tournaments: [{ alias: 'apertura-2026' }] },
    ]);
    const xml = buildSitemap(ORIGIN, entries);

    expect(xml).toContain('/apertura-2026/clubs</loc>');
    expect(xml).not.toMatch(/\/clubs\/[^<]+<\/loc>/);
  });
});
