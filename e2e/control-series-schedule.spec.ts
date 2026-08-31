import { expect, test, type Page } from '@playwright/test';
import { loginCallbackUrl, seedLoginTransaction, TOKEN_ENDPOINT } from './support/control-login.js';

/**
 * Scheduling a series in the builder, end to end (0159 tasks 7.1, 7.2).
 *
 * The thing being proven is that a best-of-five is five placeable games and not one cross with
 * a note attached: each has its own row, its own slot at its own venue on its own date, and its
 * own contingency stated in words. And that once the series decides, the games it no longer
 * needs stay in the view, naming the slots they had held so the organizer knows the venue and
 * the hour came back.
 */

const ORG_ALIAS = 'liga-mendocina';
const TOURNAMENT_ALIAS = 'apertura-2026';
const STAGE_ID = 'stage-1';

const VENUES = [
  {
    venueId: 'venue-1',
    organizationId: 'org-1',
    alias: 'cancha-1',
    name: 'Cancha 1',
    concurrentCapacity: 2,
  },
  {
    venueId: 'venue-2',
    organizationId: 'org-1',
    alias: 'cancha-2',
    name: 'Cancha 2',
    concurrentCapacity: 2,
  },
];

/** Five slots across two venues and five days, so each game can genuinely go somewhere else. */
const SCHEDULES = [
  {
    scheduleId: 'schedule-1',
    organizationId: 'org-1',
    name: 'Playoffs',
    slotMinutes: 90,
    slots: [
      { slotId: 'slot-1', venueId: 'venue-1', startsAt: '2026-08-01T19:00:00.000Z', matchCount: 0 },
      { slotId: 'slot-2', venueId: 'venue-2', startsAt: '2026-08-02T19:00:00.000Z', matchCount: 0 },
      { slotId: 'slot-3', venueId: 'venue-1', startsAt: '2026-08-03T19:00:00.000Z', matchCount: 0 },
      { slotId: 'slot-4', venueId: 'venue-2', startsAt: '2026-08-04T19:00:00.000Z', matchCount: 0 },
      { slotId: 'slot-5', venueId: 'venue-1', startsAt: '2026-08-05T19:00:00.000Z', matchCount: 0 },
    ],
  },
];

const SERIES_DEFAULTS = {
  span: 5,
  resolutionClass: 'best-of',
  guaranteedMatches: 3,
  matchesPlayed: 0,
  anulledMatchNumbers: [] as readonly number[],
};

function fixturesResponse(
  games: readonly { number: number; status: string; releasedSlotId?: string }[],
  series: Record<string, unknown> = {},
) {
  return {
    stageId: STAGE_ID,
    fixtures: [
      {
        fixtureId: 'fixture-1',
        matchId: 'match-1',
        round: 1,
        homeEntrantId: 'Godoy Cruz',
        awayEntrantId: 'Independiente Rivadavia',
        matches: games.map((game) => ({
          matchId: `match-${game.number}`,
          number: game.number,
          status: game.status,
          ...(game.releasedSlotId === undefined ? {} : { releasedSlotId: game.releasedSlotId }),
        })),
        series: { ...SERIES_DEFAULTS, ...series },
      },
    ],
  };
}

/** An unstarted best-of-five: nothing played, nothing anulled. */
let fixtures = fixturesResponse([1, 2, 3, 4, 5].map((number) => ({ number, status: 'scheduled' })));
let assignments: { matchId: string; fixtureId: string; slotId: string }[] = [];

