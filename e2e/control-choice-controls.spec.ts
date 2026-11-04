import { expect, test } from '@playwright/test';
import { loginCallbackUrl, seedLoginTransaction, TOKEN_ENDPOINT } from './support/control-login.js';

/**
 * Checkbox and radio are two boxes: a 44px target that paints nothing and a `1.25rem` box inside
 * it. Only a browser can measure that, and only a browser resolves which rule paints the target.
 */

const TARGET = '/control/liga-mendocina/tournaments/apertura-2026/registrations';

async function openRegistrationReview(page: import('@playwright/test').Page): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(
    ({ tokenEndpoint }) => {
      const originalFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const url = String(input);
        if (url === tokenEndpoint) {
          return Response.json({ access_token: 'e2e-access-token', expires_in: 3600 });
        }
        if (url.endsWith('/registrations')) {
          return Response.json([
            {
              entrantId: 'entrant-1',
              tournamentId: 't-1',
              status: 'pending',
              personId: 'person-1',
              displayName: 'Elías Salomón',
            },
          ]);
        }
        if (url.endsWith('/entrants/needing-abbreviation')) return Response.json([]);
        return originalFetch(input, init);
      };
    },
    { tokenEndpoint: TOKEN_ENDPOINT },
  );
  await seedLoginTransaction(page, TARGET);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${TARGET}`);
}

test('a selection checkbox shows a 1.25rem box inside a 44px target that paints nothing', async ({
  page,
}) => {
  await openRegistrationReview(page);
  const checkbox = page.getByRole('checkbox', { name: /Elías Salomón/ });
  await expect(checkbox).toBeVisible();

  const target = await checkbox.boundingBox();
  const box = await checkbox.locator('.cl-checkbox__box').boundingBox();
  expect(target).toMatchObject({ width: 44, height: 44 });
  expect(box).toMatchObject({ width: 20, height: 20 });
  // eslint-disable-next-line no-restricted-syntax -- asserting a computed browser style value, not an app style
  await expect(checkbox).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(checkbox).toHaveCSS('border-top-width', '0px');
});

test('registration review keeps its selection column as narrow as the target', async ({ page }) => {
  await openRegistrationReview(page);
  const cell = page.locator('td').filter({ has: page.getByRole('checkbox') });
  await expect(cell).toBeVisible();

  const width = (await cell.boundingBox())?.width ?? Number.POSITIVE_INFINITY;
  expect(width).toBeLessThan(80);
});

test('the keyboard focus ring sits on the box, not on the target', async ({ page }) => {
  await openRegistrationReview(page);
  const checkbox = page.getByRole('checkbox', { name: /Elías Salomón/ });
  await checkbox.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');

  await expect(checkbox).toBeFocused();
  await expect(checkbox).toHaveCSS('box-shadow', 'none');
  await expect(checkbox.locator('.cl-checkbox__box')).not.toHaveCSS('box-shadow', 'none');
});

test('checking a row fills the box and keeps the same size', async ({ page }) => {
  await openRegistrationReview(page);
  const checkbox = page.getByRole('checkbox', { name: /Elías Salomón/ });
  const box = checkbox.locator('.cl-checkbox__box');
  const resting = await box.evaluate((node) => getComputedStyle(node).backgroundColor);

  await checkbox.click();

  await expect(checkbox).toBeChecked();
  await expect(box).not.toHaveCSS('background-color', resting);
  await expect(checkbox.locator('.cl-checkbox__indicator')).toBeVisible();
  expect(await box.boundingBox()).toMatchObject({ width: 20, height: 20 });
});
