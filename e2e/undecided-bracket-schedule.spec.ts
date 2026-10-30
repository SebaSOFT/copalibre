import { createServer, type Server } from 'node:http';
import { expect, test } from './fixtures.js';
import { seedLoginTransaction, loginCallbackUrl, TOKEN_ENDPOINT } from './support/control-login.js';
import type { Locator, Page } from '@playwright/test';

/**
 * A published eight-entrant cup with a third-place game, read before its semi-finals are played:
 * every undecided side names the match it waits on, on the public programme (with and without
 * scripting), on TV and in the operator console; a resolution then seats the entrant in place.
 */
const org = 'liga-eliminatoria';
const tournament = 'copa-invierno';
const base = `/organizations/${org}/tournaments/${tournament}`;
const finalId = '0199c000-0000-7000-8000-000000000007';
const kickoff = Date.UTC(2026, 10, 14, 18);
let semisPlayed = false;
let server: Server;

const club = (n: number) => ({ name: `Club ${n}`, abbreviation: `C${n}` });
const sourceOf = (kind: 'winner-of' | 'loser-of', round: number, position: number) => ({
  kind,
  nodeKey: `SE-R${round}-M${position}`,
  matchId: `0199c000-0000-7000-8000-00000000000${round === 1 ? position : 4 + position}`,
  round,
  position,
});
const side = (prefix: 'home' | 'away', n: number | undefined, source?: object) => ({
  ...(n === undefined
    ? {}
    : {
        [`${prefix}EntrantId`]: `entrant-${n}`,
        [`${prefix}Name`]: club(n).name,
        [`${prefix}Abbreviation`]: club(n).abbreviation,
      }),
  ...(source === undefined ? {} : { [`${prefix}Source`]: source }),
});
const rows = () => {
  const quarter = (position: number) => ({
    matchId: `0199c000-0000-7000-8000-00000000000${position}`,
    nodeKey: `SE-R1-M${position}`,
    stageNumber: 1,
    matchNumber: position,
    round: 1,
    status: 'final',
    ...side('home', position),
    ...side('away', 9 - position),
    homeScore: 2,
    awayScore: 0,
  });
  const semi = (position: number) => ({
    matchId: `0199c000-0000-7000-8000-00000000000${4 + position}`,
    nodeKey: `SE-R2-M${position}`,
    stageNumber: 1,
    matchNumber: 4 + position,
    round: 2,
    status: semisPlayed ? 'final' : 'upcoming',
    ...side('home', position, sourceOf('winner-of', 1, position * 2 - 1)),
    ...side('away', position + 2, sourceOf('winner-of', 1, position * 2)),
    ...(semisPlayed ? { homeScore: 1, awayScore: 0 } : {}),
    scheduledAt: new Date(kickoff - 4 * 60 * 60_000).toISOString(),
    venueName: 'Cancha 1',
  });
  return [
    ...[1, 2, 3, 4].map(quarter),
    semi(1),
    semi(2),
    {
      matchId: finalId,
      nodeKey: 'SE-R3-M1',
      stageNumber: 1,
      matchNumber: 7,
      round: 3,
      status: 'upcoming',
      ...side('home', semisPlayed ? 1 : undefined, sourceOf('winner-of', 2, 1)),
      ...side('away', semisPlayed ? 2 : undefined, sourceOf('winner-of', 2, 2)),
      scheduledAt: new Date(kickoff).toISOString(),
      venueName: 'Estadio Central',
    },
    {
      matchId: '0199c000-0000-7000-8000-000000000008',
      nodeKey: 'placement-3',
      branch: 'placement-3',
      stageNumber: 1,
      matchNumber: 8,
      round: 1,
      status: 'upcoming',
      ...side('home', semisPlayed ? 3 : undefined, sourceOf('loser-of', 2, 1)),
      ...side('away', semisPlayed ? 4 : undefined, sourceOf('loser-of', 2, 2)),
      scheduledAt: new Date(kickoff - 2 * 60 * 60_000).toISOString(),
      venueName: 'Estadio Central',
    },
  ];
};
const overview = () => ({
  organizationAlias: org,
  organizationName: 'Liga Eliminatoria',
  organizationTimeZone: 'America/Argentina/Mendoza',
  tournamentAlias: tournament,
  tournamentName: 'Copa Invierno',
  seasonName: 'Invierno 2026',
  matches: [],
  clubs: [],
  ruleset: {},
});

