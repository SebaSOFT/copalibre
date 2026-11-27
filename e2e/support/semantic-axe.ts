import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/**
 * Fails on any critical or serious axe violation on the page. Contrast has its
 * own checks, in both themes. The TV rail takes no input by design, because the
 * kiosk has no keyboard, so its scrolling region is left out.
 */
export async function expectNoSeriousSemanticViolations(page: Page): Promise<void> {
  const builder = new AxeBuilder({ page }).disableRules(['color-contrast']);
  if ((await page.locator('.tv-rail-content').count()) > 0) builder.exclude('.tv-rail-content');
  const { violations } = await builder.analyze();
  const serious = violations
    .filter(({ impact }) => impact === 'critical' || impact === 'serious')
    .map(({ id, nodes }) => ({ id, targets: nodes.map(({ target }) => target) }));
  expect(serious).toEqual([]);
}
