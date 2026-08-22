import { expect, test } from '@playwright/test';
import { loginCallbackUrl, seedLoginTransaction, TOKEN_ENDPOINT } from './support/control-login.js';

/**
 * 0124 task 7: the schedule builder end to end — create a venue and an
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
  readonly fixtureId: string;
  readonly window: { readonly startsAt: number; readonly durationMinutes: number };
  readonly venueId?: string;
  readonly officialIds?: readonly string[];
}

let venues: VenueRecord[] = [];
let officials: OfficialRecord[] = [];
let published: ScheduleAssignment[] = [];
let nextVenueId = 1;
let nextOfficialId = 1;

const fixtures = [
  { fixtureId: 'fixture-1', round: 1, homeEntrantId: 'entrant-a', awayEntrantId: 'entrant-b' },
  { fixtureId: 'fixture-2', round: 1, homeEntrantId: 'entrant-c', awayEntrantId: 'entrant-d' },
];

/** A single-capacity venue hosting both fixtures at once is exactly one conflict. */
function detectConflicts(
  assignments: readonly ScheduleAssignment[],
): readonly { readonly detail: string }[] {
  const conflicts: { detail: string }[] = [];
  for (const [index, a] of assignments.entries()) {
    for (const b of assignments.slice(index + 1)) {
      if (a.venueId === undefined || a.venueId !== b.venueId) continue;
      const overlaps =
        a.window.startsAt < b.window.startsAt + b.window.durationMinutes * 60_000 &&
        b.window.startsAt < a.window.startsAt + a.window.durationMinutes * 60_000;
      if (overlaps) {
        conflicts.push({ detail: `Venue "${a.venueId}" hosts 1 fixture(s) at once` });
      }
    }
  }
  return conflicts;
}

async function mockControlApi(page: import('@playwright/test').Page): Promise<void> {
  venues = [];
  officials = [];
  published = [];
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
          const body = JSON.parse(String(init?.body)) as {
            assignments: readonly ScheduleAssignment[];
          };
          return Response.json(
            await (
              window as unknown as { __preview: (body: unknown) => Promise<unknown> }
            ).__preview(body.assignments),
          );
        }
        if (url === scheduleBase && method === 'POST') {
          const body = JSON.parse(String(init?.body)) as {
            assignments: readonly ScheduleAssignment[];
          };
          return Response.json(
            await (
              window as unknown as { __publish: (body: unknown) => Promise<unknown> }
            ).__publish(body.assignments),
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
  await page.exposeFunction('__fixtures', () => ({ stageId: STAGE_ID, fixtures }));
  await page.exposeFunction('__schedule', () => ({ assignments: published }));
  await page.exposeFunction('__preview', (assignments: readonly ScheduleAssignment[]) => {
    const conflicts = detectConflicts(assignments);
    return { committable: conflicts.length === 0, conflicts, affectedPublishedFixtures: [] };
  });
  await page.exposeFunction('__publish', (assignments: readonly ScheduleAssignment[]) => {
    published = [...assignments];
    return { assignments: published };
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
  await page.getByLabel('Hora de inicio — fixture-1').fill('2026-08-01T14:00');
  await page.getByLabel('Duración (minutos) — fixture-1').fill('60');
  await page.getByLabel('Cancha — fixture-1').selectOption({ label: 'Cancha 1' });

  await page.getByText('Previsualizar').click();
  await expect(page.getByText('Publicar')).toBeEnabled();
  await page.getByText('Publicar').click();

  await expect(page.getByText('Horario publicado.')).toBeVisible();
  // fixture-1 is no longer among the unassigned calendar rows — only
  // fixture-2 (never assigned in this test) remains "Sin asignar".
  await expect(page.getByText('Sin asignar')).toHaveCount(1);
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

  await page.getByLabel('Hora de inicio — fixture-1').fill('2026-08-01T14:00');
  await page.getByLabel('Duración (minutos) — fixture-1').fill('60');
  await page.getByLabel('Cancha — fixture-1').selectOption({ label: 'Cancha 1' });

  await page.getByLabel('Hora de inicio — fixture-2').fill('2026-08-01T14:30');
  await page.getByLabel('Duración (minutos) — fixture-2').fill('60');
  await page.getByLabel('Cancha — fixture-2').selectOption({ label: 'Cancha 1' });

  await page.getByText('Previsualizar').click();
  await expect(page.getByText('Conflictos')).toBeVisible();
  await expect(page.getByText(/hosts 1 fixture\(s\) at once/)).toBeVisible();
  await expect(page.getByText('Publicar')).toBeDisabled();
});
