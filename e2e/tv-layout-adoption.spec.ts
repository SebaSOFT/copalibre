import { createServer, type Server } from 'node:http';
import { expect, test } from './fixtures.js';

const ORGANIZATION = 'panamericano-demo';
const TOURNAMENT = 'panamericano-clubes-2025';
const BASE = `/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT}`;
const TV_PATH = `/tv/${ORGANIZATION}/tournaments/${TOURNAMENT}`;

const longNames = [
  'Ciudad de Buenos Aires',
  'Club Union Dep Bancaria',
  'Estudiantil San Miguel',
  'Corazonistas Bogota',
] as const;

const match = (
  matchNumber: number,
  status: 'in-progress' | 'scheduled',
  homeName: string,
  awayName: string,
  homeScore?: number,
  awayScore?: number,
) => ({
  matchId: `match-${matchNumber}`,
  stageNumber: 1,
  stageOrdinal: matchNumber,
  matchNumber,
  status,
  homeName,
  homeAbbreviation: 'HOM',
  awayName,
  awayAbbreviation: 'AWY',
  ...(homeScore === undefined ? {} : { homeScore }),
  ...(awayScore === undefined ? {} : { awayScore }),
  ...(status === 'scheduled'
    ? { scheduledAt: `2026-10-27T${String(12 + matchNumber).padStart(2, '0')}:00:00Z` }
    : {}),
  venueName: `Cancha ${matchNumber}`,
});

const overview = {
  organizationAlias: ORGANIZATION,
  organizationName: 'Panamericano Demo',
  tournamentAlias: TOURNAMENT,
  tournamentName: 'Campeonato Panamericano Clubes Senior Varones',
  seasonName: '2025/26',
  status: 'in-progress',
  ruleset: {},
  matches: [
    match(1, 'in-progress', longNames[0], longNames[1], 3, 2),
    match(2, 'in-progress', longNames[1], longNames[0], 1, 0),
    match(3, 'scheduled', longNames[2], longNames[0]),
    match(4, 'scheduled', longNames[1], longNames[3]),
    match(5, 'scheduled', longNames[0], longNames[2]),
    match(6, 'scheduled', longNames[3], longNames[1]),
  ],
  standingsPreview: longNames.map((name, index) => ({
    rank: index + 1,
    entrantId: `entrant-${index + 1}`,
    name,
    abbreviation: `T${index + 1}`,
    clubId: `club-${index + 1}`,
    statistics: { played: 1, points: 3 - index },
    zoneName: 'Zona A',
  })),
};

const bracket = {
  format: 'single-elimination',
  zones: [
    {
      zoneId: 'zone-a',
      zoneName: 'Zona A',
      format: 'single-elimination',
      matches: [
        {
          matchId: 'bracket-final',
          matchNumber: 1,
          bracket: 'winners',
          round: 1,
          position: 1,
          status: 'scheduled',
          slots: [
            { kind: 'entrant', entrantId: 'entrant-1', name: longNames[0] },
            { kind: 'entrant', entrantId: 'entrant-2', name: longNames[1] },
          ],
        },
      ],
    },
  ],
};

const report = {
  organizationAlias: ORGANIZATION,
  organizationName: 'Panamericano Demo',
  tournamentAlias: TOURNAMENT,
  tournamentName: 'Campeonato Panamericano Clubes Senior Varones',
  stageNumber: 1,
  stageFormat: 'round-robin',
  matchNumber: 1,
  round: 1,
  status: 'live',
  homeEntrantId: 'home-0',
  awayEntrantId: 'away-0',
  schedulePublished: true,
  officials: [],
  rosters: { home: [], away: [] },
  timeline: [
    {
      eventId: 'event-1',
      definitionCode: 'score',
      label: 'Gol',
      occurredAt: '2026-10-26T12:15:00Z',
      side: 'home-0',
    },
  ],
};

let server: Server;

