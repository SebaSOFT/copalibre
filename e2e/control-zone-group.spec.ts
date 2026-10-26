import { createServer, type Server } from 'node:http';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';
import { loginCallbackUrl, seedLoginTransaction, TOKEN_ENDPOINT } from './support/control-login.js';
import { expectNoVisibleIdentifiers, FIXTURE_ALIASES } from './support/visible-identifiers.js';

/**
 * Exercise zone and group management in a real browser: creating a second zone and group on a stage,
 * assigning entrants to them manually, and confirming group-scoped
 * standings reflects it; and configuring/reviewing a
 * promotion plan for a zone, confirming the reviewed list matches
 * `promotion-preview`'s own response, that nothing is written to the next
 * stage's seeding along the way, and — now that the seeding builder
 * promotion-prefill` is built — that the next stage's seeding builder opens
 * pre-filled from that reviewed order, still with nothing published.
 *
 * The API is stubbed at `window.fetch`, as the other control-panel e2e specs
 * do.
 */

const ORG = 'liga-mendocina';
const TOURNAMENT_ALIAS = 'apertura-2026';
const TOURNAMENT = `/organizations/${ORG}/tournaments/${TOURNAMENT_ALIAS}`;
const STAGE = `${TOURNAMENT}/stages/1`;
const STAGE_2 = `${TOURNAMENT}/stages/2`;

const zone1 = { zoneId: 'zone-1', stageId: 'stage-1', number: 1, name: 'Zona 1' };
const group1 = { groupId: 'group-1', zoneId: 'zone-1', number: 1, name: 'Grupo 1' };

const entrants = [
  {
    entrantId: 'entrant-aaaaaaaa',
    tournamentId: 'tournament-1',
    status: 'accepted',
    displayName: 'Deportivo Norte',
  },
  {
    entrantId: 'entrant-bbbbbbbb',
    tournamentId: 'tournament-1',
    status: 'accepted',
    displayName: 'Atlético Sur',
  },
];

const tableLayoutsFixture = {
  layouts: [
    {
      code: 'group-standings-default',
      target: 'group-phase',
      label: 'Group Standings',
      entityGranularity: 'team',
    },
  ],
};

/**
 * `window.fetch` is fully overridden in-page (see `mockControlApi`), so no
 * real network request ever reaches the browser's network stack — Playwright's
 * `page.on('request', ...)` never fires for it. Every mocked fetch call is
 * logged into `sessionStorage` instead (see `logRequest` in each init
 * script), and read back here.
 */
async function readRequestLog(page: Page): Promise<readonly string[]> {
  return page.evaluate(
    () => JSON.parse(sessionStorage.getItem('e2e-request-log') ?? '[]') as string[],
  );
}

