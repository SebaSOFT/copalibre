import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const css = readFileSync('packages/design-tokens/generated/copalibre.css', 'utf8');

test('calibrated hover fills are not brightened again by the generic button rule', async ({
  page,
}) => {
  await page.setContent(
    '<button class="cl-btn cl-btn--primary">Primary</button><button class="cl-btn cl-btn--secondary">Secondary</button><div id="expected"></div>',
  );
  await page.addStyleTag({ content: css });
  for (const [variant, role] of [
    ['primary', 'primary-hover'],
    ['secondary', 'surface-hover'],
  ]) {
    const expected = await page.locator('#expected').evaluate((element, token) => {
      (element as HTMLElement).style.background = `var(--cl-${token})`;
      return getComputedStyle(element).backgroundColor;
    }, role);
    const button = page.locator(`.cl-btn--${variant}`);
    await button.hover();
    await expect(button).toHaveCSS('background-color', expected);
    await expect(button).toHaveCSS('filter', 'none');
  }
});

test('blocked font delivery preserves readable labels and focus at the zoom floor', async ({
  page,
}) => {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
  await page.setViewportSize({ width: 188, height: 900 });
  await page.goto('/control/login');
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
  const input = page.getByLabel('Email', { exact: true });
  await input.focus();
  await expect(input).toBeFocused();
  expect(await input.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe('none');
  expect(await page.evaluate(() => document.body.scrollWidth <= innerWidth)).toBe(true);
  expect(
    await page.evaluate(
      () => [...document.fonts].filter((font) => font.status === 'loaded').length,
    ),
  ).toBe(0);
});

test('content alternates through wrappers and chrome stays lifted at every depth', async ({
  page,
}) => {
  await page.setContent('<main></main>');
  await page.addStyleTag({ content: css });
  const levels = await page.evaluate(() => {
    const main = document.querySelector('main');
    if (!main) throw new Error('Missing test surface');
    const probe = document.createElement('div');
    main.append(probe);
    const color = (role: string) => {
      probe.style.background = `var(--cl-${role})`;
      return getComputedStyle(probe).backgroundColor;
    };
    const expected = {
      base: color('surface-base'),
      panel: color('surface-panel'),
      chrome: color('surface-chrome'),
    };
    return ['cl-band', 'cl-band--base'].map((bandClass) => {
      const band = document.createElement('section');
      band.className = bandClass;
      main.append(band);
      let parent: HTMLElement = band;
      const values = [];
      for (let depth = 0; depth < 8; depth += 1) {
        const wrapper = document.createElement('div');
        const card = document.createElement('section');
        card.className = depth % 2 === 0 ? 'cl-card' : 'cl-well';
        const header = document.createElement('header');
        header.className = 'cl-card__header';
        header.textContent = 'Header';
        card.append(header);
        wrapper.append(card);
        parent.append(wrapper);
        values.push({
          background: getComputedStyle(card).backgroundColor,
          chrome: getComputedStyle(header).backgroundColor,
          border: getComputedStyle(header).borderTopWidth,
        });
        parent = card;
      }
      return { values, expected };
    });
  });
  for (const [band, { values, expected }] of levels.entries()) {
    for (const [depth, value] of values.entries()) {
      expect(value.background).toBe((depth + band) % 2 === 0 ? expected.base : expected.panel);
      expect(value.chrome).toBe(expected.chrome);
      expect(value.border).toBe('1px');
    }
  }
});

test('single chamfers and badge reset unused corners in the longhand-only tier', async ({
  page,
}) => {
  await page.setContent(
    '<div class="cl-chamfer-tr">Single</div><span class="cl-badge cl-chamfer">LIVE</span>',
  );
  await page.addStyleTag({
    content: css.replaceAll(
      '@supports (corner-shape: bevel) {',
      '@supports (unsupported-property: never) {',
    ),
  });
  const corners = await page.locator('.cl-chamfer-tr, .cl-badge').evaluateAll((elements) =>
    elements.map((element) => {
      const style = getComputedStyle(element);
      return [
        style.borderTopLeftRadius,
        style.borderTopRightRadius,
        style.borderBottomRightRadius,
        style.borderBottomLeftRadius,
      ];
    }),
  );
  expect(corners).toEqual([
    ['0px', '14px', '0px', '0px'],
    ['14px', '0px', '0px', '14px'],
  ]);
});

test('preview identifiers are unknown paths in the production server', async ({ request }) => {
  for (const id of ['result-legend', 'score-ticker', 'not-a-component']) {
    const response = await request.get(`/__preview/${id}?locale=es`);
    expect(response.status()).toBe(404);
    expect(await response.text()).not.toContain('data-preview=');
  }
});
