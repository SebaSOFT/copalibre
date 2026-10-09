import { createServer, type Server } from 'node:http';
import { expect, test } from './fixtures.js';

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

let apiServer: Server;

test.beforeAll(async ({ workerPort }) => {
  apiServer = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    const path = (req.url ?? '').split('?')[0] ?? '';
    if (path === `/organizations/${organization}/public/tournaments`) {
      res.end(
        JSON.stringify({
          organizationAlias: organization,
          organizationName: 'Org Cards Fixture',
          tournaments: [tournament],
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
});
