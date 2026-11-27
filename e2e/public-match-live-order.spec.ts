import { createServer, type Server } from 'node:http';
import { expect, test } from './fixtures.js';

/**
 * A live match leads its page with what is happening: the timeline, then the rosters, then the
 * officials and the bracket. An upcoming or finished match keeps the bracket first.
 */

const ORGANIZATION = 'liga-mendocina';
const TOURNAMENT_ALIAS = 'apertura-2026';
const STAGE = '1';
const MATCH = '1';
const BASE = `/api/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`;
const PAGE = `/es/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/stages/${STAGE}/matches/${MATCH}`;

const matchReport = (status: 'live' | 'final') => ({
  organizationAlias: ORGANIZATION,
  organizationName: 'Liga Mendocina',
  tournamentAlias: TOURNAMENT_ALIAS,
  tournamentName: 'Apertura 2026',
  stageNumber: 1,
  stageFormat: 'single-elimination',
  matchNumber: 1,
  round: 1,
  status,
  homeEntrantId: '00000000-0000-7000-8000-000000000801',
  homeName: 'Talleres',
  homeAbbreviation: 'TAL',
  homeScore: 1,
  awayEntrantId: '00000000-0000-7000-8000-000000000802',
  awayName: 'Independiente',
  awayAbbreviation: 'IND',
  awayScore: 0,
  scheduledAt: '2025-11-09T14:00:00.000Z',
  schedulePublished: true,
  officials: [{ name: 'Marta Gómez', roles: ['referee'] }],
  rosters: {
    home: [
      {
        personId: '00000000-0000-7000-8000-000000000811',
        number: 7,
        name: 'Julián Pérez',
        roles: [],
        onField: true,
      },
    ],
    away: [],
  },
  timeline: [
    {
      eventId: '00000000-0000-7000-8000-000000000821',
      definitionCode: 'goal',
      label: 'Goal',
      labels: { en: 'Goal', es: 'Gol' },
      occurredAt: '2025-11-09T14:12:00.000Z',
      sequence: 1,
      segmentNumber: 1,
      segmentElapsedSeconds: 720,
      side: '00000000-0000-7000-8000-000000000801',
      scoreAfter: [1, 0],
      payload: {},
    },
  ],
  disciplineImages: {},
});

/** Two first-round matches and the final, as the bracket endpoint serves them. */
const bracketData = {
  format: 'single-elimination',
  zones: [
    {
      matches: [
        {
          matchId: 'LIVE-R1-M1',
          matchNumber: 1,
          bracket: 'winners',
          round: 1,
          position: 1,
          status: 'in-progress',
          slots: [
            { kind: 'entrant', name: 'Talleres', score: 1 },
            { kind: 'entrant', name: 'Independiente', score: 0 },
          ],
        },
        {
          matchId: 'LIVE-R1-M2',
          matchNumber: 2,
          bracket: 'winners',
          round: 1,
          position: 2,
          status: 'finalized',
          slots: [
            { kind: 'entrant', name: 'Racing', score: 2 },
            { kind: 'entrant', name: 'San Lorenzo', score: 1 },
          ],
        },
      ],
    },
  ],
};

let apiServer: Server;
let currentStatus: 'live' | 'final' = 'live';

test.beforeAll(async ({ workerPort }) => {
  apiServer = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    const [path] = (req.url ?? '').split('?');

    if (path === `${BASE}/stages/${STAGE}/matches/${MATCH}`) {
      res.end(JSON.stringify(matchReport(currentStatus)));
      return;
    }
    if (path === `${BASE}/stages/${STAGE}/bracket`) {
      res.end(JSON.stringify(bracketData));
      return;
    }
    if (path === `${BASE}/live`) {
      res.end(JSON.stringify({ matches: [] }));
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

/** Vertical position of each section, so the order on the page is read from the layout. */
async function sectionOrder(page: import('@playwright/test').Page): Promise<string[]> {
  const sections = [
    { name: 'timeline', selector: '#timeline-heading' },
    { name: 'rosters', selector: '#rosters-heading' },
    { name: 'officials', selector: '#officials-heading' },
    { name: 'bracket', selector: '.cl-bracket-context' },
  ];
  const tops = await Promise.all(
    sections.map(async (section) => ({
      name: section.name,
      top: (await page.locator(section.selector).first().boundingBox())?.y ?? Number.NaN,
    })),
  );
  return tops.sort((a, b) => a.top - b.top).map((section) => section.name);
}

test.describe('match page section order', () => {
  test('a live match shows its timeline and rosters before the officials and the bracket', async ({
    page,
  }) => {
    currentStatus = 'live';
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(PAGE);
    await page.waitForSelector('meta[name="copalibre:deferred-stylesheet"]', { state: 'attached' });
    await page.evaluate(() => document.fonts.ready);

    expect(await sectionOrder(page)).toEqual(['timeline', 'rosters', 'officials', 'bracket']);
  });

  test('a finished match keeps the bracket before its rosters, officials and timeline', async ({
    page,
  }) => {
    currentStatus = 'final';
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(PAGE);
    await page.waitForSelector('meta[name="copalibre:deferred-stylesheet"]', { state: 'attached' });
    await page.evaluate(() => document.fonts.ready);

    expect(await sectionOrder(page)).toEqual(['bracket', 'rosters', 'officials', 'timeline']);
  });
});
