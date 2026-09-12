import { expect, test, type Page } from '@playwright/test';

/**
 * The invitation-accept screen composes the owned Card atom and the shared auth
 * template, rather than its own rounded, self-centred card (openspec 0204,
 * task 2.1).
 */

const ACCEPT_PATH = '/invitations/accept?token=e2e-invitation-token';
const MOBILE = { width: 375, height: 800 } as const;
const DESKTOP = { width: 1440, height: 900 } as const;

async function openInvitation(page: Page): Promise<void> {
  await page.goto(ACCEPT_PATH);
  await expect(page.getByRole('heading', { name: 'Accept invitation' })).toBeVisible();
}

test('the invitation card carries the chamfer geometry every Control-web card uses', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await openInvitation(page);

  const card = page.locator('.cl-card').first();
  await expect(card).toBeVisible();

  const geometry = await card.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      classes: element.className,
      clipPath: style.clipPath,
      supported:
        CSS.supports('corner-top-right-shape', 'bevel') || CSS.supports('corner-shape', 'bevel'),
      topRightShape: style.getPropertyValue('corner-top-right-shape'),
      bottomLeftShape: style.getPropertyValue('corner-bottom-left-shape'),
      radii: [
        style.borderTopLeftRadius,
        style.borderTopRightRadius,
        style.borderBottomRightRadius,
        style.borderBottomLeftRadius,
      ],
    };
  });

  expect(geometry.classes).toContain('cl-chamfer');
  expect(geometry.clipPath).toBe('none');
  if (geometry.supported) {
    expect(geometry.topRightShape).toBe('bevel');
    expect(geometry.bottomLeftShape).toBe('bevel');
    expect(geometry.radii).toEqual(['0px', '8px', '0px', '8px']);
  } else {
    expect(geometry.radii).toEqual(['0px', '0px', '0px', '0px']);
  }
});

test('the invitation card keeps a horizontal gutter at a mobile viewport', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await openInvitation(page);

  const gutters = await page.evaluate(() => {
    const card = document.querySelector('.cl-card');
    if (!card) return null;
    const box = card.getBoundingClientRect();
    return { left: box.left, right: document.documentElement.clientWidth - box.right };
  });

  expect(gutters).not.toBeNull();
  // It used to sit flush against both edges: width:100% inside a bare, unpadded
  // <body>. The template owns the gutter now.
  expect(gutters?.left ?? 0).toBeGreaterThan(0);
  expect(gutters?.right ?? 0).toBeGreaterThan(0);
});

test('the screen composes the shared auth template, not its own centring', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await openInvitation(page);

  await expect(page.locator('.cl-auth-screen')).toBeVisible();
  await expect(page.locator('.cl-auth-screen__panel')).toBeVisible();

  // No horizontal page overflow at the narrowest reviewed width.
  const overflow = await page.evaluate(
    () => document.body.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});

test('the form is built from the owned field and button atoms', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await openInvitation(page);

  // Every control on this screen used to be a bare element with inline styles.
  await expect(page.locator('.cl-form-field')).toHaveCount(3);
  await expect(page.locator('input.cl-input')).toHaveCount(3);
  await expect(page.locator('button.cl-btn')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Accept and start' })).toBeVisible();
});
