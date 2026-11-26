import { createServer, type Server } from 'node:http';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

/**
 * End-to-end tests for public match presentation (Public Match Presentation and Badge Polish):
 * - 4.1: Finalized match detail page must NOT contain "Schedule not yet available" or
 *        "Schedule has not yet been published" — those banners are only appropriate for
 *        upcoming matches whose schedule hasn't been published yet.
 * - 4.2: Rank badge in matches-view card uses JetBrains Mono (cl-badge--rank) so
 *        the "#1" indicator aligns typographically with adjacent score digits; the gap
 *        between badge and score is >= 6px.
 */

const ORGANIZATION = 'liga-mendocina';
const TOURNAMENT_ALIAS = 'apertura-2026';
const STAGE = '1';
const MATCH = '5';

const BASE = `/api/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`;

/** A finalized match with no scheduledAt (retroactive data entry scenario). */
const finalizedMatchReport = {
  organizationAlias: ORGANIZATION,
  organizationName: 'Liga Mendocina',
  tournamentAlias: TOURNAMENT_ALIAS,
  tournamentName: 'Apertura 2026',
  stageNumber: 1,
  matchNumber: 5,
  round: 3,
  status: 'final',
  homeName: 'Club Andes',
  homeAbbreviation: 'AND',
  homeScore: 3,
  awayName: 'Deportivo Sur',
  awayAbbreviation: 'SUR',
  awayScore: 1,
  // No scheduledAt — simulates retroactive entry where no slot was ever assigned.
  schedulePublished: false,
  officials: [],
  rosters: { home: [], away: [] },
  timeline: [],
  disciplineImages: {},
};

/** A match-view entry with position badges to verify spacing. */
const matchWithPosition = {
  matchId: '00000000-0000-7000-8000-000000000030',
  stageNumber: 1,
  matchNumber: 5,
  status: 'final',
  round: 3,
  homeName: 'Club Andes',
  homeScore: 3,
  homePosition: 1,
  awayName: 'Deportivo Sur',
  awayScore: 1,
  awayPosition: 4,
};

const overview = {
  organizationAlias: ORGANIZATION,
  organizationName: 'Liga Mendocina',
  tournamentAlias: TOURNAMENT_ALIAS,
  tournamentName: 'Apertura 2026',
  seasonName: 'Apertura 2026',
  matches: [],
  clubs: [],
  ruleset: {},
};

/** An upcoming match between two clubs with crests, a stream link, and no match-day roster recorded yet. */
const upcomingMatchNumber = '6';
const upcomingMatchReport = {
  organizationAlias: ORGANIZATION,
  organizationName: 'Liga Mendocina',
  tournamentAlias: TOURNAMENT_ALIAS,
  tournamentName: 'Apertura 2026',
  stageNumber: 1,
  matchNumber: 6,
  round: 3,
  status: 'upcoming',
  homeEntrantId: '00000000-0000-7000-8000-000000000601',
  homeName: 'Club Andes',
  homeAbbreviation: 'AND',
  homeClubId: '00000000-0000-7000-8000-000000000611',
  homeEmblemObjectId: '00000000-0000-7000-8000-000000000621',
  awayEntrantId: '00000000-0000-7000-8000-000000000602',
  awayName: 'Deportivo Sur',
  awayAbbreviation: 'SUR',
  awayClubId: '00000000-0000-7000-8000-000000000612',
  awayEmblemObjectId: '00000000-0000-7000-8000-000000000622',
  scheduledAt: '2025-11-09T14:00:00.000Z',
  schedulePublished: true,
  streamUrl: 'https://example.org/live/semifinal-1',
  officials: [],
  rosters: { home: [], away: [] },
  registeredSquads: {
    home: [
      {
        personId: '00000000-0000-7000-8000-000000000701',
        name: 'Ada Lovelace',
        publicProfileAvailable: true,
      },
    ],
    away: [
      {
        personId: '00000000-0000-7000-8000-000000000702',
        name: 'Grace Hopper',
        publicProfileAvailable: true,
      },
    ],
  },
  timeline: [],
  disciplineImages: {},
};

let apiServer: Server;
// Set by the officials test only: the match report then names two officials.
let withOfficials = false;
// Set by the long-name scoreboard tests: long team names and three-digit scores.
let withLongNames = false;

