import { createServer, type Server } from 'node:http';
import { expect, test } from './fixtures.js';

const ORGANIZATION = 'org-live-cards';
const id = (n: number) => `00000000-0000-7000-8000-${String(n).padStart(12, '0')}`;

const tournamentWithLiveMatches = {
  tournamentId: id(1),
  alias: 'apertura-con-vivo',
  name: 'Apertura con partidos en vivo',
  status: 'live',
  discipline: { name: 'Rink Hockey' },
  featured: false,
  liveMatches: [
    {
      matchId: id(101),
      stageNumber: 1,
      matchNumber: 1,
      home: 'Talleres',
      away: 'Andes',
      homeScore: 3,
      awayScore: 1,
    },
    {
      matchId: id(102),
      stageNumber: 1,
      matchNumber: 2,
      home: 'Gimnasia',
      away: 'Maipú',
      homeScore: 0,
      awayScore: 0,
    },
  ],
};

const tournamentWithoutLiveMatches = {
  tournamentId: id(2),
  alias: 'clausura-sin-vivo',
  name: 'Clausura en progreso sin partidos',
  status: 'live',
  discipline: { name: 'Rink Hockey' },
  featured: false,
  liveMatches: [],
};

let apiServer: Server;

test.beforeAll(async ({ workerPort }) => {
  apiServer = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    const [path] = (req.url ?? '').split('?');
    if (path === `/api/organizations/${ORGANIZATION}/public/tournaments`) {
      res.end(
        JSON.stringify({
          organizationAlias: ORGANIZATION,
          organizationName: 'Liga Mendocina',
          tournaments: [tournamentWithLiveMatches, tournamentWithoutLiveMatches],
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

test.describe('organization home live match cards', () => {
  test('renders live match summary, count, and primary Live button only when liveMatches is non-empty (en)', async ({
    page,
  }) => {
    await page.goto(`/${ORGANIZATION}`);

    const withLive = page.locator('[data-tournament-alias="apertura-con-vivo"]');
    await expect(withLive).toBeVisible();
    await expect(withLive.locator('.cl-tournament-card__live-match')).toContainText('Talleres');
    await expect(withLive.locator('.cl-tournament-card__live-match')).toContainText('Andes');
    await expect(withLive.locator('.cl-tournament-card__live-score')).toHaveText('3 – 1');
    await expect(withLive.locator('.cl-tournament-card__live-more')).toHaveText('+1 live');

    const liveBtn = withLive.locator('.cl-card-actions').getByRole('link', { name: /^Live/i });
    const detailsBtn = withLive
      .locator('.cl-card-actions')
      .getByRole('link', { name: 'View tournament' });
    await expect(liveBtn).toHaveClass(/cl-btn--primary/);
    await expect(liveBtn).toHaveAttribute(
      'href',
      `/${ORGANIZATION}/tournaments/apertura-con-vivo/live`,
    );
    await expect(detailsBtn).toHaveClass(/cl-btn--secondary/);

    const withoutLive = page.locator('[data-tournament-alias="clausura-sin-vivo"]');
    await expect(withoutLive).toBeVisible();
    await expect(withoutLive.locator('.cl-badge-in-progress')).toHaveText('In progress');
    await expect(withoutLive.locator('.cl-tournament-card__live')).toHaveCount(0);
    await expect(withoutLive.locator(`a[href$="/live"]`)).toHaveCount(0);
    await expect(withoutLive.getByRole('link', { name: 'View tournament' })).toHaveClass(
      /cl-btn--primary/,
    );
  });

  test('renders localized live match summary, +count en vivo, and primary En vivo button (es)', async ({
    page,
  }) => {
    await page.goto(`/es/${ORGANIZATION}`);

    const withLive = page.locator('[data-tournament-alias="apertura-con-vivo"]');
    await expect(withLive).toBeVisible();
    await expect(withLive.locator('.cl-tournament-card__live-match')).toContainText('Talleres');
    await expect(withLive.locator('.cl-tournament-card__live-match')).toContainText('Andes');
    await expect(withLive.locator('.cl-tournament-card__live-score')).toHaveText('3 – 1');
    await expect(withLive.locator('.cl-tournament-card__live-more')).toHaveText('+1 en vivo');

    const liveBtn = withLive.locator('.cl-card-actions').getByRole('link', { name: /^En vivo/i });
    const detailsBtn = withLive
      .locator('.cl-card-actions')
      .getByRole('link', { name: 'Ver torneo' });
    await expect(liveBtn).toHaveClass(/cl-btn--primary/);
    await expect(liveBtn).toHaveAttribute(
      'href',
      `/es/${ORGANIZATION}/tournaments/apertura-con-vivo/live`,
    );
    await expect(detailsBtn).toHaveClass(/cl-btn--secondary/);

    const withoutLive = page.locator('[data-tournament-alias="clausura-sin-vivo"]');
    await expect(withoutLive).toBeVisible();
    await expect(withoutLive.locator('.cl-badge-in-progress')).toHaveText('En progreso');
    await expect(withoutLive.locator('.cl-tournament-card__live')).toHaveCount(0);
    await expect(withoutLive.locator(`a[href$="/live"]`)).toHaveCount(0);
    await expect(withoutLive.getByRole('link', { name: 'Ver torneo' })).toHaveClass(
      /cl-btn--primary/,
    );
  });
});
