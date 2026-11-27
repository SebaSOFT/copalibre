import type { Page } from '@playwright/test';
import { expect, test as base } from '../fixtures.js';

export { expect };

/**
 * What React reports when a client island's first render disagrees with the
 * server markup. The production build throws minified errors (#418 text,
 * #419–#425 the other hydration failures) as uncaught page errors: they never
 * reach the console, so only a page-error listener sees them.
 */
export const HYDRATION_ERROR = /Minified React error #(418|419|420|421|422|423|425)\b|hydrat/i;

/**
 * The fixtures every TV spec runs with, plus a guard that fails the test on any
 * React hydration error raised by any page it opened.
 */
export const test = base.extend<{ hydrationGuard: void }>({
  hydrationGuard: [
    async ({ context }, use) => {
      const errors: string[] = [];
      context.on('weberror', (webError) => {
        const message = webError.error().message;
        if (HYDRATION_ERROR.test(message)) errors.push(message);
      });
      await use();
      if (errors.length > 0) {
        throw new Error(`React hydration errors:\n${[...new Set(errors)].join('\n')}`);
      }
    },
    { auto: true },
  ],
});

/**
 * Opens a TV route and waits until its island has hydrated. Before that the
 * markup is the server's, with no handlers: a click on a rail tab does nothing,
 * and a hydration error has not been raised yet.
 */
export async function gotoTv(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await expect(page.locator('[data-hydrated]').first()).toBeAttached();
}