test.beforeAll(async ({ workerPort }) => {
  apiServer = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    const [path] = (req.url ?? '').split('?');

    if (path === `${BASE}/overview`) {
      res.end(JSON.stringify(overview));
      return;
    }

    if (path === `${BASE}/stages/${STAGE}/matches/${MATCH}`) {
      res.end(
        JSON.stringify(
          withLongNames
            ? {
                ...finalizedMatchReport,
                homeName: 'Fußballgemeinschaft Niederrheinstrudel',
                homeScore: 102,
                awayName: 'SV Donaustrudelbachtal Ost',
                awayScore: 98,
              }
            : withOfficials
              ? {
                  ...finalizedMatchReport,
                  officials: [
                    { name: 'Ana Pérez', roles: ['referee'] },
                    { name: 'Luis Gómez', roles: ['referee'] },
                  ],
                }
              : finalizedMatchReport,
        ),
      );
      return;
    }

    if (path === `${BASE}/matches-view`) {
      res.end(JSON.stringify({ matches: [matchWithPosition] }));
      return;
    }

    if (path === `${BASE}/stages/${STAGE}/matches/${upcomingMatchNumber}`) {
      res.end(JSON.stringify(upcomingMatchReport));
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

test.describe('Public Match Presentation and Badge Polish', () => {
  test('finalized match detail page does not show scheduling placeholder banners', async ({
    page,
  }) => {
    await page.goto(
      `/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/stages/${STAGE}/matches/${MATCH}`,
    );

    // The match rendered as FINAL — no "not yet available" or "not yet published" banner.
    await expect(page.getByText(/schedule not yet available/i)).toHaveCount(0);
    await expect(page.getByText(/schedule has not yet been published/i)).toHaveCount(0);

    // A finalized match with no officials assigned shows "No officials assigned." not the
    // schedule-pending placeholder.
    await expect(page.getByText(/no officials assigned/i)).toBeVisible();

    // The page heading and scoreboard identify each side by its full display name.
    await expect(
      page.getByRole('heading', { level: 1, name: 'Club Andes vs Deportivo Sur' }),
    ).toBeVisible();
    await expect(page.locator('.cl-scoreboard__side--home .cl-team-name')).toHaveText('Club Andes');
    await expect(page.locator('.cl-scoreboard__side--home .cl-team-score')).toHaveText('3');
    await expect(page.locator('.cl-scoreboard__side--away .cl-team-score')).toHaveText('1');
    await expect(page.locator('.cl-scoreboard__side--away .cl-team-name')).toHaveText(
      'Deportivo Sur',
    );
  });

  test('rank badge in matches-view card uses monospace font and is spaced >= 6px from score', async ({
    page,
  }) => {
    await page.goto(`/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/matches?view=cards`);

    // The rank badge is rendered with cl-badge--rank.
    const rankBadge = page.locator('.cl-badge--rank').first();
    await expect(rankBadge).toBeVisible();
    await expect(rankBadge).toContainText('#1');

    // cl-badge--rank applies JetBrains Mono font family.
    const fontFamily = await rankBadge.evaluate((el) => window.getComputedStyle(el).fontFamily);
    expect(fontFamily.toLowerCase()).toContain('jetbrains mono');

    // The gap between the badge and the adjacent score element is >= 6px.
    // We measure the horizontal distance between the right edge of the badge
    // and the left edge of the score span inside the same cl-match-card__side.
    const side = rankBadge.locator('xpath=ancestor::li[contains(@class,"cl-match-card__side")]');
    const score = side.locator('.cl-stat-tile__value').first();
    await expect(score).toBeVisible();

    const badgeBox = await rankBadge.boundingBox();
    const scoreBox = await score.boundingBox();
    expect(badgeBox).not.toBeNull();
    expect(scoreBox).not.toBeNull();

    // Gap = left edge of score - right edge of badge.
    const gap = (scoreBox?.x ?? 0) - ((badgeBox?.x ?? 0) + (badgeBox?.width ?? 0));
    expect(gap).toBeGreaterThanOrEqual(6);
  });
});

test.describe('match page identity, registered squads and stream link', () => {
  test('an upcoming match shows each side crest, its registered squad, and a watch link', async ({
    page,
  }) => {
    await page.goto(
      `/es/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/stages/${STAGE}/matches/${upcomingMatchNumber}`,
    );
    await page.waitForSelector('meta[name="copalibre:deferred-stylesheet"]', { state: 'attached' });

    await expect(page.locator('.cl-team-crest')).toHaveCount(2);
    // The squad note is written once for the match, not once per team.
    await expect(page.getByText('Plantel inscripto')).toHaveCount(1);
    await expect(page.getByText('Ada Lovelace')).toBeVisible();
    await expect(page.getByText('Grace Hopper')).toBeVisible();

    const watch = page.getByRole('link', { name: 'Ver transmisión' });
    await expect(watch).toHaveAttribute('href', 'https://example.org/live/semifinal-1');
    await expect(watch).toHaveAttribute('target', '_blank');
    await expect(watch).toHaveAttribute('rel', 'noopener noreferrer');
  });
});

test.describe('match page width and officials', () => {
  const MATCH_PAGE = `/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/stages/${STAGE}/matches/${MATCH}`;
  const OVERVIEW_PAGE = `/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`;

  test.beforeEach(() => {
    withOfficials = true;
  });
  test.afterEach(() => {
    withOfficials = false;
  });

  test('at 1440 px the match content is as wide as the overview content', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(OVERVIEW_PAGE);
    const overviewWidth = (await page.locator('main > .cl-container--public').first().boundingBox())
      ?.width;
    await page.goto(MATCH_PAGE);
    const matchWidth = (await page.locator('main > .cl-container--public').first().boundingBox())
      ?.width;
    expect(overviewWidth).toBeDefined();
    expect(Math.abs((matchWidth ?? 0) - (overviewWidth ?? 0))).toBeLessThan(2);
  });

  test('officials are text rows with no button, chip or bordered styling', async ({ page }) => {
    await page.goto(MATCH_PAGE);
    const officials = page.locator('section[aria-labelledby="officials-heading"]');
    await expect(officials.getByText('Ana Pérez')).toBeVisible();
    await expect(officials.getByRole('button')).toHaveCount(0);
    const rows = officials.locator('.cl-officials-list li');
    await expect(rows).toHaveCount(2);
    for (const row of await rows.all()) {
      const style = await row.evaluate((element) => {
        const computed = getComputedStyle(element);
        return { border: computed.borderTopWidth, background: computed.backgroundColor };
      });
      expect(style.border).toBe('0px');
      expect(style.background).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
    }
  });
});

/**
 * Every team name and score box lies inside the hero card. The page clips horizontal overflow
 * (`overflow-x: hidden`), so a scroll-width check could not see a score spilling past an edge.
 */
async function expectScoreboardInsideHero(page: Page): Promise<void> {
  const hero = await page.locator('.cl-match-hero').boundingBox();
  expect(hero).not.toBeNull();
  if (!hero) return;
  for (const selector of ['.cl-team-name', '.cl-team-score']) {
    for (const box of await page.locator(`.cl-scoreboard ${selector}`).evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left + window.scrollX, right: rect.right + window.scrollX };
      }),
    )) {
      expect(box.left).toBeGreaterThanOrEqual(hero.x);
      expect(box.right).toBeLessThanOrEqual(hero.x + hero.width);
    }
  }
}

