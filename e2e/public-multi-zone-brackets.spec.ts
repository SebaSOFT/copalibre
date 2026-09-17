import { createServer, type Server } from 'node:http';
import { expect, test } from './fixtures.js';

/**
 * OpenSpec 0246: a multi-zone elimination stage renders one independent bracket diagram per
 * zone, with a jump-list, real entrant/score data despite every zone sharing the same
 * round/position numbering, club emblems on resolved entrant slots, and each zone's own
 * champion highlighted independently of the others' completion state. A single-zone (or
 * un-zoned) stage keeps rendering exactly as it did before — no heading, no jump-list.
 */

const ORGANIZATION = 'liga-mendocina';
const TOURNAMENT_ALIAS = 'apertura-2026';
const BASE = `/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`;
const MULTI_ZONE_ROUTE = `/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/stages/1`;
const SINGLE_ZONE_ROUTE = `/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/stages/2`;

const overview = {
  organizationAlias: ORGANIZATION,
  organizationName: 'Liga Mendocina',
  tournamentAlias: TOURNAMENT_ALIAS,
  tournamentName: 'Apertura 2026',
  seasonName: 'Apertura 2026',
  matches: [],
  clubs: [],
  ruleset: {},
};

/** Both zones' only round is round 1/position 1 — the exact cross-zone collision shape. */
const goldZoneMatches = [
  {
    matchId: 'gold-final',
    bracket: 'winners',
    round: 1,
    position: 1,
    status: 'finalized',
    slots: [
      {
        kind: 'entrant',
        entrantId: 'gold-a',
        name: 'Talleres',
        clubId: 'club-talleres',
        emblemObjectId: 'emblem-talleres',
        score: 2,
      },
      { kind: 'entrant', entrantId: 'gold-b', name: 'Independiente', score: 0 },
    ],
  },
];

/**
 * Two matches share this zone's own deepest round (round 1) — `championshipMatch` declines to
 * mark either one as the champion node when that happens (same "don't guess" rule 0245 applies
 * to `resolveTournamentWinners`), so this zone's own ambiguity must not affect gold's marking.
 */
const silverZoneMatches = [
  {
    matchId: 'silver-a-final',
    bracket: 'winners',
    round: 1,
    position: 1,
    status: 'scheduled',
    slots: [
      { kind: 'entrant', entrantId: 'silver-a', name: 'Gimnasia' },
      { kind: 'entrant', entrantId: 'silver-b', name: 'Maipú' },
    ],
  },
  {
    matchId: 'silver-b-final',
    bracket: 'winners',
    round: 1,
    position: 2,
    status: 'scheduled',
    slots: [
      { kind: 'entrant', entrantId: 'silver-c', name: 'Ciudad de Buenos Aires' },
      { kind: 'entrant', entrantId: 'silver-d', name: 'Recreativo Bochas' },
    ],
  },
];

let server: Server;
test.beforeAll(async ({ workerPort }) => {
  server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === `${BASE}/overview`) {
      res.end(JSON.stringify(overview));
    } else if (req.url === `${BASE}/stages/1/bracket`) {
      res.end(
        JSON.stringify({
          format: 'single-elimination',
          zones: [
            { zoneId: 'zone-gold', zoneName: 'Copa de Oro', matches: goldZoneMatches },
            { zoneId: 'zone-silver', zoneName: 'Copa de Plata', matches: silverZoneMatches },
          ],
        }),
      );
    } else if (req.url === `${BASE}/stages/2/bracket`) {
      // The implicit single-zone case: no `zoneId`/`zoneName`, exactly one zone entry.
      res.end(
        JSON.stringify({ format: 'single-elimination', zones: [{ matches: goldZoneMatches }] }),
      );
    } else {
      res.statusCode = 404;
      res.end('{}');
    }
  });
  await new Promise<void>((resolve) => server.listen(workerPort, '127.0.0.1', resolve));
});
test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test('renders one bracket diagram per zone with a jump-list, real entrant data, emblems, and independent champion highlighting', async ({
  page,
}) => {
  await page.goto(MULTI_ZONE_ROUTE);

  // Jump-list names both zones.
  await expect(page.getByRole('link', { name: 'Copa de Oro' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Copa de Plata' })).toBeVisible();

  // Both zone headings render.
  await expect(page.getByRole('heading', { name: 'Copa de Oro' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Copa de Plata' })).toBeVisible();

  // Neither zone's round-1/position-1 node collided into a TBD placeholder: both show their
  // real entrant names and scores despite sharing round/position.
  await expect(page.getByRole('button', { name: 'Highlight path for Talleres' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Highlight path for Independiente' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Highlight path for Gimnasia' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Highlight path for Maipú' })).toBeVisible();
  await expect(page.getByText('Por definir')).toHaveCount(0);

  // Gold's single, structurally-deepest cross is marked as its own zone's champion node
  // (`.cl-bracket-stage__node` is the wrapper `championshipMatch` marks, one level above the
  // match card itself); silver's two concurrent deepest-round crosses are an ambiguous terminal
  // round — declined, exactly the same "don't guess" rule 0245 applies — unaffected by gold's.
  const goldNode = page.locator('.cl-bracket-stage__node', {
    has: page.locator('[data-match="1"]', { hasText: 'Talleres' }),
  });
  await expect(goldNode).toHaveClass(/cl-bracket-stage__node--championship/);
  const silverNode = page.locator('.cl-bracket-stage__node', {
    has: page.locator('[data-match="1"]', { hasText: 'Gimnasia' }),
  });
  await expect(silverNode).not.toHaveClass(/cl-bracket-stage__node--championship/);

  // The entrant with a recorded club emblem gets an <img>; the sibling with none gets only the
  // placeholder shield (0245's existing onerror-fallback markup, never a broken-image icon).
  await expect(page.locator('img[alt="Talleres emblem"]')).toHaveCount(1);
});

test('a single-zone stage renders exactly as before: no heading, no jump-list', async ({
  page,
}) => {
  await page.goto(SINGLE_ZONE_ROUTE);

  await expect(page.getByRole('button', { name: 'Highlight path for Talleres' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Copa de Oro' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Copa de Oro' })).toHaveCount(0);
});
