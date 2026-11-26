import { createServer, type Server } from 'node:http';
import { expect, test } from './fixtures.js';

/**
 * The public match page shows the discipline's match counters per side and,
 * while the match is live, the timed penalties in force with the time left,
 * counting down without a reload. A finished match keeps the match-scope totals.
 */

const ORGANIZATION = 'liga-mendocina';
const TOURNAMENT_ALIAS = 'apertura-2026';
const BASE = `/api/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`;
const MATCH_PATH = `${BASE}/stages/1/matches/5`;
const HOME_ID = '00000000-0000-7000-8000-0000000000a1';
const AWAY_ID = '00000000-0000-7000-8000-0000000000a2';

const TEAM_FOULS = {
  code: 'team-fouls',
  label: { en: 'Team fouls', es: 'Faltas de equipo' },
  shortLabel: 'F',
  scope: 'match',
  events: ['team-foul'],
  warnAt: 3,
  values: [
    { entrantId: HOME_ID, value: 3 },
    { entrantId: AWAY_ID, value: 1 },
  ],
};

const TIMEOUTS = {
  code: 'timeouts',
  label: { en: 'Timeouts', es: 'Tiempos muertos' },
  shortLabel: 'TM',
  scope: 'segment',
  events: ['timeout'],
  allowance: 1,
  values: [
    { entrantId: HOME_ID, value: 1 },
    { entrantId: AWAY_ID, value: 0 },
  ],
};

const SUSPENSION = { timerId: 'timer-1', entrantId: AWAY_ID, remainingSeconds: 120 };

function report(status: 'live' | 'final', counters: unknown[], activePenalties: unknown[]) {
  return {
    organizationAlias: ORGANIZATION,
    organizationName: 'Liga Mendocina',
    organizationTimeZone: 'America/Argentina/Buenos_Aires',
    tournamentAlias: TOURNAMENT_ALIAS,
    tournamentName: 'Apertura 2026',
    stageNumber: 1,
    stageFormat: 'round-robin',
    matchNumber: 5,
    round: 3,
    status,
    homeEntrantId: HOME_ID,
    awayEntrantId: AWAY_ID,
    homeName: 'Club Andes',
    homeAbbreviation: 'AND',
    homeScore: 2,
    awayName: 'Deportivo Sur',
    awayAbbreviation: 'SUR',
    awayScore: 1,
    schedulePublished: true,
    officials: [],
    rosters: { home: [], away: [] },
    timeline: [],
    disciplineImages: {},
    counters,
    ...(activePenalties.length === 0 ? {} : { activePenalties }),
  };
}

const LIVE_MATCH = {
  matchId: 'match-5',
  stageNumber: 1,
  matchNumber: 5,
  state: 'live',
  projectionVersion: 1,
  sides: [
    { entrantId: HOME_ID, name: 'Club Andes', score: 2 },
    { entrantId: AWAY_ID, name: 'Deportivo Sur', score: 1 },
  ],
  counters: [TEAM_FOULS, TIMEOUTS],
  activePenalties: [SUSPENSION],
};

let reportBody: unknown = report('live', [TEAM_FOULS, TIMEOUTS], [SUSPENSION]);
let liveBody: unknown = { matches: [LIVE_MATCH] };
let apiServer: Server;

test.beforeAll(async ({ workerPort }) => {
  apiServer = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    const [path] = (req.url ?? '').split('?');
    if (path === MATCH_PATH) {
      res.end(JSON.stringify(reportBody));
    } else if (path === `${BASE}/live`) {
      res.end(JSON.stringify(liveBody));
    } else {
      res.statusCode = 404;
      res.end(JSON.stringify({ message: 'not found' }));
    }
  });
  await new Promise<void>((resolve) => apiServer.listen(workerPort, '127.0.0.1', resolve));
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => apiServer.close(() => resolve()));
});

test.beforeEach(() => {
  reportBody = report('live', [TEAM_FOULS, TIMEOUTS], [SUSPENSION]);
  liveBody = { matches: [LIVE_MATCH] };
});

const MATCH_URL = `/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/stages/1/matches/5`;

test('a live match shows each counter per side and the penalty counting down', async ({ page }) => {
  await page.goto(MATCH_URL);

  const counters = page.locator('.cl-match-counters');
  await expect(counters).toContainText('Team fouls');
  await expect(counters).toContainText('Club Andes 3 !');
  await expect(counters).toContainText('Deportivo Sur 1');
  await expect(counters).toContainText('Club Andes 1/1 !');
  await expect(counters).toContainText('Deportivo Sur 0/1');

  const penalty = page.locator('.cl-match-penalty time');
  await expect(penalty).toContainText('Deportivo Sur:');
  await expect(penalty).toContainText('suspension');
  // The remaining time falls without a reload.
  await expect(penalty).toHaveText(/Deportivo Sur: 01:5\d suspension/, { timeout: 5000 });
});

test('a counter at its warning value is marked with a text cue, not colour alone', async ({
  page,
}) => {
  await page.goto(MATCH_URL);

  // Three team fouls against a warning value of three.
  const warning = page.locator('.cl-match-counter--warning').first();
  await expect(warning).toContainText('Club Andes 3 !');
  await expect(warning.locator('.cl-visually-hidden')).toHaveText(
    'Club Andes, Team fouls: 3 (warning)',
  );
});

test('a finished match keeps the match-scope totals and no penalty', async ({ page }) => {
  reportBody = report('final', [TEAM_FOULS], []);
  await page.goto(MATCH_URL);

  await expect(page.locator('.cl-match-counters')).toContainText('Team fouls');
  await expect(page.locator('.cl-match-counters')).toContainText('Club Andes 3 !');
  await expect(page.locator('.cl-match-counters')).not.toContainText('Timeouts');
  await expect(page.locator('.cl-match-penalty')).toHaveCount(0);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the counters wrap within the screen without horizontal scroll', async ({ page }) => {
    await page.goto(MATCH_URL);
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('.cl-match-counters')).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
