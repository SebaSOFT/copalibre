import AxeBuilder from '@axe-core/playwright';
import { createServer, type Server } from 'node:http';
import { expect, gotoTv, test } from './support/tv-ready.js';
import { expectNoSeriousSemanticViolations } from './support/semantic-axe.js';

const ORGANIZATION = 'panamericano-demo';
const TOURNAMENT = 'panamericano-clubes-2025';
const BASE = `/api/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT}`;
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
    ? { scheduledAt: `2099-10-27T${String(12 + matchNumber).padStart(2, '0')}:00:00Z` }
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
  standingsPreview: Array.from({ length: 24 }, (_, index) => {
    const name = longNames[index % longNames.length] ?? 'Club';
    return {
      rank: index + 1,
      entrantId: `entrant-${index + 1}`,
      name: index < longNames.length ? name : `${name} ${index + 1}`,
      abbreviation: `T${index + 1}`,
      clubId: `club-${index + 1}`,
      statistics: { played: 1, points: 24 - index },
      zoneName: 'Zona A',
    };
  }),
};

let activeOverview = overview;
/** The matches the match list shows; a scenario replaces it, and the rest of the file keeps none. */
let activeMatchesView: { readonly matches: readonly unknown[] } = { matches: [] };

test.afterEach(() => {
  activeOverview = overview;
  activeMatchesView = { matches: [] };
});

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
    if (pathname === `${BASE}/overview`) res.end(JSON.stringify(activeOverview));
    else if (pathname === `${BASE}/live`) res.end(JSON.stringify({ matches: [] }));
    else if (pathname === `${BASE}/stages/1/bracket`) res.end(JSON.stringify(bracket));
    else if (pathname === `${BASE}/stages/1/matches/1`) res.end(JSON.stringify(report));
    else if (pathname === `${BASE}/matches-view`) res.end(JSON.stringify(activeMatchesView));
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
    await gotoTv(page, `${TV_PATH}?layout=${layout}`);
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
    await expectMinimum('.tv-scorebug__clock--wall', 3 * vmin);
    await expectMinimum(team, 3.5 * vmin);
    await expectMinimum(table, 2.2 * vmin);

    if (layout === 'kiosk') {
      const featuredTeamName = page
        .locator('.tv-match-spotlight__vs-grid .tv-team-side__name')
        .first();
      await expect(featuredTeamName).toBeVisible();
      await expect(featuredTeamName).not.toHaveText('');
      const textLayout = await featuredTeamName.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          clientWidth: element.clientWidth,
          overflow: style.overflow,
          scrollWidth: element.scrollWidth,
          textOverflow: style.textOverflow,
          whiteSpace: style.whiteSpace,
        };
      });
      expect(textLayout.overflow).toBe('visible');
      expect(textLayout.textOverflow).toBe('clip');
      expect(textLayout.whiteSpace).toBe('normal');
      expect(textLayout.scrollWidth).toBeLessThanOrEqual(textLayout.clientWidth);
    }
  }
});

test('presentation composes match events, bracket path, standings and next-match crawl', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await gotoTv(page, `${TV_PATH}?layout=presentation&lang=es`);

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
  await gotoTv(page, `${TV_PATH}?layout=dashboard&lang=de`);

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

test('TV dashboard fits the frame and rotates overflowing standings without scrolling', async ({
  page,
}) => {
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await gotoTv(page, `${TV_PATH}?layout=dashboard&lang=es`);

    const standings = page.getByTestId('tv-dashboard-standings');
    await expect(standings).toBeVisible();
    const metrics = () =>
      page.evaluate(() => {
        const dashboard = document.querySelector<HTMLElement>('.tv-multi-match-dashboard');
        const panel = document.querySelector<HTMLElement>('.tv-dashboard-standings');
        return {
          documentScrollHeight: document.documentElement.scrollHeight,
          viewportHeight: window.innerHeight,
          dashboardScrollHeight: dashboard?.scrollHeight ?? 0,
          dashboardClientHeight: dashboard?.clientHeight ?? 0,
          panelScrollHeight: panel?.scrollHeight ?? 0,
          panelClientHeight: panel?.clientHeight ?? 0,
        };
      });
    const expectNoScroll = async () => {
      await expect
        .poll(async () => (await metrics()).documentScrollHeight)
        .toBeLessThanOrEqual(viewport.height);
      await expect
        .poll(async () => {
          const measured = await metrics();
          return measured.dashboardScrollHeight - measured.dashboardClientHeight;
        })
        .toBeLessThanOrEqual(0);
      await expect
        .poll(async () => {
          const measured = await metrics();
          return measured.panelScrollHeight - measured.panelClientHeight;
        })
        .toBeLessThanOrEqual(0);
    };
    await expectNoScroll();

    if (viewport.width === 1280) {
      await expect
        .poll(async () => Number(await standings.getAttribute('data-page-count')))
        .toBeGreaterThan(1);
      const currentPage = await standings.getAttribute('data-page-index');
      await expect
        .poll(async () => standings.getAttribute('data-page-index'), { timeout: 12_000 })
        .not.toBe(currentPage);
      await expectNoScroll();
    }
  }
});

