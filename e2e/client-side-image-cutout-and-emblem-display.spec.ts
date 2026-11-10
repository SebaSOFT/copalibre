import sharp from 'sharp';
import { expect, test } from './csp-guard.js';
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

        if (url === `/api/organizations/${orgAlias}` && method === 'GET') {
          return Response.json({
            organizationId: 'org-test-1',
            alias: orgAlias,
            name: 'Liga Cutout Test',
            primaryLanguage: 'es',
            timezone: 'UTC',
          });
        }

        if (url === '/api/auth/pat/scopes' && method === 'GET') {
          return Response.json({ scopes: [] });
        }
        if (url === '/api/auth/pat' && method === 'GET') return Response.json([]);
        if (url === `/api/organizations/${orgAlias}/storage-usage` && method === 'GET') {
          return Response.json({ totalBytes: 0, objectCount: 0 });
        }
        if (url === `/api/organizations/${orgAlias}/storage-usage/objects` && method === 'GET') {
          return Response.json([]);
        }

        if (url === `/api/organizations/${orgAlias}/emblem` && method === 'POST') {
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

        if (url === `/api/organizations/${orgAlias}/clubs` && method === 'GET') {
          return Response.json([
            { clubId: 'club-alpha', organizationId: 'org-test-1', name: 'Club Alpha' },
          ]);
        }

        if (url === `/api/organizations/${orgAlias}/clubs/club-alpha/emblem` && method === 'POST') {
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

/** 256×256: a dark disc on a uniform light background, the shape the cutout model isolates. */
async function opaqueFixturePng(): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">
    <rect width="256" height="256" fill="#e6e6e6"/>
    <circle cx="128" cy="128" r="72" fill="#1f3a93"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * Share of mostly transparent pixels (alpha below 128) in each 16×16 corner of a PNG, and the alpha of
 * its centre pixel. The model leaves faint, semi-transparent speckle in the background, so "mostly
 * transparent" is the measure; the opaque fixture scores 0 everywhere.
 */
async function cutoutAlpha(png: Buffer): Promise<{ corners: number[]; centre: number }> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const size = 16;
  const origins = [
    [0, 0],
    [info.width - size, 0],
    [0, info.height - size],
    [info.width - size, info.height - size],
  ];
  const corners = origins.map(([x0, y0]) => {
    let transparent = 0;
    for (let y = y0; y < y0 + size; y++) {
      for (let x = x0; x < x0 + size; x++) {
        if (data[(y * info.width + x) * info.channels + 3] < 128) transparent++;
      }
    }
    return transparent / (size * size);
  });
  const centre =
    data[
      (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * info.channels + 3
    ];
  return { corners, centre };
}

function thirdPartyRequests(urls: readonly string[]): string[] {
  return urls.filter((url) => {
    if (url.startsWith('blob:') || url.startsWith('data:')) return false;
    try {
      const { hostname } = new URL(url);
      return !hostname.includes('localhost') && !hostname.includes('127.0.0.1');
    } catch {
      return false;
    }
  });
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

  test('removes the background of an opaque image and uploads a transparent PNG', async ({
    page,
  }) => {
    // Model download and CPU inference on first run.
    test.setTimeout(180_000);
    const requestedUrls: string[] = [];
    const failedLocalModelRequests: string[] = [];
    const runtimeErrors: string[] = [];

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
      if (msg.type() === 'error') runtimeErrors.push(msg.text());
    });
    page.on('pageerror', (error) => runtimeErrors.push(error.message));
    page.on('worker', (worker) => {
      worker.on('console', (msg) => {
        if (msg.type() === 'error') runtimeErrors.push(msg.text());
      });
    });

    await mockIdentityUploadApi(page);
    const preferencesTarget = `/control/${ORG_ALIAS}/preferences`;
    await seedLoginTransaction(page, preferencesTarget);
    await page.goto(loginCallbackUrl());
    await page.waitForURL(`**${preferencesTarget}`);

    await page.getByLabel('Subir escudo').setInputFiles({
      name: 'org-emblem.png',
      mimeType: 'image/png',
      buffer: await opaqueFixturePng(),
    });

    const dialog = page.getByRole('dialog', { name: 'Ajustar imagen' });
    await expect(dialog).toBeVisible();

    const useImage = dialog.getByRole('button', { name: 'Aplicar' });
    await expect(useImage).toBeEnabled({ timeout: 150_000 });
    // A real cutout never offers the fallback.
    await expect(dialog.getByRole('button', { name: 'Conservar original' })).toHaveCount(0);
    await useImage.click();

    await expect(page.getByText('Escudo subido.')).toBeVisible();

    expect(submittedUploads).toHaveLength(1);
    expect(submittedUploads[0].endpoint).toContain(`/api/organizations/${ORG_ALIAS}/emblem`);
    expect(submittedUploads[0].contentType).toBe('image/png');

    const { corners, centre } = await cutoutAlpha(
      Buffer.from(submittedUploads[0].contentBase64, 'base64'),
    );
    for (const share of corners) expect(share).toBeGreaterThanOrEqual(0.9);
    // The disc, the foreground, stays opaque.
    expect(centre).toBeGreaterThanOrEqual(200);

    expect(failedLocalModelRequests).toHaveLength(0);
    expect(runtimeErrors.filter((text) => /_Ort|onnx|session/i.test(text))).toEqual([]);
    expect(thirdPartyRequests(requestedUrls)).toHaveLength(0);
  });

  test('keeps the original only after a removal failure the operator sees', async ({ page }) => {
    // Every model chunk fails, so the worker cannot create a session.
    await page.route('**/background-removal/**', (route) => route.fulfill({ status: 500 }));

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
    await expect(dialog.getByText('No se pudo eliminar el fondo.', { exact: false })).toBeVisible({
      timeout: 30_000,
    });
    // Nothing is uploaded until the operator chooses.
    expect(submittedUploads).toHaveLength(0);

    await dialog.getByRole('button', { name: 'Conservar original' }).click();
    const useImage = dialog.getByRole('button', { name: 'Aplicar' });
    await expect(useImage).toBeEnabled({ timeout: 15_000 });
    await useImage.click();

    await expect(page.getByText('Escudo subido.')).toBeVisible();
    expect(submittedUploads).toHaveLength(1);
    expect(submittedUploads[0].contentType).toBe('image/png');
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