async function mockControlApi(page: Page): Promise<void> {
  await page.addInitScript(
    ({ tournament, stage, stage2, zone1, group1, entrants, layouts, tokenEndpoint }) => {
      const ZONES_KEY = 'e2e-zones';
      const GROUPS_KEY = 'e2e-groups-by-zone';
      const readZones = (): (typeof zone1)[] => {
        const stored = sessionStorage.getItem(ZONES_KEY);
        return stored ? (JSON.parse(stored) as (typeof zone1)[]) : [zone1];
      };
      const writeZones = (next: (typeof zone1)[]): void =>
        sessionStorage.setItem(ZONES_KEY, JSON.stringify(next));
      const readGroups = (): Record<string, (typeof group1)[]> => {
        const stored = sessionStorage.getItem(GROUPS_KEY);
        return stored
          ? (JSON.parse(stored) as Record<string, (typeof group1)[]>)
          : { '1': [group1] };
      };
      const writeGroups = (next: Record<string, (typeof group1)[]>): void =>
        sessionStorage.setItem(GROUPS_KEY, JSON.stringify(next));
      const REQUEST_LOG_KEY = 'e2e-request-log';
      const logRequest = (requestUrl: string, requestMethod: string): void => {
        const log = JSON.parse(sessionStorage.getItem(REQUEST_LOG_KEY) ?? '[]') as string[];
        log.push(`${requestMethod} ${requestUrl}`);
        sessionStorage.setItem(REQUEST_LOG_KEY, JSON.stringify(log));
      };

      window.fetch = async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        if (url !== tokenEndpoint) logRequest(url, method);

        if (url === tokenEndpoint) {
          return Response.json({ access_token: 'e2e-access-token', expires_in: 3600 });
        }

        if (url === `${tournament}/registrations?status=accepted`) {
          return Response.json(entrants);
        }

        if (url === `${tournament}/stages` && method === 'GET') {
          return Response.json([
            { stageId: 'stage-1', seasonId: 'season-1', number: 1, name: 'Fase de grupos' },
            { stageId: 'stage-2', seasonId: 'season-1', number: 2, name: 'Fase final' },
          ]);
        }
        if (
          (url === `${stage}/configuration` || url === `${stage2}/configuration`) &&
          method === 'GET'
        ) {
          return Response.json({ overrides: {} });
        }

        if (url === `${stage}/zones` && method === 'GET') return Response.json(readZones());
        if (url === `${stage}/zones` && method === 'POST') {
          const body = JSON.parse(String(init?.body)) as { readonly name: string };
          const zones = readZones();
          const created = {
            zoneId: `zone-${zones.length + 1}`,
            stageId: 'stage-1',
            number: zones.length + 1,
            name: body.name,
          };
          writeZones([...zones, created]);
          return Response.json(created);
        }

        const groupsMatch = /\/zones\/(\d+)\/groups$/.exec(url);
        if (groupsMatch && method === 'GET') {
          const zoneNumber = groupsMatch[1];
          return Response.json(readGroups()[zoneNumber] ?? []);
        }
        if (groupsMatch && method === 'POST') {
          const zoneNumber = groupsMatch[1];
          const body = JSON.parse(String(init?.body)) as { readonly name: string };
          const groups = readGroups();
          const existing = groups[zoneNumber] ?? [];
          const created = {
            groupId: `group-z${zoneNumber}-${existing.length + 1}`,
            zoneId: `zone-${zoneNumber}`,
            number: existing.length + 1,
            name: body.name,
          };
          writeGroups({ ...groups, [zoneNumber]: [...existing, created] });
          return Response.json(created);
        }

        if (url === `${stage}/zones/assign` && method === 'POST') {
          return Response.json({ assignment: { groups: {} }, zones: readZones() });
        }
        if (/\/zones\/\d+\/groups\/assign$/.test(url) && method === 'POST') {
          const zoneNumber = /\/zones\/(\d+)\/groups\/assign$/.exec(url)?.[1] ?? '1';
          return Response.json({
            assignment: { groups: {} },
            groups: readGroups()[zoneNumber] ?? [],
          });
        }
        if (/\/zones\/\d+\/entrants$/.test(url) && method === 'GET') {
          return Response.json(entrants.map((entrant) => entrant.entrantId));
        }

        if (url === `${tournament}/tables`) return Response.json(layouts);
        const projectionMatch = new URL(url, 'https://e2e.example').pathname.endsWith(
          '/tables/group-standings-default',
        );
        if (projectionMatch && method === 'GET') {
          const groupId = new URL(url, 'https://e2e.example').searchParams.get('groupId');
          const label = groupId === null ? 'Sin agrupar' : `Grupo ${groupId}`;
          return Response.json({
            layoutCode: 'group-standings-default',
            target: 'group-phase',
            label: 'Group Standings',
            columns: [{ code: 'name', header: 'Team', format: 'text' }],
            defaultSort: [],
            rows: [
              {
                actorId: label,
                entrantId: label,
                rank: 1,
                sharedRank: false,
                cells: { name: { raw: label, formatted: label } },
              },
            ],
            projectionVersion: groupId === null ? 1 : 2,
          });
        }

        return new Response('Not found', { status: 404 });
      };
    },
    {
      tournament: TOURNAMENT,
      stage: STAGE,
      stage2: STAGE_2,
      zone1,
      group1,
      entrants,
      layouts: tableLayoutsFixture,
      tokenEndpoint: TOKEN_ENDPOINT,
    },
  );
}

