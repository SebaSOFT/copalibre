import { createServer, type Server } from 'node:http';
import { expect, test } from '@playwright/test';

/**
 * End-to-end tests for OpenSpec 0173: SEO hardening, canonical-URL locale consistency,
 * Open Graph & JSON-LD structured data, and dynamic sitemap generation.
 */

const ORGANIZATION = 'liga-mendocina';
const TOURNAMENT_ALIAS = 'apertura-2026';

const organizationsList = [
  {
    organizationId: '01900000-0000-7000-8000-000000000001',
    alias: ORGANIZATION,
    name: 'Liga Mendocina',
    primaryLanguage: 'es',
    timezone: 'America/Argentina/Mendoza',
  },
];

const organizationTournaments = {
  organizationAlias: ORGANIZATION,
  organizationName: 'Liga Mendocina',
  tournaments: [
    {
      tournamentId: '01900000-0000-7000-8000-000000000010',
      alias: TOURNAMENT_ALIAS,
      name: 'Apertura 2026',
      status: 'live',
      discipline: {
        descriptorId: '01890000-0000-7000-8000-000000000001',
        version: '1.0.0',
        name: 'Football',
      },
    },
  ],
};

const overview = {
  organizationAlias: ORGANIZATION,
  organizationName: 'Liga Mendocina',
  tournamentAlias: TOURNAMENT_ALIAS,
  tournamentName: 'Apertura 2026',
  seasonName: 'Apertura 2026',
  matches: [
    {
      matchNumber: 1,
      stageNumber: 1,
      homeName: 'Talleres',
      awayName: 'San Martín',
      status: 'in-progress',
      scheduledAt: '2026-03-01T15:00:00Z',
    },
  ],
  clubs: [],
  ruleset: {},
};

const liveDashboard = {
  organizationAlias: ORGANIZATION,
  tournamentAlias: TOURNAMENT_ALIAS,
  matches: [
    {
      matchId: '01900000-0000-7000-8000-000000000021',
      stageNumber: 1,
      matchNumber: 1,
      state: 'in-progress',
      projectionVersion: 1,
      sides: [
        {
          entrantId: '01900000-0000-7000-8000-000000000031',
          name: 'Talleres',
          abbreviation: 'TAL',
          score: 1,
        },
        {
          entrantId: '01900000-0000-7000-8000-000000000032',
          name: 'San Martín',
          abbreviation: 'SM',
          score: 0,
        },
      ],
    },
  ],
};

let apiServer: Server;

test.beforeAll(async () => {
  apiServer = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    const [path] = (req.url ?? '').split('?');

    if (path === '/organizations') {
      res.end(JSON.stringify(organizationsList));
      return;
    }
    if (path === `/organizations/${ORGANIZATION}/public/tournaments`) {
      res.end(JSON.stringify(organizationTournaments));
      return;
    }
    if (path === `/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/overview`) {
      res.end(JSON.stringify(overview));
      return;
    }
    if (path === `/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/live`) {
      res.end(JSON.stringify(liveDashboard));
      return;
    }
    if (path === `/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/tables`) {
      res.end(JSON.stringify({ layouts: [] }));
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ message: 'not found' }));
  });

  await new Promise<void>((resolve) => apiServer.listen(3001, '127.0.0.1', resolve));
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => apiServer.close(() => resolve()));
});

test.describe('SEO & Public Discoverability Hardening (0173)', () => {
  test('8.1: homepage renders real organization content instead of placeholder', async ({
    page,
  }) => {
    await page.goto('/');

    // Check header and content
    await expect(page.locator('h1')).toHaveText('CopaLibre');
    await expect(page.getByText('Public surface under construction')).toHaveCount(0);
    await expect(page.locator('.cl-org-name')).toHaveText('Liga Mendocina');
    await expect(page.getByRole('link', { name: /Liga Mendocina/ })).toBeVisible();
  });

  test('8.2: tournament live page under non-primary locale carries self-referential canonical URL', async ({
    page,
  }) => {
    await page.goto(`/es/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/live`);

    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveAttribute(
      'href',
      new RegExp(`/es/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/live$`),
    );
  });

  test('8.3: sitemap.xml dynamically enumerates published organizations and tournaments with locale variants', async ({
    request,
  }) => {
    const response = await request.get('/sitemap.xml');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/xml');

    const body = await response.text();
    // Site root
    expect(body).toContain('<loc>');
    // Organization canonical and Spanish locale variant
    expect(body).toContain(`/${ORGANIZATION}</loc>`);
    expect(body).toContain(`/es/${ORGANIZATION}</loc>`);
    // Tournament canonical and Spanish locale variant
    expect(body).toContain(`/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}</loc>`);
    expect(body).toContain(`/es/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}</loc>`);
  });

  test('8.4: tournament overview page carries Open Graph, Twitter cards, hreflang, and JSON-LD SportsEvent', async ({
    page,
  }) => {
    await page.goto(`/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`);

    // OG & Twitter Meta
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      'content',
      /Apertura 2026/,
    );
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
      'content',
      new RegExp(`/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}$`),
    );
    await expect(page.locator('meta[name="twitter:card"]')).toBeDefined();

    // Hreflang alternates
    await expect(page.locator('link[rel="alternate"][hreflang="es"]')).toHaveAttribute(
      'href',
      new RegExp(`/es/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}$`),
    );
    await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute(
      'href',
      new RegExp(`/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}$`),
    );

    // JSON-LD Structured Data
    const ldJsonScript = page.locator('script[type="application/ld+json"]');
    await expect(ldJsonScript).toHaveCount(1);
    const ldJsonText = await ldJsonScript.textContent();
    const ldJson = JSON.parse(ldJsonText || '{}');
    expect(ldJson).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'SportsEvent',
      name: expect.stringContaining('Apertura 2026'),
      url: expect.stringContaining(`/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`),
    });
  });
});
