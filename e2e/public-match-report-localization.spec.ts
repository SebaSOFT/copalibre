import { createServer, type Server } from 'node:http';
import { expect, test } from './fixtures.js';

/**
 * OpenSpec 0269: the match report page's officials, rosters, and event
 * timeline sections render localized text (not hardcoded English) and
 * humanized timestamps (not a raw ISO-8601 string), matching the rest of
 * the public surface.
 */

const ORGANIZATION = 'liga-mendocina';
const TOURNAMENT_ALIAS = 'apertura-2026';
const STAGE = '1';
const MATCH = '5';

const BASE = `/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`;

const populatedMatchReport = {
  organizationAlias: ORGANIZATION,
  organizationName: 'Liga Mendocina',
  tournamentAlias: TOURNAMENT_ALIAS,
  tournamentName: 'Apertura 2026',
  stageNumber: 1,
  stageFormat: 'round-robin',
  matchNumber: 5,
  round: 3,
  status: 'final',
  homeName: 'Club Andes',
  homeAbbreviation: 'AND',
  homeScore: 2,
  awayName: 'Deportivo Sur',
  awayAbbreviation: 'SUR',
  awayScore: 1,
  scheduledAt: '2025-11-02T11:17:30.000Z',
  schedulePublished: true,
  officials: [{ name: 'Marta Gómez', roles: ['referee'] }],
  rosters: {
    home: [
      {
        personId: '00000000-0000-7000-8000-000000000101',
        number: 9,
        name: 'Julián Pérez',
        roles: ['captain'],
        onField: true,
      },
    ],
    away: [
      {
        personId: '00000000-0000-7000-8000-000000000102',
        number: 4,
        name: 'Nicolás Ruiz',
        roles: [],
        onField: false,
      },
    ],
  },
  timeline: [
    {
      eventId: '00000000-0000-7000-8000-000000000201',
      definitionCode: 'goal',
      label: 'Goal — Julián Pérez',
      occurredAt: '2025-11-02T11:17:30.000Z',
      sequence: 1,
      personId: '00000000-0000-7000-8000-000000000101',
      payload: {},
    },
  ],
  disciplineImages: {},
};

let apiServer: Server;

test.beforeAll(async ({ workerPort }) => {
  apiServer = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    const [path] = (req.url ?? '').split('?');

    if (path === `${BASE}/stages/${STAGE}/matches/${MATCH}`) {
      res.end(JSON.stringify(populatedMatchReport));
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

test.describe('OpenSpec 0269 match report localization and timestamps', () => {
  test('renders localized section headings and a humanized timestamp in a non-English locale', async ({
    page,
  }) => {
    await page.goto(
      `/es/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/stages/${STAGE}/matches/${MATCH}`,
    );

    // Section headings render in Spanish, not the hardcoded English strings.
    await expect(page.getByRole('heading', { name: 'Árbitros' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Planteles' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Cronología del partido' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Event timeline' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Officials' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Rosters' })).toHaveCount(0);

    // The rosters table's column headers are localized too (one table per side).
    await expect(page.getByRole('columnheader', { name: 'Jugador' }).first()).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'En cancha' }).first()).toBeVisible();

    // The event timeline's timestamp is humanized, not a raw ISO-8601 string.
    const timelineTime = page.locator('.cl-timeline-time');
    await expect(timelineTime).toBeVisible();
    await expect(timelineTime).not.toContainText('2025-11-02T11:17:30');
    await expect(page.getByText('2025-11-02T11:17:30.000Z')).toHaveCount(0);
  });
});
