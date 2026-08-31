import { expect, test, type Page } from '@playwright/test';
import { loginCallbackUrl, seedLoginTransaction, TOKEN_ENDPOINT } from './support/control-login.js';

/**
 * The organizer-facing matches view (openspec 0172): the same card grid the
 * public site renders, plus the full internal comparator trace on a
 * tiebreak-decided match — reached only by a subject holding
 * `org.view-internal-standings` for this tournament, enforced server-side.
 * This spec proves the client renders that trace when the response carries
 * one; server-side authorization itself (admin vs. scoped/unscoped
 * tournament-admin vs. referee) is proven against the real HTTP stack in
 * `apps/api/src/controllers/matches-view.integration.test.ts`.
 */

const MATCHES_VIEW_PATH = '/control/liga-mendocina/tournaments/apertura-2026/matches-view';

function finalizedMatchWithTrace() {
  return {
    matchId: '00000000-0000-7000-8000-000000000010',
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
    homeTrace: ['Comparator: head-to-head goal difference — Club Andes ahead by 2'],
    awayTrace: ['Comparator: head-to-head goal difference — Deportivo Sur behind by 2'],
  };
}

function liveMatchNoTrace() {
  return {
    matchId: '00000000-0000-7000-8000-000000000011',
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
  };
}

/**
 * Control-web defaults to Spanish absent a stored preference
 * (`ORGANIZATION_PRIMARY_LANGUAGE_PLACEHOLDER` in `ControlIntl.tsx`) — a
 * stored preference outranks that placeholder per `resolveLanguage`'s own
 * precedence, so this pins English rather than asserting against whichever
 * language the placeholder or the runner's browser locale would otherwise
 * pick.
 */
async function forceEnglish(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('copalibre.language', 'en');
  });
}

async function mockMatchesViewApi(page: Page): Promise<void> {
  await page.addInitScript(
    ({ finalized, live, tokenEndpoint }) => {
      window.fetch = async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        if (url === tokenEndpoint) {
          return Response.json({ access_token: 'e2e-access-token', expires_in: 3600 });
        }
        if (url.includes('/internal-matches-view') && method === 'GET') {
          const state = new URL(url, window.location.origin).searchParams.get('state');
          const matches =
            state === 'live' ? [live] : state === 'final' ? [finalized] : [finalized, live];
          return Response.json({ matches });
        }
        return new Response('Not found', { status: 404 });
      };
    },
    {
      finalized: finalizedMatchWithTrace(),
      live: liveMatchNoTrace(),
      tokenEndpoint: TOKEN_ENDPOINT,
    },
  );
}

test('shows every match with venue/clock and the full comparator trace on a tiebreak-decided one', async ({
  page,
}) => {
  await forceEnglish(page);
  await mockMatchesViewApi(page);
  await seedLoginTransaction(page, MATCHES_VIEW_PATH);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${MATCHES_VIEW_PATH}`);

  await expect(page.getByText('Club Andes', { exact: true })).toBeVisible();
  await expect(page.getByText('Talleres', { exact: true })).toBeVisible();
  await expect(page.getByText('Estadio Central')).toBeVisible();

  // The full trace, not just the summary line, reaches this authorized screen —
  // collapsed by default, so open it before checking its content is present.
  await expect(page.getByText('Decided by: head-to-head goal difference')).toBeVisible();
  await page.getByText('Full standings comparator trace').click();
  await expect(page.getByText('Club Andes ahead by 2')).toBeVisible();
  await expect(page.getByText('Deportivo Sur behind by 2')).toBeVisible();

  // Read-only: no operational control reaches this screen.
  await expect(page.getByRole('button', { name: /start|stop|record/i })).toHaveCount(0);
});

test('narrows to live matches only when the Live filter is used', async ({ page }) => {
  await forceEnglish(page);
  await mockMatchesViewApi(page);
  await seedLoginTransaction(page, MATCHES_VIEW_PATH);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${MATCHES_VIEW_PATH}`);

  await expect(page.getByText('Club Andes', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Live', exact: true }).click();

  await expect(page.getByText('Talleres', { exact: true })).toBeVisible();
  await expect(page.getByText('Club Andes', { exact: true })).toHaveCount(0);
});
