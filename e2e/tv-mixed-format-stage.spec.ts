import { createServer, type Server } from 'node:http';
import { expect, test } from './fixtures.js';

/**
 * The venue kiosk of a stage that mixes formats: a league zone and a knockout zone beside a second
 * league zone. Each table zone is ranked under its own heading, the knockout zone is the bracket
 * and the league zone's matches are listed by round. The API is a per-worker mock the server-side
 * render reads, so the page is built from real responses rather than the sample dashboard.
 */

const tvPath = '/tv/liga-mendocina/tournaments/apertura-2026';
const base = '/organizations/liga-mendocina/tournaments/apertura-2026';

const entrant = (id: string, name: string, abbreviation: string, score?: number) => ({
  kind: 'entrant',
  entrantId: id,
  name,
  abbreviation,
  ...(score === undefined ? {} : { score }),
});

const leagueMatch = (position: number, round: number, home: string[], away: string[]) => ({
  matchId: `league-${position}`,
  bracket: 'winners',
  round,
  position,
  matchNumber: position,
  status: round === 1 ? 'finalized' : 'scheduled',
  slots: [
    entrant(home[0] as string, home[1] as string, home[2] as string, round === 1 ? 2 : undefined),
    entrant(away[0] as string, away[1] as string, away[2] as string, round === 1 ? 1 : undefined),
  ],
});

