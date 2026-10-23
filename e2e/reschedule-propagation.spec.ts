import { createServer, type Server } from 'node:http';
import { expect, test } from './fixtures.js';
import { seedLoginTransaction, loginCallbackUrl, TOKEN_ENDPOINT } from './support/control-login.js';
import type { Page } from '@playwright/test';

const org = 'liga-reprogramacion';
const tournament = 'copa-primavera';
const base = `/organizations/${org}/tournaments/${tournament}`;
const target = `/control/${org}/tournaments/${tournament}/stages/1/schedule`;
const matchId = '0199a000-0000-7000-8000-000000000001';
const stageId = '0199a000-0000-7000-8000-000000000002';
const first = Date.UTC(2026, 10, 7, 14, 30);
let moved = false;
let previews = 0;
let server: Server;
const previous = { startsAt: first, venue: { alias: 'cancha-1', name: 'Cancha 1' } };
const row = () => ({
  matchId,
  stageNumber: 1,
  matchNumber: 1,
  round: 1,
  status: 'upcoming',
  homeEntrantId: 'alfa',
  awayEntrantId: 'bravo',
  homeName: 'Club Alfa',
  awayName: 'Club Bravo',
  homeAbbreviation: 'ALF',
  awayAbbreviation: 'BRA',
  scheduledAt: new Date(first + (moved ? 4 * 60 * 60_000 : 0)).toISOString(),
  venueName: moved ? 'Cancha 2' : 'Cancha 1',
  scheduleVersion: moved ? 2 : 1,
  rescheduledFrom: moved ? previous : null,
});
const overview = () => ({
  organizationAlias: org,
  organizationName: 'Liga de Mendoza',
  organizationTimeZone: 'America/Argentina/Mendoza',
  tournamentAlias: tournament,
  tournamentName: 'Copa Primavera',
  seasonName: 'Primavera 2026',
  matches: [{ ...row(), status: 'scheduled' }],
  clubs: [],
  ruleset: {},
});
const slots = [
  { slotId: 'slot-1', venueId: 'venue-1', startsAt: new Date(first).toISOString(), matchCount: 1 },
  {
    slotId: 'slot-2',
    venueId: 'venue-2',
    startsAt: new Date(first + 4 * 60 * 60_000).toISOString(),
    matchCount: 0,
  },
];

test.beforeAll(async ({ workerPort }) => {
  server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (path === `${base}/overview`) res.end(JSON.stringify(overview()));
    else if (path === `${base}/matches-view`) res.end(JSON.stringify({ matches: [row()] }));
    else if (path === `${base}/live`) res.end(JSON.stringify({ matches: [] }));
    else if (path === `${base}/completion`)
      res.end(
        JSON.stringify({
          totalMatches: 1,
          resolvedMatches: 0,
          liveMatches: 0,
          scheduledMatches: 1,
          finalizedMatches: 0,
          forfeitedMatches: 0,
          stages: [
            {
              stageId,
              stageNumber: 1,
              stageName: 'Liga',
              totalMatches: 1,
              resolvedMatches: 0,
              zones: [],
            },
          ],
        }),
      );
    else if (path === `${base}/stages/1/bracket`)
      res.end(JSON.stringify({ format: 'round-robin', zones: [], matches: [] }));
    else if (path === `${base}/stages/1/matches/1`)
      res.end(
        JSON.stringify({
          ...row(),
          organizationAlias: org,
          tournamentAlias: tournament,
          tournamentName: 'Copa Primavera',
          organizationName: 'Liga de Mendoza',
          schedulePublished: true,
          officials: [],
          rosters: { home: [], away: [] },
          timeline: [],
        }),
      );
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
  moved = false;
  previews = 0;
});

