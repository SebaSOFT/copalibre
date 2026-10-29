import type { CDPSession, Page } from '@playwright/test';

/**
 * The current Playwright runner calls Element.checkVisibility(), which Chromium 100 does not
 * implement. This test-only shim keeps Playwright's visibility checks running against the older
 * browser; application rendering and CSS still come from the unmodified page.
 */
export async function installChromium100VisibilityShim(
  page: Page,
  projectName: string,
): Promise<CDPSession | undefined> {
  if (projectName !== 'chromium-100') return undefined;

  // Playwright's locator engine uses this page-specific isolated world for visibility checks.
  const pageGuid = (page as Page & { _guid: string })._guid;
  const cdp = await page.context().newCDPSession(page);

  await cdp.send('Page.enable');
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    worldName: `__playwright_utility_world_${pageGuid}`,
    source: `if (typeof Element.prototype.checkVisibility !== 'function') {
      Object.defineProperty(Element.prototype, 'checkVisibility', {
        configurable: true,
        value() {
          return getComputedStyle(this).display !== 'none';
        },
      });
    }`,
  });

  return cdp;
}