test('creates a second zone and group, assigns entrants manually, and reflects it in group-scoped standings @visible-identifier-lint', async ({
  page,
}) => {
  await mockControlApi(page);

  const zonesTarget = `/control/${ORG}/tournaments/${TOURNAMENT_ALIAS}/stages/1/zones`;
  await seedLoginTransaction(page, zonesTarget);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${zonesTarget}`);
  await expectNoVisibleIdentifiers(page, FIXTURE_ALIASES);
  const zonesPanel = page.getByRole('region', { name: 'Zonas', exact: true });
  await expect(zonesPanel.getByText('Zona 1')).toBeVisible();

  // Create a second zone.
  await page.getByLabel('Nombre de la zona nueva').fill('Zona 2');
  await page.getByRole('button', { name: 'Agregar zona' }).click();
  await expect(zonesPanel.getByText('Zona 2')).toBeVisible();

  // Select the new zone and create a group in it.
  await page.getByLabel('Zona', { exact: true }).selectOption({ label: 'Zona 2' });
  const groupsPanel = page.getByRole('region', { name: 'Grupos', exact: true });
  await page.getByLabel('Nombre del grupo nuevo').fill('Grupo 2');
  await page.getByRole('button', { name: 'Agregar grupo' }).click();
  await expect(groupsPanel.getByText('Grupo 2')).toBeVisible();

  // Assign entrants to Zona 2 manually.
  const zoneAssignRegion = page.getByRole('region', {
    name: /Asignar (?:entrantes|participantes) a zonas/,
  });
  await zoneAssignRegion.getByText('Colocación manual').click();
  await zoneAssignRegion.getByLabel('Deportivo Norte — número').fill('2');
  await zoneAssignRegion.getByLabel('Atlético Sur — número').fill('2');
  await zoneAssignRegion.getByText('Guardar asignación').click();
  await expect(page.getByText('Asignación guardada.')).toBeVisible();
  const requestLog = await readRequestLog(page);
  expect(
    requestLog.some(
      (entry) =>
        entry ===
        'POST /organizations/liga-mendocina/tournaments/apertura-2026/stages/1/zones/assign',
    ),
  ).toBe(true);

  // Assign entrants to Grupo 2 manually.
  const groupAssignRegion = page.getByRole('region', {
    name: /Asignar (?:entrantes|participantes) a grupos/,
  });
  await groupAssignRegion.getByText('Colocación manual').click();
  await groupAssignRegion.getByLabel('Deportivo Norte — número').fill('2');
  await groupAssignRegion.getByLabel('Atlético Sur — número').fill('2');
  await groupAssignRegion.getByText('Guardar asignación').click();
  await expect(page.getByText('Asignación guardada.').last()).toBeVisible();

  // Group-scoped standings now offers the new group and scopes the table to
  // it. A fresh navigation (not an in-app link) reloads the whole document,
  // which discards the in-memory access token — log back in the same way
  // `control-standings-seeding.spec.ts`'s reload case does.
  const standingsTarget = `/control/${ORG}/tournaments/${TOURNAMENT_ALIAS}/stages/1/standings`;
  await seedLoginTransaction(page, standingsTarget);
  await page.goto(loginCallbackUrl()).catch((error: Error) => {
    if (!error.message.includes('is interrupted by another navigation')) throw error;
  });
  await page.waitForURL(`**${standingsTarget}`);
  const selector = page.getByRole('combobox', { name: 'Grupo' });
  await expect(selector).toBeVisible();
  await selector.selectOption({ label: 'Zona 2 / Grupo 2' });

  await expect(page.getByText(/Grupo group-z2-1/)).toBeVisible();
});

test('reviews a promotion plan and confirms nothing is written to the next stage until its own publish action', async ({
  page,
}) => {
  await page.addInitScript(
    ({ tournament, stage, stage2, entrants, tokenEndpoint, zone1 }) => {
      const PLAN_KEY = 'e2e-promotion-plan';
      const REQUEST_LOG_KEY = 'e2e-request-log';
      const logRequest = (requestUrl: string, requestMethod: string): void => {
        const log = JSON.parse(sessionStorage.getItem(REQUEST_LOG_KEY) ?? '[]') as string[];
        log.push(`${requestMethod} ${requestUrl}`);
        sessionStorage.setItem(REQUEST_LOG_KEY, JSON.stringify(log));
      };

      window.fetch = async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        if (url !== tokenEndpoint) logRequest(url, method);

        if (url === tokenEndpoint) {
          return Response.json({ access_token: 'e2e-access-token', expires_in: 3600 });
        }
        if (url === `${stage}/zones`) return Response.json([zone1]);
        if (url === `${tournament}/registrations?status=accepted` && method === 'GET') {
          return Response.json(entrants);
        }

        if (url === `${stage}/zones/1/promotion-preview` && method === 'GET') {
          const saved = sessionStorage.getItem(PLAN_KEY);
          if (saved === null) {
            // Matches the real server's own message (zones-groups.controller.ts's
            // `promotionPreview` handler) for "no plan configured yet".
            return Response.json(
              {
                message: 'No promotion plan for zone 1',
                errorCode: 'promotion-plan-not-found',
              },
              { status: 404 },
            );
          }
          return Response.json({
            combined: [
              { entrantId: 'entrant-aaaaaaaa', groupId: 'group-1', rank: 1 },
              { entrantId: 'entrant-bbbbbbbb', groupId: 'group-1', rank: 2 },
            ],
            trace: [],
          });
        }
        if (url === `${stage}/zones/1/promotion-plan` && method === 'POST') {
          sessionStorage.setItem(PLAN_KEY, String(init?.body));
          return Response.json({
            promotionPlanId: 'plan-1',
            zoneId: 'zone-1',
            nextStageId: 'stage-2',
            plan: {},
          });
        }

        if (url === `${stage2}/seeding` && method === 'GET') {
          return Response.json({
            stageId: 'stage-2',
            format: 'single-elimination',
            seeds: [],
            names: {
              'entrant-aaaaaaaa': 'Deportivo Norte',
              'entrant-bbbbbbbb': 'Atlético Sur',
            },
            zones: [],
            hasRecordedResults: false,
          });
        }
        if (url === `${stage2}/configuration` && method === 'GET') {
          return Response.json({ overrides: {} });
        }
        if (url === `${stage2}/promotion-plans` && method === 'GET') {
          const saved = sessionStorage.getItem(PLAN_KEY);
          if (saved === null) return Response.json([]);
          return Response.json([
            {
              zoneNumber: 1,
              zoneId: 'zone-1',
              combined: [
                { entrantId: 'entrant-aaaaaaaa', groupId: 'group-1', rank: 1 },
                { entrantId: 'entrant-bbbbbbbb', groupId: 'group-1', rank: 2 },
              ],
            },
          ]);
        }

        return new Response('Not found', { status: 404 });
      };
    },
    {
      tournament: TOURNAMENT,
      stage: STAGE,
      stage2: STAGE_2,
      entrants,
      tokenEndpoint: TOKEN_ENDPOINT,
      zone1,
    },
  );

  const promotionTarget = `/control/${ORG}/tournaments/${TOURNAMENT_ALIAS}/stages/1/zones/1/promotion`;
  await seedLoginTransaction(page, promotionTarget);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${promotionTarget}`);

  await expect(
    page.getByText('Todavía no hay un plan de promoción guardado para esta zona.'),
  ).toBeVisible();

  await page.getByLabel('Número de la fase siguiente').fill('2');
  await page.getByLabel(/(?:Entrantes|Participantes) que avanzan por grupo/).fill('2');
  await page.getByRole('button', { name: 'Guardar plan de promoción' }).click();

  await expect(page.getByText('Plan guardado.')).toBeVisible();
  const review = page.getByRole('region', { name: 'Revisión — orden de candidatos calculado' });
  await expect(review.getByText(/1\.\s*Deportivo Norte/)).toBeVisible();
  await expect(review.getByText(/2\.\s*Atlético Sur/)).toBeVisible();

  // Reviewing the plan writes nothing to the next stage's seeding; the
  // seeding-builder pre-fill remains deferred.
  const requestLog = await readRequestLog(page);
  expect(
    requestLog.some((entry) => entry.startsWith('POST') && entry.includes('/stages/2/seeding')),
  ).toBe(false);

  // The next stage's seeding builder is pre-filled from the reviewed
  // promotion plan's order — still nothing published, only the
  // builder's own initial state.
  const seedingTarget = `/control/${ORG}/tournaments/${TOURNAMENT_ALIAS}/stages/2/seeding`;
  await seedLoginTransaction(page, seedingTarget);
  await page.goto(loginCallbackUrl()).catch((error: Error) => {
    if (!error.message.includes('is interrupted by another navigation')) throw error;
  });
  await page.waitForURL(`**${seedingTarget}`);
  const seedList = page.getByRole('list', { name: 'Orden de siembra' });
  await expect(seedList.getByText(/1.*Deportivo Norte/)).toBeVisible();
  await expect(seedList.getByText(/2.*Atlético Sur/)).toBeVisible();

  // Still nothing persisted — pre-fill only changes the builder's initial
  // client-side state (no new commit path).
  const seedingRequestLog = await readRequestLog(page);
  expect(
    seedingRequestLog.some(
      (entry) => entry.startsWith('POST') && entry.includes('/stages/2/seeding'),
    ),
  ).toBe(false);
});

