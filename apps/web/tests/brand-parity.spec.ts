import { expect, test, type Page } from '@playwright/test';

const VIEWPORT_WIDTHS = [1440, 767, 374, 188] as const;

async function mockLoginApi(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.fetch = async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (
        (url === '/auth/login' || url === '/api/auth/login' || url.endsWith('/auth/login')) &&
        method === 'POST'
      ) {
        return Response.json({ access_token: 'e2e-access-token', expires_in: 3600 });
      }
      return new Response('Not found', { status: 404 });
    };
  });
}

test.describe('Brand Design System Parity (0217)', () => {
  test('primary buttons render uppercase condensed display typography and chamfer geometry', async ({
    page,
  }) => {
    await mockLoginApi(page);
    await page.goto('/control/login');

    const submitBtn = page.getByRole('button', { name: 'Sign in' });
    await expect(submitBtn).toBeVisible({ timeout: 15_000 });

    const styles = await submitBtn.evaluate((el) => {
      const computed = window.getComputedStyle(el);
      return {
        textTransform: computed.textTransform,
        fontFamily: computed.fontFamily,
        letterSpacing: computed.letterSpacing,
      };
    });

    expect(styles.textTransform).toBe('uppercase');
    expect(styles.fontFamily.toLowerCase()).toContain('barlow condensed');
  });

  for (const width of VIEWPORT_WIDTHS) {
    test(`renders cleanly without horizontal page overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await mockLoginApi(page);
      await page.goto('/control/login');

      await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible({
        timeout: 15_000,
      });

      const overflow = await page.evaluate(() => {
        return document.body.scrollWidth <= document.documentElement.clientWidth;
      });

      expect(overflow).toBe(true);
    });
  }

  test('content alternates on public/control surfaces, broadcast stops after one step, and selection differs from chrome', async ({
    page,
  }) => {
    await mockLoginApi(page);
    await page.goto('/control/login');
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();

    const result = await page.evaluate(() => {
      const container = document.createElement('div');
      const content = `
        <div class="cl-card first">
          <div class="cl-card__header">Header</div>
          <div class="cl-card__content">
            <div class="cl-file-picker__zone cl-file-picker--selection-present">
              <span class="cl-file-picker__filename">entrants.csv</span>
            </div>
            <div class="layout-wrapper"><div class="cl-well second">
              <div class="layout-wrapper"><div class="cl-card third">Nested content</div></div>
            </div></div>
          </div>
        </div>`;
      container.innerHTML = `
        <section class="cl-band" data-surface="control">${content}</section>
        <section class="cl-band cl-band--base" data-surface="public">${content}</section>
        <section class="cl-band cl-band--base" data-surface="broadcast">${content}</section>`;
      document.body.appendChild(container);
      const surfaces = Array.from(container.querySelectorAll('section')).map((section) => {
        const style = (selector: string) => {
          const element = section.querySelector(selector);
          if (!element) throw new Error(`Missing surface fixture: ${selector}`);
          return getComputedStyle(element);
        };
        const selected = style('.cl-file-picker__zone');
        const chrome = style('.cl-card__header');
        return {
          band: getComputedStyle(section).backgroundColor,
          levels: ['.first', '.second', '.third'].map(
            (selector) => style(selector).backgroundColor,
          ),
          borders: ['.first', '.second', '.third'].map(
            (selector) => style(selector).borderTopStyle,
          ),
          chrome: chrome.backgroundColor,
          selected: selected.backgroundColor,
          selectedBorder: selected.borderTopColor,
          chromeBorder: chrome.borderTopColor,
          filename: section.querySelector('.cl-file-picker__filename')?.textContent,
        };
      });
      container.remove();
      return surfaces;
    });

    for (const surface of result) {
      expect(surface.levels[0]).not.toBe(surface.band);
      expect(surface.selected).not.toBe(surface.chrome);
      expect(surface.selectedBorder).not.toBe(surface.chromeBorder);
      expect(surface.filename).toBe('entrants.csv');
      expect(surface.borders).toEqual(['solid', 'solid', 'solid']);
    }
    for (const surface of result.slice(0, 2)) {
      expect(surface.levels[0]).not.toBe(surface.levels[1]);
      expect(surface.levels[0]).toBe(surface.levels[2]);
    }
    expect(result[0].levels[0]).not.toBe(result[1].levels[0]);
    expect(result[0].chrome).toBe(result[1].chrome);
    expect(new Set(result[2].levels).size).toBe(1);
  });
});
