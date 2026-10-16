import { expect, test } from '@playwright/test';
import { fork, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { loginCallbackUrl, seedLoginTransaction, TOKEN_ENDPOINT } from './support/control-login.js';

/**
 * Exercise the schedule builder end to end — create a venue and an
 * official, assign a fixture, preview, and publish; and a conflicting batch
 * that blocks publish until resolved.
 */

const ORG_ALIAS = 'liga-mendocina';
const TOURNAMENT_ALIAS = 'apertura-2026';
const STAGE_ID = 'stage-1';

interface VenueRecord {
  readonly venueId: string;
  readonly organizationId: string;
  readonly alias: string;
  readonly name: string;
  readonly concurrentCapacity: number;
}

interface OfficialRecord {
  readonly officialId: string;
  readonly organizationId: string;
  readonly displayName: string;
  readonly roles: readonly string[];
}

interface ScheduleAssignment {
  readonly matchId: string;
  readonly slotId: string;
  readonly officialIds?: readonly string[];
}

interface ScheduleReason {
  readonly code?: string;
  readonly text: string;
}

/** A batch entry as the builder sends it: a placement, or a withdrawal. */
interface BatchEntry {
  readonly matchId: string;
  readonly slotId?: string;
  readonly withdraw?: true;
  readonly officialIds?: readonly string[];
  readonly reason?: ScheduleReason;
}

interface BatchBody {
  readonly assignments: readonly BatchEntry[];
  readonly reason?: ScheduleReason;
}

/**
 * A slot is the placeable unit — a venue and a time already reserved — since scheduling moved
 * to match grain. The builder picks one, rather than typing a start time and a duration.
 */
const SCHEDULES = [
  {
    scheduleId: 'schedule-1',
    organizationId: 'org-1',
    name: 'Fecha 1',
    slotMinutes: 60,
    slots: [
      { slotId: 'slot-1', venueId: 'venue-1', startsAt: '2026-08-01T14:00:00.000Z', matchCount: 0 },
      { slotId: 'slot-2', venueId: 'venue-1', startsAt: '2026-08-01T16:00:00.000Z', matchCount: 0 },
      { slotId: 'slot-3', venueId: 'venue-1', startsAt: '2026-08-01T18:00:00.000Z', matchCount: 0 },
      { slotId: 'slot-4', venueId: 'venue-1', startsAt: '2026-08-01T20:00:00.000Z', matchCount: 0 },
      { slotId: 'slot-5', venueId: 'venue-2', startsAt: '2026-08-01T15:00:00.000Z', matchCount: 0 },
      { slotId: 'slot-6', venueId: 'venue-2', startsAt: '2026-08-01T17:00:00.000Z', matchCount: 0 },
      { slotId: 'slot-7', venueId: 'venue-2', startsAt: '2026-08-01T19:00:00.000Z', matchCount: 0 },
    ],
  },
];

let venues: VenueRecord[] = [];
let officials: OfficialRecord[] = [];
let published: ScheduleAssignment[] = [];
let minimumRestMinutes: number | undefined;
let publishedBodies: BatchBody[] = [];
let nextVenueId = 1;
let nextOfficialId = 1;

const BASE_FIXTURES = [
  {
    fixtureId: 'fixture-1',
    matchId: 'match-1',
    round: 1,
    homeEntrantId: 'entrant-a',
    homeName: 'Club Alfa',
    awayEntrantId: 'entrant-b',
    awayName: 'Club Bravo',
    matches: [{ matchId: 'match-1', number: 1, status: 'scheduled' }],
  },
  {
    fixtureId: 'fixture-2',
    matchId: 'match-2',
    round: 1,
    homeEntrantId: 'entrant-c',
    homeName: 'Club Cóndor',
    awayEntrantId: 'entrant-d',
    awayName: 'Club Delta',
    matches: [{ matchId: 'match-2', number: 1, status: 'scheduled' }],
  },
];

/** A third and a fourth cross: the fourth shares entrant-a with the first, so rest can bite. */
const MORE_FIXTURES = [
  {
    fixtureId: 'fixture-3',
    matchId: 'match-3',
    round: 2,
    homeEntrantId: 'entrant-e',
    homeName: 'Club Estrella',
    awayEntrantId: 'entrant-f',
    awayName: 'Club Faro',
    matches: [{ matchId: 'match-3', number: 1, status: 'scheduled' }],
  },
  {
    fixtureId: 'fixture-4',
    matchId: 'match-4',
    round: 2,
    homeEntrantId: 'entrant-a',
    homeName: 'Club Alfa',
    awayEntrantId: 'entrant-c',
    awayName: 'Club Cóndor',
    matches: [{ matchId: 'match-4', number: 1, status: 'scheduled' }],
  },
];

let fixtures = [...BASE_FIXTURES];

test('publishes an undecided eight-entrant final through the real API and retains it after reload', async ({
  page,
}) => {
  test.setTimeout(120_000);
  // This API-only TypeScript build never writes the web server's build directory.
  await promisify(execFile)('yarn', ['workspace', '@copalibre/api', 'build']);
  const child = fork(
    fileURLToPath(new URL('./support/persisted-bracket-api.mjs', import.meta.url)),
    {
      execArgv: ['--import', 'tsx'],
      env: { ...process.env, COPALIBRE_TEST_DIALECT: 'sqlite' },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    },
  );
  let errors = '';
  child.stderr?.on('data', (chunk) => {
    errors += String(chunk);
  });
  try {
    const api = await new Promise<{ url: string; stageId: string; matchId: string }>(
      (resolve, reject) => {
        child.once('message', (message) =>
          resolve(message as { url: string; stageId: string; matchId: string }),
        );
        child.once('error', reject);
        child.once('exit', (code) => reject(new Error(`Fixture API exited ${code}: ${errors}`)));
      },
    );
    await page.exposeFunction(
      '__realBracketApi',
      async (path: string, method: string, body?: string) => {
        const response = await fetch(`${api.url}${path}`, {
          method,
          ...(body === undefined ? {} : { body }),
          headers: { authorization: 'Bearer organizer-org1', 'content-type': 'application/json' },
        });
        return { status: response.status, body: await response.text() };
      },
    );
    await page.addInitScript(
      ({ tokenEndpoint }) => {
        const originalFetch = window.fetch.bind(window);
        window.fetch = async (input, init) => {
          const path = String(input);
          if (path === tokenEndpoint)
            return Response.json({ access_token: 'organizer-org1', expires_in: 3600 });
          if (!path.startsWith('/organizations/')) return originalFetch(input, init);
          const response = await (
            window as unknown as {
              __realBracketApi: (
                path: string,
                method: string,
                body?: string,
              ) => Promise<{ status: number; body: string }>;
            }
          ).__realBracketApi(
            path,
            init?.method ?? 'GET',
            init?.body === undefined ? undefined : String(init.body),
          );
          return new Response(response.body, {
            status: response.status,
            headers: { 'content-type': 'application/json' },
          });
        };
      },
      { tokenEndpoint: TOKEN_ENDPOINT },
    );
    const target = '/control/liga-orbital/tournaments/undecided-cup/stages/1/schedule';
    await seedLoginTransaction(page, target);
    await page.goto(loginCallbackUrl());
    await page.waitForURL(`**${target}`);
    await expect(page.getByText('Ronda 3').first()).toBeVisible();
    await expect(
      page.getByTestId('entrant-name').filter({ hasText: 'Club 1' }).first(),
    ).toBeVisible();
    expect(await page.locator('main').innerText()).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
    // Until source labels arrive, the final remains selectable by its real match row.
    const time = page.getByLabel(/^Hora de inicio/).last();
    await time.selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Previsualizar', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Publicar', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Publicar', exact: true }).click();
    await expect(page.getByText('Horario publicado.')).toBeVisible();
    const stored = await fetch(
      `${api.url}/organizations/liga-orbital/tournaments/undecided-cup/stages/${api.stageId}/schedule`,
    );
    expect((await stored.json()).assignments).toEqual([
      expect.objectContaining({ matchId: api.matchId, slotId: expect.any(String) }),
    ]);
    await page.reload();
    await expect(page.getByLabel(/^Hora de inicio/).last()).not.toHaveValue('');
    for (const [name, width, height] of [
      ['desktop', 1440, 900],
      ['mobile', 390, 844],
    ] as const) {
      await page.setViewportSize({ width, height });
      const typography = await page.getByTestId('entrant-name').evaluateAll((names) =>
        names.every((name) => {
          const own = getComputedStyle(name);
          if (name.parentElement === null) return false;
          const parent = getComputedStyle(name.parentElement);
          return (
            own.fontFamily === parent.fontFamily &&
            own.fontSize === parent.fontSize &&
            own.fontWeight === parent.fontWeight
          );
        }),
      );
      expect(typography).toBe(true);
      await page
        .getByLabel(/^Hora de inicio/)
        .last()
        .evaluate((element) => element.scrollIntoView({ block: 'center' }));
      await page.screenshot({
        path: `docs/assets/screenshots/control-undecided-final-${name}.png`,
      });
    }
  } finally {
    if (child.connected) child.send('close');
    await new Promise<void>((resolve) => {
      child.once('exit', () => resolve());
      if (child.exitCode !== null) resolve();
    });
  }
});

const slotStart = (slotId: string | undefined) =>
  Date.parse(SCHEDULES[0]?.slots.find((one) => one.slotId === slotId)?.startsAt ?? '');

/** The tournament's stored rest rule, measured from a one-hour match's end. */
function restConflicts(assignments: readonly ScheduleAssignment[]): readonly { detail: string }[] {
  if (minimumRestMinutes === undefined) return [];
  const entrantsOf = (matchId: string) => {
    const fixture = fixtures.find((one) => one.matchId === matchId);
    return [fixture?.homeEntrantId, fixture?.awayEntrantId];
  };
  const placed = [
    ...published.filter((one) => !assignments.some((a) => a.matchId === one.matchId)),
    ...assignments,
  ];
  const conflicts: { detail: string }[] = [];
  for (const [index, a] of placed.entries()) {
    for (const b of placed.slice(index + 1)) {
      const shared = entrantsOf(a.matchId).filter((id) => entrantsOf(b.matchId).includes(id));
      if (shared.length === 0) continue;
      const gap = Math.abs(slotStart(a.slotId) - slotStart(b.slotId)) / 60_000 - 60;
      if (gap < minimumRestMinutes) {
        conflicts.push({
          detail: `Entrant "${shared[0]}" gets ${gap} minute(s) between "${a.matchId}" and "${b.matchId}"; ${minimumRestMinutes} are required`,
        });
      }
    }
  }
  return conflicts;
}

/** Two matches placed in one slot at a single-capacity venue is exactly one conflict. */
function detectConflicts(
  assignments: readonly ScheduleAssignment[],
): readonly { readonly detail: string }[] {
  const conflicts: { detail: string }[] = [];
  for (const [index, a] of assignments.entries()) {
    for (const b of assignments.slice(index + 1)) {
      if (a.slotId !== b.slotId) continue;
      const slot = SCHEDULES[0]?.slots.find((one) => one.slotId === a.slotId);
      const venue = venues.find((one) => one.venueId === slot?.venueId);
      if ((venue?.concurrentCapacity ?? 1) < 2) {
        conflicts.push({ detail: `Venue "${slot?.venueId}" hosts 1 fixture(s) at once` });
      }
    }
  }
  return conflicts;
}

async function mockControlApi(page: import('@playwright/test').Page): Promise<void> {
  venues = [];
  officials = [];
  published = [];
  fixtures = [...BASE_FIXTURES];
  minimumRestMinutes = undefined;
  publishedBodies = [];
  nextVenueId = 1;
  nextOfficialId = 1;

  await page.addInitScript(
    ({ tokenEndpoint, orgAlias, tournamentAlias, stageId }) => {
      window.fetch = async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';

        if (url === tokenEndpoint) {
          return Response.json({ access_token: 'e2e-access-token', expires_in: 3600 });
        }

        if (url === `/organizations/${orgAlias}/venues` && method === 'GET') {
          return Response.json(
            await (window as unknown as { __venues: () => Promise<unknown> }).__venues(),
          );
        }
        if (url === `/organizations/${orgAlias}/venues` && method === 'POST') {
          const body = JSON.parse(String(init?.body)) as {
            alias: string;
            name: string;
            concurrentCapacity: number;
          };
          return Response.json(
            await (
              window as unknown as { __createVenue: (body: unknown) => Promise<unknown> }
            ).__createVenue(body),
            { status: 201 },
          );
        }
        if (url === `/organizations/${orgAlias}/schedules` && method === 'GET') {
          return Response.json(
            await (window as unknown as { __schedules: () => Promise<unknown> }).__schedules(),
          );
        }
        if (url === `/organizations/${orgAlias}/officials` && method === 'GET') {
          return Response.json(
            await (window as unknown as { __officials: () => Promise<unknown> }).__officials(),
          );
        }
        if (url === `/organizations/${orgAlias}/officials` && method === 'POST') {
          const body = JSON.parse(String(init?.body)) as {
            displayName: string;
            roles: readonly string[];
          };
          return Response.json(
            await (
              window as unknown as { __createOfficial: (body: unknown) => Promise<unknown> }
            ).__createOfficial(body),
            { status: 201 },
          );
        }

        const fixturesUrl = `/organizations/${orgAlias}/tournaments/${tournamentAlias}/stages/1/fixtures`;
        if (url === fixturesUrl && method === 'GET') {
          return Response.json(
            await (window as unknown as { __fixtures: () => Promise<unknown> }).__fixtures(),
          );
        }

        const scheduleBase = `/organizations/${orgAlias}/tournaments/${tournamentAlias}/stages/${stageId}/schedule`;
        if (url === scheduleBase && method === 'GET') {
          return Response.json(
            await (window as unknown as { __schedule: () => Promise<unknown> }).__schedule(),
          );
        }
        if (url === `${scheduleBase}/preview` && method === 'POST') {
          return Response.json(
            await (
              window as unknown as { __preview: (body: unknown) => Promise<unknown> }
            ).__preview(JSON.parse(String(init?.body))),
          );
        }
        if (url === scheduleBase && method === 'POST') {
          return Response.json(
            await (
              window as unknown as { __publish: (body: unknown) => Promise<unknown> }
            ).__publish(JSON.parse(String(init?.body))),
          );
        }
        if (url === `/organizations/${orgAlias}/schedule/reasons/recent` && method === 'GET') {
          return Response.json({ reasons: ['Cancha 1 sin luz'] });
        }
        const settingsUrl = `/organizations/${orgAlias}/tournaments/${tournamentAlias}/settings`;
        if (url === settingsUrl && method === 'GET') {
          return Response.json(
            await (window as unknown as { __settings: () => Promise<unknown> }).__settings(),
          );
        }
        if (url === settingsUrl && method === 'PUT') {
          return Response.json(
            await (
              window as unknown as { __saveSettings: (body: unknown) => Promise<unknown> }
            ).__saveSettings(JSON.parse(String(init?.body))),
          );
        }

        return new Response('Not found', { status: 404 });
      };
    },
    {
      tokenEndpoint: TOKEN_ENDPOINT,
      orgAlias: ORG_ALIAS,
      tournamentAlias: TOURNAMENT_ALIAS,
      stageId: STAGE_ID,
    },
  );

  await page.exposeFunction('__venues', () => venues);
  await page.exposeFunction(
    '__createVenue',
    (body: { alias: string; name: string; concurrentCapacity: number }) => {
      const created: VenueRecord = {
        venueId: `venue-${nextVenueId}`,
        organizationId: 'org-1',
        alias: body.alias,
        name: body.name,
        concurrentCapacity: body.concurrentCapacity,
      };
      nextVenueId += 1;
      venues = [...venues, created];
      return created;
    },
  );
  await page.exposeFunction('__officials', () => officials);
  await page.exposeFunction(
    '__createOfficial',
    (body: { displayName: string; roles: readonly string[] }) => {
      const created: OfficialRecord = {
        officialId: `official-${nextOfficialId}`,
        organizationId: 'org-1',
        displayName: body.displayName,
        roles: body.roles,
      };
      nextOfficialId += 1;
      officials = [...officials, created];
      return created;
    },
  );
  await page.exposeFunction('__schedules', () => SCHEDULES);
  await page.exposeFunction('__fixtures', () => ({ stageId: STAGE_ID, fixtures }));
  await page.exposeFunction('__schedule', () => ({ assignments: published }));
  await page.exposeFunction('__preview', (body: BatchBody) => {
    const placements = body.assignments.filter(
      (entry): entry is ScheduleAssignment => entry.withdraw !== true,
    );
    const withdrawn = body.assignments
      .filter((entry) => entry.withdraw === true)
      .map((e) => e.matchId);
    const conflicts = [...detectConflicts(placements), ...restConflicts(placements)];
    const moved = placements
      .filter((entry) => {
        const prior = published.find((one) => one.matchId === entry.matchId);
        return prior !== undefined && prior.slotId !== entry.slotId;
      })
      .map((entry) => entry.matchId);
    return {
      committable: conflicts.length === 0,
      conflicts,
      affectedPublishedMatches: [...moved, ...withdrawn],
      reasonRequiredMatches: [...moved, ...withdrawn],
      withdrawn,
      freedSlotIds: published.filter((one) => withdrawn.includes(one.matchId)).map((o) => o.slotId),
    };
  });
  await page.exposeFunction('__publish', (body: BatchBody) => {
    publishedBodies = [...publishedBodies, body];
    const withdrawn = body.assignments
      .filter((entry) => entry.withdraw === true)
      .map((e) => e.matchId);
    const placements = body.assignments.filter(
      (entry): entry is ScheduleAssignment => entry.withdraw !== true,
    );
    published = [
      ...published.filter(
        (one) =>
          !withdrawn.includes(one.matchId) && !placements.some((p) => p.matchId === one.matchId),
      ),
      ...placements.map(({ matchId, slotId, officialIds }) => ({
        matchId,
        slotId,
        ...(officialIds === undefined ? {} : { officialIds }),
      })),
    ];
    return { assignments: published };
  });
  await page.exposeFunction('__settings', () => ({
    name: 'Apertura 2026',
    featured: false,
    ...(minimumRestMinutes === undefined ? {} : { minimumRestMinutes }),
  }));
  await page.exposeFunction('__saveSettings', (body: { minimumRestMinutes?: number | null }) => {
    if (body.minimumRestMinutes !== undefined) {
      minimumRestMinutes = body.minimumRestMinutes ?? undefined;
    }
    return {
      name: 'Apertura 2026',
      featured: false,
      ...(minimumRestMinutes === undefined ? {} : { minimumRestMinutes }),
    };
  });
}