/** The two scores share one row, with the divider between them on that row. */
async function expectScoresFacingOnOneRow(page: Page): Promise<void> {
  const home = await page.locator('.cl-scoreboard__side--home .cl-team-score').boundingBox();
  const away = await page.locator('.cl-scoreboard__side--away .cl-team-score').boundingBox();
  const divider = await page.locator('.cl-scoreboard__divider').boundingBox();
  expect(home && away && divider).toBeTruthy();
  if (!home || !away || !divider) return;
  const homeCentre = home.y + home.height / 2;
  expect(Math.abs(homeCentre - (away.y + away.height / 2))).toBeLessThanOrEqual(4);
  expect(Math.abs(homeCentre - (divider.y + divider.height / 2))).toBeLessThanOrEqual(8);
  expect(home.x).toBeLessThan(divider.x);
  expect(away.x).toBeGreaterThan(divider.x);
}

test.describe('match scoreboard keeps both sides on one row', () => {
  const MATCH_PAGE = `/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/stages/${STAGE}/matches/${MATCH}`;

  test('390x844: both scores share one row across the divider without horizontal scroll', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(MATCH_PAGE);
    await page.waitForSelector('meta[name="copalibre:deferred-stylesheet"]', { state: 'attached' });
    await page.evaluate(() => document.fonts.ready);

    await expectScoresFacingOnOneRow(page);
    await expectScoreboardInsideHero(page);
  });

  for (const width of [390, 188]) {
    test(`${width}px: long names wrap in their own column and three-digit scores stay on one row inside the card`, async ({
      page,
    }) => {
      withLongNames = true;
      try {
        await page.setViewportSize({ width, height: 844 });
        await page.goto(MATCH_PAGE);
        await page.waitForSelector('meta[name="copalibre:deferred-stylesheet"]', {
          state: 'attached',
        });
        await page.evaluate(() => document.fonts.ready);
        await expect(page.locator('.cl-scoreboard__side--home .cl-team-score')).toHaveText('102');
        await expectScoresFacingOnOneRow(page);
        await expectScoreboardInsideHero(page);
      } finally {
        withLongNames = false;
      }
    });
  }

  test('1440x900: each side keeps its name and score on one line', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(MATCH_PAGE);
    await page.waitForSelector('meta[name="copalibre:deferred-stylesheet"]', { state: 'attached' });
    await page.evaluate(() => document.fonts.ready);

    for (const side of ['home', 'away']) {
      const name = await page.locator(`.cl-scoreboard__side--${side} .cl-team-name`).boundingBox();
      const score = await page
        .locator(`.cl-scoreboard__side--${side} .cl-team-score`)
        .boundingBox();
      expect(name).not.toBeNull();
      expect(score).not.toBeNull();
      if (!name || !score) return;
      // The abbreviation under the name shifts the name box off the score centre, so
      // "one line" is checked as the two vertical extents overlapping.
      expect(name.y).toBeLessThan(score.y + score.height);
      expect(score.y).toBeLessThan(name.y + name.height);
    }
  });
});
