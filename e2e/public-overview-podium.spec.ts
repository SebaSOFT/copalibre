import { createServer, type Server } from 'node:http';
import { expect, test } from './fixtures.js';

const organization = 'overview-fixture';
const basePath = `/${organization}/tournaments`;
const entrant = (id: string, name: string) => ({ entrantId: id, name });
const champions = [
  entrant('00000000-0000-7000-8000-000000000101', 'Andes'),
  entrant('00000000-0000-7000-8000-000000000102', 'Talleres'),
];
const gold = {
  zoneName: 'Copa Oro',
  champion: champions[0],
  champions,
  thirdPlace: entrant('00000000-0000-7000-8000-000000000103', 'Bronze Club'),
};
const silver = {
  zoneName: 'Copa Plata',
  champion: entrant('00000000-0000-7000-8000-000000000104', 'Concepcion'),
  runnerUp: entrant('00000000-0000-7000-8000-000000000105', 'Runner Club'),
};
const match = {
  matchId: '00000000-0000-7000-8000-000000000106',
  matchNumber: 1,
  stageNumber: 1,
  round: 1,
  status: 'final',
  homeName: 'Andes',
  awayName: 'Concepcion',
  homeScore: 2,
  awayScore: 1,
  scheduledAt: '2025-05-18T15:30:00.000Z',
};

let apiServer: Server;

test.beforeAll(async ({ workerPort }) => {
  apiServer = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    const path = (req.url ?? '').split('?')[0] ?? '';
    const tournament = path.startsWith(`/organizations/${organization}/tournaments/single-zone`)
      ? 'single-zone'
      : 'multi-zone';
    const route = `/organizations/${organization}/tournaments/${tournament}`;
    if (path === `${route}/overview`) {
      res.end(
        JSON.stringify({
          organizationAlias: organization,
          organizationName: 'Fixture League',
          tournamentAlias: tournament,
          tournamentName: 'Overview Fixture',
          status: 'finished',
          winners: tournament === 'multi-zone' ? [gold, silver] : [gold],
          matches: [match],
          clubs: [],
          ruleset: {},
        }),
      );
      return;
    }
    if (path === `${route}/matches-view`) {
      res.end(JSON.stringify({ matches: [match] }));
      return;
    }
    if (path === `${route}/completion`) {
      res.end(
        JSON.stringify({
          totalMatches: 1,
          resolvedMatches: 1,
          liveMatches: 0,
          scheduledMatches: 0,
          finalizedMatches: 1,
          forfeitedMatches: 0,
          stages: [],
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

test('finished multi-zone overview shows shared champions and known third place', async ({
  page,
  workerPort,
}) => {
  await page.setExtraHTTPHeaders({ 'x-copalibre-api-port': String(workerPort) });
  await page.goto(`${basePath}/multi-zone`);

  const podium = page.locator('.cl-podium-container');
  await expect(podium).toBeVisible();
  await expect(podium.locator('.cl-zone-podium')).toHaveCount(2);
  await expect(podium.getByText('Andes', { exact: true })).toBeVisible();
  await expect(podium.getByText('Talleres', { exact: true })).toBeVisible();
  await expect(podium.getByText('Bronze Club', { exact: true })).toBeVisible();
  await expect(podium.getByText('Runner Club', { exact: true })).toBeVisible();

  const result = page.locator('.cl-match-card').filter({ hasText: 'Andes' });
  await expect(result).toContainText('Final');
  await expect(result.getByText('Andes 2', { exact: true })).toBeVisible();
  await expect(result.getByText('1 Concepcion', { exact: true })).toBeVisible();
});

test('single-zone overview keeps its match schedule but omits the podium', async ({
  page,
  workerPort,
}) => {
  await page.setExtraHTTPHeaders({ 'x-copalibre-api-port': String(workerPort) });
  await page.goto(`${basePath}/single-zone`);

  await expect(page.locator('.cl-podium-container')).toHaveCount(0);
  const matches = page.getByRole('region', { name: 'Matches' });
  await expect(matches.locator('.cl-match-card')).toHaveCount(1);
  await expect(matches.locator('.cl-match-card')).toContainText('Andes');
  await expect(matches.getByRole('link', { name: 'See every match' })).toBeVisible();
});
