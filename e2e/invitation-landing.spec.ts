import { expect, test, type Page } from './csp-guard.js';
import { E2E_COOKIE_SESSION_KEY, installSessionEndpointStandIn } from './support/control-login.js';

/**
 * Accepting an invitation sends the person to `/control/app`, the file that
 * mounts Control. That address is the root landing, so it must lead where
 * signing in leads: the one organization, or the list. It must never be read
 * as an organization called `app`.
 */

const TOKEN = 'e2e-invitation-token';
const ACCEPT_PATH = `/invitations/accept?token=${TOKEN}`;

interface Membership {
  readonly organizationAlias: string;
  readonly organizationName: string;
}

async function mockApi(page: Page, organizations: readonly Membership[]): Promise<void> {
  await installSessionEndpointStandIn(page);
  await page.addInitScript(
    ({ organizations, sessionKey }) => {
      window.fetch = async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input), location.href);
        const method = (init?.method ?? 'GET').toUpperCase();
        if (url.pathname === '/api/auth/accept-invitation' && method === 'POST') {
          const session = {
            subject: 'e2e-invited',
            scopes: ['copalibre.control'],
            expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
            method: 'native',
          };
          // What the API's HttpOnly session cookie would carry to the next page.
          sessionStorage.setItem(sessionKey, JSON.stringify(session));
          return Response.json(session);
        }
        if (url.pathname === '/api/organizations' && url.searchParams.get('mine') === 'true') {
          return Response.json(
            organizations.map((organization, index) => ({
              organizationId: `org-${index + 1}`,
              role: 'admin',
              ...organization,
            })),
          );
        }
        return new Response('Not found', { status: 404 });
      };
    },
    { organizations, sessionKey: E2E_COOKIE_SESSION_KEY },
  );
}

/** Every request that names `app` where an organization alias goes. */
function recordAppAsOrganization(page: Page): string[] {
  const offending: string[] = [];
  page.on('request', (request) => {
    const { pathname } = new URL(request.url());
    if (
      /^\/(api|events)\/.*\/app(\/|$)/.test(pathname) ||
      /\/organizations\/app(\/|$)/.test(pathname)
    ) {
      offending.push(pathname);
    }
  });
  return offending;
}

async function acceptInvitation(page: Page): Promise<void> {
  await page.goto(ACCEPT_PATH);
  await page.locator('#password').fill('correct-horse-battery');
  await page.locator('#confirmPassword').fill('correct-horse-battery');
  await page.getByRole('button', { name: 'Aceptar y comenzar' }).click();
}

test('one organization: the invitee lands on its panel', async ({ page }) => {
  await mockApi(page, [{ organizationAlias: 'liga-orbital', organizationName: 'Liga Orbital' }]);
  const offending = recordAppAsOrganization(page);

  await acceptInvitation(page);

  await page.waitForURL('**/control/liga-orbital');
  expect(offending).toEqual([]);
});

test('several organizations: the invitee lands on the list', async ({ page }) => {
  await mockApi(page, [
    { organizationAlias: 'liga-orbital', organizationName: 'Liga Orbital' },
    { organizationAlias: 'copa-andina', organizationName: 'Copa Andina' },
  ]);
  const offending = recordAppAsOrganization(page);

  await acceptInvitation(page);

  await page.waitForURL('**/control/app');
  await expect(page.getByText('Liga Orbital')).toBeVisible();
  await expect(page.getByText('Copa Andina')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(offending).toEqual([]);
});

test('no session: /control/app sends the person to sign in, and back to the landing', async ({
  page,
}) => {
  await mockApi(page, [{ organizationAlias: 'liga-orbital', organizationName: 'Liga Orbital' }]);
  const offending = recordAppAsOrganization(page);

  await page.goto('/control/app');

  await page.waitForURL((url) => url.pathname === '/control/login' || url.pathname === '/control/');
  // Signing in returns to `/control/app` (the root landing) or to the default
  // `/control/`, which runs the same lookup; never to an organization page.
  const returnTo = new URL(page.url()).searchParams.get('returnTo');
  expect([null, '/control/', '/control/app']).toContain(returnTo);
  expect(offending).toEqual([]);
});
