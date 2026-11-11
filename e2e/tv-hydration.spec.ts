import { expect, gotoTv, HYDRATION_ERROR, test } from './support/tv-ready.js';

/**
 * Every TV island hydrates the markup the server sent, whatever the browser
 * prefers. The server cannot know the viewer's motion preference, so a value
 * read from the browser during the first client render would differ from the
 * server's and React would throw away the markup, along with any click made
 * meanwhile. The guard in `support/tv-ready.ts` fails on such an error; this
 * spec also lists what each page raised, so a failure names the page.
 */

const TV_PATH = '/tv/liga-mendocina/tournaments/apertura-2026';

const ROUTES = [
  { name: 'kiosk', path: TV_PATH },
  { name: 'lower third', path: `${TV_PATH}?mode=overlay-lower` },
  { name: 'full overlay', path: `${TV_PATH}?mode=overlay-full` },
  { name: 'multi-court grid', path: `${TV_PATH}?layout=multicourt` },
] as const;

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  for (const route of ROUTES) {
    test(`the ${route.name} hydrates without mismatch (motion: ${reducedMotion})`, async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => {
        if (HYDRATION_ERROR.test(error.message)) errors.push(error.message);
      });
      await page.emulateMedia({ reducedMotion });
      await page.setViewportSize({ width: 1920, height: 1080 });

      await gotoTv(page, route.path);

      expect(errors).toEqual([]);
    });
  }
}

test('a rail tab clicked once the kiosk has hydrated shows its section and keeps it', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await gotoTv(page, TV_PATH);

  const tab = page.getByRole('button', { name: 'Top performers' });
  await tab.click();

  await expect(tab).toHaveClass(/tv-rail-tab--active/);
  await expect(page.getByTestId('tv-rail-content')).toBeVisible();
});
