import { createServer, type Server } from 'node:http';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from './fixtures.js';
import { loginCallbackUrl, seedLoginTransaction, TOKEN_ENDPOINT } from './support/control-login.js';

const ORGANIZATION = 'liga-mendocina';
const TOURNAMENT = 'apertura-2026';
const PERSON_ID = '01936f4a-8001-7000-8000-000000000001';
const CLUB_ID = '00000000-0000-7000-8000-000000000101';
const MATCH_ID = '00000000-0000-7000-8000-000000000041';
const BASE = `/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT}`;
const TOURNAMENT_ROUTE = `/es/${ORGANIZATION}/tournaments/${TOURNAMENT}`;

const organizations = [
  {
    organizationId: '00000000-0000-7000-8000-000000000001',
    alias: ORGANIZATION,
    name: 'Liga Mendocina',
  },
];

const organizationTournaments = {
  organizationAlias: ORGANIZATION,
  organizationName: 'Liga Mendocina',
  clubs: [],
  tournaments: [
    {
      alias: TOURNAMENT,
      name: 'Apertura 2026',
      status: 'in-progress',
      discipline: { descriptorId: 'football' },
    },
  ],
};

const overview = {
  organizationAlias: ORGANIZATION,
  organizationName: 'Liga Mendocina',
  tournamentAlias: TOURNAMENT,
  tournamentName: 'Apertura 2026',
  seasonName: 'Apertura 2026',
  status: 'live',
  matches: [
    {
      matchId: MATCH_ID,
      stageNumber: 1,
      matchNumber: 1,
      status: 'in-progress',
      round: 1,
      homeEntrantId: 'home-1',
      homeName: 'Club Andes',
      homeScore: 1,
      awayEntrantId: 'away-1',
      awayName: 'Deportivo Sur',
      awayScore: 0,
      zoneName: 'Zona Norte',
      groupName: 'Grupo A',
    },
  ],
  clubs: [],
  ruleset: { format: 'round-robin' },
  rulesetLabels: { format: { en: 'Format', es: 'Formato' } },
};

const completion = {
  totalMatches: 1,
  resolvedMatches: 0,
  liveMatches: 1,
  scheduledMatches: 0,
  finalizedMatches: 0,
  forfeitedMatches: 0,
  stages: [
    {
      stageId: 'stage-1',
      stageNumber: 1,
      stageName: 'Fase de grupos',
      totalMatches: 1,
      resolvedMatches: 0,
      liveMatches: 1,
      scheduledMatches: 0,
      finalizedMatches: 0,
      forfeitedMatches: 0,
      segments: [{ segmentId: 'zone-1', name: 'Zona Norte', totalMatches: 1, resolvedMatches: 0 }],
    },
  ],
};

const matchesView = {
  matches: [
    {
      matchId: MATCH_ID,
      stageNumber: 1,
      matchNumber: 1,
      status: 'live',
      round: 1,
      homeName: 'Club Andes',
      homeScore: 1,
      awayName: 'Deportivo Sur',
      awayScore: 0,
      zoneName: 'Zona Norte',
      groupName: 'Grupo A',
      venueName: 'Estadio Central',
    },
  ],
};

const bracket = {
  format: 'single-elimination',
  zones: [
    {
      zoneId: 'zone-final',
      zoneName: 'Copa de Oro',
      matches: [
        {
          matchId: 'bracket-final',
          matchNumber: 1,
          bracket: 'winners',
          round: 1,
          position: 1,
          status: 'final',
          slots: [
            {
              kind: 'entrant',
              entrantId: 'home-1',
              name: 'Club Andes',
              abbreviation: 'AND',
              score: 2,
            },
            {
              kind: 'entrant',
              entrantId: 'away-1',
              name: 'Deportivo Sur',
              abbreviation: 'SUR',
              score: 1,
            },
          ],
        },
      ],
    },
  ],
};

const matchReport = {
  organizationAlias: ORGANIZATION,
  organizationName: 'Liga Mendocina',
  tournamentAlias: TOURNAMENT,
  tournamentName: 'Apertura 2026',
  stageNumber: 1,
  stageFormat: 'round-robin',
  matchNumber: 1,
  round: 1,
  status: 'final',
  homeName: 'Club Andes',
  homeAbbreviation: 'AND',
  homeScore: 2,
  awayName: 'Deportivo Sur',
  awayAbbreviation: 'SUR',
  awayScore: 1,
  scheduledAt: '2026-10-26T18:00:00.000Z',
  schedulePublished: true,
  officials: [],
  rosterRoles: [],
  rosters: { home: [], away: [] },
  timeline: [],
  disciplineImages: {},
};