test('overrides one zone’s format and series, labels it, and returns it to the stage default', async ({
  page,
}) => {
  await page.addInitScript(
    ({ tournament, stage, tokenEndpoint }) => {
      const ZONES_KEY = 'e2e-format-zones';
      const REQUEST_LOG_KEY = 'e2e-request-log';
      type Zone = {
        zoneId: string;
        stageId: string;
        number: number;
        name: string;
        effectiveFormat: string;
        format?: string;
        series?: { span: number; resolutionClass?: string };
      };
      const initial: Zone[] = [1, 2, 3].map((number) => ({
        zoneId: `zone-${number}`,
        stageId: 'stage-1',
        number,
        name: `Zona ${number}`,
        effectiveFormat: 'single-elimination',
      }));
      const readZones = (): Zone[] =>
        JSON.parse(sessionStorage.getItem(ZONES_KEY) ?? JSON.stringify(initial)) as Zone[];
      const logRequest = (entry: string): void => {
        const log = JSON.parse(sessionStorage.getItem(REQUEST_LOG_KEY) ?? '[]') as string[];
        log.push(entry);
        sessionStorage.setItem(REQUEST_LOG_KEY, JSON.stringify(log));
      };

      window.fetch = async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        if (url === tokenEndpoint) {
          return Response.json({ access_token: 'e2e-access-token', expires_in: 3600 });
        }
        if (url === `${tournament}/registrations?status=accepted`) return Response.json([]);
        if (url === `${tournament}/stages`) {
          return Response.json([
            {
              stageId: 'stage-1',
              seasonId: 'season-1',
              number: 1,
              name: 'Fase 1',
              format: 'single-elimination',
              seeded: false,
              availableFormats: ['single-elimination', 'round-robin'],
            },
          ]);
        }
        if (url === `${stage}/zones` && method === 'GET') return Response.json(readZones());
        if (/\/zones\/\d+\/(groups|entrants)$/.test(url)) return Response.json([]);

        const configuration = /\/zones\/(\d+)\/configuration$/.exec(url);
        if (configuration && method === 'PUT') {
          const number = Number(configuration[1]);
          const body = JSON.parse(String(init?.body)) as {
            format?: string | null;
            series?: { span: number; resolutionClass?: string } | null;
          };
          logRequest(`PUT zone ${number} ${JSON.stringify(body)}`);
          const next = readZones().map((zone) => {
            if (zone.number !== number) return zone;
            const format = body.format === undefined ? zone.format : (body.format ?? undefined);
            const series = body.series === undefined ? zone.series : (body.series ?? undefined);
            return {
              zoneId: zone.zoneId,
              stageId: zone.stageId,
              number: zone.number,
              name: zone.name,
              effectiveFormat: format ?? 'single-elimination',
              ...(format === undefined ? {} : { format }),
              ...(series === undefined ? {} : { series }),
            };
          });
          sessionStorage.setItem(ZONES_KEY, JSON.stringify(next));
          return Response.json(next.find((zone) => zone.number === number));
        }
        return new Response('Not found', { status: 404 });
      };
    },
    { tournament: TOURNAMENT, stage: STAGE, tokenEndpoint: TOKEN_ENDPOINT },
  );

  const target = `/control/${ORG}/tournaments/${TOURNAMENT_ALIAS}/stages/1/zones`;
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  const zonesPanel = page.getByRole('region', { name: 'Zonas', exact: true });
  await expect(
    zonesPanel.getByText(/Juega Eliminación directa \(formato de la fase\)/),
  ).toHaveCount(3);
  await expect(zonesPanel.getByText('Personalizada')).toHaveCount(0);

  // The override controls stay collapsed until asked for, so the stage default is the primary path.
  const zone3 = page.locator('details', { has: page.locator('#zone-3-series-span') });
  await expect(zone3.getByLabel('Formato de Zona 3')).toBeHidden();
  await zone3.locator('summary').click();

  // Zona 3 becomes a league for the clubs left over; the other two keep inheriting.
  await page.getByLabel('Formato de Zona 3').selectOption({ label: 'Todos contra todos' });
  await expect(zonesPanel.getByText('Personalizada')).toHaveCount(1);
  await expect(zonesPanel.getByText('Juega Todos contra todos')).toBeVisible();
  await expect(
    zonesPanel.getByText(/Juega Eliminación directa \(formato de la fase\)/),
  ).toHaveCount(2);

  // A series for Zona 3 only.
  await page.locator('#zone-3-series-span').fill('3');
  await page
    .locator('details', { has: page.locator('#zone-3-series-span') })
    .getByRole('button', {
      name: 'Guardar serie',
    })
    .click();
  await expect(zonesPanel.getByText(/Serie de 3 partidos/)).toHaveCount(1);

  // Back to the stage default.
  await page
    .getByLabel('Formato de Zona 3')
    .selectOption({ label: 'Formato de la fase (Eliminación directa)' });
  await expect(zonesPanel.getByText('Personalizada')).toHaveCount(0);

  const log = await readRequestLog(page);
  expect(log).toEqual([
    'PUT zone 3 {"format":"round-robin"}',
    'PUT zone 3 {"series":{"span":3,"resolutionClass":"best-of"}}',
    'PUT zone 3 {"format":null}',
  ]);
});

