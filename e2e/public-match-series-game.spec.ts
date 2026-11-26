import { createServer, type Server } from 'node:http';
import { expect, test } from './fixtures.js';

/**
 * A series fixture has one page and one game per match. `?game=N` shows that game's own status and stream
 * link, and the switcher marks it. A value that is not a positive whole number shows the first game.
 */

const ORGANIZATION = 'liga-mendocina';
const TOURNAMENT_ALIAS = 'apertura-2026';
const STAGE = '1';
const MATCH = '1';
const BASE = `/api/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`;
const PAGE = `/es/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/stages/${STAGE}/matches/${MATCH}`;

const seriesReport = (gameNumber: number) => ({
  organizationAlias: ORGANIZATION,
  organizationName: 'Liga Mendocina',
  tournamentAlias: TOURNAMENT_ALIAS,
  tournamentName: 'Apertura 2026',
  stageNumber: 1,
  stageFormat: 'single-elimination',
  matchNumber: 1,
  round: 1,
  status: gameNumber === 2 ? 'upcoming' : 'final',
  matchId: `00000000-0000-7000-8000-00000000090${gameNumber}`,
  gameNumber,
  games: [
    { number: 1, status: 'final' },
    { number: 2, status: 'upcoming' },
    { number: 3, status: 'upcoming' },
  ],
  homeName: 'Talleres',
  homeAbbreviation: 'TAL',
  homeScore: gameNumber === 1 ? 2 : 0,
  awayName: 'Independiente',
  awayAbbreviation: 'IND',
  awayScore: gameNumber === 1 ? 1 : 0,
  scheduledAt: '2099-11-09T14:00:00.000Z',
  schedulePublished: true,
  streamUrl: `https://example.org/live/game-${gameNumber}`,
  officials: [],
  rosters: { home: [], away: [] },
  timeline: [],
  disciplineImages: {},
});

let apiServer: Server;
const requestedGames: string[] = [];

test.beforeAll(async ({ workerPort }) => {
  apiServer = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (url.pathname === `${BASE}/stages/${STAGE}/matches/${MATCH}`) {
      const game = url.searchParams.get('game') ?? '';
      requestedGames.push(game);
      const number = Number(game);
      const gameNumber = Number.isSafeInteger(number) && number >= 1 ? number : 1;
      res.end(JSON.stringify(seriesReport(gameNumber)));
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

test.describe('series games on the match page', () => {
  test('?game=2 shows game 2’s status and stream link, and the switcher marks game 2', async ({
    page,
  }) => {
    await page.goto(`${PAGE}?game=2`);

    const switcher = page.getByRole('navigation', { name: 'Partidos de la serie' });
    await expect(switcher.getByRole('link')).toHaveCount(3);
    await expect(switcher.getByRole('link', { name: 'Partido 2' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(switcher.getByRole('link', { name: 'Partido 1' })).not.toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(switcher.getByRole('link', { name: 'Partido 2' })).toHaveAttribute(
      'href',
      `${PAGE}?game=2`,
    );
    await expect(page.locator('.cl-badge--upcoming')).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'Ver transmisión' })).toHaveAttribute(
      'href',
      'https://example.org/live/game-2',
    );
  });

  test('the first game shows without a game parameter, and an unusable one falls back to it', async ({
    page,
  }) => {
    for (const path of [PAGE, `${PAGE}?game=abc`, `${PAGE}?game=0`]) {
      await page.goto(path);
      const switcher = page.getByRole('navigation', { name: 'Partidos de la serie' });
      await expect(switcher.getByRole('link', { name: 'Partido 1' })).toHaveAttribute(
        'aria-current',
        'page',
      );
      await expect(page.getByRole('link', { name: 'Ver transmisión' })).toHaveAttribute(
        'href',
        'https://example.org/live/game-1',
      );
    }
    expect(requestedGames).toEqual(expect.arrayContaining(['']));
    expect(requestedGames).not.toContain('abc');
    expect(requestedGames).not.toContain('0');
  });
});
