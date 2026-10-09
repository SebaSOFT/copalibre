import { expect, test } from '@playwright/test';
import { loginCallbackUrl, seedLoginTransaction, TOKEN_ENDPOINT } from './support/control-login.js';

const ONE_PIXEL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

const ORG_ALIAS = 'liga-cutout-test';

interface SubmittedUpload {
  readonly endpoint: string;
  readonly method: string;
  readonly contentType: string;
  readonly contentBase64: string;
}

let submittedUploads: SubmittedUpload[] = [];

async function mockIdentityUploadApi(page: import('@playwright/test').Page): Promise<void> {
  submittedUploads = [];

  await page.addInitScript(
    ({ tokenEndpoint, orgAlias }) => {
      const originalFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';

        if (url === tokenEndpoint) {
          return Response.json({ access_token: 'e2e-token', expires_in: 3600 });
        }

        if (url === `/organizations/${orgAlias}` && method === 'GET') {
          return Response.json({
            organizationId: 'org-test-1',
            alias: orgAlias,
            name: 'Liga Cutout Test',
            primaryLanguage: 'es',
            timezone: 'UTC',
          });
        }

        if (url === `/organizations/${orgAlias}/emblem` && method === 'POST') {
          const body = JSON.parse(String(init?.body)) as {
            contentType: string;
            contentBase64: string;
          };
          await (
            window as unknown as {
              __recordUpload: (e: string, m: string, ct: string, b64: string) => Promise<void>;
            }
          ).__recordUpload(url, method, body.contentType, body.contentBase64);
          return Response.json({ objectId: 'org-emblem-obj' });
        }

        if (url === `/organizations/${orgAlias}/clubs` && method === 'GET') {
          return Response.json([
            { clubId: 'club-alpha', organizationId: 'org-test-1', name: 'Club Alpha' },
          ]);
        }

        if (url === `/organizations/${orgAlias}/clubs/club-alpha/emblem` && method === 'POST') {
          const body = JSON.parse(String(init?.body)) as {
            contentType: string;
            contentBase64: string;
          };
          await (
            window as unknown as {
              __recordUpload: (e: string, m: string, ct: string, b64: string) => Promise<void>;
            }
          ).__recordUpload(url, method, body.contentType, body.contentBase64);
          return Response.json({ objectId: 'club-emblem-obj' });
        }

        // Forward static resources and model assets cleanly
        return originalFetch(input, init);
      };
    },
    { tokenEndpoint: TOKEN_ENDPOINT, orgAlias: ORG_ALIAS },
  );

  await page.exposeFunction(
    '__recordUpload',
    (endpoint: string, method: string, contentType: string, contentBase64: string) => {
      submittedUploads.push({ endpoint, method, contentType, contentBase64 });
    },
  );
}

test.describe('client-side image cutout and emblem display', () => {
  test('handles modal cancellation without submitting unconfirmed upload', async ({ page }) => {
    await mockIdentityUploadApi(page);
    const preferencesTarget = `/control/${ORG_ALIAS}/preferences`;
    await seedLoginTransaction(page, preferencesTarget);
    await page.goto(loginCallbackUrl());
    await page.waitForURL(`**${preferencesTarget}`);

    await page.getByLabel('Subir escudo').setInputFiles({
      name: 'test-emblem.png',
      mimeType: 'image/png',
      buffer: Buffer.from(ONE_PIXEL_PNG_BASE64, 'base64'),
    });

    const dialog = page.getByRole('dialog', { name: 'Ajustar imagen' });
    await expect(dialog).toBeVisible();

    // Click Cancel
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog).toBeHidden();

    // Verify nothing submitted
    expect(submittedUploads).toHaveLength(0);
  });

  test('executes image upload with fallback to original and verifies confirmed upload', async ({
    page,
  }) => {
    const requestedUrls: string[] = [];
    const failedLocalModelRequests: string[] = [];
    const consoleErrors: string[] = [];

    page.on('request', (request) => requestedUrls.push(request.url()));
    page.on('response', (response) => {
      if (
        response.url().includes('/background-removal/') &&
        !response.ok() &&
        response.status() !== 304
      ) {
        failedLocalModelRequests.push(`${response.status()} ${response.url()}`);
      }
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await mockIdentityUploadApi(page);
    const preferencesTarget = `/control/${ORG_ALIAS}/preferences`;
    await seedLoginTransaction(page, preferencesTarget);
    await page.goto(loginCallbackUrl());
    await page.waitForURL(`**${preferencesTarget}`);

    await page.getByLabel('Subir escudo').setInputFiles({
      name: 'org-emblem.png',
      mimeType: 'image/png',
      buffer: Buffer.from(ONE_PIXEL_PNG_BASE64, 'base64'),
    });

    const dialog = page.getByRole('dialog', { name: 'Ajustar imagen' });
    await expect(dialog).toBeVisible();

    // Progress or keep-original fallback handling
    const keepOriginal = dialog.getByRole('button', { name: 'Conservar original' });
    try {
      await keepOriginal.waitFor({ state: 'visible', timeout: 4000 });
      await keepOriginal.click();
    } catch {
      // Background removal finished without error
    }

    const useImage = dialog.getByRole('button', { name: 'Usar imagen' });
    await expect(useImage).toBeEnabled({ timeout: 15000 });
    await useImage.click();

    await expect(page.getByText('Escudo subido.')).toBeVisible();

    // Verify exactly one confirmed submission
    expect(submittedUploads).toHaveLength(1);
    expect(submittedUploads[0].endpoint).toContain(`/organizations/${ORG_ALIAS}/emblem`);
    expect(submittedUploads[0].contentType).toBe('image/png');
    expect(submittedUploads[0].contentBase64.length).toBeGreaterThan(0);

    // Verify no failed local model requests
    expect(failedLocalModelRequests).toHaveLength(0);

    // Verify no remote third-party source-image transfers
    const thirdPartyRequests = requestedUrls.filter((url) => {
      if (url.startsWith('blob:') || url.startsWith('data:')) return false;
      try {
        const parsed = new URL(url);
        if (parsed.hostname.includes('localhost') || parsed.hostname.includes('127.0.0.1'))
          return false;
        if (
          parsed.hostname.includes('fonts.googleapis.com') ||
          parsed.hostname.includes('fonts.gstatic.com')
        )
          return false;
        return true;
      } catch {
        return false;
      }
    });
    expect(thirdPartyRequests).toHaveLength(0);
  });

  test('verifies square emblem display atom dimensions and containment', async ({ page }) => {
    // Visit the home page where organizations are rendered using EmblemImage
    await page.goto('/');

    const emblemFrames = page.locator('.cl-emblem-frame');
    const count = await emblemFrames.count();

    if (count > 0) {
      for (let i = 0; i < count; i++) {
        const frame = emblemFrames.nth(i);
        const box = await frame.boundingBox();
        if (box && box.width > 0) {
          // 1:1 aspect ratio: width and height match within 1px
          expect(Math.abs(box.width - box.height)).toBeLessThanOrEqual(1);

          // Check inner image styling
          const innerImg = frame.locator('img');
          if (await innerImg.count()) {
            const fit = await innerImg.evaluate((el) => window.getComputedStyle(el).objectFit);
            expect(fit).toBe('contain');
          }
        }
      }
    }
  });
});