/**
 * A cup generated ahead of its groups: the builder previews and generates it with qualifier
 * positions, the public programme names each side by its position, the confirmation waits for the
 * groups, and confirming seats every entrant at once.
 */
test.describe('generate a cup ahead and confirm its qualifiers', () => {
  const PLAN = '0199c000-0000-7000-8000-0000000000c1';
  const label = (rank: number, group: 'A' | 'B') => ({
    kind: 'group-rank',
    rank,
    groupNumber: group === 'A' ? 1 : 2,
    groupName: `Grupo ${group}`,
  });
  const seeds = [
    [1, 1, 'A'],
    [2, 2, 'A'],
    [3, 1, 'B'],
    [4, 2, 'B'],
  ].map(([position, rank, group]) => ({
    promotionPlanId: PLAN,
    position: position as number,
    qualifierLabel: label(rank as number, group as 'A' | 'B'),
  }));
  const clubs = ['Deportivo Norte', 'Atlético Sur', 'Unión Oeste', 'Sportivo Este'];
  let confirmed = false;
  let server: Server;

  /** The two semi-finals as the public programme reads them: seed 1 meets seed 4. */
  const semiRows = () =>
    [
      [1, 0, 3],
      [2, 1, 2],
    ].map(([position, home, away]) => ({
      matchId: `0199c000-0000-7000-8000-00000000010${position}`,
      nodeKey: `SE-R1-M${position}`,
      stageNumber: 2,
      matchNumber: position,
      round: 1,
      status: 'upcoming',
      homeSource: { kind: 'qualifier', ...seeds[home as number] },
      awaySource: { kind: 'qualifier', ...seeds[away as number] },
      ...(confirmed
        ? {
            homeEntrantId: `entrant-${home}`,
            homeName: clubs[home as number],
            awayEntrantId: `entrant-${away}`,
            awayName: clubs[away as number],
          }
        : {}),
      scheduledAt: new Date(Date.UTC(2026, 10, 21, 18 + (position as number))).toISOString(),
      venueName: 'Estadio Malvinas Argentinas',
    }));

  test.beforeAll(async ({ workerPort }) => {
    server = createServer((req, res) => {
      res.setHeader('content-type', 'application/json');
      const url = new URL(req.url ?? '/', 'http://localhost');
      const send = (body: unknown) => res.end(JSON.stringify(body));
      if (url.pathname === `${TOURNAMENT}/overview`)
        send({
          organizationAlias: ORG,
          organizationName: 'Liga Mendocina',
          organizationTimeZone: 'America/Argentina/Mendoza',
          tournamentAlias: TOURNAMENT_ALIAS,
          tournamentName: 'Apertura 2026',
          seasonName: '2026',
          matches: [],
          clubs: [],
          ruleset: {},
        });
      else if (url.pathname === `${TOURNAMENT}/matches-view`) send({ matches: semiRows() });
      else if (url.pathname === `${TOURNAMENT}/live`) send({ matches: [] });
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

  async function mockAhead(page: Page): Promise<void> {
    await page.addInitScript(
      ({ stage2, tokenEndpoint, seeds, clubs }) => {
        const GENERATED = 'e2e-ahead-generated';
        const FINISHED = 'e2e-groups-finished';
        const CONFIRMED = 'e2e-qualification-confirmed';
        const names = Object.fromEntries(clubs.map((name, index) => [`entrant-${index}`, name]));
        const preview = () => {
          const finished = sessionStorage.getItem(FINISHED) !== null;
          const done = sessionStorage.getItem(CONFIRMED) !== null;
          return {
            state: !finished ? 'incomplete' : done ? 'confirmed' : 'ready',
            positions: seeds.map((seed, index) => ({
              ...seed,
              ...(finished ? { entrantId: `entrant-${index}` } : {}),
              ...(done ? { confirmedEntrantId: `entrant-${index}` } : {}),
            })),
            incomplete: finished
              ? []
              : [{ matchId: 'group-final-a', round: 3, status: 'scheduled' }],
            names,
          };
        };
        const qualifierSlot = (index: number) => ({
          kind: 'qualifier',
          source: { kind: 'qualifier', ...seeds[index] },
        });

        window.fetch = async (input, init) => {
          const url = String(input);
          const method = init?.method ?? 'GET';
          if (url === tokenEndpoint) {
            return Response.json({ access_token: 'e2e-access-token', expires_in: 3600 });
          }
          if (url === `${stage2}/seeding` && method === 'GET') {
            const generated = sessionStorage.getItem(GENERATED) !== null;
            return Response.json({
              stageId: 'stage-2',
              format: 'single-elimination',
              seeds: [],
              zones: generated
                ? [
                    {
                      matches: [
                        [1, 0, 3],
                        [2, 1, 2],
                      ].map(([position, home, away]) => ({
                        matchId: `SE-R1-M${position}`,
                        bracket: 'winners',
                        round: 1,
                        position,
                        status: 'scheduled',
                        slots: [qualifierSlot(home), qualifierSlot(away)],
                      })),
                    },
                  ]
                : [],
              hasRecordedResults: false,
              qualifiers: [{ format: 'single-elimination', seeds }],
            });
          }
          if (url === `${stage2}/configuration` && method === 'GET') {
            return Response.json({ overrides: {} });
          }
          if (url === `${stage2}/seeding` && method === 'POST') {
            sessionStorage.setItem(GENERATED, String(init?.body));
            return Response.json({
              mutationClass: 'safe',
              reason: 'Copa generada por adelantado',
              invalidates: [],
              persisted: true,
            });
          }
          if (url === `${stage2}/promotion-plans`) return Response.json([]);
          if (url === `${stage2}/qualification/preview` && method === 'POST') {
            return Response.json(preview());
          }
          if (url === `${stage2}/qualification/confirm` && method === 'POST') {
            sessionStorage.setItem(CONFIRMED, String(init?.body));
            return Response.json({ ...preview(), changedSides: 4 });
          }
          return new Response('Not found', { status: 404 });
        };
      },
      { stage2: STAGE_2, tokenEndpoint: TOKEN_ENDPOINT, seeds, clubs },
    );
  }

  async function open(page: Page, target: string): Promise<void> {
    await seedLoginTransaction(page, target);
    await page.goto(loginCallbackUrl()).catch((error: Error) => {
      if (!error.message.includes('is interrupted by another navigation')) throw error;
    });
    await page.waitForURL(`**${target}`);
  }

  test('generates the cup ahead, names its sides by position, and seats them on confirmation', async ({
    page,
  }) => {
    confirmed = false;
    await mockAhead(page);
    await open(page, `/control/${ORG}/tournaments/${TOURNAMENT_ALIAS}/stages/2/seeding`);

    // The builder previews the cross-overs the plan decides before anything is written.
    const panel = page.getByRole('region', { name: 'Generar por adelantado' });
    await expect(panel.getByText('1.° Grupo A').first()).toBeVisible();
    await expect(panel.getByText('2.° Grupo B').first()).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem('e2e-ahead-generated'))).toBeNull();
    await panel.getByRole('button', { name: 'Generar por adelantado' }).click();
    await expect(page.getByText('Copa generada por adelantado')).toBeVisible();
    expect(
      JSON.parse(
        (await page.evaluate(() => sessionStorage.getItem('e2e-ahead-generated'))) ?? '{}',
      ),
    ).toEqual({ ahead: true });

    // The public programme names each side by its qualifier position, with scripting or without.
    const publicPage = await page.context().newPage();
    await publicPage.goto(`/${ORG}/tournaments/${TOURNAMENT_ALIAS}/matches?view=cards`);
    const semi = publicPage.locator('[data-match="0199c000-0000-7000-8000-000000000101"]');
    await expect(
      semi.getByText('1st Grupo A', { exact: true }).or(semi.getByTitle('1st Grupo A')).first(),
    ).toBeVisible();
    await expect(
      semi.getByText('2nd Grupo B', { exact: true }).or(semi.getByTitle('2nd Grupo B')).first(),
    ).toBeVisible();
    await publicPage.setViewportSize({ width: 1440, height: 900 });
    await publicPage.screenshot({
      path: 'docs/assets/screenshots/next-stage-ahead-public-desktop.png',
    });
    await publicPage.setViewportSize({ width: 390, height: 844 });
    await publicPage.screenshot({
      path: 'docs/assets/screenshots/next-stage-ahead-public-mobile.png',
    });
    await publicPage.close();

    // While a group game remains, the confirmation says why and offers nothing to confirm.
    await page.getByRole('link', { name: 'Confirmar clasificación' }).click();
    await page.waitForURL('**/stages/2/qualification');
    await expect(page.getByText(/1 partido de la fase anterior sigue sin resolver/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Confirmar clasificación' })).toHaveCount(0);

    // The groups finish; the screen lists who each position resolves to.
    await page.evaluate(() => sessionStorage.setItem('e2e-groups-finished', '1'));
    await open(page, `/control/${ORG}/tournaments/${TOURNAMENT_ALIAS}/stages/2/qualification`);
    const table = page.getByRole('table');
    await expect(table.getByText('1.° Grupo A')).toBeVisible();
    await expect(page.locator('[data-qualification-entrant="1"]')).toHaveText('Deportivo Norte');
    await expect(page.locator('[data-qualification-entrant="4"]')).toHaveText('Sportivo Este');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: 'docs/assets/screenshots/next-stage-ahead-qualification.png' });

    await page.getByRole('button', { name: 'Confirmar clasificación' }).click();
    await expect(page.getByText('Clasificación confirmada: 4 lugares completados.')).toBeVisible();
    const sent = JSON.parse(
      (await page.evaluate(() => sessionStorage.getItem('e2e-qualification-confirmed'))) ?? '{}',
    ) as { expected: { position: number; entrantId: string }[] };
    expect(sent.expected.map(({ position, entrantId }) => [position, entrantId])).toEqual([
      [1, 'entrant-0'],
      [2, 'entrant-1'],
      [3, 'entrant-2'],
      [4, 'entrant-3'],
    ]);

    // The public programme now seats the cup's entrants.
    confirmed = true;
    const after = await page.context().newPage();
    await after.goto(`/${ORG}/tournaments/${TOURNAMENT_ALIAS}/matches?view=cards`);
    const seated = after.locator('[data-match="0199c000-0000-7000-8000-000000000101"]');
    await expect(seated.getByText('Deportivo Norte')).toBeVisible();
    await expect(seated.getByText('Sportivo Este')).toBeVisible();
    await expect(seated.getByText('1st Grupo A', { exact: true })).toHaveCount(0);
    await after.close();
  });
});
