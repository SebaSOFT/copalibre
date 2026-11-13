import { createServer, type Server } from 'node:http';
import { expect, test } from './fixtures.js';

/**
 * Long public match lists on a phone: Matches and the stage page list a tournament's matches by
 * day, with only the live or next match's day open, and Live keeps its next five matches. The
 * fixture has the Panamericano demo's volume: 72 matches over seven days, one of them live.
 */

const ORGANIZATION = 'liga-mendocina';
const TOURNAMENT = 'apertura-2026';
const BASE = `/api/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT}`;
const ROUTE = `/es/${ORGANIZATION}/tournaments/${TOURNAMENT}`;
const TIME_ZONE = 'America/Argentina/Buenos_Aires';

// Seven days in Buenos Aires (UTC-3), as many matches a day as the demo plays.
const PER_DAY = [10, 12, 12, 8, 6, 12, 12];
const KICKOFFS = ['12:00', '14:15', '17:30', '19:45', '22:00', '00:15'];
const GROUPS = ['Grupo A', 'Grupo B', 'Grupo C', 'Grupo D', 'Grupo E', 'Grupo F'];
const LIVE_DAY = 1;

const matches = PER_DAY.flatMap((count, day) =>
  Array.from({ length: count }, (_, index) => {
    const ordinal =
      PER_DAY.slice(0, day).reduce((total, dayCount) => total + dayCount, 0) + index + 1;
    const kickoff = KICKOFFS[Math.floor(index / 2) % KICKOFFS.length] ?? '12:00';
    // 00:15 UTC is the evening before in Buenos Aires: the day is the organization's, not UTC's.
    const utcDay = kickoff === '00:15' ? 14 + day : 13 + day;
    const status = day < LIVE_DAY ? 'final' : day === LIVE_DAY && index === 0 ? 'live' : 'upcoming';
    return {
      matchId: `00000000-0000-7000-8000-${String(ordinal).padStart(12, '0')}`,
      stageNumber: 1,
      matchNumber: ordinal,
      stageOrdinal: ordinal,
      round: day + 1,
      status,
      groupName: GROUPS[ordinal % GROUPS.length],
      homeName: `Local ${ordinal}`,
      awayName: `Visitante ${ordinal}`,
      ...(status === 'final' ? { homeScore: 2, awayScore: 1 } : {}),
      scheduledAt: `2026-11-${String(utcDay).padStart(2, '0')}T${kickoff}:00.000Z`,
    };
  }),
);

const overview = {
  organizationAlias: ORGANIZATION,
  organizationName: 'Liga Mendocina',
  organizationTimeZone: TIME_ZONE,
  tournamentAlias: TOURNAMENT,
  tournamentName: 'Apertura 2026',
  seasonName: 'Apertura 2026',
  matches,
  clubs: [],
  ruleset: {},
};

let apiServer: Server;

test.beforeAll(async ({ workerPort }) => {
  apiServer = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    const path = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
    if (path === `${BASE}/overview`) {
      res.end(JSON.stringify(overview));
      return;
    }
    if (path === `${BASE}/matches-view`) {
      res.end(JSON.stringify({ matches }));
      return;
    }
    if (path === `${BASE}/live`) {
      res.end(
        JSON.stringify({
          organizationAlias: ORGANIZATION,
          tournamentAlias: TOURNAMENT,
          matches: [],
        }),
      );
      return;
    }
    if (path === `${BASE}/public/tables`) {
      res.end(JSON.stringify({ layouts: [] }));
      return;
    }
    if (path === `${BASE}/stages/1/bracket`) {
      res.end(
        JSON.stringify({
          format: 'round-robin',
          zones: [{ zoneId: 'zone-1', matches: [] }],
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

const phone = { width: 375, height: 812 };
const pageHeight = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.documentElement.scrollHeight);

test('Matches lists a phone its days, the live day open and the others closed', async ({
  page,
}) => {
  await page.setViewportSize(phone);
  await page.goto(`${ROUTE}/matches`);

  const days = page.locator('.cl-match-day');
  await expect(days).toHaveCount(7);
  await expect(page.locator('.cl-match-day[open]')).toHaveCount(1);
  const open = page.locator('.cl-match-day[open]');
  await expect(open.locator('summary')).toContainText('12 partidos');
  await expect(open.locator('summary')).toContainText('En vivo');
  await expect(open.locator('.cl-match-day-row')).toHaveCount(12);
  // The evening kickoffs at 00:15 UTC belong to the day before, in the organization's zone.
  await expect(days.first().locator('summary')).toContainText('10 partidos');

  const liveRow = open.locator('.cl-match-day-row--live');
  await expect(liveRow).toHaveAttribute('href', `${ROUTE}/stages/1/matches/11`);
  await expect(liveRow.locator('.cl-match-day-row__score')).toHaveText('0 – 0');

  await expect(page.locator('.cl-match-schedule__nested')).toBeHidden();
  expect(await pageHeight(page)).toBeLessThan(4500);
});

test('the stage page lists a phone its days instead of a card per match', async ({ page }) => {
  await page.setViewportSize(phone);
  await page.goto(`${ROUTE}/stages/1`);

  await expect(page.locator('.cl-match-day')).toHaveCount(7);
  await expect(page.locator('.cl-match-day[open]')).toHaveCount(1);
  await expect(page.locator('.cl-matches-view__grid')).toBeHidden();
  expect(await pageHeight(page)).toBeLessThan(4500);
});

test('Live keeps its next five matches, each with its own report, then links to Matches', async ({
  page,
}) => {
  await page.setViewportSize(phone);
  await page.goto(`${ROUTE}/live`);

  const upcoming = page.locator('.cl-match-card-grid > a');
  await expect(upcoming).toHaveCount(5);
  const links = await upcoming.evaluateAll((anchors) =>
    anchors.map((anchor) => anchor.getAttribute('href')),
  );
  expect(new Set(links).size).toBe(5);
  // Kick-off order: the live match's day goes on with ordinals 12 to 16.
  expect(links).toEqual(
    [12, 13, 14, 15, 16].map((ordinal) => `${ROUTE}/stages/1/matches/${ordinal}`),
  );
  await expect(page.getByRole('link', { name: 'Ver todos los partidos' })).toHaveAttribute(
    'href',
    `${ROUTE}/matches?state=upcoming`,
  );
  expect(await pageHeight(page)).toBeLessThan(4000);
});

test('desktop keeps its tables and shows no day list', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${ROUTE}/matches`);

  await expect(page.locator('.cl-match-days')).toBeHidden();
  await expect(page.locator('.cl-match-schedule__nested')).toBeVisible();
  await expect(page.getByRole('table').first()).toBeVisible();
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('a closed day opens and lists its matches', async ({ page }) => {
    await page.setViewportSize(phone);
    await page.goto(`${ROUTE}/matches`);

    const lastDay = page.locator('.cl-match-day').last();
    await expect(lastDay).not.toHaveAttribute('open', '');
    await expect(lastDay.locator('.cl-match-day-row').first()).toBeHidden();
    await lastDay.locator('summary').click();
    await expect(lastDay.locator('.cl-match-day-row')).toHaveCount(12);
    await expect(lastDay.locator('.cl-match-day-row').first()).toBeVisible();
  });
});
