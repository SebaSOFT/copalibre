import { createServer, type Server } from 'node:http';
import { expect, test } from '@playwright/test';

/**
 * End-to-end tests for OpenSpec 0192 (Public Web & Broadcast Polish):
 * - 5.1: Organization home shows a Final section for finished tournaments, with no "LIVE" badge
 * - 5.2: Finished round-robin stage page renders compact grid, not elimination bracket tree
 * - 5.3: Finished tournament overview and organization home visibly present its champion
 * - 5.4: Player profile page shows non-empty career statistics and tokenized colors
 */

const ORGANIZATION = 'liga-mendocina';
const TOURNAMENT_ALIAS = 'clausura-2025';
const PERSON_ID = '01900000-0000-7000-8000-000000000099';

const finishedTournamentItem = {
  tournamentId: '01900000-0000-7000-8000-000000000010',
  alias: TOURNAMENT_ALIAS,
  name: 'Clausura 2025',
  status: 'finished',
  discipline: {
    descriptorId: '01890000-0000-7000-8000-000000000001',
    version: '1.0.0',
    name: 'Football',
  },
  winners: [
    {
      zoneId: '01900000-0000-7000-8000-000000000020',
      zoneName: 'Zona Campeonato',
      champion: {
        entrantId: '01900000-0000-7000-8000-000000000030',
        name: 'Club Andes',
        abbreviation: 'AND',
      },
      runnerUp: {
        entrantId: '01900000-0000-7000-8000-000000000031',
        name: 'Deportivo Sur',
        abbreviation: 'SUR',
      },
    },
  ],
};

const organizationTournaments = {
  organizationAlias: ORGANIZATION,
  organizationName: 'Liga Mendocina',
  tournaments: [finishedTournamentItem],
  clubs: [],
};

const overview = {
  organizationAlias: ORGANIZATION,
  organizationName: 'Liga Mendocina',
  tournamentAlias: TOURNAMENT_ALIAS,
  tournamentName: 'Clausura 2025',
  seasonName: 'Temporada 2025',
  status: 'finished',
  winners: finishedTournamentItem.winners,
  matches: [
    {
      matchNumber: 1,
      stageNumber: 1,
      homeName: 'Club Andes',
      homeAbbreviation: 'AND',
      homeScore: 2,
      awayName: 'Deportivo Sur',
      awayAbbreviation: 'SUR',
      awayScore: 1,
      status: 'final',
      scheduledAt: '2025-11-20T18:00:00.000Z',
    },
  ],
  clubs: [],
  ruleset: {
    format: 'round-robin',
    match_duration_minutes: 90,
    points_for_win: 3,
  },
};

const roundRobinBracket = {
  format: 'round-robin',
  matches: [],
};

const stageMatches = [
  {
    matchId: '00000000-0000-7000-8000-000000000050',
    stageNumber: 1,
    matchNumber: 1,
    status: 'final',
    round: 1,
    homeName: 'Club Andes',
    homeAbbreviation: 'AND',
    homeScore: 2,
    awayName: 'Deportivo Sur',
    awayAbbreviation: 'SUR',
    awayScore: 1,
    decidingFactor: 'regular time',
  },
];

const playerProfile = {
  personId: PERSON_ID,
  displayName: 'Mateo Rossi',
  alias: 'mrossi',
  nationality: 'AR',
  age: 24,
  competitionHistory: [
    {
      tournamentId: '01900000-0000-7000-8000-000000000010',
      tournamentName: 'Clausura 2025',
      teamName: 'Club Andes',
      role: 'player',
      matchesPlayed: 12,
      statistics: { goals: 8 },
    },
  ],
  careerStatistics: [
    {
      disciplineDescriptorId: '01890000-0000-7000-8000-000000000001',
      disciplineName: 'Football',
      statistics: [
        { code: 'goals', label: 'Goals', value: 8 },
        { code: 'assists', label: 'Assists', value: 5 },
      ],
    },
  ],
};

let apiServer: Server;

