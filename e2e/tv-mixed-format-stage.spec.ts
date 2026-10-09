import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import path from 'node:path';
import { expect, test } from './fixtures.js';

/**
 * The venue kiosk of a stage that mixes formats: two league zones and a knockout zone. Each table
 * zone is ranked under its own heading, the knockout zone is the bracket and a league zone's
 * matches are listed by round. The API is a per-worker mock the server-side render reads, so the
 * page is built from real responses rather than the sample dashboard.
 *
 * The clubs and their emblems are the committed Panamericano demo dataset's own, so the frames show
 * what a venue would see; the zones, scores and standings below are invented for the layout.
 */

const ORGANIZATION = 'panamericano-demo';
const TOURNAMENT = 'panamericano-clubes-2025';
const tvPath = `/tv/${ORGANIZATION}/tournaments/${TOURNAMENT}`;
const base = `/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT}`;
const EMBLEMS = path.resolve(
  import.meta.dirname,
  '../packages/demo-datasets/datasets/panamericano-clubes-2025/emblems',
);

interface Club {
  readonly alias: string;
  readonly name: string;
  readonly abbreviation: string;
}

const CLUBS: Readonly<Record<string, Club>> = Object.fromEntries(
  (
    [
      ['andes-talleres', 'Andes Talleres', 'AND'],
      ['atletico-union', 'Atletico Union', 'CAU'],
      ['casa-de-italia', 'Casa de Italia', 'CIT'],
      ['centro-valenciano', 'Centro Valenciano', 'VAL'],
      ['ciudad-de-buenos-aires', 'Ciudad de Buenos Aires', 'CCBA'],
      ['club-hispano', 'Club Hispano', 'HIS'],
      ['club-union-dep-bancaria', 'Club Union Dep Bancaria', 'CUDB'],
      ['concepcion-patin-club', 'Concepcion Patin Club', 'CON'],
      ['corazonistas-bogota', 'Corazonistas Bogota', 'BOG'],
      ['estudiantil-san-miguel', 'Estudiantil San Miguel', 'ESTSM'],
    ] as const
  ).map(([alias, name, abbreviation]) => [alias, { alias, name, abbreviation }]),
);

const entrant = (alias: string, score?: number) => {
  const club = CLUBS[alias] as Club;
  return {
    kind: 'entrant',
    entrantId: alias,
    name: club.name,
    abbreviation: club.abbreviation,
    ...(score === undefined ? {} : { score }),
  };
};

const leagueMatch = (
  position: number,
  round: number,
  home: string,
  away: string,
  scores?: readonly [number, number],
) => ({
  matchId: `${home}-${away}`,
  bracket: 'winners',
  round,
  position,
  matchNumber: position,
  status: scores ? 'finalized' : 'scheduled',
  slots: [entrant(home, scores?.[0]), entrant(away, scores?.[1])],
});

const standing = (
  alias: string,
  rank: number,
  zoneName: string,
  played: number,
  points: number,
) => ({
  rank,
  entrantId: alias,
  name: (CLUBS[alias] as Club).name,
  abbreviation: (CLUBS[alias] as Club).abbreviation,
  sharedRank: false,
  zoneName,
  statistics: { played, points },
});

/** The matches view's own row for a league match: what the kiosk's match list reads. */
const viewRow = (
  zoneName: string,
  ordinal: number,
  round: number,
  home: string,
  away: string,
  scores?: readonly [number, number],
) => ({
  matchId: `${home}-${away}`,
  stageNumber: 1,
  matchNumber: ordinal,
  round,
  status: scores ? 'final' : 'upcoming',
  homeName: (CLUBS[home] as Club).name,
  homeAbbreviation: (CLUBS[home] as Club).abbreviation,
  ...(scores ? { homeScore: scores[0] } : {}),
  awayName: (CLUBS[away] as Club).name,
  awayAbbreviation: (CLUBS[away] as Club).abbreviation,
  ...(scores ? { awayScore: scores[1] } : {}),
  zoneName,
});
const matchesView = {
  matches: [
    viewRow('Zona A', 1, 1, 'andes-talleres', 'atletico-union', [2, 2]),
    viewRow('Zona A', 2, 1, 'casa-de-italia', 'centro-valenciano', [3, 1]),
    viewRow('Zona A', 3, 2, 'andes-talleres', 'casa-de-italia'),
    viewRow('Zona A', 4, 2, 'atletico-union', 'centro-valenciano'),
    viewRow('Zona B', 5, 1, 'ciudad-de-buenos-aires', 'club-hispano', [4, 1]),
    viewRow('Zona B', 6, 1, 'club-union-dep-bancaria', 'concepcion-patin-club', [2, 0]),
  ],
};

