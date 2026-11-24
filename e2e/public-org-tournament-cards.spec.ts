import AxeBuilder from '@axe-core/playwright';
import { createServer, type Server } from 'node:http';
import { expect, test } from './fixtures.js';
import { expectCenteredPageContainer } from './support/public-layout-widths.js';

const organization = 'org-cards-fixture';
const id = (n: number) => `00000000-0000-7000-8000-${String(n).padStart(12, '0')}`;
const entrant = (n: number, name: string, abbreviation: string) => ({
  entrantId: id(n),
  name,
  abbreviation,
});
const zone = (name: string, base: number) => ({
  zoneName: name,
  champion: entrant(base, `Estudiantil San Miguel ${name}`, 'ESM'),
  runnerUp: entrant(base + 1, `Concepcion Patin Club ${name}`, 'CON'),
  thirdPlace: entrant(base + 2, `Atletico Union ${name}`, 'CAU'),
});
const tournament = {
  tournamentId: id(1),
  alias: 'senior-varones',
  name: 'Campeonato Panamericano de Clubes Senior Varones de Hockey Patines',
  status: 'finished',
  discipline: { name: 'Rink Hockey' },
  winners: [zone('Copa Oro', 10), zone('Copa Plata', 20), zone('Copa Bronce', 30)],
  featured: false,
};
const inProgressTournament = {
  tournamentId: id(2),
  alias: 'apertura-2026',
  name: 'Apertura 2026',
  status: 'live',
  discipline: { name: 'Rink Hockey' },
  featured: false,
};
const scheduledInProgressTournament = {
  tournamentId: id(3),
  alias: 'panamericano-clubes-2025',
  name: 'Panamericano de Clubes 2025',
  status: 'live',
  discipline: { name: 'Rink Hockey' },
  featured: false,
  schedule: {
    // 2026-11-19T01:00Z is 2026-11-18 22:00 in America/Argentina/Mendoza (UTC-3).
    firstKickoffAt: '2026-11-19T01:00:00.000Z',
    lastKickoffAt: '2026-11-24T22:00:00.000Z',
  },
  venueCount: 7,
  progress: {
    currentStageNumber: 2,
    currentStageName: 'Copas',
    resolvedMatches: 48,
    totalMatches: 72,
  },
};
const unscheduledTournament = {
  tournamentId: id(4),
  alias: 'sin-programacion',
  name: 'Torneo Sin Programación',
  status: 'upcoming',
  discipline: { name: 'Rink Hockey' },
  featured: false,
};

let apiServer: Server;