const playerProfile = {
  personId: PERSON_ID,
  displayName: 'Priya Natarajan-Whitfield',
  alias: 'priya-nw',
  nationality: 'IN',
  age: 27,
  competitionHistory: [],
  careerStatistics: [
    {
      disciplineDescriptorId: 'football',
      disciplineName: 'Football',
      statistics: [{ code: 'goals', label: 'Goals', value: 14, samples: 22 }],
    },
  ],
};

const publicRoutes = [
  { name: 'default-language home', path: '/' },
  { name: 'Spanish home', path: '/es' },
  { name: 'organization', path: `/es/${ORGANIZATION}` },
  { name: 'tournament overview', path: TOURNAMENT_ROUTE },
  { name: 'matches', path: `${TOURNAMENT_ROUTE}/matches` },
  { name: 'stage 1', path: `${TOURNAMENT_ROUTE}/stages/1` },
  { name: 'stage 2', path: `${TOURNAMENT_ROUTE}/stages/2` },
  { name: 'live', path: `${TOURNAMENT_ROUTE}/live` },
  { name: 'match 1', path: `${TOURNAMENT_ROUTE}/stages/1/matches/1` },
  { name: 'match 5', path: `${TOURNAMENT_ROUTE}/stages/1/matches/5` },
  { name: 'player profile', path: `${TOURNAMENT_ROUTE}/players/${PERSON_ID}` },
  { name: 'public 404', path: '/es/missing-heading-route', status: 404 },
  {
    name: 'TV launcher',
    path: `/tv?organization=${ORGANIZATION}&tournament=${TOURNAMENT}&lang=es`,
  },
  {
    name: 'TV tournament display',
    path: `/tv/${ORGANIZATION}/tournaments/${TOURNAMENT}?lang=es`,
  },
  {
    name: 'TV pinned match display',
    path: `/tv/${ORGANIZATION}/tournaments/${TOURNAMENT}/stages/1/matches/1?lang=es`,
  },
  {
    name: 'TV missing tournament metadata',
    path: '/tv/missing-organization/tournaments/opaque-tournament-name?lang=es',
  },
  {
    name: 'TV pinned match missing tournament metadata',
    path: '/tv/missing-organization/tournaments/opaque-tournament-name/stages/1/matches/1?lang=es',
  },
  { name: 'invitation acceptance', path: '/invitations/accept?token=e2e-invitation-token' },
  { name: 'control login', path: '/control/login' },
  { name: 'forgot password', path: '/control/forgot-password' },
  { name: 'reset password', path: '/control/reset-password?token=e2e-reset-token' },
  // /control is a static no-content redirect to login; its destination is checked above.
  { name: 'control redirect', path: '/control' },
];