test.beforeAll(async ({ workerPort }) => {
  server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    const url = new URL(req.url ?? '/', 'http://localhost');
    const state = url.searchParams.get('state');
    const send = (body: unknown) => res.end(JSON.stringify(body));
    if (url.pathname === `${base}/overview`) send(overview());
    else if (url.pathname === `${base}/matches-view`)
      send({
        matches: rows().filter((row) => !state || state === 'all' || row.status === state),
      });
    else if (url.pathname === `${base}/live`) send({ matches: [] });
    else if (url.pathname === `${base}/completion`)
      send({
        totalMatches: 8,
        resolvedMatches: semisPlayed ? 6 : 4,
        liveMatches: 0,
        scheduledMatches: semisPlayed ? 2 : 4,
        finalizedMatches: semisPlayed ? 6 : 4,
        forfeitedMatches: 0,
        stages: [
          {
            stageId: '0199c000-0000-7000-8000-0000000000aa',
            stageNumber: 1,
            stageName: 'Copa',
            totalMatches: 8,
            resolvedMatches: semisPlayed ? 6 : 4,
            zones: [],
          },
        ],
      });
    else if (url.pathname === `${base}/stages/1/bracket`)
      send({ format: 'single-elimination', zones: [], matches: [] });
    else {
      res.statusCode = 404;
      res.end('{}');
    }
  });
  await new Promise<void>((resolve) => server.listen(workerPort, '127.0.0.1', resolve));
});
test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
test.beforeEach(() => {
  semisPlayed = false;
});

/** An event stream the test can write into, served through the page's own `fetch`. */
async function streams(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const original = window.fetch.bind(window);
    const controllers: ReadableStreamDefaultController<Uint8Array>[] = [];
    Object.assign(window, {
      __domainEvent: (event: unknown) => {
        for (const controller of controllers)
          controller.enqueue(
            new TextEncoder().encode(
              `id: resolved\nevent: domain\ndata: ${JSON.stringify(event)}\n\n`,
            ),
          );
      },
    });
    window.fetch = async (input, init) => {
      if (String(input).includes('/events/'))
        return new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controllers.push(controller);
              controller.enqueue(new TextEncoder().encode(': connected\n\n'));
            },
          }),
          { headers: { 'content-type': 'text/event-stream' } },
        );
      return original(input, init);
    };
  });
}

async function resolve(page: Page): Promise<void> {
  await page.evaluate(
    (event) =>
      (window as unknown as { __domainEvent: (event: unknown) => void }).__domainEvent(event),
    {
      eventId: '0199c000-0000-7000-8000-0000000000bb',
      organizationId: 'org',
      entityId: finalId,
      stream: `match:${finalId}`,
      eventType: 'fixture.entrant-resolved',
      projectionVersion: 1,
      createdAt: new Date().toISOString(),
      payload: { matchId: finalId, side: 'away', entrantId: 'entrant-2' },
    },
  );
}

const upcoming = `/${org}/tournaments/${tournament}/matches?state=upcoming`;

/** A side reads its source in full, or compactly with the full wording as its title. */
const source = (scope: Locator, text: string): Locator =>
  scope
    .getByText(text, { exact: true })
    .or(scope.getByTitle(text, { exact: true }))
    .first();

