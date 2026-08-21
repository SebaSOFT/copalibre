import { expect, test, type Page } from '@playwright/test';
import { loginCallbackUrl, seedLoginTransaction, TOKEN_ENDPOINT } from './support/control-login.js';

/**
 * 0108 in a real browser: creating a second zone and group on a stage,
 * assigning entrants to them manually, and confirming group-scoped
 * standings reflects it (tasks.md 5.3); and configuring/reviewing a
 * promotion plan for a zone, confirming the reviewed list matches
 * `promotion-preview`'s own response, that nothing is written to the next
 * stage's seeding along the way, and — now that `0121-seeding-builder-
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
    ({ tournament, stage, zone1, group1, entrants, layouts, tokenEndpoint }) => {
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
      zone1,
      group1,
      entrants,
      layouts: tableLayoutsFixture,
      tokenEndpoint: TOKEN_ENDPOINT,
    },
  );
}

test('creates a second zone and group, assigns entrants manually, and reflects it in group-scoped standings', async ({
  page,
}) => {
  await mockControlApi(page);

  const zonesTarget = `/control/${ORG}/tournaments/${TOURNAMENT_ALIAS}/stages/1/zones`;
  await seedLoginTransaction(page, zonesTarget);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${zonesTarget}`);

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
  const zoneAssignRegion = page.getByRole('region', { name: 'Asignar entrantes a zonas' });
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
  const groupAssignRegion = page.getByRole('region', { name: 'Asignar entrantes a grupos' });
  await groupAssignRegion.getByText('Colocación manual').click();
  await groupAssignRegion.getByLabel('Deportivo Norte — número').fill('2');
  await groupAssignRegion.getByLabel('Atlético Sur — número').fill('2');
  await groupAssignRegion.getByText('Guardar asignación').click();
  await expect(page.getByText('Asignación guardada.')).toBeVisible();

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
    ({ stage, stage2, tokenEndpoint, zone1 }) => {
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

        if (url === `${stage}/zones/1/promotion-preview` && method === 'GET') {
          const saved = sessionStorage.getItem(PLAN_KEY);
          if (saved === null) {
            // Matches the real server's own message (zones-groups.controller.ts's
            // `promotionPreview` handler) for "no plan configured yet".
            return Response.json({ message: 'No promotion plan for zone 1' }, { status: 404 });
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
            matches: [],
            hasRecordedResults: false,
          });
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
    { stage: STAGE, stage2: STAGE_2, tokenEndpoint: TOKEN_ENDPOINT, zone1 },
  );

  const promotionTarget = `/control/${ORG}/tournaments/${TOURNAMENT_ALIAS}/stages/1/zones/1/promotion`;
  await seedLoginTransaction(page, promotionTarget);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${promotionTarget}`);

  await expect(page.getByText('No promotion plan for zone 1')).toBeVisible();

  await page.getByLabel('Número de la fase siguiente').fill('2');
  await page.getByLabel('Entrantes que avanzan por grupo').fill('2');
  await page.getByRole('button', { name: 'Guardar plan de promoción' }).click();

  await expect(page.getByText('Plan guardado.')).toBeVisible();
  const review = page.getByRole('region', { name: 'Revisión — orden de candidatos calculado' });
  await expect(review.getByText(/1\.\s*aaaaaaaa/)).toBeVisible();
  await expect(review.getByText(/2\.\s*bbbbbbbb/)).toBeVisible();

  // Reviewing the plan writes nothing to the next stage's seeding — 0108
  // deferred the seeding-builder pre-fill to 0121.
  const requestLog = await readRequestLog(page);
  expect(
    requestLog.some((entry) => entry.startsWith('POST') && entry.includes('/stages/2/seeding')),
  ).toBe(false);

  // The next stage's seeding builder is pre-filled from the reviewed
  // promotion plan's order (0121) — still nothing published, only the
  // builder's own initial state.
  const seedingTarget = `/control/${ORG}/tournaments/${TOURNAMENT_ALIAS}/stages/2/seeding`;
  await seedLoginTransaction(page, seedingTarget);
  await page.goto(loginCallbackUrl()).catch((error: Error) => {
    if (!error.message.includes('is interrupted by another navigation')) throw error;
  });
  await page.waitForURL(`**${seedingTarget}`);
  const seedList = page.getByRole('list', { name: 'Orden de siembra' });
  await expect(seedList.getByText(/1.*aaaaaaaa/)).toBeVisible();
  await expect(seedList.getByText(/2.*bbbbbbbb/)).toBeVisible();

  // Still nothing persisted — pre-fill only changes the builder's initial
  // client-side state (proposal.md's "no new commit path").
  const seedingRequestLog = await readRequestLog(page);
  expect(
    seedingRequestLog.some(
      (entry) => entry.startsWith('POST') && entry.includes('/stages/2/seeding'),
    ),
  ).toBe(false);
});