const overviewMatch = (
  matchNumber: number,
  status: string,
  home: string,
  away: string,
  homeScore: number,
  awayScore: number,
) => ({
  matchId: `overview-${matchNumber}`,
  matchNumber,
  stageNumber: 1,
  round: 1,
  status,
  homeName: (CLUBS[home] as Club).name,
  homeAbbreviation: (CLUBS[home] as Club).abbreviation,
  homeScore,
  awayName: (CLUBS[away] as Club).name,
  awayAbbreviation: (CLUBS[away] as Club).abbreviation,
  awayScore,
});

// A 1x1 JPEG: the API's discipline background route answers with image bytes, this stands in for them.
const BACKDROP = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64',
);

const overview = {
  organizationAlias: ORGANIZATION,
  organizationName: 'Panamericano Demo',
  tournamentAlias: TOURNAMENT,
  tournamentName: 'Campeonato Panamericano Clubes Senior Varones',
  seasonName: '2025/26',
  status: 'in-progress',
  emblemObjectId: 'tournament',
  disciplineImages: [{ key: 'modules/rink-hockey/1.1.0/rink-hockey-01.jpg' }],
  ruleset: {},
  clubs: Object.values(CLUBS).map((club) => ({
    clubId: `club-${club.alias}`,
    name: club.name,
    alias: club.alias,
    emblemObjectId: `emblem-${club.alias}`,
  })),
  matches: [
    overviewMatch(1, 'in-progress', 'andes-talleres', 'atletico-union', 2, 2),
    overviewMatch(2, 'finalized', 'ciudad-de-buenos-aires', 'club-hispano', 4, 1),
  ],
  standingsPreview: [
    standing('andes-talleres', 1, 'Zona A', 3, 7),
    standing('casa-de-italia', 2, 'Zona A', 3, 5),
    standing('atletico-union', 3, 'Zona A', 3, 4),
    standing('centro-valenciano', 4, 'Zona A', 3, 1),
    standing('ciudad-de-buenos-aires', 1, 'Zona B', 3, 9),
    standing('club-union-dep-bancaria', 2, 'Zona B', 3, 4),
    standing('club-hispano', 3, 'Zona B', 3, 3),
    standing('concepcion-patin-club', 4, 'Zona B', 3, 0),
  ],
};

// A finished tournament decided zone by zone: three cups, the Bronze one with a shared title.
const FINISHED_TOURNAMENT = 'copas-finalizadas';
const podium = (alias: string) => {
  const club = CLUBS[alias] as Club;
  return {
    entrantId: alias,
    name: club.name,
    abbreviation: club.abbreviation,
    clubId: `club-${alias}`,
    emblemObjectId: `emblem-${alias}`,
  };
};
const finishedOverview = {
  ...overview,
  tournamentAlias: FINISHED_TOURNAMENT,
  status: 'finished',
  matches: [overviewMatch(1, 'finalized', 'andes-talleres', 'atletico-union', 3, 1)],
  standingsPreview: overview.standingsPreview,
  winners: [
    {
      zoneName: 'Copa Oro',
      champion: podium('andes-talleres'),
      champions: [podium('andes-talleres')],
    },
    {
      zoneName: 'Copa Plata',
      champion: podium('concepcion-patin-club'),
      champions: [podium('concepcion-patin-club')],
    },
    {
      zoneName: 'Copa Bronce',
      champion: podium('atletico-union'),
      champions: [podium('atletico-union'), podium('estudiantil-san-miguel')],
    },
  ],
};