test('creates a venue and an official, assigns a fixture, previews, and publishes', async ({
  page,
}) => {
  await mockControlApi(page);

  const resourcesTarget = `/control/${ORG_ALIAS}/resources`;
  await seedLoginTransaction(page, resourcesTarget);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${resourcesTarget}`);

  await page.getByLabel('Nombre de la nueva cancha').fill('Cancha 1');
  await page.getByLabel('Alias').first().fill('cancha-1');
  await page.getByText('Agregar cancha').click();
  await expect(page.getByText('Cancha creada.')).toBeVisible();

  await page.getByLabel('Nombre del nuevo árbitro').fill('Ana Gómez');
  await page.getByLabel('Árbitro principal').check();
  await page.getByText('Agregar árbitro').click();
  await expect(page.getByText('Árbitro creado.')).toBeVisible();

  const scheduleTarget = `/control/${ORG_ALIAS}/tournaments/${TOURNAMENT_ALIAS}/stages/1/schedule`;
  await seedLoginTransaction(page, scheduleTarget);
  await page.goto(loginCallbackUrl()).catch((error: Error) => {
    if (!error.message.includes('is interrupted by another navigation')) throw error;
  });
  await page.waitForURL(`**${scheduleTarget}`);

  await expect(page.getByText('Ronda 1').first()).toBeVisible();
  await page.getByLabel('Hora de inicio — Club Alfa vs Club Bravo').selectOption('slot-1');

  await page.getByText('Previsualizar').click();
  await expect(page.getByText('Publicar')).toBeEnabled();
  await page.getByText('Publicar').click();

  await expect(page.getByText('Horario publicado.')).toBeVisible();
  // fixture-1 is no longer among the unassigned calendar rows — only fixture-2 (never
  // assigned in this test) remains "Sin asignar". Scoped to the calendar: the list view's
  // slot picker carries an unassigned option on every row, which is not a row's state.
  await expect(
    page.locator('[aria-label="Vista de calendario"]').getByText('Sin asignar'),
  ).toHaveCount(1);
});

test('a conflicting batch shows the conflict and blocks publish until resolved', async ({
  page,
}) => {
  await mockControlApi(page);
  venues = [
    {
      venueId: 'venue-1',
      organizationId: 'org-1',
      alias: 'cancha-1',
      name: 'Cancha 1',
      concurrentCapacity: 1,
    },
  ];

  const scheduleTarget = `/control/${ORG_ALIAS}/tournaments/${TOURNAMENT_ALIAS}/stages/1/schedule`;
  await seedLoginTransaction(page, scheduleTarget);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${scheduleTarget}`);

  await expect(page.getByText('Ronda 1').first()).toBeVisible();

  // Both matches into the same slot at a venue that can host only one.
  await page.getByLabel('Hora de inicio — Club Alfa vs Club Bravo').selectOption('slot-1');
  await page.getByLabel('Hora de inicio — Club Cóndor vs Club Delta').selectOption('slot-1');

  await page.getByText('Previsualizar').click();
  await expect(page.getByText('Conflictos')).toBeVisible();
  await expect(page.getByText(/hosts 1 fixture\(s\) at once/)).toBeVisible();
  await expect(page.getByText('Publicar')).toBeDisabled();
});