test('names every undecided side on the public programme and seats the entrant in place', async ({
  page,
  browser,
}) => {
  await streams(page);
  await page.goto(`${upcoming}&view=cards`);
  const final = page.locator(`[data-match="${finalId}"]`);
  await expect(source(final, 'Winner of Semi-final 1')).toBeVisible();
  await expect(source(final, 'Winner of Semi-final 2')).toBeVisible();
  await expect(final.getByText('Estadio Central')).toBeVisible();
  await expect(source(page, 'Loser of Semi-final 1')).toBeVisible();
  await expect(page.getByText('Place 3')).toBeVisible();
  await expect(page.getByText('TBD', { exact: true })).toHaveCount(0);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: 'docs/assets/screenshots/undecided-public-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'docs/assets/screenshots/undecided-public-mobile.png' });

  await page.evaluate(() => Object.assign(window, { documentMarker: 'same-document' }));
  semisPlayed = true;
  await resolve(page);
  await expect(final.getByText('Club 2')).toBeVisible();
  await expect(final.getByTitle('Winner of Semi-final 2')).toHaveCount(0);
  await expect(final.getByText('Winner of Semi-final 2')).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as unknown as { documentMarker?: string }).documentMarker),
  ).toBe('same-document');

  semisPlayed = false;
  const noJs = await browser.newContext({ javaScriptEnabled: false });
  const plain = await noJs.newPage();
  await plain.goto(upcoming);
  await expect(plain.getByRole('table').getByText('Winner of Semi-final 2')).toBeVisible();
  await plain.goto(`${upcoming}&view=cards`);
  await expect(plain.getByText('Loser of Semi-final 2')).toBeVisible();
  await noJs.close();
});

test('the broadcast list names the sources a final waits on', async ({ page }) => {
  await streams(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(`/tv/${org}/tournaments/${tournament}?view=matches&lang=en&token=test`);
  const list = page.getByTestId('tv-match-list');
  await expect(list).toBeVisible();
  await expect(list.getByRole('listitem', { name: /Winner of Semi-final 2/ })).toBeVisible();
  await page.screenshot({ path: 'docs/assets/screenshots/undecided-tv.png' });
});

test('the console states what an undecided final awaits and offers no controls', async ({
  page,
}) => {
  const matchPath = `${base}/matches/${finalId}`;
  await page.addInitScript(
    ({ matchPath, base, finalId, tokenEndpoint, consoleProjection }) => {
      window.fetch = async (input) => {
        const url = String(input);
        if (url === tokenEndpoint)
          return Response.json({ access_token: 'e2e-access-token', expires_in: 3600 });
        if (url === `${matchPath}/console`) return Response.json(consoleProjection);
        if (url === `${base}/stages/1/seeding`)
          return Response.json({
            stageId: 'stage',
            format: 'single-elimination',
            seeds: [],
            hasRecordedResults: false,
            zones: [
              {
                matches: [1, 2, 3, 4, 5, 6, 7].map((n) => {
                  const round = n <= 4 ? 1 : n <= 6 ? 2 : 3;
                  const position = n <= 4 ? n : n <= 6 ? n - 4 : 1;
                  return {
                    matchId: `SE-R${round}-M${position}`,
                    ...(n === 7 ? { persistedMatchId: finalId } : {}),
                    bracket: 'winners',
                    round,
                    position,
                    status: n <= 4 ? 'finalized' : 'scheduled',
                    slots: [],
                  };
                }),
              },
            ],
          });
        return new Response('Not found', { status: 404 });
      };
    },
    {
      matchPath,
      base,
      finalId,
      tokenEndpoint: TOKEN_ENDPOINT,
      consoleProjection: {
        matchId: finalId,
        stageNumber: 1,
        status: 'scheduled',
        result: null,
        liveScores: [],
        segments: [],
        runningTimers: [],
        events: [],
        eventDefinitions: [
          {
            code: 'goal',
            label: 'Gol',
            category: 'positive',
            permittedSegmentTypes: ['half'],
            actorRequirement: 'side',
            payloadSchema: { type: 'object' },
            display: {},
            secondaryActorFields: [],
          },
        ],
        eligiblePersonIds: [],
        rosters: [],
        rosterRoles: [],
        eligibleStaffIds: [],
        entrants: [{ entrantId: 'entrant-1', name: 'Club 1', abbreviation: 'C1' }],
        homeEntrantId: 'entrant-1',
        nodeKey: 'SE-R3-M1',
        homeSource: sourceOf('winner-of', 2, 1),
        awaySource: sourceOf('winner-of', 2, 2),
        capabilities: ['match.record-event', 'match.control-clock', 'match.finalize'],
        projectionVersion: 1,
      },
    },
  );
  const target = `/control/${org}/tournaments/${tournament}/matches/${finalId}`;
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  await expect(page.getByText('Esperando Ganador de Semifinal 2')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Gol', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Iniciar', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Finalizar/ })).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: 'docs/assets/screenshots/undecided-console-desktop.png' });
});
