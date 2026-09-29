import { createServer, type Server } from 'node:http';
import { expect, test } from './fixtures.js';

/**
 * The public matches view (openspec 0172): a flat, filterable card grid of a
 * tournament's matches, server-rendered so the default and every
 * state-filtered view work with scripting off. The deciding-factor line is
 * deliberately a one-line summary here — the full comparator trace only ever
 * reaches the authorized control-web equivalent, proven separately in
 * `e2e/control-matches-view.spec.ts`.
 */

const ORGANIZATION = 'liga-mendocina';
const TOURNAMENT_ALIAS = 'apertura-2026';
const TOURNAMENT = `/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`;

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

const finalizedMatch = {
  matchId: '00000000-0000-7000-8000-000000000020',
  stageNumber: 1,
  matchNumber: 3,
  status: 'final',
  round: 1,
  homeName: 'Club Andes',
  homeScore: 2,
  awayName: 'Deportivo Sur',
  awayScore: 1,
  zoneName: 'Zona Norte',
  groupName: 'Grupo A',
  homePosition: 1,
  awayPosition: 2,
  decidingFactor: 'head-to-head goal difference',
};

const liveMatch = {
  matchId: '00000000-0000-7000-8000-000000000021',
  stageNumber: 1,
  matchNumber: 4,
  status: 'live',
  round: 1,
  homeName: 'Talleres',
  homeScore: 1,
  awayName: 'Independiente',
  awayScore: 1,
  clockSeconds: 2145,
  venueName: 'Estadio Central',
  scheduledAt: '2026-08-28T18:00:00.000Z',
  latestEvent: { label: 'Goal — Talleres', occurredAt: '2026-08-28T20:15:00.000Z' },
};

let apiServer: Server;

test.beforeAll(async ({ workerPort }) => {
  apiServer = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    const [path, query] = (req.url ?? '').split('?');
    if (path === `${TOURNAMENT}/overview`) {
      res.end(JSON.stringify(overview));
      return;
    }
    if (path === `${TOURNAMENT}/matches-view`) {
      const state = new URLSearchParams(query).get('state');
      const matches =
        state === 'live'
          ? [liveMatch]
          : state === 'final'
            ? [finalizedMatch]
            : [finalizedMatch, liveMatch];
      res.end(JSON.stringify({ matches }));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ message: 'not found' }));
  });
  await new Promise<void>((resolve) => apiServer.listen(workerPort, '127.0.0.1', resolve));
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => apiServer.close(() => resolve()));
});

const matchesPath = `/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/matches`;

test('shows every match with venue, clock, and a one-line deciding-factor summary — no full trace', async ({
  page,
}) => {
  await page.goto(matchesPath);

  await expect(page.getByText('Club Andes', { exact: true })).toBeVisible();
  await expect(page.getByText('Talleres', { exact: true })).toBeVisible();
  await expect(page.getByText('Estadio Central')).toBeVisible();
  await expect(page.getByText('Decided by: head-to-head goal difference')).toBeVisible();

  // The public card never carries the internal comparator trace lines.
  await expect(page.getByText(/ahead by|behind by/)).toHaveCount(0);
  await expect(page.getByText('Full standings comparator trace')).toHaveCount(0);
});

