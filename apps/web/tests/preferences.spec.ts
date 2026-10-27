import { expect, test, type Page } from '@playwright/test';
import { resolveSemantic } from '@copalibre/design-tokens';
import {
  loginCallbackUrl,
  seedLoginTransaction,
  TOKEN_ENDPOINT,
} from '../../../e2e/support/control-login.js';

const cssColor = (hex: string): string => {
  const channels = hex.slice(1).match(/.{2}/g);
  if (!channels || channels.length !== 3) throw new Error('Expected a six-digit design token.');
  return `rgb(${channels.map((channel) => Number.parseInt(channel, 16)).join(', ')})`;
};

async function mockPreferencesApi(page: Page): Promise<void> {
  await page.addInitScript(
    ({ tokenEndpoint }) => {
      let tokens = [
        {
          tokenId: 'token-1',
          label: 'E2E Test Token',
          scopes: ['api'],
          revoked: false,
          expiresAt: '2099-01-01T00:00:00.000Z',
          createdAt: '2023-01-01T00:00:00.000Z',
        },
      ];

      window.fetch = async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';

        if (url === tokenEndpoint) {
          return Response.json({ access_token: 'e2e-access-token', expires_in: 3600 });
        }

        // Mock the PAT API under /api
        if (url === '/api/auth/pat/scopes' && method === 'GET') {
          return Response.json({ scopes: ['api'] });
        }
        if (url.includes('/auth/pat') && method === 'GET') {
          return Response.json(tokens);
        }

        if (url.includes('/auth/pat') && method === 'POST') {
          const body = JSON.parse(String(init?.body));
          const newToken = {
            tokenId: 'token-2',
            label: body.label,
            scopes: ['api'],
            revoked: false,
            expiresAt: '2099-01-01T00:00:00.000Z',
            createdAt: '2023-01-01T00:00:00.000Z',
            token: 'cl_pat_123456789',
          };
          tokens.push(newToken);
          return Response.json(newToken, { status: 201 });
        }

        if (url.includes('/auth/pat/') && method === 'DELETE') {
          if (url.endsWith('?dryRun=true')) {
            return Response.json({ reversible: true });
          }
          const id = url.split('/').pop();
          tokens = tokens.map((t) => (t.tokenId === id ? { ...t, revoked: true } : t));
          return Response.json({ reversible: true });
        }

        if (url.endsWith('/organizations/liga-mendocina')) {
          return Response.json({
            organizationId: 'org-1',
            alias: 'liga-mendocina',
            name: 'Liga Mendocina',
            primaryLanguage: 'es',
            timezone: 'America/Argentina/Buenos_Aires',
          });
        }
        if (url.endsWith('/organizations/liga-mendocina/storage-usage')) {
          return Response.json({ totalBytes: 0, objectCount: 0 });
        }
        if (url.endsWith('/organizations/liga-mendocina/storage-usage/objects')) {
          return Response.json([]);
        }

        return new Response('Not found', { status: 404 });
      };
    },
    { tokenEndpoint: TOKEN_ENDPOINT },
  );
}

test('user can generate and revoke PAT', async ({ page }) => {
  await mockPreferencesApi(page);
  const target = '/control/liga-mendocina/preferences';
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  // Verify existing token is rendered
  await expect(page.getByText('E2E Test Token')).toBeVisible();

  // Create a new token
  await page.getByLabel('Etiqueta del token').fill('New CI Token');
  const createToken = page.getByRole('button', { name: 'Generar token' });
  await expect(createToken).toBeDisabled();
  await page.getByRole('checkbox', { name: 'api' }).check();
  await expect(createToken).toBeEnabled();
  await createToken.click();

  // Check it shows the token value
  await expect(page.getByText('Token creado. Copialo ahora:')).toBeVisible();
  await expect(page.getByText('cl_pat_123456789')).toBeVisible();

  // Verify it was added to the list
  await expect(page.getByText('New CI Token')).toBeVisible();

  // Revoke the original token
  // Using a simpler approach since there's multiple Revoke buttons now
  await page
    .locator('li')
    .filter({ hasText: 'E2E Test Token' })
    .getByRole('button', { name: 'Revocar' })
    .click();

  // E2E Test Token should be gone
  await expect(page.getByText('E2E Test Token')).toBeHidden();
});

test('theme preference persists across reload without a dark flash', async ({ page }) => {
  await mockPreferencesApi(page);
  const target = '/control/liga-mendocina/preferences';
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  await page.getByRole('region', { name: 'Tema' }).getByLabel('Tema').selectOption('light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate(() => localStorage.getItem('cl-theme'))).toBe('light');

  let releaseLoadGate: (() => void) | undefined;
  const loadGate = new Promise<void>((resolve) => {
    releaseLoadGate = resolve;
  });
  await page.route('**/__theme_load_gate', async (route) => {
    await loadGate;
    await route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>gate</title>' });
  });
  await page.addInitScript(() => {
    if (window.top !== window || location.pathname !== '/control/liga-mendocina/preferences') {
      return;
    }
    document.addEventListener(
      'DOMContentLoaded',
      () => {
        const frame = document.createElement('iframe');
        frame.src = '/__theme_load_gate';
        frame.tabIndex = -1;
        frame.setAttribute('aria-hidden', 'true');
        frame.style.cssText =
          'position:fixed;inset:0 auto auto 0;width:1px;height:1px;opacity:0;pointer-events:none';
        document.body.append(frame);
      },
      { once: true },
    );
  });

  try {
    await page.reload({ waitUntil: 'commit' });
    expect(await page.evaluate(() => localStorage.getItem('cl-theme'))).toBe('light');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.locator('body')).toHaveCSS(
      'background-color',
      cssColor(resolveSemantic('surface-base', 'light')),
    );
    expect(await page.evaluate(() => document.readyState)).not.toBe('complete');
    await test.info().attach('control-light-theme-before-load', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
  } finally {
    releaseLoadGate?.();
  }

  await page.waitForLoadState('load');
});
