import { createServer, type Server } from 'node:http';
import { expect, test } from './fixtures.js';

/**
 * Regression test for the 0258 JSON-LD script-breakout fix
 * (`apps/web/src/lib/seo.ts`'s `serializeJsonLd`): an admin-set tournament
 * name containing a `</script>` sequence must never close the surrounding
 * `<script type="application/ld+json">` tag early (`PublicLayout.astro`'s
 * `set:html={serializeJsonLd(structuredData)}`). `seo.test.ts` proves this
 * at the unit level; this proves it through the real page render.
 */

const ORGANIZATION = 'liga-breakout';
const TOURNAMENT_ALIAS = 'apertura-breakout';
const MALICIOUS_NAME = '</script><script>window.__xssExecuted = true;</script>';

const organizationsList = [
  {
    organizationId: '01900000-0000-7000-8000-0000000000a1',
    alias: ORGANIZATION,
    name: 'Liga Breakout',
    primaryLanguage: 'es',
    timezone: 'America/Argentina/Mendoza',
  },
];

const organizationTournaments = {
  organizationAlias: ORGANIZATION,
  organizationName: 'Liga Breakout',
  tournaments: [
    {
      tournamentId: '01900000-0000-7000-8000-0000000000b1',
      alias: TOURNAMENT_ALIAS,
      name: MALICIOUS_NAME,
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
  organizationName: 'Liga Breakout',
  tournamentAlias: TOURNAMENT_ALIAS,
  tournamentName: MALICIOUS_NAME,
  seasonName: MALICIOUS_NAME,
  matches: [],
  clubs: [],
  ruleset: {},
};

let apiServer: Server;

test.beforeAll(async ({ workerPort }) => {
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
    if (path === `/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/tables`) {
      res.end(JSON.stringify({ layouts: [] }));
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ message: 'not found' }));
  });

  await new Promise<void>((resolve) => apiServer.listen(workerPort, '127.0.0.1', resolve));
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => apiServer.close(() => resolve()));
});

test.describe('JSON-LD script-breakout regression (0258)', () => {
  test('a tournament name containing </script> never breaks out of the structured-data tag', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      (window as unknown as { __xssExecuted?: boolean }).__xssExecuted = false;
    });

    await page.goto(`/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`);

    const executed = await page.evaluate(
      () => (window as unknown as { __xssExecuted?: boolean }).__xssExecuted,
    );
    expect(executed).toBe(false);

    const ldJsonScript = page.locator('script[type="application/ld+json"]');
    await expect(ldJsonScript).toHaveCount(1);
    const ldJsonText = await ldJsonScript.textContent();
    const ldJson = JSON.parse(ldJsonText ?? '{}');
    expect(ldJson.name).toBe(MALICIOUS_NAME);
  });
});
