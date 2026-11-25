import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * Public navigation on the committed demo tournament (`copalibre dev demo panamericano-clubes-2025
 * --anchor 2026-11-18 --played-until now`, see docs/DEMO-DATA.md). It reads the live dev API, so it
 * runs against a stack with the demo loaded. Each test opens its own page; none depends on another.
 */

const TOURNAMENT = '/es/panamericano-demo/tournaments/panamericano-clubes-2025';
const GROUP_STAGE = `${TOURNAMENT}/stages/1`;
const CUP_STAGE = `${TOURNAMENT}/stages/2`;
const CUP_MATCH = `${CUP_STAGE}/matches/20`;

const tournamentNav = (page: Page): Locator => page.getByRole('navigation', { name: 'Torneo' });

test.describe('tournament section tabs', () => {
  test('Posiciones and Cuadros open distinct pages, neither an overview anchor', async ({
    page,
  }) => {
    await page.goto(TOURNAMENT);
    const standings = tournamentNav(page).getByRole('link', { name: 'Posiciones' });
    const brackets = tournamentNav(page).getByRole('link', { name: 'Cuadros' });

    await expect(standings).toHaveAttribute('href', /\?tab=/);
    await expect(brackets).toHaveAttribute('href', /\/stages\/2$/);
    await expect(tournamentNav(page).getByRole('link', { name: 'Equipos' })).toHaveAttribute(
      'href',
      /(clubs|#teams)$/,
    );

    await standings.click();
    await expect(page).toHaveURL(/\?tab=/);
    await expect(standings).toHaveAttribute('aria-current', 'page');

    await brackets.click();
    await expect(page).toHaveURL(/\/stages\/2$/);
    await expect(brackets).toHaveAttribute('aria-current', 'page');
  });

  test('the live page marks En vivo and not Partidos', async ({ page }) => {
    await page.goto(`${TOURNAMENT}/live`);
    await expect(tournamentNav(page).getByRole('link', { name: 'En vivo' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(tournamentNav(page).getByRole('link', { name: 'Partidos' })).not.toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('the group stage marks Posiciones and the cup stage marks Cuadros', async ({ page }) => {
    await page.goto(GROUP_STAGE);
    await expect(tournamentNav(page).getByRole('link', { name: 'Posiciones' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(tournamentNav(page).getByRole('link', { name: 'Cuadros' })).not.toHaveAttribute(
      'aria-current',
      'page',
    );

    await page.goto(CUP_STAGE);
    await expect(tournamentNav(page).getByRole('link', { name: 'Cuadros' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(tournamentNav(page).getByRole('link', { name: 'Posiciones' })).not.toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('the Control Panel link is the secondary button and TV is labelled as screens', async ({
    page,
  }) => {
    await page.goto(TOURNAMENT);
    const control = page.getByRole('link', { name: 'Panel de control' });
    await expect(control).toHaveClass(/cl-btn--secondary/);
    await expect(control).not.toHaveClass(/cl-btn--primary/);
    await expect(page.getByRole('link', { name: 'Pantallas TV' })).toBeVisible();
  });
});

test.describe('stage switcher and next stage', () => {
  test('a group stage lists both stages and links to the cups', async ({ page }) => {
    await page.goto(GROUP_STAGE);
    const switcher = page.getByRole('navigation', { name: 'Fases del torneo' });
    await expect(switcher.getByRole('link')).toHaveCount(2);
    await expect(switcher.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(page.locator('p.cl-stage-next a')).toHaveAttribute('href', /\/stages\/2$/);
  });
});

test.describe('breadcrumb', () => {
  test('a match page trail reads organization, tournament, stage, match', async ({ page }) => {
    await page.goto(CUP_MATCH);
    const trail = page.locator('nav.cl-breadcrumb ol > li:visible');
    const labels = (await trail.allTextContents()).map((text) => text.replace(/›/g, '').trim());
    expect(labels).toHaveLength(4);
    expect(labels[0]).toBe('Panamericano Demo');
    expect(labels[1]).toContain('Campeonato Panamericano Clubes Senior Varones');
    expect(labels).not.toContain('Partidos');
  });

  test('at 1440 px no wrapped line starts with a separator', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(CUP_MATCH);
    const items = page.locator('nav.cl-breadcrumb ol > li:visible');
    const count = await items.count();
    for (let index = 0; index < count - 1; index += 1) {
      const item = items.nth(index);
      const separator = item.locator('.cl-crumb__sep');
      await expect(separator).toHaveCount(1);
      const itemBox = await item.boundingBox();
      const separatorBox = await separator.boundingBox();
      expect(itemBox).not.toBeNull();
      expect(separatorBox).not.toBeNull();
      // The separator sits on the line of the crumb it follows, never on a line of its own.
      expect(Math.abs((separatorBox?.y ?? 0) - (itemBox?.y ?? 0))).toBeLessThan(
        itemBox?.height ?? 0,
      );
    }
    await expect(items.last().locator('.cl-crumb__sep')).toHaveCount(0);
  });
});

test.describe('schedule controls', () => {
  test('a cup-zone scope offers no view or density control', async ({ page }) => {
    await page.goto(`${TOURNAMENT}/matches?zone=Copa%20Oro`);
    await expect(page.getByRole('link', { name: 'Tarjetas' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Compacto' })).toHaveCount(0);
  });

  test('choosing a cup zone selects its stage in the Fase row', async ({ page }) => {
    await page.goto(`${TOURNAMENT}/matches`);
    await page.locator('details.cl-match-schedule-filters > summary').click();
    await page.locator('a.cl-pill', { hasText: /^Copa Oro$/ }).click();
    await expect(page).toHaveURL(/zone=Copa(%20|\+| )Oro/);
    await expect(page).toHaveURL(/stageNumber=2/);
    await expect(page.getByRole('link', { name: 'Copas', exact: true }).first()).toHaveAttribute(
      'aria-current',
      'true',
    );
  });
});

test.describe('match page', () => {
  test('at 1440 px the match content is as wide as the overview content', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(TOURNAMENT);
    const overviewWidth = (
      await page
        .locator('#overview-matches-heading')
        .locator('xpath=ancestor::section[1]')
        .boundingBox()
    )?.width;
    await page.goto(CUP_MATCH);
    const matchWidth = (await page.locator('article.cl-match-page').boundingBox())?.width;
    expect(overviewWidth).toBeDefined();
    expect(Math.abs((matchWidth ?? 0) - (overviewWidth ?? 0))).toBeLessThan(2);
  });

  test('officials are text rows, not buttons or chips', async ({ page }) => {
    await page.goto(CUP_MATCH);
    const officials = page.locator('section[aria-labelledby="officials-heading"]');
    await expect(officials.getByRole('button')).toHaveCount(0);
    const rows = officials.locator('.cl-officials-list li');
    const count = await rows.count();
    for (let index = 0; index < count; index += 1) {
      const style = await rows.nth(index).evaluate((element) => {
        const computed = getComputedStyle(element);
        return { background: computed.backgroundColor, border: computed.borderTopWidth };
      });
      expect(style.border).toBe('0px');
      expect(style.background).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
    }
  });

  test('at 1440 px the highlighted match is within the bracket scroller on load', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    // A placement game is listed below the graph, so the first cup match that is a graph node is used.
    let focused = page.locator('.cl-bracket-stage__node--focused').filter({ visible: true });
    for (const matchId of [10, 11, 12, 13, 19, 20, 3, 4, 5]) {
      await page.goto(`${CUP_STAGE}/matches/${matchId}`);
      focused = page.locator('.cl-bracket-stage__node--focused').filter({ visible: true });
      if ((await focused.count()) === 1) break;
    }
    await expect(focused).toHaveCount(1);
    await expect
      .poll(async () => {
        const scroller = await focused.evaluate((node) => {
          const box = node.closest('.cl-bracket-stage__scroll')?.getBoundingClientRect();
          const item = node.getBoundingClientRect();
          if (!box) return false;
          return item.left >= box.left - 1 && item.right <= box.right + 1;
        });
        return scroller;
      })
      .toBe(true);
  });
});

test.describe('bracket scroll affordance', () => {
  test('an overflowing cup bracket shows the hint and a fade at 1440 px', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(CUP_STAGE);
    const scroller = page.locator('.cl-bracket-stage__scroll--full').first();
    await expect(scroller).toHaveAttribute('data-overflowing', '');
    await expect(scroller).toHaveAttribute('data-overflow-end', '');
    await expect(page.getByText('Deslizá para ver toda la llave').first()).toBeVisible();
  });
});
