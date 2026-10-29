import { expect, type Page } from '@playwright/test';

const REFERENCE_WIDTHS = [375, 1440, 1920] as const;

export async function expectCenteredPageContainer(
  page: Page,
  path: string,
  variant: 'public' | 'reading' = 'public',
): Promise<void> {
  const maximum = variant === 'public' ? 1200 : 720;

  for (const width of REFERENCE_WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(path);

    const container = page.locator(`main > .cl-container--${variant}`).first();
    await expect(container).toBeVisible();
    const geometry = await container.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const leftGutter = Number.parseFloat(style.paddingLeft);
      const rightGutter = Number.parseFloat(style.paddingRight);
      return {
        left: box.left,
        width: box.width,
        contentLeft: box.left + leftGutter,
        contentRight: box.right - rightGutter,
        viewportWidth: window.innerWidth,
      };
    });
    const gutter = width < 768 ? 16 : width < 1024 ? 24 : 32;

    expect(geometry.width).toBeLessThanOrEqual(maximum + 1);
    expect(geometry.contentLeft).toBeGreaterThanOrEqual(gutter - 1);
    expect(geometry.viewportWidth - geometry.contentRight).toBeGreaterThanOrEqual(gutter - 1);
    expect(Math.abs(geometry.left + geometry.width / 2 - width / 2)).toBeLessThanOrEqual(1);
  }
}