const bracket = {
  format: 'round-robin',
  zones: [
    {
      zoneId: 'zone-a',
      zoneName: 'Zona A',
      format: 'round-robin',
      matches: [
        leagueMatch(1, 1, 'andes-talleres', 'atletico-union', [2, 2]),
        leagueMatch(2, 1, 'casa-de-italia', 'centro-valenciano', [3, 1]),
        leagueMatch(3, 2, 'andes-talleres', 'casa-de-italia'),
        leagueMatch(4, 2, 'atletico-union', 'centro-valenciano'),
      ],
    },
    {
      zoneId: 'zone-b',
      zoneName: 'Zona B',
      format: 'round-robin',
      matches: [
        leagueMatch(1, 1, 'ciudad-de-buenos-aires', 'club-hispano', [4, 1]),
        leagueMatch(2, 1, 'club-union-dep-bancaria', 'concepcion-patin-club', [2, 0]),
      ],
    },
    {
      zoneId: 'zone-cup',
      zoneName: 'Copa de Oro',
      format: 'single-elimination',
      matches: [
        {
          matchId: 'cup-1',
          bracket: 'winners',
          round: 1,
          position: 1,
          matchNumber: 1,
          status: 'scheduled',
          slots: [entrant('corazonistas-bogota'), entrant('estudiantil-san-miguel')],
        },
      ],
    },
  ],
};

let server: Server;
test.beforeAll(async ({ workerPort }) => {
  server = createServer((req, res) => {
    if (req.url?.startsWith('/objects/discipline-background-image')) {
      res.setHeader('content-type', 'image/jpeg');
      res.end(BACKDROP);
      return;
    }
    res.setHeader('content-type', 'application/json');
    if (req.url === `${base}/overview`) res.end(JSON.stringify(overview));
    else if (
      req.url === `/organizations/${ORGANIZATION}/tournaments/${FINISHED_TOURNAMENT}/overview`
    )
      res.end(JSON.stringify(finishedOverview));
    else if (
      req.url?.startsWith(`/organizations/${ORGANIZATION}/tournaments/${FINISHED_TOURNAMENT}/`)
    )
      res.end(JSON.stringify({ matches: [] }));
    else if (req.url === `${base}/live`) res.end(JSON.stringify({ matches: [] }));
    else if (req.url?.split('?')[0] === `${base}/matches-view`)
      res.end(JSON.stringify(matchesView));
    else if (req.url === `${base}/stages/1/bracket`) res.end(JSON.stringify(bracket));
    else {
      res.statusCode = 404;
      res.end('{}');
    }
  });
  await new Promise<void>((resolve) => server.listen(workerPort, '127.0.0.1', resolve));
});

test.beforeEach(async ({ page }) => {
  await page.route(`**/organizations/${ORGANIZATION}/clubs/club-*/emblem`, (route) => {
    const alias = decodeURIComponent(
      route.request().url().split('/clubs/club-')[1]?.split('/')[0] ?? '',
    );
    return route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: readFileSync(path.join(EMBLEMS, 'clubs', `${alias}.png`)),
    });
  });
  await page.route(`**${base}/emblem`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: readFileSync(path.join(EMBLEMS, 'tournament.png')),
    }),
  );
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test('ranks each table zone under its own heading instead of one merged list', async ({ page }) => {
  await page.goto(`${tvPath}?view=standings`);

  const zones = page.getByTestId('tv-standings-zone');
  await expect(zones).toHaveCount(2);
  await expect(zones.nth(0).getByRole('heading', { name: 'Zona A' })).toBeVisible();
  await expect(zones.nth(0)).toContainText('Andes Talleres');
  await expect(zones.nth(0)).not.toContainText('Ciudad de Buenos Aires');
  await expect(zones.nth(1).getByRole('heading', { name: 'Zona B' })).toBeVisible();
  await expect(zones.nth(1)).toContainText('Ciudad de Buenos Aires');
});