const controlRoutes = [
  { name: 'dashboard', path: `/control/${ORGANIZATION}` },
  { name: 'tournaments', path: `/control/${ORGANIZATION}/tournaments` },
  { name: 'live console', path: `/control/${ORGANIZATION}/live` },
  { name: 'organization', path: `/control/${ORGANIZATION}/organization` },
  { name: 'analytics', path: `/control/${ORGANIZATION}/analytics` },
  { name: 'roles', path: `/control/${ORGANIZATION}/roles` },
  { name: 'audit trail', path: `/control/${ORGANIZATION}/audit-trail` },
  { name: 'preferences', path: `/control/${ORGANIZATION}/preferences` },
  { name: 'new tournament', path: `/control/${ORGANIZATION}/tournaments/new` },
  { name: 'clubs', path: `/control/${ORGANIZATION}/clubs` },
  { name: 'resources', path: `/control/${ORGANIZATION}/resources` },
  { name: 'person profile', path: `/control/${ORGANIZATION}/persons/${PERSON_ID}` },
  { name: 'tournament hub', path: `/control/${ORGANIZATION}/tournaments/${TOURNAMENT}` },
  {
    name: 'registrations',
    path: `/control/${ORGANIZATION}/tournaments/${TOURNAMENT}/registrations`,
  },
  {
    name: 'tournament settings',
    path: `/control/${ORGANIZATION}/tournaments/${TOURNAMENT}/settings`,
  },
  {
    name: 'tournament ruleset',
    path: `/control/${ORGANIZATION}/tournaments/${TOURNAMENT}/ruleset`,
  },
  { name: 'reports', path: `/control/${ORGANIZATION}/tournaments/${TOURNAMENT}/reports` },
  { name: 'matches view', path: `/control/${ORGANIZATION}/tournaments/${TOURNAMENT}/matches-view` },
  { name: 'broadcaster', path: `/control/${ORGANIZATION}/tournaments/${TOURNAMENT}/broadcaster` },
  {
    name: 'match console',
    path: `/control/${ORGANIZATION}/tournaments/${TOURNAMENT}/matches/${MATCH_ID}`,
  },
  {
    name: 'match data entry',
    path: `/control/${ORGANIZATION}/tournaments/${TOURNAMENT}/matches/${MATCH_ID}/load`,
  },
  { name: 'stage hub', path: `/control/${ORGANIZATION}/tournaments/${TOURNAMENT}/stages/1` },
  { name: 'seeding', path: `/control/${ORGANIZATION}/tournaments/${TOURNAMENT}/stages/1/seeding` },
  {
    name: 'standings',
    path: `/control/${ORGANIZATION}/tournaments/${TOURNAMENT}/stages/1/standings`,
  },
  { name: 'zones', path: `/control/${ORGANIZATION}/tournaments/${TOURNAMENT}/stages/1/zones` },
  {
    name: 'qualification',
    path: `/control/${ORGANIZATION}/tournaments/${TOURNAMENT}/stages/1/qualification`,
  },
  {
    name: 'promotion plan',
    path: `/control/${ORGANIZATION}/tournaments/${TOURNAMENT}/stages/1/zones/1/promotion`,
  },
  {
    name: 'schedule',
    path: `/control/${ORGANIZATION}/tournaments/${TOURNAMENT}/stages/1/schedule`,
  },
  { name: 'club portal members', path: `/control/${ORGANIZATION}/clubs/${CLUB_ID}/portal/members` },
  {
    name: 'club portal roster',
    path: `/control/${ORGANIZATION}/clubs/${CLUB_ID}/portal/tournaments/${TOURNAMENT}/roster`,
  },
  { name: 'platform administration', path: '/control/platform' },
  { name: 'discipline document', path: '/control/platform/disciplines/football' },
];

let apiServer: Server;

