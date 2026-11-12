import type { Page } from '@playwright/test';
import { PERFORMANCE_ROUTES } from '../scripts/lighthouse/budgets.mjs';
import { startPerformanceFixtureApi } from '../scripts/lighthouse/performance-fixture-api.mjs';
import { expect, test } from './fixtures.js';

/**
 * How the public pages load their fonts on a phone.
 *
 * Every brand face swaps in after the first paint. The text that paints first
 * is set in a fallback face sized to the brand face's metrics, so the swap
 * moves nothing; the heading's face is requested with the document; and the
 * interface's own marks are drawn as icons, so a Spanish page downloads no
 * fallback font for a script it does not show.
 *
 * The pages and their data are the ones the performance budgets measure, served
 * by the same fixture API.
 */

const PHONE = { width: 412, height: 823 };
const HEADING_FACE = /barlow-condensed-latin-700-normal\.[^/]+\.woff2$/;
const FALLBACK_SCRIPT_FACES = /\/(noto-sans-sc|roboto|roboto-condensed)-[^/]*\.woff2$/;

let fixture: Awaited<ReturnType<typeof startPerformanceFixtureApi>> | undefined;

test.beforeAll(async ({ workerPort }) => {
  fixture = await startPerformanceFixtureApi({ port: workerPort });
});

test.afterAll(async () => {
  await fixture?.close();
});

interface RecordedShift {
  readonly value: number;
  readonly sources: readonly string[];
}

/** Records every layout shift from navigation start, naming each shifted node. */
async function recordLayoutShifts(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const shifts: { value: number; sources: string[] }[] = [];
    (window as unknown as { __layoutShifts: typeof shifts }).__layoutShifts = shifts;
    const describe = (node: Node | null): string => {
      if (!(node instanceof Element)) return node?.nodeName ?? 'unknown';
      const inMain = node.closest('main') !== null;
      return `${inMain ? 'main>' : ''}${node.localName}.${String(node.className)}`;
    };
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as unknown as {
        value: number;
        hadRecentInput: boolean;
        sources?: { node: Node | null }[];
      }[]) {
        if (entry.hadRecentInput) continue;
        shifts.push({
          value: entry.value,
          sources: (entry.sources ?? []).map((source) => describe(source.node)),
        });
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
}

/*
  A fast machine has the fonts before the first paint and would hide the swap.
  Holding every font file back (delayed, never refused) makes the page paint in
  its fallback faces first and swap the brand faces in afterwards, as a slow
  phone does.
*/
async function delayFonts(page: Page): Promise<void> {
  await page.route(/\.woff2?(\?|$)/, async (route) => {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1200));
    await route.continue();
  });
}

/**
 * Whether the machine has a face the fallbacks stand on: Arial or a face with its metrics. Phones
 * and desktops have one (Roboto on Android, Arial elsewhere) and CI's browser dependencies install
 * Liberation Sans; a bare Linux box may have none, and then the fallback faces cannot apply.
 */
async function hasMetricCompatibleFace(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    const probe = new FontFace(
      'cl-local-probe',
      "local('Arial'), local('ArialMT'), local('Liberation Sans'), local('LiberationSans-Regular'), local('Arimo'), local('Roboto'), local('Roboto-Regular')",
    );
    return probe.load().then(
      () => true,
      () => false,
    );
  });
}

test.describe('public fonts on a phone', () => {
  for (const route of PERFORMANCE_ROUTES) {
    test(`a font swap moves none of the page content: ${route}`, async ({ page }) => {
      await page.goto('about:blank');
      test.skip(
        !process.env.CI && !(await hasMetricCompatibleFace(page)),
        'No Arial, Liberation Sans, Arimo or Roboto installed (CI installs Liberation Sans).',
      );
      await page.setViewportSize(PHONE);
      await recordLayoutShifts(page);
      await delayFonts(page);
      await page.goto(route);
      await page.waitForLoadState('load');
      await page.evaluate(() => document.fonts.ready);
      // Let the frame after the swap be laid out and reported.
      await page.evaluate(
        () =>
          new Promise((resolveFrame) => requestAnimationFrame(() => setTimeout(resolveFrame, 100))),
      );
      expect(await page.evaluate(() => document.fonts.check('700 16px "Barlow Condensed"'))).toBe(
        true,
      );

      const shifts = await page.evaluate(
        () => (window as unknown as { __layoutShifts: RecordedShift[] }).__layoutShifts,
      );
      const content = shifts.filter((shift) =>
        shift.sources.some((source) => source.startsWith('main>')),
      );
      for (const shift of content) {
        expect(shift.value, JSON.stringify(shifts)).toBeLessThanOrEqual(0.01);
      }
    });

    test(`requests the heading face once and no fallback script face: ${route}`, async ({
      page,
    }) => {
      const fonts: string[] = [];
      page.on('request', (request) => {
        if (request.resourceType() === 'font') fonts.push(new URL(request.url()).pathname);
      });
      await page.setViewportSize(PHONE);
      await page.goto(route);
      await page.waitForLoadState('load');
      await page.evaluate(() => document.fonts.ready);

      expect(fonts.filter((path) => HEADING_FACE.test(path))).toHaveLength(1);
      expect(fonts.filter((path) => FALLBACK_SCRIPT_FACES.test(path))).toEqual([]);
    });
  }
});