async function mockControlApi(page: Page): Promise<void> {
  await page.addInitScript(
    ({ tokenEndpoint, orgAlias, tournamentAlias, stageId }) => {
      const original = window.fetch.bind(window);
      window.fetch = async (info: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof info === 'string' ? info : info instanceof URL ? info.href : info.url;
        const method = (init?.method ?? 'GET').toUpperCase();

        if (url === tokenEndpoint) {
          return Response.json({ access_token: 'e2e-access-token', expires_in: 3600 });
        }
        if (url === `/organizations/${orgAlias}/venues` && method === 'GET') {
          return Response.json(
            await (window as unknown as { __venues: () => Promise<unknown> }).__venues(),
          );
        }
        if (url === `/organizations/${orgAlias}/officials` && method === 'GET') {
          return Response.json([]);
        }
        if (url === `/organizations/${orgAlias}/schedules` && method === 'GET') {
          return Response.json(
            await (window as unknown as { __schedules: () => Promise<unknown> }).__schedules(),
          );
        }
        if (
          url === `/organizations/${orgAlias}/tournaments/${tournamentAlias}/stages/1/fixtures` &&
          method === 'GET'
        ) {
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
          return Response.json({
            committable: true,
            conflicts: [],
            affectedPublishedMatches: [],
          });
        }
        if (url === scheduleBase && method === 'POST') {
          const body = JSON.parse(String(init?.body)) as {
            assignments: readonly { matchId: string; slotId: string }[];
          };
          return Response.json(
            await (
              window as unknown as { __publish: (body: unknown) => Promise<unknown> }
            ).__publish(body.assignments),
          );
        }

        return original(info, init);
      };
    },
    {
      tokenEndpoint: TOKEN_ENDPOINT,
      orgAlias: ORG_ALIAS,
      tournamentAlias: TOURNAMENT_ALIAS,
      stageId: STAGE_ID,
    },
  );

  await page.exposeFunction('__venues', () => VENUES);
  await page.exposeFunction('__schedules', () => SCHEDULES);
  await page.exposeFunction('__fixtures', () => fixtures);
  await page.exposeFunction('__schedule', () => ({ assignments }));
  await page.exposeFunction(
    '__publish',
    (published: readonly { matchId: string; slotId: string }[]) => {
      assignments = published.map((one) => ({ ...one, fixtureId: 'fixture-1' }));
      return { assignments };
    },
  );
}

async function openBuilder(page: Page): Promise<void> {
  const target = `/control/${ORG_ALIAS}/tournaments/${TOURNAMENT_ALIAS}/stages/1/schedule`;
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);
}

test.beforeEach(() => {
  fixtures = fixturesResponse([1, 2, 3, 4, 5].map((number) => ({ number, status: 'scheduled' })));
  assignments = [];
});

test('7.1: places each game of a best-of-five in its own slot, marking four and five contingent', async ({
  page,
}) => {
  await mockControlApi(page);
  await openBuilder(page);

  // Five placeable rows for one cross, numbered in play order.
  for (const number of [1, 2, 3, 4, 5]) {
    await expect(page.getByText(`Partido ${number} de 5`).first()).toBeVisible();
  }

  // Games one to three will certainly be played; four and five only if the series is alive.
  await expect(page.getByText('Se jugará').first()).toBeVisible();
  await expect(page.getByText('Se juega solo si la serie sigue indefinida')).toHaveCount(4);

  // Each game goes to its own slot: two venues, five different days.
  for (const number of [1, 2, 3, 4, 5]) {
    await page
      .getByLabel(`Hora de inicio — Godoy Cruz vs Independiente Rivadavia — Partido ${number} de 5`)
      .selectOption(`slot-${number}`);
  }

  await page.getByText('Previsualizar').click();
  await page.getByText('Publicar').click();
  await expect(page.getByText('Horario publicado.')).toBeVisible();
});

test('7.2: a decided series shows its surplus games as no longer required, naming their slots', async ({
  page,
}) => {
  await mockControlApi(page);
  // Three games played, the series decided, four and five anulled — each naming the slot it had
  // held before the decision freed it.
  fixtures = fixturesResponse(
    [
      { number: 1, status: 'finalized' },
      { number: 2, status: 'finalized' },
      { number: 3, status: 'finalized' },
      { number: 4, status: 'not-required', releasedSlotId: 'slot-4' },
      { number: 5, status: 'not-required', releasedSlotId: 'slot-5' },
    ],
    { matchesPlayed: 3, anulledMatchNumbers: [4, 5], status: 'decided' },
  );

  await openBuilder(page);

  // Not dropped from the view: still shown, and stated in words rather than by colour.
  await expect(page.getByText('Ya no hace falta: la serie está definida').first()).toBeVisible();

  // Naming the slot each had occupied, and that the slot is now free.
  await expect(page.getByText(/Ocupaba .*Cancha 2.*Ese turno quedó libre/).first()).toBeVisible();
  await expect(page.getByText(/Ocupaba .*Cancha 1.*Ese turno quedó libre/).first()).toBeVisible();

  // An anulled game offers no slot picker: the record says it was never played.
  await expect(
    page.getByLabel('Hora de inicio — Godoy Cruz vs Independiente Rivadavia — Partido 4 de 5'),
  ).toHaveCount(0);
});
