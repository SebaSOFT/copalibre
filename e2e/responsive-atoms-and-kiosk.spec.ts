import { createServer, type Server } from 'node:http';
import { expect, test } from './fixtures.js';

/**
 * openspec 0247: the ResponsiveTimestamp / EntrantName / ResponsivePlayerName
 * atoms adopted across the TV kiosk and a public surface.
 */

const ORGANIZATION = 'responsive-atoms-org';
const TOURNAMENT = 'responsive-atoms-2026';
const TV_PATH = `/tv/${ORGANIZATION}/tournaments/${TOURNAMENT}`;
const PUBLIC_BASE = `/${ORGANIZATION}/tournaments/${TOURNAMENT}`;
const API_BASE = `/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT}`;

const HOME_NAME = 'Club Atlético Independiente de Avellaneda';
const AWAY_NAME = 'Club Atlético Talleres de Córdoba';

const overview = {
  organizationAlias: ORGANIZATION,
  organizationName: 'Responsive Atoms League',
  tournamentAlias: TOURNAMENT,
  tournamentName: 'Responsive Atoms 2026',
  seasonName: 'Season 2026',
  status: 'in-progress',
  winners: [],
  matches: [
    {
      matchNumber: 1,
      stageNumber: 1,
      homeName: HOME_NAME,
      homeAbbreviation: 'CAI',
      homeScore: 2,
      awayName: AWAY_NAME,
      awayAbbreviation: 'TAL',
      awayScore: 1,
      status: 'live',
      scheduledAt: new Date().toISOString(),
    },
  ],
  clubs: [],
  ruleset: { format: 'round-robin' },
};

const tableLayouts = {
  layouts: [
    {
      code: 'top-scorers',
      target: 'player-ranking',
      label: 'Top Scorers',
      entityGranularity: 'person',
    },
  ],
};

const topScorersProjection = {
  layoutCode: 'top-scorers',
  target: 'player-ranking',
  label: 'Top Scorers',
  defaultSort: [{ columnCode: 'goals', direction: 'desc' }],
  projectionVersion: 1,
  columns: [
    { code: 'player', header: 'Player', format: 'text' },
    { code: 'team', header: 'Team', format: 'text' },
    { code: 'goals', header: 'Goals', format: 'number' },
  ],
  rows: [
    {
      actorId: 'person-scorer-1',
      actorName: 'Sebastian Dieguez',
      entrantName: AWAY_NAME,
      entrantAbbreviation: 'TAL',
      nationality: 'AR',
      rank: 1,
      sharedRank: false,
      cells: {
        player: { raw: 'Sebastian Dieguez', formatted: 'Sebastian Dieguez' },
        team: { raw: AWAY_NAME, formatted: AWAY_NAME },
        goals: { raw: 9, formatted: '9' },
      },
    },
  ],
};

let server: Server;

test.beforeAll(async ({ workerPort }) => {
  server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    const [path] = (req.url ?? '').split('?');

    if (path === `${API_BASE}/overview`) {
      res.end(JSON.stringify(overview));
      return;
    }
    if (path === `${API_BASE}/public/tables`) {
      res.end(JSON.stringify(tableLayouts));
      return;
    }
    if (path === `${API_BASE}/public/tables/top-scorers`) {
      res.end(JSON.stringify(topScorersProjection));
      return;
    }
    if (path === `${API_BASE}/matches-view` || path === `${API_BASE}/matches`) {
      res.end(
        JSON.stringify({
          matches: overview.matches.map((m, index) => ({
            matchId: `match-${index}`,
            stageNumber: m.stageNumber,
            matchNumber: m.matchNumber,
            round: 1,
            status: 'live',
            homeName: m.homeName,
            homeAbbreviation: m.homeAbbreviation,
            homeScore: m.homeScore,
            awayName: m.awayName,
            awayAbbreviation: m.awayAbbreviation,
            awayScore: m.awayScore,
            scheduledAt: m.scheduledAt,
          })),
        }),
      );
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ message: 'not found' }));
  });
  await new Promise<void>((resolve) => server.listen(workerPort, '127.0.0.1', resolve));
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test.describe('TV kiosk', () => {
  test('the spotlight anchors the home emblem at least 120x120px', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(TV_PATH);
    const box = await page
      .locator('.tv-team-side--anchor .tv-team-side__emblem-wrap')
      .boundingBox();
    if (box === null) throw new Error('The anchor emblem has no layout box');
    expect(box.width).toBeGreaterThanOrEqual(120);
    expect(box.height).toBeGreaterThanOrEqual(120);
  });

  test('the spotlight team name falls back to its abbreviation in a narrow frame', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 480, height: 900 });
    await page.goto(TV_PATH);
    await expect(page.locator('.tv-team-side__name abbr', { hasText: 'CAI' })).toBeVisible();
  });

  test('top performers shows a responsive player name, nationality flag, and club', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(TV_PATH);
    await page.getByRole('button', { name: 'Top performers' }).click();
    const rail = page.getByTestId('tv-rail-content');
    await expect(rail.getByText('Sebastian Dieguez')).toBeVisible();
    await expect(rail.getByText('🇦🇷')).toBeVisible();
    await expect(rail.getByTestId('entrant-name')).toHaveText(AWAY_NAME);
  });
});

test.describe('public matches page', () => {
  test('a same-day kickoff renders as a bare HH:mm, not a raw ISO string', async ({ page }) => {
    await page.goto(`${PUBLIC_BASE}/matches`);
    const now = new Date();
    const expected = new Intl.DateTimeFormat('en', {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(now);
    await expect(page.getByText(expected, { exact: true }).first()).toBeVisible();
    const [firstMatch] = overview.matches;
    if (firstMatch === undefined) throw new Error('Fixture must declare at least one match');
    await expect(page.getByText(firstMatch.scheduledAt, { exact: true })).toHaveCount(0);
  });
});
