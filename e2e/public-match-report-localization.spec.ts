import { createServer, type Server } from 'node:http';
import { expect, test } from './fixtures.js';
import { expectNoVisibleIdentifiers, FIXTURE_ALIASES } from './support/visible-identifiers.js';
import { expectCenteredPageContainer } from './support/public-layout-widths.js';

/**
 * The match report page's officials, rosters, and event
 * timeline sections render localized text (not hardcoded English) and
 * humanized timestamps (not a raw ISO-8601 string), matching the rest of
 * the public surface.
 */

const ORGANIZATION = 'liga-mendocina';
const TOURNAMENT_ALIAS = 'apertura-2026';
const STAGE = '1';
const MATCH = '5';

const BASE = `/api/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`;

const populatedMatchReport = {
  organizationAlias: ORGANIZATION,
  organizationName: 'Liga Mendocina',
  organizationTimeZone: 'America/Argentina/Buenos_Aires',
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
  rosterRoles: [
    { code: 'captain', badge: 'C', label: { en: 'Captain', es: 'Capitán' } },
    { code: 'goalkeeper', badge: 'GK', label: { en: 'Goalkeeper', es: 'Arquero' } },
  ],
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
      label: 'Goal',
      labels: { en: 'Goal', es: 'Gol' },
      occurredAt: '2025-11-02T11:17:30.000Z',
      sequence: 1,
      personId: '00000000-0000-7000-8000-000000000101',
      payload: {},
    },
  ],
  disciplineImages: {},
};

/** A finished match whose timeline carries game time, side markers, running scores and segment markers. */
const timedMatchNumber = '6';
const timedMatchReport = {
  ...populatedMatchReport,
  matchNumber: 6,
  homeEntrantId: '00000000-0000-7000-8000-000000000301',
  awayEntrantId: '00000000-0000-7000-8000-000000000302',
  homeScore: 1,
  awayScore: 1,
  segments: [
    {
      number: 1,
      type: 'half',
      label: { en: 'Half', es: 'Tiempo' },
      timed: true,
      state: 'completed',
      scores: [1, 1],
    },
  ],
  timeline: [
    {
      eventId: '00000000-0000-7000-8000-000000000311',
      definitionCode: 'goal',
      label: 'Goal',
      labels: { en: 'Goal', es: 'Gol' },
      occurredAt: '2025-11-02T11:08:00.000Z',
      sequence: 1,
      segmentNumber: 1,
      segmentElapsedSeconds: 480,
      side: '00000000-0000-7000-8000-000000000301',
      scoreAfter: [1, 0],
      personId: '00000000-0000-7000-8000-000000000101',
      payload: {},
    },
    {
      eventId: '00000000-0000-7000-8000-000000000312',
      definitionCode: 'goal',
      label: 'Goal',
      labels: { en: 'Goal', es: 'Gol' },
      occurredAt: '2025-11-02T11:20:00.000Z',
      sequence: 2,
      segmentNumber: 1,
      side: '00000000-0000-7000-8000-000000000302',
      scoreAfter: [1, 1],
      personId: '00000000-0000-7000-8000-000000000102',
      payload: {},
    },
  ],
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

    if (path === `${BASE}/stages/${STAGE}/matches/${timedMatchNumber}`) {
      res.end(JSON.stringify(timedMatchReport));
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

test.describe('Match report timeline in game time', () => {
  test('marks each event with its side, its time in the segment and the running score, and the segment ends', async ({
    page,
  }) => {
    await page.goto(
      `/es/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/stages/${STAGE}/matches/${timedMatchNumber}`,
    );
    await expectNoVisibleIdentifiers(page, FIXTURE_ALIASES);

    const timeline = page.locator('.cl-timeline-list');
    await expect(timeline.locator('.cl-timeline-time').first()).toHaveText('Tiempo 1 · 08:00');
    await expect(timeline.locator('.cl-timeline-side').first()).toContainText('AND');
    await expect(timeline.locator('.cl-timeline-entry[data-side="away"]').first()).toBeVisible();
    await expect(timeline.locator('.cl-timeline-score').first()).toHaveText('1–0');
    await expect(timeline.locator('.cl-timeline-score').nth(1)).toHaveText('1–1');
    await expect(timeline.locator('[data-segment-marker="segment-start"]')).toHaveText('Tiempo 1');
    await expect(timeline.locator('[data-segment-marker="segment-end"]')).toHaveText(
      'Fin del Tiempo 1 · 1–1',
    );
    // A finished match has no on-field column.
    await expect(page.getByRole('columnheader', { name: 'En cancha' })).toHaveCount(0);
  });
});

test.describe('Match report localization and timestamps', () => {
  test('renders localized section headings and a humanized timestamp in a non-English locale @visible-identifier-lint', async ({
    page,
  }) => {
    await page.goto(
      `/es/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/stages/${STAGE}/matches/${MATCH}`,
    );
    await expectNoVisibleIdentifiers(page, FIXTURE_ALIASES);

    // Section headings render in Spanish, not the hardcoded English strings.
    await expect(page.getByRole('heading', { name: 'Árbitros' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Planteles' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Cronología del partido' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Event timeline' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Officials' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Rosters' })).toHaveCount(0);

    // The rosters table's column headers are localized too (one table per side).
    await expect(page.getByRole('columnheader', { name: 'Jugador' }).first()).toBeVisible();
    // A finished match has no on-field column: it would read as nobody having played.
    await expect(page.getByRole('columnheader', { name: 'En cancha' })).toHaveCount(0);

    // The event timeline's wall-clock time is humanized, not a raw ISO-8601 string.
    const timelineTime = page.locator('.cl-timeline-clock');
    await expect(timelineTime).toBeVisible();
    await expect(timelineTime).not.toContainText('2025-11-02T11:17:30');
    await expect(page.getByText('2025-11-02T11:17:30.000Z')).toHaveCount(0);
  });

  test('shows the descriptor labels in the page language and never a raw code', async ({
    page,
  }) => {
    await page.goto(
      `/es/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/stages/${STAGE}/matches/${MATCH}`,
    );

    await expect(page.locator('.cl-timeline-label')).toHaveText('Gol');
    await expect(page.getByRole('cell', { name: 'Capitán' })).toBeVisible();
    await expect(page.locator('.cl-official-roles')).toHaveText('Árbitro');
    for (const raw of ['captain', 'referee', 'goalkeeper']) {
      await expect(page.getByText(raw, { exact: true })).toHaveCount(0);
    }
  });

  test('falls back to English labels on a page language the descriptor does not ship', async ({
    page,
  }) => {
    await page.goto(
      `/de/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/stages/${STAGE}/matches/${MATCH}`,
    );

    await expect(page.locator('.cl-timeline-label')).toHaveText('Goal');
    await expect(page.getByRole('cell', { name: 'Captain' })).toBeVisible();
  });

  test('uses the centered public width and chamfered sections at reference widths', async ({
    page,
  }) => {
    const path = `/es/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/stages/${STAGE}/matches/${MATCH}`;
    await expectCenteredPageContainer(page, path);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(path);

    const widthOf = async (selector: string) =>
      (await page.locator(selector).first().boundingBox())?.width ?? 0;
    expect(await widthOf('main > .cl-container--public')).toBeLessThanOrEqual(1200);
    const sections = page.locator('section.cl-section-card');
    await expect(sections).toHaveCount(3);
    for (const section of await sections.all()) {
      await expect(section).toHaveClass(/cl-chamfer/);
    }
  });
});
