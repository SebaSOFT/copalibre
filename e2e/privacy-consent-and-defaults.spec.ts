import { createServer, type Server } from 'node:http';
import { expect, test, type Page } from './fixtures.js';
import { loginCallbackUrl, seedLoginTransaction, TOKEN_ENDPOINT } from './support/control-login.js';

const ORGANIZATION = 'liga-mendocina';
const TOURNAMENT_ALIAS = 'apertura-juvenil';
const TOURNAMENT = `/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`;
const DASHBOARD = `/control/${ORGANIZATION}`;
const RESOURCES = `/control/${ORGANIZATION}/resources`;
const PLAYER_ID = '0199f110-0000-7000-8000-000000000041';

let publicApi: Server | undefined;
let publicTournamentPublished = false;

const youthOverview = {
  organizationAlias: ORGANIZATION,
  organizationName: 'Liga Mendocina',
  organizationTimeZone: 'America/Argentina/Mendoza',
  tournamentAlias: TOURNAMENT_ALIAS,
  tournamentName: 'Apertura Juvenil',
  seasonName: 'Apertura Juvenil',
  status: 'upcoming',
  matches: [],
  clubs: [],
  ruleset: {},
  rulesetLabels: {},
};

const youthStandings = {
  layoutCode: 'youth-player-ranking',
  target: 'player-ranking',
  label: { en: 'Player standings', es: 'Posiciones de jugadoras' },
  columns: [
    { code: 'rank', header: '#', format: 'number' },
    { code: 'name', header: { en: 'Player', es: 'Jugadora' }, format: 'text' },
    { code: 'points', header: { en: 'Points', es: 'Puntos' }, format: 'number' },
  ],
  defaultSort: [{ columnCode: 'points', direction: 'desc' }],
  rows: [
    {
      actorId: PLAYER_ID,
      actorName: 'Lucía Pérez',
      rank: 1,
      sharedRank: false,
      hiddenAtRequest: false,
      publicProfileAvailable: false,
      cells: {
        rank: { raw: 1, formatted: '1' },
        name: { formatted: 'Lucía Pérez' },
        points: { raw: 3, formatted: '3' },
      },
    },
  ],
  projectionVersion: 1,
};

test.beforeAll(async ({ workerPort }) => {
  publicApi = createServer((request, response) => {
    response.setHeader('content-type', 'application/json');
    const [path] = (request.url ?? '').split('?');

    if (!publicTournamentPublished) {
      response.statusCode = 404;
      response.end(JSON.stringify({ message: 'not found' }));
      return;
    }
    if (path === `${TOURNAMENT}/overview`) {
      response.end(JSON.stringify(youthOverview));
      return;
    }
    if (path === `${TOURNAMENT}/completion`) {
      response.end(
        JSON.stringify({
          totalMatches: 0,
          resolvedMatches: 0,
          liveMatches: 0,
          scheduledMatches: 0,
          finalizedMatches: 0,
          forfeitedMatches: 0,
          stages: [],
        }),
      );
      return;
    }
    if (path === `${TOURNAMENT}/public/tables`) {
      response.end(
        JSON.stringify({
          layouts: [
            {
              code: 'youth-player-ranking',
              target: 'player-ranking',
              label: youthStandings.label,
              entityGranularity: 'person',
            },
          ],
        }),
      );
      return;
    }
    if (path === `${TOURNAMENT}/public/tables/youth-player-ranking`) {
      response.end(JSON.stringify(youthStandings));
      return;
    }

    response.statusCode = 404;
    response.end(JSON.stringify({ message: 'not found' }));
  });
  await new Promise<void>((resolve) => publicApi?.listen(workerPort, '127.0.0.1', resolve));
});

test.afterAll(async () => {
  if (publicApi?.listening) await new Promise<void>((resolve) => publicApi?.close(() => resolve()));
});

test.beforeEach(() => {
  publicTournamentPublished = false;
});