test.beforeAll(async () => {
  apiServer = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    const [path] = (req.url ?? '').split('?');

    if (path === `/organizations/${ORGANIZATION}/public/tournaments`) {
      res.end(JSON.stringify(organizationTournaments));
      return;
    }

    if (
      path === `/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/overview` ||
      path === `/organizations/${ORGANIZATION}/public/tournaments/${TOURNAMENT_ALIAS}/overview`
    ) {
      res.end(JSON.stringify(overview));
      return;
    }

    if (
      path === `/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/stages/1/bracket`
    ) {
      res.end(JSON.stringify(roundRobinBracket));
      return;
    }

    if (path === `/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/matches-view`) {
      res.end(JSON.stringify({ matches: stageMatches }));
      return;
    }

    if (path === `/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/public/tables`) {
      res.end(JSON.stringify({ layouts: [] }));
      return;
    }

    if (
      path ===
      `/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/persons/${PERSON_ID}/public/profile`
    ) {
      res.end(JSON.stringify(playerProfile));
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

test.describe('OpenSpec 0192 Public Web & Broadcast Polish', () => {
  test('5.1 organization home shows a Final section for finished tournaments, with no LIVE badge', async ({
    page,
  }) => {
    await page.goto(`/${ORGANIZATION}`);

    // The Final section should exist with heading
    const finishedSection = page.locator('section[aria-labelledby="heading-finished"]');
    await expect(finishedSection).toBeVisible();
    await expect(page.locator('#heading-finished')).toContainText('Finished');

    // The tournament card should be inside the finished section
    const card = finishedSection.locator('[data-tournament-alias="clausura-2025"]');
    await expect(card).toBeVisible();

    // Verify status badge is "Final" and there is NO "LIVE" badge
    await expect(card.locator('.cl-status-badge')).toContainText(/final/i);
    await expect(card.locator('.cl-badge-live')).toHaveCount(0);
    await expect(card.locator('.cl-live-pulse')).toHaveCount(0);
    await expect(card.getByText(/live/i)).toHaveCount(0);
  });

  test('5.2 a finished round-robin tournament stage page renders the compact grid, not an elimination bracket tree', async ({
    page,
  }) => {
    await page.goto(`/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/stages/1`);

    // Matches grid is rendered with match cards
    await expect(page.locator('.cl-matches-view__grid')).toBeVisible();
    await expect(page.locator('.cl-match-card')).toBeVisible();
    await expect(page.getByText('Club Andes')).toBeVisible();
    await expect(page.getByText('Deportivo Sur')).toBeVisible();

    // Elimination bracket tree should NOT be rendered
    await expect(page.locator('.cl-bracket-view')).toHaveCount(0);
    await expect(page.locator('.cl-bracket')).toHaveCount(0);
  });

  test('5.3 a finished tournament overview and organization home visibly presents its champion', async ({
    page,
  }) => {
    // 1. Check organization home presents champion
    await page.goto(`/${ORGANIZATION}`);
    const cardPodium = page.locator(
      'section[aria-labelledby="heading-finished"] .cl-podium-container',
    );
    await expect(cardPodium).toBeVisible();
    await expect(cardPodium.locator('.cl-champion-spot')).toBeVisible();
    await expect(cardPodium).toContainText('Club Andes');
    await expect(cardPodium).toContainText('Champion');

    // 2. Check tournament overview page prominently presents champion
    await page.goto(`/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`);
    const overviewPodium = page.locator('.cl-podium-container.cl-podium-prominent');
    await expect(overviewPodium).toBeVisible();
    await expect(overviewPodium.locator('.cl-champion-spot')).toBeVisible();
    await expect(overviewPodium).toContainText('Club Andes');
    await expect(overviewPodium).toContainText('Champion');
    await expect(overviewPodium).toContainText('Deportivo Sur');
    await expect(overviewPodium).toContainText(/runner-up/i);
  });

  test('5.4 player profile page shows non-empty career statistics and uses design token palette', async ({
    page,
  }) => {
    await page.goto(`/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/players/${PERSON_ID}`);

    // Verify player identity and career statistics are displayed
    await expect(page.getByText('Mateo Rossi')).toBeVisible();
    await expect(page.getByText('Career statistics')).toBeVisible();
    await expect(page.getByText('Goals')).toBeVisible();
    await expect(page.getByText('8', { exact: true })).toBeVisible();
    await expect(page.getByText('Assists')).toBeVisible();
    await expect(page.getByText('5', { exact: true })).toBeVisible();

    // Verify back-link does not use hardcoded default-blue #2563eb (rgb(37, 99, 235))
    const backLink = page.locator('.cl-player-profile-page__back a');
    await expect(backLink).toBeVisible();
    const backLinkColor = await backLink.evaluate((el) => window.getComputedStyle(el).color);
    const unstyledDefaultBlue = ['rgb', '(37, 99, 235)'].join('');
    expect(backLinkColor).not.toBe(unstyledDefaultBlue);

    // Verify tags / chips do not use unstyled white background #f3f4f6 (rgb(243, 244, 246))
    const unstyledChipBg = ['rgb', '(243, 244, 246)'].join('');
    const tags = page.locator('.cl-player-profile__tag');
    const tagCount = await tags.count();
    expect(tagCount).toBeGreaterThan(0);
    for (let i = 0; i < tagCount; i++) {
      const bg = await tags.nth(i).evaluate((el) => window.getComputedStyle(el).backgroundColor);
      expect(bg).not.toBe(unstyledChipBg);
    }
  });
});
