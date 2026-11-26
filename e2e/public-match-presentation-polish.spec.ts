import { createServer, type Server } from 'node:http';
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

let apiServer: Server;
// Set by the officials test only: the match report then names two officials.
let withOfficials = false;

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
          withOfficials
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

test.describe('match scoreboard keeps both sides on one row', () => {
  const MATCH_PAGE = `/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/stages/${STAGE}/matches/${MATCH}`;

  test('390x844: both scores share one row across the divider without horizontal scroll', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(MATCH_PAGE);
    await page.waitForSelector('meta[name="copalibre:deferred-stylesheet"]', { state: 'attached' });
    await page.evaluate(() => document.fonts.ready);

    const home = page.locator('.cl-scoreboard__side--home .cl-team-score');
    const away = page.locator('.cl-scoreboard__side--away .cl-team-score');
    const divider = page.locator('.cl-scoreboard__divider');
    const homeBox = await home.boundingBox();
    const awayBox = await away.boundingBox();
    const dividerBox = await divider.boundingBox();
    expect(homeBox).not.toBeNull();
    expect(awayBox).not.toBeNull();
    expect(dividerBox).not.toBeNull();
    if (!homeBox || !awayBox || !dividerBox) return;

    const homeCentre = homeBox.y + homeBox.height / 2;
    const awayCentre = awayBox.y + awayBox.height / 2;
    expect(Math.abs(homeCentre - awayCentre)).toBeLessThanOrEqual(4);
    // The divider sits on the score row, between the two scores.
    expect(Math.abs(dividerBox.y + dividerBox.height / 2 - homeCentre)).toBeLessThanOrEqual(8);
    expect(homeBox.x).toBeLessThan(dividerBox.x);
    expect(awayBox.x).toBeGreaterThan(dividerBox.x);

    const scroll = await page.evaluate(() => {
      const hero = document.querySelector('.cl-match-hero');
      return {
        pageScroll: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        heroScroll: hero !== null && hero.scrollWidth <= hero.clientWidth,
      };
    });
    expect(scroll.pageScroll).toBe(true);
    expect(scroll.heroScroll).toBe(true);
  });

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