test('TV live status badge meets AA contrast', async ({ page }) => {
  await gotoTv(page, `${TV_PATH}?layout=dashboard&lang=es`);
  await expect(page.locator('.tv-scorebug__badge--live').first()).toBeVisible();

  const { violations } = await new AxeBuilder({ page })
    .include('.tv-scorebug__badge--live')
    .withRules(['color-contrast'])
    .analyze();
  expect(violations.map(({ nodes }) => nodes.map(({ target }) => target))).toEqual([]);
});

test('the TV dashboard passes the semantic accessibility rules', async ({ page }) => {
  await gotoTv(page, `${TV_PATH}?layout=dashboard&lang=es`);
  await expect(page.locator('.tv-scorebug__clock').first()).toHaveAttribute('role', 'timer');

  await expectNoSeriousSemanticViolations(page);
});

test('TV upcoming status badge uses the semantic amber token', async ({ page }) => {
  activeOverview = {
    ...overview,
    matches: overview.matches.filter((entry) => entry.status === 'scheduled'),
  };
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await gotoTv(page, `${TV_PATH}?layout=dashboard&lang=es`);

  const badge = page.locator('.tv-scorebug__badge--upcoming').first();
  await expect(badge).toContainText('Programado');
  const colors = await badge.evaluate((element) => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--cl-state-upcoming)';
    document.body.append(probe);
    const tokenColor = getComputedStyle(probe).color;
    probe.remove();
    return { badgeColor: getComputedStyle(element).color, tokenColor };
  });
  expect(colors.badgeColor).toBe(colors.tokenColor);
});

test('TV keeps its dark surface when the browser prefers light mode', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await gotoTv(page, `${TV_PATH}?layout=dashboard`);

  const channels = await page.locator('.tv-dashboard-standings').evaluate((element) =>
    getComputedStyle(element)
      .backgroundColor.match(/[\d.]+/g)
      ?.slice(0, 3)
      .map(Number),
  );
  expect(channels).toHaveLength(3);
  expect(channels?.every((channel) => channel < 80)).toBe(true);
});

/** Scheduled and finished matches of one stage, for the match list's blocks. */
const listMatch = (ordinal: number, status: 'upcoming' | 'final') => ({
  matchId: `list-${ordinal}`,
  stageNumber: 1,
  stageName: 'Fase de grupos',
  stageOrdinal: ordinal,
  matchNumber: ordinal,
  round: 1,
  status,
  homeEntrantId: `list-home-${ordinal}`,
  homeName: longNames[0],
  homeAbbreviation: 'HOM',
  ...(status === 'final' ? { homeScore: 2 } : {}),
  awayEntrantId: `list-away-${ordinal}`,
  awayName: longNames[1],
  awayAbbreviation: 'AWY',
  ...(status === 'final' ? { awayScore: 1 } : {}),
  scheduledAt:
    status === 'final'
      ? `2026-11-0${Math.min(ordinal, 9)}T18:00:00Z`
      : `2099-11-0${Math.min(ordinal, 9)}T18:00:00Z`,
  venueName: `Cancha ${ordinal}`,
});

test('view=standings pages all twenty-four rows at 1920×1080 under a table heading', async ({
  page,
}) => {
  // Each page holds for one rotation, so the walk through every page takes several of them.
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  activeOverview = { ...overview, matches: [] };
  await gotoTv(page, `${TV_PATH}?view=standings&lang=es`);

  await expect(page.locator('.tv-standings-zone__name').first()).toContainText('Zona A');
  const pager = page.locator('.tv-standings-pager');
  await expect(pager).toContainText('Página 1 de');

  // The page size settles after the first measurement, so the page count is not read up front:
  // sample each rotation until every rank has been on screen once.
  const ranks = new Set<string>();
  for (let rotation = 0; rotation < 10 && ranks.size < 24; rotation += 1) {
    // One read per page: a rotation between per-cell reads would leave a cell to wait on forever.
    const pageRanks = await page
      .locator('.tv-standings-table tbody tr td:first-child')
      .allTextContents();
    for (const rank of pageRanks) ranks.add(rank.trim());
    if (ranks.size < 24) await page.waitForTimeout(10_500);
  }
  expect(ranks.size).toBe(24);
});

