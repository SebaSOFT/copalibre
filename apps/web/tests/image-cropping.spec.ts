import { expect, test, type Page } from '@playwright/test';
import {
  loginCallbackUrl,
  seedLoginTransaction,
  TOKEN_ENDPOINT,
} from '../../../e2e/support/control-login.js';

/** A real, tiny, decodable PNG (1×1) — enough for the browser to actually load an <img>. */
const ONE_PIXEL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

async function mockOrganizationApi(
  page: Page,
  { uploaded }: { uploaded: { calls: number } },
): Promise<void> {
  await page.addInitScript(
    ({ tokenEndpoint }) => {
      let emblemObjectId: string | undefined;

      window.fetch = async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';

        if (url === tokenEndpoint) {
          return Response.json({ access_token: 'e2e-access-token', expires_in: 3600 });
        }
        if (url.includes('/auth/pat') && method === 'GET') {
          return Response.json([]);
        }
        if (url.endsWith('/organizations/liga-mendocina') && method === 'GET') {
          return Response.json({
            organizationId: 'org-1',
            alias: 'liga-mendocina',
            name: 'Liga Mendocina',
            primaryLanguage: 'en',
            timezone: 'America/Argentina/San_Juan',
            ...(emblemObjectId === undefined ? {} : { emblemObjectId }),
          });
        }
        if (url.endsWith('/organizations/liga-mendocina/emblem') && method === 'POST') {
          emblemObjectId = 'obj-1';
          window.__e2eEmblemUploadCount = (window.__e2eEmblemUploadCount ?? 0) + 1;
          return Response.json({ objectId: emblemObjectId }, { status: 201 });
        }

        return new Response('Not found', { status: 404 });
      };
    },
    { tokenEndpoint: TOKEN_ENDPOINT },
  );
  void uploaded;
}

test('selecting a file opens the crop modal; confirming it uploads and renders the framed emblem', async ({
  page,
}) => {
  await mockOrganizationApi(page, { uploaded: { calls: 0 } });
  // The `<img>` tag's own GET goes through the network stack, not the
  // in-page `window.fetch` override above — this is the browser resolving
  // `organizationEmblemUrl()`, standing in for the real emblem-serving route.
  await page.route('**/organizations/liga-mendocina/emblem', (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: Buffer.from(ONE_PIXEL_PNG_BASE64, 'base64'),
    });
  });
  const target = '/control/liga-mendocina/preferences';
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  // This control shell defaults to Spanish; select English by value (not by
  // its translated label) so the rest of this spec's English assertions
  // hold regardless of that default.
  await page.getByRole('combobox').selectOption('en');

  await expect(page.getByRole('img', { name: 'No emblem uploaded' })).toBeVisible();

  await page.getByLabel('Upload emblem').setInputFiles({
    name: 'emblem.png',
    mimeType: 'image/png',
    buffer: Buffer.from(ONE_PIXEL_PNG_BASE64, 'base64'),
  });

  const dialog = page.getByRole('dialog', { name: 'Adjust image' });
  await expect(dialog).toBeVisible();

  // Pan/zoom/rotate the real crop UI before confirming.
  await dialog.getByLabel('Zoom').fill('1.5');
  await dialog.getByLabel('Rotation').fill('15');

  const confirmButton = dialog.getByRole('button', { name: 'Use image' });
  await expect(confirmButton).toBeEnabled();
  await confirmButton.click();

  await expect(dialog).toBeHidden();
  await expect(page.getByText('Emblem uploaded.')).toBeVisible();
  await expect(page.locator('.cl-image-frame img')).toBeVisible();
});

test('cancelling the crop modal leaves the placeholder in place and uploads nothing', async ({
  page,
}) => {
  await mockOrganizationApi(page, { uploaded: { calls: 0 } });
  const target = '/control/liga-mendocina/preferences';
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  // This control shell defaults to Spanish; select English by value (not by
  // its translated label) so the rest of this spec's English assertions
  // hold regardless of that default.
  await page.getByRole('combobox').selectOption('en');

  await expect(page.getByRole('img', { name: 'No emblem uploaded' })).toBeVisible();

  await page.getByLabel('Upload emblem').setInputFiles({
    name: 'emblem.png',
    mimeType: 'image/png',
    buffer: Buffer.from(ONE_PIXEL_PNG_BASE64, 'base64'),
  });

  const dialog = page.getByRole('dialog', { name: 'Adjust image' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByRole('img', { name: 'No emblem uploaded' })).toBeVisible();
  const uploadCount = await page.evaluate(() => window.__e2eEmblemUploadCount ?? 0);
  expect(uploadCount).toBe(0);
});

declare global {
  interface Window {
    __e2eEmblemUploadCount?: number;
  }
}