test('the Live filter link narrows the server-rendered list with scripting off', async ({
  page,
  context,
}) => {
  await context.route('**/*.js', (route) => route.abort());
  await page.goto(matchesPath);

  await expect(page.getByText('Club Andes', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Live' }).click();

  await expect(page.getByText('Talleres', { exact: true })).toBeVisible();
  await expect(page.getByText('Club Andes', { exact: true })).toHaveCount(0);
});

test('0199: the state filter renders as discrete pills with a visible active state', async ({
  page,
  context,
}) => {
  // Scripting off: the treatment is server-rendered, like the filter itself.
  await context.route('**/*.js', (route) => route.abort());
  await page.goto(matchesPath);

  // Scoped by its own aria-label (openspec 0299 added a second
  // `nav.cl-pill-group` for the density toggle): a bare `nav.cl-pill-group`
  // locator now matches two navs and Playwright's strict mode refuses to
  // resolve either.
  const group = page.locator('nav.cl-pill-group[aria-label="Filter by match state"]');
  await expect(group).toBeVisible();

  const pills = group.locator('a.cl-pill');
  await expect(pills).toHaveCount(4);

  // The defect this replaces: four anchors rendering as one run-on string.
  // Discrete controls have real gaps between their boxes.
  const first = await pills.nth(0).boundingBox();
  const second = await pills.nth(1).boundingBox();
  if (first === null || second === null) {
    throw new Error('a rendered filter pill should have a layout box');
  }
  expect(second.x).toBeGreaterThan(first.x + first.width);

  // Each pill is its own bounded control, not inline text.
  expect(first.height).toBeGreaterThanOrEqual(40);

  await page.getByRole('link', { name: 'Live' }).click();
  // Scoped to this nav (openspec 0299's density toggle is its own
  // `cl-pill` group with its own always-current selection, so a bare,
  // page-wide `a.cl-pill[aria-current]` now matches two elements).
  await expect(group.locator('a.cl-pill[aria-current]')).toHaveText('Live');
});

test.describe('0299: density toggle', () => {
  test('the Compact link switches to the ticker card and sets ?compact=true, with scripting off', async ({
    page,
    context,
  }) => {
    await context.route('**/*.js', (route) => route.abort());
    await page.goto(matchesPath);

    await expect(page.locator('.cl-match-card--compact')).toHaveCount(0);
    await page.getByRole('link', { name: 'Compact' }).click();

    expect(new URL(page.url()).searchParams.get('compact')).toBe('true');
    await expect(page.locator('.cl-match-card--compact').first()).toBeVisible();
    await expect(page.locator('.cl-matches-view__grid--compact').first()).toBeVisible();
    // The full card's own structure is gone, not just visually collapsed.
    await expect(page.locator('.cl-match-card__sides')).toHaveCount(0);
  });

  test('preserves the active state filter when toggling density, and vice versa', async ({
    page,
    context,
  }) => {
    await context.route('**/*.js', (route) => route.abort());
    await page.goto(matchesPath);

    await page.getByRole('link', { name: 'Live' }).click();
    expect(new URL(page.url()).searchParams.get('state')).toBe('live');

    await page.getByRole('link', { name: 'Compact' }).click();
    const afterCompact = new URL(page.url());
    expect(afterCompact.searchParams.get('compact')).toBe('true');
    expect(afterCompact.searchParams.get('state')).toBe('live');

    await page.getByRole('link', { name: 'Detailed' }).click();
    const afterDetailed = new URL(page.url());
    expect(afterDetailed.searchParams.get('compact')).toBeNull();
    expect(afterDetailed.searchParams.get('state')).toBe('live');
    await expect(page.locator('.cl-match-card--compact')).toHaveCount(0);
  });

  test('marks the active density with aria-current', async ({ page }) => {
    await page.goto(`${matchesPath}?compact=true`);

    const toggle = page.locator('nav.cl-pill-group[aria-label="Switch view density"]');
    await expect(toggle.getByRole('link', { name: 'Compact' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    await expect(toggle.getByRole('link', { name: 'Detailed' })).not.toHaveAttribute(
      'aria-current',
      'true',
    );
  });
});

test.describe('0272: match card timestamp locale', () => {
  // A browser locale deliberately different from the page's own /es/ route
  // and from any plausible server ICU default. Before the fix,
  // ResponsiveTimestamp resolved its own locale from `navigator` — real on
  // the client, but Node's minimal `navigator.language` (undefined) on the
  // server, silently falling back to the process's own default ICU locale
  // instead. A French browser proves neither side is reading `navigator`
  // any more: both the server-only render (scripting off) and the
  // post-hydration render (scripting on) must render in Spanish — the
  // locale the /es/ route actually resolved — never in French, and must be
  // byte-identical to each other (no hydration-time re-render).
  test.use({ locale: 'fr-FR' });

  test('renders and hydrates in the route locale, not the browser locale', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    const spanishMonth = new Intl.DateTimeFormat('es', { month: 'short' }).format(
      new Date(liveMatch.scheduledAt),
    );
    const frenchMonth = new Intl.DateTimeFormat('fr', { month: 'short' }).format(
      new Date(liveMatch.scheduledAt),
    );

    await page.route('**/*.js', (route) => route.abort());
    await page.goto(`/es${matchesPath}`);
    const ssrText = await page
      .locator('.cl-match-card__venue time.cl-responsive-timestamp')
      .first()
      .textContent();

    await page.unroute('**/*.js');
    await page.goto(`/es${matchesPath}`);
    const hydratedText = await page
      .locator('.cl-match-card__venue time.cl-responsive-timestamp')
      .first()
      .textContent();

    expect(ssrText).toContain(spanishMonth);
    expect(ssrText).not.toContain(frenchMonth);
    expect(hydratedText).toBe(ssrText);
    expect(
      consoleErrors.filter((text) => /hydrat/i.test(text) || /did not match/i.test(text)),
    ).toEqual([]);
  });
});