test('lists the matches two to a row with their zone and round, and keeps the knockout zone in the bracket', async ({
  page,
}) => {
  await page.goto(`${tvPath}?view=matches`);

  const list = page.getByTestId('tv-match-list');
  const entries = list.getByRole('listitem');
  await expect(entries).toHaveCount(6);
  await expect(entries.first()).toHaveAccessibleName(
    /Zona A · Round 1: Andes Talleres 2 – 2 Atletico Union/,
  );
  await expect(list).toContainText('Zona B · Round 1');
  await expect(list).not.toContainText('BOG');

  // The knockout zone is the bracket, reached from the rotating dashboard's own tab.
  await page.goto(tvPath);
  await page.getByRole('button', { name: 'Bracket' }).click();
  const drawn = page.getByTestId('tv-bracket');
  await expect(drawn).toContainText('Copa de Oro');
  await expect(drawn).toContainText('BOG');
  await expect(drawn).not.toContainText('Zona A');
});

test('every image the kiosk asks for loads from the web application alone', async ({ page }) => {
  await page.goto(`${tvPath}?view=standings&bg=discipline`);
  await expect(page.getByTestId('tv-standings-zone')).toHaveCount(2);

  const emblems = page.locator('img.tv-table-club-emblem');
  await expect(emblems.first()).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        [...document.images]
          .filter((image) => !(image.complete && image.naturalWidth > 0))
          .map((image) => image.src),
      ),
    )
    .toEqual([]);
  // The discipline backdrop is requested through the web application's own `/objects` route.
  await expect(
    page.locator('img[src*="/objects/discipline-background-image"]').first(),
  ).toBeAttached();
});

test('the recap of a finished tournament lists the champions of every zone of the last stage', async ({
  page,
}) => {
  await page.goto(`/tv/${ORGANIZATION}/tournaments/${FINISHED_TOURNAMENT}`);

  const zones = page.getByTestId('tv-champions-zone');
  await expect(zones).toHaveCount(3);
  await expect(zones.nth(0)).toContainText('Copa Oro');
  await expect(zones.nth(0)).toContainText('Andes Talleres');
  await expect(zones.nth(2)).toContainText('Atletico Union');
  await expect(zones.nth(2)).toContainText('Estudiantil San Miguel');
  // The group-stage leader (the first standings row) is not presented as the champion.
  await expect(page.getByTestId('tv-champion-panel')).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          [...document.querySelectorAll('.tv-champions__emblem')].filter(
            (image) =>
              !(
                (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0
              ),
          ).length,
      ),
    )
    .toBe(0);
});

test('captures screenshots of the zone-aware kiosk at broadcast size', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  // Reduced motion also stops the rail's rotation and its tab transitions, so a frame is stable.
  await page.emulateMedia({ reducedMotion: 'reduce' });

  await page.goto(`${tvPath}?view=standings`);
  await expect(page.getByTestId('tv-standings-zone')).toHaveCount(2);
  await page.screenshot({ path: 'docs/assets/screenshots/tv-mixed-stage-standings.png' });

  await page.goto(`${tvPath}?view=matches`);
  await expect(page.getByTestId('tv-match-list')).toBeVisible();
  await page.screenshot({ path: 'docs/assets/screenshots/tv-mixed-stage-matches.png' });

  await page.goto(tvPath);
  await page.getByRole('button', { name: 'Bracket' }).click();
  await expect(page.getByTestId('tv-bracket')).toBeVisible();
  // The rail tab fades its fill in and out; a frame taken mid-fade shows two tabs highlighted.
  await expect(page.getByRole('button', { name: 'Matches' })).toHaveCSS(
    'background-color',
    // eslint-disable-next-line no-restricted-syntax -- asserting a computed browser style value, not an app styling literal
    'rgba(0, 0, 0, 0)',
  );
  await page.screenshot({ path: 'docs/assets/screenshots/tv-mixed-stage-bracket.png' });
});