test.beforeAll(async ({ workerPort }) => {
  apiServer = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    const path = (req.url ?? '').split('?')[0] ?? '';
    if (path === '/api/organizations') {
      res.end(
        JSON.stringify([
          {
            organizationId: id(99),
            alias: organization,
            name: 'Org Cards Fixture',
            primaryLanguage: 'es',
            timezone: 'America/Argentina/Mendoza',
          },
        ]),
      );
      return;
    }
    if (path === `/api/organizations/${organization}/public/tournaments`) {
      res.end(
        JSON.stringify({
          organizationAlias: organization,
          organizationName: 'Org Cards Fixture',
          tournaments: [
            tournament,
            inProgressTournament,
            scheduledInProgressTournament,
            unscheduledTournament,
          ],
          clubs: [],
        }),
      );
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

test.describe('organization page tournament cards', () => {
  test('a tournament in progress without a live match has a neutral status badge', async ({
    page,
    workerPort,
  }) => {
    await page.setExtraHTTPHeaders({ 'x-copalibre-api-port': String(workerPort) });
    await page.goto(`/${organization}`);

    const section = page.locator('section[aria-labelledby="heading-live"]');
    await expect(section.getByRole('heading', { name: 'In progress' })).toBeVisible();
    await expect(
      section.locator('[data-tournament-alias="apertura-2026"] .cl-badge-in-progress'),
    ).toHaveText('In progress');
    await expect(section.locator('.cl-badge-live, .cl-live-pulse')).toHaveCount(0);
  });

  for (const colorScheme of ['dark', 'light'] as const) {
    test(`the in-progress badge meets AA contrast in the ${colorScheme} theme`, async ({
      page,
      workerPort,
    }) => {
      await page.emulateMedia({ colorScheme });
      await page.setExtraHTTPHeaders({ 'x-copalibre-api-port': String(workerPort) });
      await page.goto(`/${organization}`);
      await expect(page.locator('.cl-badge-in-progress').first()).toBeVisible();

      const { violations } = await new AxeBuilder({ page })
        .include('.cl-badge-in-progress')
        .withRules(['color-contrast'])
        .analyze();
      expect(violations.map(({ nodes }) => nodes.map(({ target }) => target))).toEqual([]);
    });
  }

  test('uses the centered public container at reference widths', async ({ page, workerPort }) => {
    await page.setExtraHTTPHeaders({ 'x-copalibre-api-port': String(workerPort) });
    await expectCenteredPageContainer(page, `/${organization}`);
  });

  test('a lone finished card is at most half the content area and stacks its winners', async ({
    page,
    workerPort,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.setExtraHTTPHeaders({ 'x-copalibre-api-port': String(workerPort) });
    await page.goto(`/${organization}`);

    const card = page.locator('section[aria-labelledby="heading-finished"] article');
    await expect(card).toHaveCount(1);
    const content = (await page.locator('.cl-org-container').boundingBox()) ?? { width: 0 };
    const cardBox = (await card.boundingBox()) ?? { width: Number.POSITIVE_INFINITY };
    expect(cardBox.width).toBeLessThanOrEqual(content.width / 2 + 1);

    // A narrow card gives each placing its own row: one column per zone, wide enough for a name.
    const columns = await card
      .locator('.cl-podium-grid')
      .first()
      .evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.split(' ').length);
    expect(columns).toBe(1);
    const names = card.locator('.cl-entrant-name');
    expect(await names.count()).toBe(9);
    for (const name of await names.all()) {
      const overflow = await name.evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      // `line-height: normal` has no number, so count lines in font-size units: three lines is
      // about 4.2, four is 5.6 — a name broken letter by letter would be far taller.
      const heightInEm = await name.evaluate(
        (el) => el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).fontSize),
      );
      expect(heightInEm).toBeLessThanOrEqual(4.5);
    }
  });

  test('a long tournament name wraps to two lines before it is cut', async ({
    page,
    workerPort,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.setExtraHTTPHeaders({ 'x-copalibre-api-port': String(workerPort) });
    await page.goto(`/${organization}`);

    const link = page.locator('section[aria-labelledby="heading-finished"] a.cl-tournament-link');
    const lines = await link.evaluate(
      (el) => el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight),
    );
    expect(lines).toBeGreaterThan(1.5);
    expect(lines).toBeLessThanOrEqual(2.1);
  });

  test('on a phone the card keeps names whole and the page does not scroll sideways', async ({
    page,
    workerPort,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.setExtraHTTPHeaders({ 'x-copalibre-api-port': String(workerPort) });
    await page.goto(`/${organization}`);

    await expect(page.locator('.cl-entrant-name').first()).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('displays schedule window in organization timezone, venue count, current stage and match progress, and omits them when absent', async ({
    page,
    workerPort,
  }) => {
    await page.setExtraHTTPHeaders({ 'x-copalibre-api-port': String(workerPort) });
    await page.goto(`/es/${organization}`);

    const detailedCard = page.locator('[data-tournament-alias="panamericano-clubes-2025"]');
    const details = detailedCard.locator('.cl-tournament-card__details li');
    await expect(details).toHaveCount(4);
    await expect(details.nth(0)).toContainText('18');
    await expect(details.nth(0)).toContainText('24');
    await expect(details.nth(1)).toHaveText('Copas');
    await expect(details.nth(2)).toHaveText('48 de 72 partidos');
    await expect(details.nth(3)).toHaveText('7 sedes');

    const unscheduledCard = page.locator('[data-tournament-alias="sin-programacion"]');
    await expect(unscheduledCard).toBeVisible();
    await expect(unscheduledCard.locator('.cl-tournament-card__details')).toHaveCount(0);
  });
});
