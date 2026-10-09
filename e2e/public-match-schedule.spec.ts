import { createServer, type Server } from 'node:http';
import { expect, test } from './fixtures.js';

/**
 * The public schedule: matches as tables grouped by stage, zone or group and round, a knockout
 * zone drawn as its bracket instead of rows, titled filters, and a tournament page that opens the
 * stage a viewer wants and keeps the standings within reach.
 */

const ORGANIZATION = 'liga-mendocina';
const TOURNAMENT_ALIAS = 'apertura-2026';
const BASE = `/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`;
const TOURNAMENT = `/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`;

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

const GROUPS = ['Grupo A', 'Grupo B'];
const groupRow = (matchNumber: number, round: number, group: string) => ({
  matchId: `group-${matchNumber}`,
  stageNumber: 1,
  matchNumber,
  round,
  status: 'final',
  homeName: `Local ${matchNumber}`,
  awayName: `Visita ${matchNumber}`,
  homeScore: 2,
  awayScore: 1,
  venueName: 'Estadio Central',
  scheduledAt: `2026-03-0${round}T18:00:00.000Z`,
  zoneName: 'Grupos',
  groupName: group,
});
const groupRows = GROUPS.flatMap((group, index) => [
  groupRow(index * 4 + 1, 1, group),
  groupRow(index * 4 + 2, 1, group),
  groupRow(index * 4 + 3, 2, group),
  groupRow(index * 4 + 4, 2, group),
]);

const CUPS = ['Copa Oro', 'Copa Plata', 'Copa Bronce'];
const cupFinal = (cup: number) => ({
  matchId: `cup-${cup}`,
  matchNumber: 100 + cup,
  bracket: 'winners',
  round: 1,
  position: 1,
  status: 'finalized',
  slots: [
    { kind: 'entrant', entrantId: `cup-${cup}-a`, name: `Campeón ${cup}`, score: 3 },
    { kind: 'entrant', entrantId: `cup-${cup}-b`, name: `Finalista ${cup}`, score: 1 },
  ],
});
const cupRows = CUPS.map((cup, index) => ({
  matchId: `cup-${index}`,
  stageNumber: 2,
  matchNumber: 101 + index,
  round: 1,
  status: 'final',
  homeName: `Campeón ${index}`,
  awayName: `Finalista ${index}`,
  homeScore: 3,
  awayScore: 1,
  zoneName: cup,
}));

let server: Server;
test.beforeAll(async ({ workerPort }) => {
  server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    const [path, query] = (req.url ?? '').split('?');
    if (path === `${BASE}/overview`) {
      res.end(JSON.stringify(overview));
    } else if (path === `${BASE}/completion`) {
      res.end(
        JSON.stringify({
          totalMatches: 11,
          resolvedMatches: 11,
          liveMatches: 0,
          scheduledMatches: 0,
          finalizedMatches: 11,
          forfeitedMatches: 0,
          stages: [
            { stageNumber: 1, stageName: 'Fase de grupos', totalMatches: 8 },
            { stageNumber: 2, stageName: 'Copas', totalMatches: 3 },
          ],
        }),
      );
    } else if (path === `${BASE}/matches-view`) {
      const params = new URLSearchParams(query);
      const stage = params.get('stageNumber');
      const rows = [...groupRows, ...cupRows].filter(
        (row) => stage === null || String(row.stageNumber) === stage,
      );
      res.end(JSON.stringify({ matches: rows }));
    } else if (path === `${BASE}/stages/1/bracket`) {
      res.end(
        JSON.stringify({
          format: 'round-robin',
          zones: [{ zoneName: 'Grupos', format: 'round-robin', matches: [] }],
        }),
      );
    } else if (path === `${BASE}/stages/2/bracket`) {
      res.end(
        JSON.stringify({
          format: 'single-elimination',
          zones: CUPS.map((zoneName, index) => ({
            zoneName,
            format: 'single-elimination',
            matches: [cupFinal(index)],
          })),
        }),
      );
    } else {
      res.statusCode = 404;
      res.end('{}');
    }
  });
  await new Promise<void>((resolve) => server.listen(workerPort, '127.0.0.1', resolve));
});
test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test('the matches page lists a table per group and draws each cup as a bracket', async ({
  page,
}) => {
  await page.goto(`${TOURNAMENT}/matches`);

  const schedule = page.locator('.cl-match-schedule');
  await expect(schedule.getByRole('heading', { name: 'Fase de grupos' })).toBeVisible();
  await expect(schedule.getByRole('heading', { name: 'Copas' })).toBeVisible();
  for (const group of GROUPS) {
    await expect(schedule.getByRole('heading', { name: group })).toBeVisible();
  }
  // One table per group, its two rounds as row-group headings; the cups add none.
  await expect(schedule.getByRole('table')).toHaveCount(2);
  const first = schedule.getByRole('table').first();
  await expect(first.getByRole('rowheader')).toHaveText(['Round 1', 'Round 2']);

  for (const cup of CUPS) {
    await expect(schedule.getByRole('heading', { name: cup })).toBeVisible();
  }
  await expect(schedule.locator('.cl-bracket-stage')).toHaveCount(3);
  // A knockout zone is its bracket only: its matches are not listed again as rows.
  await expect(schedule.getByRole('cell', { name: 'Campeón 0' })).toHaveCount(0);
});

test('round headings never mix competitions', async ({ page }) => {
  await page.goto(`${TOURNAMENT}/matches?stageNumber=1`);

  const tables = page.locator('.cl-match-schedule').getByRole('table');
  await expect(tables).toHaveCount(2);
  for (const table of await tables.all()) {
    await expect(table.getByRole('rowheader')).toHaveText(['Round 1', 'Round 2']);
  }
});

test('a state filter turns the knockout zones into a list of matches', async ({ page }) => {
  await page.goto(`${TOURNAMENT}/matches?stageNumber=2&state=final`);

  await expect(page.locator('.cl-match-schedule .cl-bracket-stage')).toHaveCount(0);
  await expect(page.locator('.cl-match-schedule').getByRole('table')).toHaveCount(3);
});

test('every filter row is titled and the view choice is offered for a short scope', async ({
  page,
}) => {
  await page.goto(`${TOURNAMENT}/matches`);
  await expect(page.locator('.cl-filter-row__title')).toHaveText([
    'Stage',
    'Zone',
    'Group',
    'State',
    'View',
  ]);

  await page.goto(`${TOURNAMENT}/matches?stageNumber=1&group=Grupo%20A`);
  await expect(page.locator('.cl-filter-row__title')).toHaveText([
    'Stage',
    'Group',
    'State',
    'View',
  ]);
});

test('the tournament page keeps every stage one click away once all is played', async ({
  page,
}) => {
  await page.goto(TOURNAMENT);

  const stages = page.locator('.cl-match-schedule details');
  await expect(stages).toHaveCount(2);
  // Every match is final, so nothing is left to follow and no stage starts open.
  await expect(stages.nth(0)).not.toHaveAttribute('open', '');
  await expect(stages.nth(1)).not.toHaveAttribute('open', '');

  await stages.nth(0).locator('summary').click();
  await expect(stages.nth(0).getByRole('table')).toHaveCount(2);
});