test('four groups of four rows page through every row on the full frame, with the pager inside the frame', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  const groups = ['A', 'B', 'C', 'D'];
  activeOverview = {
    ...overview,
    matches: [],
    standingsPreview: Array.from({ length: 16 }, (_, index) => ({
      rank: index + 1,
      entrantId: `grouped-${index + 1}`,
      name: `Club Grupo ${groups[Math.floor(index / 4)]} ${(index % 4) + 1}`,
      abbreviation: `G${index + 1}`,
      clubId: `grouped-club-${index + 1}`,
      statistics: { played: 3, points: 16 - index },
      groupName: `Grupo ${groups[Math.floor(index / 4)]}`,
    })),
  };
  await gotoTv(page, `${TV_PATH}?view=standings&lang=es`);

  await expect(page.locator('.tv-standings-zone__name').first()).toContainText('Grupo A');
  const ranks = new Set<string>();
  for (let rotation = 0; rotation < 10 && ranks.size < 16; rotation += 1) {
    const pageRanks = await page
      .locator('.tv-standings-table tbody tr td:first-child')
      .allTextContents();
    for (const rank of pageRanks) ranks.add(rank.trim());
    if (ranks.size < 16) await page.waitForTimeout(10_500);
  }
  expect(ranks.size).toBe(16);

  // Nothing of the page spills past its frame: the last row and the pager sit inside it.
  const frame = await page.locator('.tv-rail-content').boundingBox();
  const pager = await page.locator('.tv-standings-pager').boundingBox();
  expect(frame).not.toBeNull();
  expect(pager).not.toBeNull();
  if (frame && pager)
    expect(pager.y + pager.height).toBeLessThanOrEqual(frame.y + frame.height + 1);
});

test('a match-list entry keeps its kickoff and court whole, and its team names are its largest text', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  activeMatchesView = { matches: [listMatch(1, 'upcoming'), listMatch(2, 'final')] };
  await gotoTv(page, `${TV_PATH}?view=matches&lang=es`);

  const scheduled = page.locator('.tv-match-list__entry').first();
  await expect(scheduled.locator('.tv-start-time__when')).not.toBeEmpty();
  await expect(scheduled.locator('.tv-start-time__court')).toContainText('Cancha 1');

  const played = page.locator('.tv-match-list__entry').nth(1);
  const when = played.locator('.tv-match-list__when');
  await expect(when).toContainText('Cancha 2');
  const truncated = await when.evaluate((element) => element.scrollWidth > element.clientWidth);
  expect(truncated).toBe(false);

  const sizes = await played.evaluate((entry) => {
    const pixels = (selector: string): number =>
      Number.parseFloat(getComputedStyle(entry.querySelector(selector) as Element).fontSize);
    return {
      team: pixels('.tv-match-list__side'),
      scope: pixels('.tv-match-list__scope'),
      when: pixels('.tv-match-list__when'),
    };
  });
  // Half a pixel of tolerance: computed styles round the token's 37.8px.
  expect(sizes.team).toBeGreaterThanOrEqual(1080 * 0.035 - 0.5);
  expect(sizes.team).toBeGreaterThan(sizes.scope);
  expect(sizes.scope).toBeGreaterThanOrEqual(1080 * 0.018);
  expect(sizes.when).toBeGreaterThanOrEqual(1080 * 0.018);
});

test('view=matches opens on the Programado block', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  activeMatchesView = {
    matches: [listMatch(1, 'upcoming'), listMatch(2, 'upcoming'), listMatch(3, 'final')],
  };
  await gotoTv(page, `${TV_PATH}?view=matches&lang=es`);

  await expect(page.locator('.tv-match-list__heading').first()).toHaveText('Programado');
  await expect(page.locator('.tv-match-list__heading').nth(1)).toHaveText('Finalizado');
});

test('secondary text meets 1.8vmin and no rail tab label truncates at 1920×1080', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  activeMatchesView = { matches: [listMatch(1, 'upcoming')] };
  await gotoTv(page, `${TV_PATH}?view=matches&lang=es`);

  const round = page.locator('.tv-match-list__scope').first();
  await expect(round).toBeVisible();
  const fontPx = await round.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).fontSize),
  );
  expect(fontPx).toBeGreaterThanOrEqual(1080 * 0.018);

  // The rail's tabs are on the rotating kiosk, not the fixed matches view.
  await gotoTv(page, `${TV_PATH}?lang=es`);
  const truncated = await page
    .locator('.tv-rail-tab')
    .evaluateAll((tabs) =>
      tabs.filter((tab) => tab.scrollWidth > tab.clientWidth).map((tab) => tab.textContent),
    );
  expect(truncated).toEqual([]);
});
