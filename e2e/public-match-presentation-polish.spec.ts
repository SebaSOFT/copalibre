import { createServer, type Server } from 'node:http';
import { expect, test } from '@playwright/test';

/**
 * End-to-end tests for OpenSpec 0197 (Public Match Presentation and Badge Polish):
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

const BASE = `/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`;

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

test.beforeAll(async () => {
  apiServer = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    const [path] = (req.url ?? '').split('?');

    if (path === `${BASE}/overview`) {
      res.end(JSON.stringify(overview));
      return;
    }

    if (path === `${BASE}/stages/${STAGE}/matches/${MATCH}`) {
      res.end(JSON.stringify(finalizedMatchReport));
      return;
    }

    if (path === `${BASE}/matches-view`) {
      res.end(JSON.stringify({ matches: [matchWithPosition] }));
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

test.describe('OpenSpec 0197 Public Match Presentation and Badge Polish', () => {
  test('4.1 finalized match detail page does not show scheduling placeholder banners', async ({
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

    // Scores and team abbreviations are present — the match did finish.
    await expect(page.getByRole('heading', { name: /AND.*3.*1.*SUR/ })).toBeVisible();
  });

  test('4.2 rank badge in matches-view card uses monospace font and is spaced >= 6px from score', async ({
    page,
  }) => {
    await page.goto(`/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/matches`);

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
