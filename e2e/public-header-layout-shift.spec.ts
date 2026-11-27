import type { Page } from '@playwright/test';
import { PERFORMANCE_ROUTES } from '../scripts/lighthouse/budgets.mjs';
import { startPerformanceFixtureApi } from '../scripts/lighthouse/performance-fixture-api.mjs';
import { expect, test } from './fixtures.js';

/**
 * The public header on a phone must not move the page while it loads. With
 * scripting, its compact menu paints closed from the first frame; without
 * scripting, every navigation link stays visible and reachable.
 *
 * The pages and their data are the ones the performance budgets measure, served
 * by the same fixture API.
 */

const PHONE = { width: 412, height: 823 };

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
      if (node.id) return `${node.localName}#${node.id}`;
      const header = node.closest('.cl-public-header');
      return header ? `header>${node.localName}.${node.className}` : node.localName;
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
  A slow phone paints before the deferred module scripts run; delaying them
  reproduces that here, where a fast machine would otherwise run them first.
  Web fonts are refused, so the page keeps its fallback font: a font swap moves
  text too (the header's own call to action among it), and that is a separate
  cause, measured by the performance budgets, not the header's behavior.
*/
async function delayModuleScripts(page: Page): Promise<void> {
  await page.route('**/_astro/*.js', async (route) => {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1500));
    await route.continue();
  });
  await page.route(/\.woff2?(\?|$)/, (route) => route.abort());
}

test.describe('the public header on a phone', () => {
  for (const route of PERFORMANCE_ROUTES) {
    test(`paints its menu closed and never shifts the page: ${route}`, async ({ page }) => {
      await page.setViewportSize(PHONE);
      await recordLayoutShifts(page);
      await delayModuleScripts(page);
      await page.goto(route);

      const toggle = page.locator('[data-public-nav-toggle]');
      await expect(page.locator('.cl-public-header')).toHaveAttribute('data-nav-ready', '');
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await page.waitForLoadState('load');

      const shifts = await page.evaluate(
        () => (window as unknown as { __layoutShifts: RecordedShift[] }).__layoutShifts,
      );
      const fromHeader = shifts.filter((shift) =>
        shift.sources.some((source) => source === 'main#main' || source.startsWith('header>')),
      );
      expect(fromHeader, JSON.stringify(shifts)).toEqual([]);

      // The menu still opens, closes on Escape and returns focus, as before.
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(page.locator('#cl-public-nav')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(toggle).toBeFocused();
      await expect(page.locator('#cl-public-nav')).toBeHidden();
    });
  }
});

test.describe('the public header on a phone without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  for (const route of PERFORMANCE_ROUTES) {
    test(`keeps every navigation link visible and reachable: ${route}`, async ({ page }) => {
      await page.setViewportSize(PHONE);
      await page.goto(route);

      await expect(page.locator('[data-public-nav-toggle]')).toBeHidden();
      const links = page.locator('.cl-public-header nav a');
      const count = await links.count();
      expect(count).toBeGreaterThan(0);
      for (let index = 0; index < count; index += 1) {
        await expect(links.nth(index)).toBeVisible();
      }
      // Reachable from the keyboard: the first link takes focus from the page start.
      await links.first().focus();
      await expect(links.first()).toBeFocused();
    });
  }
});