/** A club's emblem is an object the page requests by id; each is a plain coloured disc here. */
const EMBLEM_COLOURS: Readonly<Record<string, string>> = {
  Talleres: 'royalblue',
  Independiente: 'crimson',
  Gimnasia: 'white',
  Maipú: 'seagreen',
};
const emblemSvg = (name: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="${EMBLEM_COLOURS[name]}"/><text x="32" y="42" font-size="30" font-family="sans-serif" font-weight="700" text-anchor="middle" fill="${name === 'Gimnasia' ? 'navy' : 'white'}">${name[0]}</text></svg>`;

const overview = {
  organizationAlias: 'liga-mendocina',
  organizationName: 'Liga Mendocina',
  tournamentAlias: 'apertura-2026',
  tournamentName: 'Apertura 2026',
  seasonName: '2026',
  status: 'in-progress',
  ruleset: {},
  clubs: Object.keys(EMBLEM_COLOURS).map((name) => ({
    clubId: `club-${name}`,
    name,
    emblemObjectId: `emblem-${name}`,
  })),
  matches: [
    {
      matchId: 'league-1',
      matchNumber: 1,
      stageNumber: 1,
      round: 1,
      status: 'in-progress',
      homeName: 'Talleres',
      homeAbbreviation: 'TAL',
      homeScore: 1,
      awayName: 'Independiente',
      awayAbbreviation: 'IND',
      awayScore: 1,
    },
    {
      matchId: 'league-2',
      matchNumber: 2,
      stageNumber: 1,
      round: 1,
      status: 'finalized',
      homeName: 'Gimnasia',
      homeAbbreviation: 'GIM',
      homeScore: 2,
      awayName: 'Maipú',
      awayAbbreviation: 'MAI',
      awayScore: 0,
    },
  ],
  standingsPreview: [
    {
      rank: 1,
      entrantId: 'a1',
      name: 'Talleres',
      abbreviation: 'TAL',
      sharedRank: false,
      zoneName: 'Liga A',
      statistics: { played: 2, points: 6 },
    },
    {
      rank: 2,
      entrantId: 'a2',
      name: 'Independiente',
      abbreviation: 'IND',
      sharedRank: false,
      zoneName: 'Liga A',
      statistics: { played: 2, points: 3 },
    },
    {
      rank: 1,
      entrantId: 'b1',
      name: 'Gimnasia',
      abbreviation: 'GIM',
      sharedRank: false,
      zoneName: 'Liga B',
      statistics: { played: 2, points: 4 },
    },
    {
      rank: 2,
      entrantId: 'b2',
      name: 'Maipú',
      abbreviation: 'MAI',
      sharedRank: false,
      zoneName: 'Liga B',
      statistics: { played: 2, points: 1 },
    },
  ],
};

const bracket = {
  format: 'round-robin',
  zones: [
    {
      zoneId: 'zone-a',
      zoneName: 'Liga A',
      format: 'round-robin',
      matches: [
        leagueMatch(1, 1, ['a1', 'Talleres', 'TAL'], ['a2', 'Independiente', 'IND']),
        leagueMatch(2, 2, ['a2', 'Independiente', 'IND'], ['a1', 'Talleres', 'TAL']),
      ],
    },
    {
      zoneId: 'zone-cup',
      zoneName: 'Copa',
      format: 'single-elimination',
      matches: [
        {
          matchId: 'cup-1',
          bracket: 'winners',
          round: 1,
          position: 1,
          matchNumber: 1,
          status: 'scheduled',
          slots: [entrant('c1', 'Belgrano', 'BEL'), entrant('c2', 'Racing', 'RAC')],
        },
      ],
    },
  ],
};

let server: Server;
test.beforeAll(async ({ workerPort }) => {
  server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === `${base}/overview`) res.end(JSON.stringify(overview));
    else if (req.url === `${base}/live`) res.end(JSON.stringify({ matches: [] }));
    else if (req.url === `${base}/stages/1/bracket`) res.end(JSON.stringify(bracket));
    else {
      res.statusCode = 404;
      res.end('{}');
    }
  });
  await new Promise<void>((resolve) => server.listen(workerPort, '127.0.0.1', resolve));
});
test.beforeEach(async ({ page }) => {
  await page.route('**/api/objects/emblem-*', (route) => {
    const name = decodeURIComponent(route.request().url().split('emblem-')[1] ?? '');
    return route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: emblemSvg(name),
    });
  });
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test('ranks each table zone under its own heading instead of one merged list', async ({ page }) => {
  await page.goto(`${tvPath}?view=standings`);

  const zones = page.getByTestId('tv-standings-zone');
  await expect(zones).toHaveCount(2);
  await expect(zones.nth(0).getByRole('heading', { name: 'Liga A' })).toBeVisible();
  await expect(zones.nth(0)).toContainText('Talleres');
  await expect(zones.nth(0)).not.toContainText('Gimnasia');
  await expect(zones.nth(1).getByRole('heading', { name: 'Liga B' })).toBeVisible();
  await expect(zones.nth(1)).toContainText('Gimnasia');
});

test('lists the league zone’s matches by round and keeps the knockout zone in the bracket', async ({
  page,
}) => {
  await page.goto(`${tvPath}?view=fixtures`);

  const fixtures = page.getByTestId('tv-fixtures');
  await expect(fixtures.getByRole('heading', { name: 'Liga A' })).toBeVisible();
  await expect(fixtures.getByRole('heading', { name: 'Round 1' })).toBeVisible();
  await expect(fixtures.getByRole('heading', { name: 'Round 2' })).toBeVisible();
  await expect(fixtures).not.toContainText('Belgrano');

  await page.getByRole('button', { name: 'Bracket' }).click();
  const drawn = page.getByTestId('tv-bracket');
  await expect(drawn).toContainText('Copa');
  await expect(drawn).toContainText('BEL');
  await expect(drawn).not.toContainText('Liga A');
});

test('captures screenshots of the zone-aware kiosk at broadcast size', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  // Reduced motion also stops the rail's rotation and its tab transitions, so a frame is stable.
  await page.emulateMedia({ reducedMotion: 'reduce' });

  await page.goto(`${tvPath}?view=standings`);
  await expect(page.getByTestId('tv-standings-zone')).toHaveCount(2);
  await page.screenshot({ path: 'docs/assets/screenshots/tv-mixed-stage-standings.png' });

  await page.goto(`${tvPath}?view=fixtures`);
  await expect(page.getByTestId('tv-fixtures')).toBeVisible();
  await page.screenshot({ path: 'docs/assets/screenshots/tv-mixed-stage-fixtures.png' });

  await page.getByRole('button', { name: 'Bracket' }).click();
  await expect(page.getByTestId('tv-bracket')).toBeVisible();
  // The rail tab fades its fill in and out; a frame taken mid-fade shows two tabs highlighted.
  await expect(page.getByRole('button', { name: 'Fixtures' })).toHaveCSS(
    'background-color',
    // eslint-disable-next-line no-restricted-syntax -- asserting a computed browser style value, not an app styling literal
    'rgba(0, 0, 0, 0)',
  );
  await page.screenshot({ path: 'docs/assets/screenshots/tv-mixed-stage-bracket.png' });
});