async function streams(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const original = window.fetch.bind(window);
    const controllers: ReadableStreamDefaultController<Uint8Array>[] = [];
    Object.assign(window, {
      __scheduleEvent: (event: unknown) => {
        for (const controller of controllers)
          controller.enqueue(
            new TextEncoder().encode(
              `id: schedule-2\nevent: domain\ndata: ${JSON.stringify(event)}\n\n`,
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
async function builder(page: Page, subject: string): Promise<void> {
  await streams(page);
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    const path = new URL(url).pathname;
    const json = (body: unknown) => route.fulfill({ json: body });
    if (url === TOKEN_ENDPOINT)
      return json({
        access_token: `header.${Buffer.from(JSON.stringify({ sub: subject })).toString('base64url')}.signature`,
        expires_in: 3600,
      });
    if (!path.startsWith('/organizations/')) return route.continue();
    if (path === `/organizations/${org}/venues`)
      return json(
        [1, 2].map((court) => ({
          venueId: `venue-${court}`,
          organizationId: 'org',
          alias: `cancha-${court}`,
          name: `Cancha ${court}`,
          concurrentCapacity: 1,
        })),
      );
    if (path === `/organizations/${org}/officials`) return json([]);
    if (path === `/organizations/${org}/schedules`)
      return json([{ scheduleId: 'schedule', name: 'Sábado', slotMinutes: 90, slots }]);
    if (path === `${base}/stages/1/fixtures`)
      return json({
        stageId,
        fixtures: [
          {
            fixtureId: 'fixture',
            matchId,
            round: 1,
            homeEntrantId: 'Club Alfa',
            homeName: 'Club Alfa',
            awayEntrantId: 'Club Bravo',
            awayName: 'Club Bravo',
            matches: [{ matchId, number: 1, status: 'scheduled' }],
          },
        ],
      });
    if (path === `${base}/stages/${stageId}/schedule/preview`) {
      previews += 1;
      return json({
        assignments: [],
        conflicts: [],
        affectedPublishedMatches: [matchId],
        reasonRequiredMatches: [matchId],
        committable: true,
      });
    }
    if (path === `${base}/stages/${stageId}/schedule`) {
      if (route.request().method() === 'POST') moved = true;
      return json({
        assignments: [{ matchId, slotId: moved ? 'slot-2' : 'slot-1', officialIds: [] }],
      });
    }
    if (path.endsWith('/schedule/reasons/recent')) return json({ reasons: [] });
    return route.fulfill({ status: 404, json: {} });
  });
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);
  await expect(page.getByText('Ronda 1').first()).toBeVisible();
}
async function send(page: Page): Promise<void> {
  await page.evaluate(
    (event) =>
      (window as unknown as { __scheduleEvent: (event: unknown) => void }).__scheduleEvent(event),
    {
      eventId: '0199a000-0000-7000-8000-000000000003',
      organizationId: 'org',
      entityId: matchId,
      stream: `match:${matchId}`,
      eventType: 'match.rescheduled',
      projectionVersion: 2,
      createdAt: new Date().toISOString(),
      payload: {
        matchId,
        stageId,
        startsAt: first + 4 * 60 * 60_000,
        venue: { alias: 'cancha-2', name: 'Cancha 2' },
        previous,
        withdrawn: false,
        actor: 'user:operator-a',
        actorName: 'María González',
      },
    },
  );
}

test('a published move reaches public pages, kiosk and another builder without a document reload', async ({
  page,
  context,
  browser,
}) => {
  const spectator = await context.newPage();
  const report = await context.newPage();
  const tv = await context.newPage();
  const second = await context.newPage();
  for (const surface of [spectator, report, tv]) await streams(surface);
  await spectator.goto(`/es/${org}/tournaments/${tournament}/matches?view=cards&state=upcoming`);
  await report.goto(`/es/${org}/tournaments/${tournament}/stages/1/matches/1`);
  await tv.setViewportSize({ width: 1920, height: 1080 });
  await tv.goto(`/tv/${org}/tournaments/${tournament}?view=matches&lang=es&token=test`);
  await expect(tv.getByTestId('tv-match-list')).toBeVisible();
  await builder(second, 'operator-b');
  await builder(page, 'operator-a');
  for (const surface of [spectator, report, tv, second])
    await surface.evaluate(() => Object.assign(window, { documentMarker: 'same-document' }));
  await page.getByLabel('Hora de inicio — Club Alfa vs Club Bravo').selectOption('slot-2');
  await page.getByText('Previsualizar', { exact: true }).click();
  await page.getByText('Publicar calendario', { exact: true }).click();
  await page.getByRole('dialog').getByLabel('Motivo del lote').fill('Cancha 1 sin luz');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Confirmar|Publicar/ })
    .click();
  await expect.poll(() => moved).toBe(true);
  for (const surface of [spectator, report, tv, second]) await send(surface);
  await expect(spectator.getByText(/Reprogramado/)).toBeVisible();
  await expect(report.getByText(/Reprogramado/)).toBeVisible();
  await expect(tv.getByText(/Reprogramado/)).toBeVisible();
  await expect(second.getByText(/María González/)).toBeVisible();
  expect(previews).toBeGreaterThanOrEqual(2);
  for (const surface of [spectator, report, tv, second])
    expect(
      await surface.evaluate(
        () => (window as unknown as { documentMarker: string }).documentMarker,
      ),
    ).toBe('same-document');
  const noJs = await browser.newContext({ javaScriptEnabled: false });
  const plain = await noJs.newPage();
  await plain.goto(`/es/${org}/tournaments/${tournament}/matches?view=cards&state=upcoming`);
  await expect(plain.getByText(/Reprogramado/)).toBeVisible();
  await noJs.close();
  await spectator.setViewportSize({ width: 1440, height: 900 });
  await spectator.screenshot({
    path: 'docs/assets/screenshots/reschedule-public-desktop.png',
  });
  await spectator.setViewportSize({ width: 390, height: 844 });
  await spectator.screenshot({
    path: 'docs/assets/screenshots/reschedule-public-mobile.png',
  });
  await tv.screenshot({ path: 'docs/assets/screenshots/reschedule-tv.png' });
});