async function mockDashboardApi(page: Page): Promise<void> {
  await page.exposeFunction('__markYouthTournamentPublished', () => {
    publicTournamentPublished = true;
  });
  await page.addInitScript(
    ({ tokenEndpoint, organizationAlias, tournamentAlias }) => {
      const requests: { url: string; method: string; body?: unknown }[] = [];
      Object.assign(window, { __privacyRequests: requests });

      window.fetch = async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
        requests.push({ url, method, ...(body === undefined ? {} : { body }) });

        if (url === tokenEndpoint) {
          return Response.json({ access_token: 'e2e-access-token', expires_in: 3600 });
        }
        if (url === '/organizations?mine=true') {
          return Response.json([
            {
              organizationId: 'org-1',
              organizationAlias,
              organizationName: 'Liga Mendocina',
              role: 'admin',
            },
          ]);
        }
        if (url === `/organizations/${organizationAlias}/tournaments/${tournamentAlias}/settings`) {
          return Response.json({ includesMinors: true, showYouthProfiles: false });
        }
        if (
          url === `/organizations/${organizationAlias}/tournaments/${tournamentAlias}/publish` &&
          method === 'POST'
        ) {
          return (window as Window & { __markYouthTournamentPublished: () => Promise<void> })
            .__markYouthTournamentPublished()
            .then(() => Response.json({ status: 'published' }));
        }
        if (url === `/organizations/${organizationAlias}/tournaments` && method === 'GET') {
          return Response.json([
            {
              tournamentId: 'tournament-youth',
              organizationId: 'org-1',
              alias: tournamentAlias,
              name: 'Apertura Juvenil',
              status: 'draft',
            },
          ]);
        }
        if (url.includes('/registrations?status=pending') || url.includes('/display-tokens')) {
          return Response.json([]);
        }
        if (url.includes('/audit-trail')) {
          return Response.json({ records: [], total: 0, limit: 10, offset: 0 });
        }
        return Response.json([]);
      };
    },
    {
      tokenEndpoint: TOKEN_ENDPOINT,
      organizationAlias: ORGANIZATION,
      tournamentAlias: TOURNAMENT_ALIAS,
    },
  );
}

async function mockResourceApi(page: Page): Promise<void> {
  await page.addInitScript(
    ({ tokenEndpoint, organizationAlias }) => {
      const state = { venueDeleted: false, scheduleDeleted: false };
      const requests: { url: string; method: string; body?: unknown }[] = [];
      Object.assign(window, { __privacyRequests: requests });

      window.fetch = async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
        requests.push({ url, method, ...(body === undefined ? {} : { body }) });

        if (url === tokenEndpoint) {
          return Response.json({ access_token: 'e2e-access-token', expires_in: 3600 });
        }
        if (url === '/organizations?mine=true') {
          return Response.json([
            {
              organizationId: 'org-1',
              organizationAlias,
              organizationName: 'Liga Mendocina',
              role: 'admin',
            },
          ]);
        }
        if (url === `/organizations/${organizationAlias}/venues` && method === 'GET') {
          return Response.json(
            state.venueDeleted
              ? []
              : [
                  {
                    venueId: 'venue-1',
                    organizationId: 'org-1',
                    alias: 'estadio-provincial',
                    name: 'Estadio Provincial',
                    concurrentCapacity: 1,
                  },
                ],
          );
        }
        if (url === `/organizations/${organizationAlias}/venues/venue-1` && method === 'DELETE') {
          state.venueDeleted = true;
          return Response.json({ success: true });
        }
        if (
          url === `/organizations/${organizationAlias}/venues/venue-1/restore` &&
          method === 'POST'
        ) {
          state.venueDeleted = false;
          return Response.json({
            venueId: 'venue-1',
            organizationId: 'org-1',
            alias: 'estadio-provincial',
            name: 'Estadio Provincial',
            concurrentCapacity: 1,
          });
        }
        if (url === `/organizations/${organizationAlias}/officials`) return Response.json([]);
        if (url === `/organizations/${organizationAlias}/schedules` && method === 'GET') {
          return Response.json(
            state.scheduleDeleted
              ? []
              : [
                  {
                    scheduleId: 'schedule-1',
                    organizationId: 'org-1',
                    name: 'Horario Copa',
                    startsAt: 1792504800000,
                    endsAt: 1792526400000,
                    slotMinutes: 60,
                    turnaroundMinutes: 15,
                    venueIds: ['venue-1'],
                    slots: [0, 1, 2, 3].map((index) => ({
                      slotId: `slot-${index + 1}`,
                      scheduleId: 'schedule-1',
                      venueId: 'venue-1',
                      startsAt: 1792504800000 + index * 3_600_000,
                      matchCount: index < 2 ? 1 : 0,
                    })),
                  },
                ],
          );
        }
        if (url === `/organizations/${organizationAlias}/schedules/schedule-1?dryRun=true`) {
          return Response.json({ dryRun: true, success: false, slots: 4, matchesUnassigned: 2 });
        }
        if (
          url === `/organizations/${organizationAlias}/schedules/schedule-1` &&
          method === 'DELETE'
        ) {
          if (
            (body as { confirmationName?: string } | undefined)?.confirmationName !== 'Horario Copa'
          ) {
            return Response.json({ message: 'Confirmation name does not match' }, { status: 409 });
          }
          state.scheduleDeleted = true;
          return Response.json({ dryRun: false, success: true, slots: 4, matchesUnassigned: 2 });
        }
        return Response.json([]);
      };
    },
    { tokenEndpoint: TOKEN_ENDPOINT, organizationAlias: ORGANIZATION },
  );
}