test.beforeAll(async ({ workerPort }) => {
  apiServer = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const path = url.pathname;

    if (path === '/organizations') {
      res.end(JSON.stringify(organizations));
      return;
    }
    if (path === `/organizations/${ORGANIZATION}/public/tournaments`) {
      res.end(JSON.stringify(organizationTournaments));
      return;
    }
    if (path === `${BASE}/overview`) {
      res.end(JSON.stringify(overview));
      return;
    }
    if (path === `${BASE}/completion`) {
      res.end(JSON.stringify(completion));
      return;
    }
    if (path === `${BASE}/live`) {
      res.end(
        JSON.stringify({
          organizationAlias: ORGANIZATION,
          tournamentAlias: TOURNAMENT,
          matches: [],
        }),
      );
      return;
    }
    if (path === `${BASE}/matches-view`) {
      res.end(JSON.stringify(matchesView));
      return;
    }
    if (path === `${BASE}/public/tables`) {
      res.end(JSON.stringify({ layouts: [] }));
      return;
    }
    if (path === `${BASE}/stages/1/bracket`) {
      res.end(
        JSON.stringify({
          format: 'round-robin',
          zones: [{ zoneId: 'zone-1', zoneName: 'Zona Norte', matches: [] }],
        }),
      );
      return;
    }
    if (path === `${BASE}/stages/2/bracket`) {
      res.end(JSON.stringify(bracket));
      return;
    }
    if (path === `${BASE}/stages/1/matches/1` || path === `${BASE}/stages/1/matches/5`) {
      const matchNumber = Number(path.split('/').at(-1));
      res.end(JSON.stringify({ ...matchReport, matchNumber }));
      return;
    }
    if (path === `${BASE}/persons/${PERSON_ID}/public/profile`) {
      res.end(JSON.stringify(playerProfile));
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

async function headingOutlineFailures(page: Page, routeName: string): Promise<string[]> {
  const failures: string[] = [];
  try {
    await expect(page.locator('h1')).toHaveCount(1, { timeout: 5_000 });
  } catch {
    failures.push(
      `${routeName}: expected exactly one h1, found ${await page.locator('h1').count()}`,
    );
  }

  const headings = await page
    .locator('h1,h2,h3,h4,h5,h6,[role="heading"]')
    .evaluateAll((elements) =>
      elements.map((element) => {
        const level = element.matches('h1,h2,h3,h4,h5,h6')
          ? Number(element.tagName.slice(1))
          : Number(element.getAttribute('aria-level'));
        const labelledBy = element
          .getAttribute('aria-labelledby')
          ?.split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
          .join(' ');
        const name =
          element.textContent?.trim() ||
          element.getAttribute('aria-label')?.trim() ||
          labelledBy ||
          '';
        return { level, name };
      }),
    );

  if (headings.filter(({ level }) => level === 1).length !== 1) {
    failures.push(`${routeName}: rendered outline must contain one level-one heading`);
  }
  if (headings[0]?.level !== 1) {
    failures.push(`${routeName}: the page heading must lead the outline`);
  }
  headings.forEach(({ level, name }, index) => {
    if (!Number.isInteger(level) || level < 1 || level > 6) {
      failures.push(`${routeName}: heading ${index + 1} has invalid level ${level}`);
    }
    if (!name.trim()) failures.push(`${routeName}: heading ${index + 1} is empty`);
    const previous = headings[index - 1];
    if (previous && level > previous.level + 1) {
      failures.push(`${routeName}: skipped heading level h${previous.level} → h${level}`);
    }
  });

  const { violations } = await new AxeBuilder({ page }).withRules(['heading-order']).analyze();
  for (const violation of violations) {
    failures.push(
      `${routeName}: axe ${violation.id}: ${violation.nodes.map(({ target }) => target).join(', ')}`,
    );
  }
  return failures;
}

test('public, TV and authentication routes render a complete heading outline', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const failures: string[] = [];

  for (const route of publicRoutes) {
    const response = await page.goto(route.path, { waitUntil: 'domcontentloaded' });
    if (route.status !== undefined && response?.status() !== route.status) {
      failures.push(`${route.name}: expected HTTP ${route.status}, received ${response?.status()}`);
    }
    if (route.status === undefined && response && response.status() >= 400) {
      failures.push(`${route.name}: unexpected HTTP ${response.status()}`);
    }
    failures.push(...(await headingOutlineFailures(page, route.name)));
    if (['matches', 'stage 1', 'stage 2', 'live'].includes(route.name)) {
      const heading = (await page.locator('h1').innerText()).trim();
      if (!heading.includes('Apertura 2026')) {
        failures.push(`${route.name}: h1 must include the tournament display name`);
      }
    }
    if (route.name.includes('missing tournament metadata')) {
      const heading = await page.locator('h1').innerText();
      const title = await page.title();
      if (heading.includes('opaque-tournament-name') || title.includes('opaque-tournament-name')) {
        failures.push(`${route.name}: unresolved metadata must not expose the tournament alias`);
      }
    }
  }

  expect(failures).toEqual([]);
});

test('every authenticated control route renders a complete heading outline', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const payload = Buffer.from(
    JSON.stringify({ sub: 'e2e-heading-review', scp: 'copalibre.control copalibre.super-admin' }),
  ).toString('base64url');
  const accessToken = `header.${payload}.signature`;

  await page.addInitScript(
    ({ tokenEndpoint, accessToken }) => {
      window.fetch = async (input) => {
        const value =
          typeof input === 'string' || input instanceof URL ? input.toString() : input.url;
        const url = new URL(value, window.location.origin);
        if (url.href === tokenEndpoint) {
          await new Promise((resolve) => window.setTimeout(resolve, 250));
          return Response.json({ access_token: accessToken, expires_in: 3600 });
        }
        if (url.pathname === '/organizations' && url.searchParams.get('mine') === 'true') {
          return Response.json([
            {
              organizationId: '00000000-0000-7000-8000-000000000001',
              organizationAlias: 'liga-mendocina',
              organizationName: 'Liga Mendocina',
              role: 'admin',
            },
          ]);
        }
        if (url.pathname.includes('runtime-config')) return Response.json({});
        return Response.json({ message: 'not found' }, { status: 404 });
      };
    },
    { tokenEndpoint: TOKEN_ENDPOINT, accessToken },
  );

  const dashboard = `/control/${ORGANIZATION}`;
  await seedLoginTransaction(page, dashboard);
  const callbackResponse = await page.goto(loginCallbackUrl(), { waitUntil: 'domcontentloaded' });
  if (callbackResponse && callbackResponse.status() >= 400) {
    throw new Error(`login callback returned HTTP ${callbackResponse.status()}`);
  }
  const failures = await headingOutlineFailures(page, 'login callback');
  await page.waitForURL(`**${dashboard}`);
  failures.push(...(await headingOutlineFailures(page, 'dashboard')));

  for (const route of controlRoutes) {
    await page.evaluate((path) => {
      window.history.pushState({}, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, route.path);
    failures.push(...(await headingOutlineFailures(page, route.name)));
  }

  // The silent-renew callback is an invisible iframe transport endpoint, not a page.
  expect(failures).toEqual([]);
});