test('stores a minimum rest, asks a reason for published moves from the keyboard, and withdraws a match', async ({
  page,
}) => {
  await mockControlApi(page);
  fixtures = [...BASE_FIXTURES, ...MORE_FIXTURES];
  venues = [
    {
      venueId: 'venue-1',
      organizationId: 'org-1',
      alias: 'cancha-1',
      name: 'Cancha 1',
      concurrentCapacity: 1,
    },
    {
      venueId: 'venue-2',
      organizationId: 'org-1',
      alias: 'cancha-2',
      name: 'Cancha 2',
      concurrentCapacity: 1,
    },
  ];
  published = [
    { matchId: 'match-1', slotId: 'slot-1' },
    { matchId: 'match-2', slotId: 'slot-2' },
    { matchId: 'match-3', slotId: 'slot-3' },
  ];

  const settingsTarget = `/control/${ORG_ALIAS}/tournaments/${TOURNAMENT_ALIAS}/settings`;
  await seedLoginTransaction(page, settingsTarget);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${settingsTarget}`);
  await page.getByLabel('Descanso mínimo entre partidos (minutos)').fill('120');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Configuración guardada.')).toBeVisible();
  expect(minimumRestMinutes).toBe(120);

  const scheduleTarget = `/control/${ORG_ALIAS}/tournaments/${TOURNAMENT_ALIAS}/stages/1/schedule`;
  await seedLoginTransaction(page, scheduleTarget);
  await page.goto(loginCallbackUrl()).catch((error: Error) => {
    if (!error.message.includes('is interrupted by another navigation')) throw error;
  });
  await page.waitForURL(`**${scheduleTarget}`);
  await expect(page.getByText('Ronda 1').first()).toBeVisible();

  // entrant-a plays match-1 at 14:00; match-4 at 15:00 leaves no rest at all.
  await page.getByLabel('Hora de inicio — Club Alfa vs Club Cóndor').selectOption('slot-5');
  await page.getByText('Previsualizar').click();
  await expect(page.getByText(/120 are required/).first()).toBeVisible();
  await page.getByLabel('Hora de inicio — Club Alfa vs Club Cóndor').selectOption('');

  // Three published matches move; the batch needs a reason before it publishes.
  await page.getByLabel('Hora de inicio — Club Alfa vs Club Bravo').selectOption('slot-4');
  await page.getByLabel('Hora de inicio — Club Cóndor vs Club Delta').selectOption('slot-6');
  await page.getByLabel('Hora de inicio — Club Estrella vs Club Faro').selectOption('slot-7');
  await page.getByText('Previsualizar').click();
  await page.getByRole('button', { name: 'Publicar', exact: true }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const batchReason = dialog.getByLabel('Motivo del lote');
  await expect(batchReason).toBeFocused();
  await page.keyboard.type('Cancha 1 sin luz');
  await page.keyboard.press('Tab');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('e');
  await expect(dialog.getByLabel('Motivo de Club Cóndor vs Club Delta')).toBeFocused();
  await page.keyboard.type('Pedido de un');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(
    dialog.getByText('3 partidos · 2 con el motivo del lote · 1 excepción'),
  ).toBeVisible();

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({
    path: 'docs/assets/screenshots/control-schedule-reason-prompt-desktop.png',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: 'docs/assets/screenshots/control-schedule-reason-prompt-mobile.png',
  });
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.keyboard.press('Enter');
  await expect(page.getByText('Horario publicado.')).toBeVisible();

  const moved = publishedBodies.at(-1);
  expect(moved?.reason).toEqual({ text: 'Cancha 1 sin luz' });
  expect(moved?.assignments.find((entry) => entry.matchId === 'match-2')?.reason).toEqual({
    code: 'entrant-request',
    text: 'Pedido de un participante',
  });
  expect(moved?.assignments.find((entry) => entry.matchId === 'match-1')?.reason).toBeUndefined();

  // Withdrawing a published match frees its slot in the preview and needs a reason too.
  await page
    .getByRole('button', { name: 'Retirar del horario — Club Estrella vs Club Faro' })
    .click();
  await page.getByText('Previsualizar').click();
  await expect(page.getByText('Horarios que libera este lote')).toBeVisible();
  await page.getByRole('button', { name: 'Publicar', exact: true }).click();
  await page.keyboard.type('Clima');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  // The first publish's toast may still be showing; the newest one is this publish's.
  await expect(page.getByText('Horario publicado.').last()).toBeVisible();
  expect(publishedBodies.at(-1)?.assignments).toContainEqual({
    matchId: 'match-3',
    withdraw: true,
  });
  expect(publishedBodies.at(-1)?.reason).toEqual({ code: 'weather', text: 'Clima' });
  expect(published.map((one) => one.matchId)).not.toContain('match-3');
});