test('publishes a youth tournament and its standings show player names without profile links', async ({
  page,
}) => {
  await mockDashboardApi(page);
  await seedLoginTransaction(page, DASHBOARD);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${DASHBOARD}`);

  await page.getByRole('button', { name: 'Más acciones' }).first().click();
  await page.getByRole('menuitem', { name: 'Publicar torneo' }).click();
  const preview = page.getByRole('dialog', {
    name: 'Revisá qué se publicará sobre Apertura Juvenil',
  });
  await expect(preview).toContainText('Posiciones');
  await expect(preview).toContainText(
    'sus nombres aparecen sin fotos, nacionalidades, perfiles públicos ni estadísticas de carrera',
  );
  await preview.getByRole('button', { name: 'Publicar torneo' }).click();
  await expect(page.getByText('Torneo publicado.')).toBeVisible();

  await page.goto(`/es/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`);
  const standings = page.locator('.cl-standings-section');
  await expect(standings.getByRole('heading', { name: 'Posiciones de jugadoras' })).toBeVisible();
  await expect(standings.getByRole('row').filter({ hasText: 'Lucía Pérez' })).toBeVisible();
  await expect(standings.locator('.cl-player-link')).toHaveCount(0);
  await expect(standings.getByRole('link', { name: 'Lucía Pérez' })).toHaveCount(0);
});

test('shows schedule deletion counts and enables confirmation only after typing its exact name', async ({
  page,
}) => {
  await mockResourceApi(page);
  await seedLoginTransaction(page, RESOURCES);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${RESOURCES}`);
  await expect(page.getByRole('heading', { name: 'Canchas, horarios y árbitros' })).toBeVisible();

  await page.getByRole('button', { name: 'Eliminar horario' }).click();
  const dialog = page.getByRole('dialog', { name: 'Eliminar horario' });
  await expect(dialog).toContainText('Elimina 4 franjas horarias y deja 2 partidos sin asignación');
  await expect(dialog.getByText('4', { exact: true })).toBeVisible();
  await expect(dialog.getByText('2', { exact: true })).toBeVisible();
  const confirm = dialog.getByRole('button', { name: 'Eliminar horario' });
  await expect(confirm).toBeDisabled();
  const name = dialog.getByLabel('Escribí el nombre exacto para confirmar');
  await name.fill('Horario distinto');
  await expect(confirm).toBeDisabled();
  await name.fill('Horario Copa');
  await expect(confirm).toBeEnabled();
  await confirm.click();

  await expect(page.getByText('Horario Copa')).toHaveCount(0);
  await expect(page.getByText('Horario eliminado.')).toBeVisible();
  const requests = await page.evaluate(
    () =>
      (window as Window & { __privacyRequests: { url: string; method: string; body?: unknown }[] })
        .__privacyRequests,
  );
  expect(requests).toContainEqual(
    expect.objectContaining({
      url: `/organizations/${ORGANIZATION}/schedules/schedule-1`,
      method: 'DELETE',
      body: { confirmationName: 'Horario Copa' },
    }),
  );
});

test('removes a venue with a ten-second Undo action and restores it', async ({ page }) => {
  await mockResourceApi(page);
  await seedLoginTransaction(page, RESOURCES);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${RESOURCES}`);
  const venues = page.getByRole('region', { name: 'Canchas' });
  await expect(venues.getByText('Estadio Provincial')).toBeVisible();

  await venues.getByRole('button', { name: 'Editar sede' }).click();
  await page.getByRole('button', { name: 'Eliminar cancha' }).click();
  await expect(venues.getByText('Estadio Provincial')).toHaveCount(0);
  const toast = page.getByRole('status').filter({ hasText: 'Cancha eliminada.' });
  await expect(toast).toBeVisible();
  await toast.getByRole('button', { name: 'Deshacer' }).click();

  await expect(venues.getByText('Estadio Provincial')).toBeVisible();
  await expect(page.getByText('Cancha restaurada.')).toBeVisible();
});
