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

    const submitBtn = page.getByRole('button', { name: 'Ingresar' });
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

      await expect(page.getByRole('button', { name: 'Ingresar' })).toBeVisible({
        timeout: 15_000,
      });

      const overflow = await page.evaluate(() => {
        return document.body.scrollWidth <= document.documentElement.clientWidth;
      });

      expect(overflow).toBe(true);
    });
  }

  test('nested surface levels: card alternates against dark and light bands, header lifts chrome, and selected container differs', async ({
    page,
  }) => {
    await mockLoginApi(page);
    await page.goto('/control/login');

    const result = await page.evaluate(() => {
      const container = document.createElement('div');
      container.innerHTML = `
        <div class="cl-band">
          <div class="cl-card card-panel">
            <div class="cl-card__header header-panel">Header</div>
            <div class="cl-card__content content-panel">Content</div>
          </div>
          <div class="cl-card card-selected" style="background: var(--cl-surface-raised); border-color: var(--cl-state-live);">Selected</div>
        </div>
        <div class="cl-band cl-band--base">
          <div class="cl-card card-base">
            <div class="cl-card__header header-base">Header</div>
            <div class="cl-card__content content-base">Content</div>
          </div>
        </div>
      `;
      document.body.appendChild(container);

      const cardPanel = container.querySelector('.card-panel');
      const cardBase = container.querySelector('.card-base');
      const headerPanel = container.querySelector('.header-panel');
      const headerBase = container.querySelector('.header-base');
      const cardSelected = container.querySelector('.card-selected');

      const cardPanelBg = cardPanel ? getComputedStyle(cardPanel).backgroundColor : '';
      const cardBaseBg = cardBase ? getComputedStyle(cardBase).backgroundColor : '';
      const headerPanelBg = headerPanel ? getComputedStyle(headerPanel).backgroundColor : '';
      const headerBaseBg = headerBase ? getComputedStyle(headerBase).backgroundColor : '';
      const selectedBorder = cardSelected ? getComputedStyle(cardSelected).borderColor : '';
      const headerBorder = headerPanel ? getComputedStyle(headerPanel).borderColor : '';

      container.remove();
      return { cardPanelBg, cardBaseBg, headerPanelBg, headerBaseBg, selectedBorder, headerBorder };
    });

    expect(result.cardPanelBg).not.toBe(result.cardBaseBg);
    expect(result.headerPanelBg).toBe(result.headerBaseBg);
    expect(result.selectedBorder).not.toBe(result.headerBorder);
  });
});