test.beforeAll(async ({ workerPort }) => {
  server = createServer((req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
    res.setHeader('content-type', 'application/json');
    if (pathname === `${BASE}/overview`) res.end(JSON.stringify(overview));
    else if (pathname === `${BASE}/live`) res.end(JSON.stringify({ matches: [] }));
    else if (pathname === `${BASE}/stages/1/bracket`) res.end(JSON.stringify(bracket));
    else if (pathname === `${BASE}/stages/1/matches/1`) res.end(JSON.stringify(report));
    else if (pathname === `${BASE}/matches-view`) res.end(JSON.stringify({ matches: [] }));
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

test('all three TV layouts meet broadcast-size minimums at 1920×1080', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.emulateMedia({ reducedMotion: 'reduce' });

  const layouts = [
    {
      layout: 'kiosk',
      score: '.tv-focal-panel .tv-score-center__digits',
      team: '.tv-focal-panel .tv-team-side__name',
      table: '.tv-standings-table',
    },
    {
      layout: 'presentation',
      score: '.tv-presentation-match .tv-score-center__digits',
      team: '.tv-presentation-match .tv-team-side__name',
      table: '.tv-presentation-standings .tv-standings-table',
    },
    {
      layout: 'dashboard',
      score: '.tv-dashboard-match__scoreline strong',
      team: '.tv-dashboard-match__scoreline > span',
      table: '.tv-dashboard-standings .tv-standings-table',
    },
  ] as const;
  const vmin = Math.min(1920, 1080) / 100;

  for (const { layout, score, team, table } of layouts) {
    await page.goto(`${TV_PATH}?layout=${layout}`);
    await expect(page.locator(`.tv-root-container[data-layout="${layout}"]`)).toBeVisible();
    await expect(page.locator('.tv-scorebug__clock').first()).toBeVisible();

    const fontSize = async (selector: string) =>
      page
        .locator(selector)
        .first()
        .evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
    const expectMinimum = async (selector: string, minimum: number) =>
      expect((await fontSize(selector)) + 0.01).toBeGreaterThanOrEqual(minimum);

    await expectMinimum(score, 12 * vmin);
    await expectMinimum('.tv-scorebug__clock', 6 * vmin);
    await expectMinimum(team, 3.5 * vmin);
    await expectMinimum(table, 2.2 * vmin);
  }
});

test('presentation composes match events, bracket path, standings and next-match crawl', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${TV_PATH}?layout=presentation&lang=es`);

  await expect(page.locator('.tv-presentation-match .tv-event-ticker')).toContainText('Gol');
  await expect(page.locator('.tv-presentation-rail .tv-bracket')).toContainText('Zona A');
  await expect(page.locator('.tv-presentation-standings .tv-standings-table')).toContainText(
    'Ciudad de Buenos Aires',
  );
  await expect(page.getByTestId('tv-next-match')).toHaveCount(4);

  const sides = page.locator('.tv-presentation-match .tv-team-side');
  await expect(sides).toHaveCount(2);
  const emblemFrames = await sides.locator('.tv-team-side__emblem-wrap').evaluateAll((elements) =>
    elements.map((element) => {
      const bounds = element.getBoundingClientRect();
      return { width: bounds.width, height: bounds.height };
    }),
  );
  expect(emblemFrames[0]).toEqual(emblemFrames[1]);
  await expect(page.locator('.tv-team-side[data-leading="true"]')).toHaveCount(1);
  for (const side of await sides.all()) {
    const name = await side.locator('.tv-team-side__name').boundingBox();
    const tag = await side.locator('.tv-team-side__leading').boundingBox();
    expect(name && tag && name.y + name.height <= tag.y).toBe(true);
  }
});

test('German dashboard keeps long club names accessible and prevents overlap at 1280px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${TV_PATH}?layout=dashboard&lang=de`);

  await expect(page.getByTestId('tv-dashboard-match')).toHaveCount(2);
  const upcoming = page.getByTestId('tv-upcoming-match');
  await expect(upcoming).toHaveCount(4);
  for (const item of await upcoming.all()) {
    await expect(item.locator('strong')).toHaveText('–');
  }

  const cards = await page.getByTestId('tv-dashboard-match').all();
  const cardBounds = await Promise.all(cards.map((card) => card.boundingBox()));
  for (const card of cards) {
    const slots = await card.locator('.tv-dashboard-match__scoreline > *').evaluateAll((elements) =>
      elements.map((element) => {
        const bounds = element.getBoundingClientRect();
        return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom };
      }),
    );
    for (let left = 0; left < slots.length; left += 1) {
      for (let right = left + 1; right < slots.length; right += 1) {
        const a = slots[left];
        const b = slots[right];
        expect(
          a &&
            b &&
            (a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top),
        ).toBe(true);
      }
    }
  }

  const first = cardBounds[0];
  const second = cardBounds[1];
  expect(
    first && second && (first.x + first.width <= second.x || second.x + second.width <= first.x),
  ).toBe(true);

  const names = page.locator('.tv-dashboard-match__scoreline > span');
  await expect(names).toHaveCount(4);
  for (const name of await names.all()) {
    const visibleText = await name.innerText();
    await expect(name).toHaveAttribute('title', visibleText);
    await expect(name).toHaveAccessibleName(visibleText);
    await expect(name).toHaveCSS('text-overflow', 'ellipsis');
    await expect(name).toHaveCSS('white-space', 'nowrap');
  }
});

test('TV keeps its dark surface when the browser prefers light mode', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.goto(`${TV_PATH}?layout=dashboard`);

  const channels = await page.locator('.tv-dashboard-standings').evaluate((element) =>
    getComputedStyle(element)
      .backgroundColor.match(/[\d.]+/g)
      ?.slice(0, 3)
      .map(Number),
  );
  expect(channels).toHaveLength(3);
  expect(channels?.every((channel) => channel < 80)).toBe(true);
});
