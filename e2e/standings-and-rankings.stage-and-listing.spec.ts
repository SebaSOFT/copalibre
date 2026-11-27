import { expect, test } from './fixtures.js';
import type { Server } from 'node:http';
import {
  ORGANIZATION,
  createStandingsApiServer,
  groupStandingsFixture,
} from './standings-and-rankings.fixtures.js';

test.describe('B2: public tournament page', () => {
  let apiServer: Server;
  const groupStandingsResponse: object = groupStandingsFixture;

  test.beforeAll(async ({ workerPort }) => {
    apiServer = createStandingsApiServer(() => groupStandingsResponse);
    await new Promise<void>((resolve) => apiServer.listen(workerPort, '127.0.0.1', resolve));
  });

  test.afterAll(async () => {
    await new Promise<void>((resolve) => apiServer.close(() => resolve()));
  });

  test('renders organization tournament listing with live, upcoming, and finished podium', async ({
    page,
  }) => {
    await page.goto(`/${ORGANIZATION}`);

    await expect(page.getByRole('heading', { name: 'Liga Mendocina' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'In progress' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Upcoming' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Finished & Archive' })).toBeVisible();

    // The live tournament appears once in the In progress section and carries
    // its featured badge there, instead of being duplicated in another section.
    const inProgress = page.getByRole('region', { name: 'In progress' });
    const liveCard = inProgress.locator('[data-tournament-alias="torneo-relampago-2026"]');
    await expect(liveCard).toHaveCount(1);
    await expect(liveCard).toContainText('In progress');
    await expect(liveCard).toContainText('Featured');
    await expect(liveCard.locator('.cl-badge-live')).toHaveCount(0);
    await expect(liveCard.locator('.cl-live-pulse')).toHaveCount(0);

    // The sections follow lifecycle priority.
    const sectionHeadings = await page
      .locator('h2.cl-section-title')
      .allTextContents()
      .then((all) => all.map((heading) => heading.trim()));
    expect(sectionHeadings.indexOf('In progress')).toBeLessThan(
      sectionHeadings.indexOf('Upcoming'),
    );
    expect(sectionHeadings.indexOf('Upcoming')).toBeLessThan(
      sectionHeadings.indexOf('Finished & Archive'),
    );

    await expect(inProgress.getByRole('link', { name: 'Torneo Relámpago 2026' })).toBeVisible();

    // Check Finished tournament & Podium
    await expect(page.getByRole('link', { name: 'Apertura 2026' }).first()).toBeVisible();
    await expect(page.getByText('Club Atlético Talleres (TAL)')).toBeVisible();
    await expect(page.getByText('Club Atlético Independiente (IND)')).toBeVisible();
    await expect(page.getByText('Champion')).toBeVisible();
    await expect(page.getByText('Runner-up')).toBeVisible();

    // Club grid.
    await expect(page.getByRole('heading', { name: 'Clubs' })).toBeVisible();
    await expect(page.getByText('Club Atlético Talleres').first()).toBeVisible();
    await expect(page.getByText('Club Atlético Independiente').first()).toBeVisible();
  });

  test('the former organization tournament listing path is no longer served', async ({ page }) => {
    const response = await page.goto(`/${ORGANIZATION}/tournaments`);
    expect(response?.status()).toBe(404);
  });

  test('stage-1 page renders six per-group tables with shared controls, Orden matching legend ranges, and distinct categorical band colours', async ({
    page,
  }) => {
    await page.goto(`/es/${ORGANIZATION}/tournaments/panamericano-clubes-2025/stages/1`);
    await page.waitForFunction(() => {
      const deferredHrefs = Array.from(
        document.querySelectorAll<HTMLMetaElement>('meta[name="copalibre:deferred-stylesheet"]'),
      ).map((meta) => meta.content);
      const links = Array.from(
        document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'),
      );
      return deferredHrefs.every((href) =>
        links.some((link) => link.getAttribute('href') === href && link.sheet !== null),
      );
    });
    await page.evaluate(() => document.fonts.ready);

    const standingsSection = page.locator('#standings');
    const groupHeadings = standingsSection.locator('h3.cl-standings-group-heading');
    await expect(groupHeadings).toHaveText([
      'Grupo A',
      'Grupo B',
      'Grupo C',
      'Grupo D',
      'Grupo E',
      'Grupo F',
    ]);
    await expect(standingsSection.locator('.cl-standings-groups .cl-standings-group')).toHaveCount(
      6,
    );
    await expect(standingsSection.locator('tbody tr')).toHaveCount(24);

    // Shared filter and CSV export appear once, not repeated per group.
    await expect(standingsSection.locator('.cl-club-filter')).toHaveCount(1);
    await expect(standingsSection.getByRole('link', { name: 'Descargar CSV' })).toHaveCount(1);

    const promoLegend = standingsSection.getByRole('group', { name: 'Bandas de clasificación' });
    await expect(promoLegend).toHaveCount(1);
    await expect(promoLegend).toContainText('Copa Oro');
    await expect(promoLegend).toContainText('orden 1–8');
    await expect(promoLegend).toContainText('Copa Plata');
    await expect(promoLegend).toContainText('orden 9–16');
    await expect(promoLegend).toContainText('Copa Bronce');
    await expect(promoLegend).toContainText('orden 17–24');

    const legendRanges = new Map<number, { first: number; last: number }>([
      [0, { first: 1, last: 8 }],
      [1, { first: 9, last: 16 }],
      [2, { first: 17, last: 24 }],
    ]);

    const rowAudit = await standingsSection.evaluate(() => {
      const tables = Array.from(document.querySelectorAll('#standings .cl-standings-group table'));
      return tables.map((table) => {
        const headers = Array.from(table.querySelectorAll('thead th')).map((th) =>
          th.textContent?.trim(),
        );
        const orderIndex = headers.findIndex((text) => text?.includes('Orden'));
        const rows = Array.from(table.querySelectorAll('tbody tr')).map((tr) => {
          const bandIndex = Number(tr.getAttribute('data-promotion-band-index'));
          const cells = Array.from(tr.querySelectorAll('td'));
          const seedTag = tr.querySelector('.cl-standings-qualification-seed')?.textContent?.trim();
          const orderCell = orderIndex >= 0 ? cells[orderIndex]?.textContent?.trim() : undefined;
          return { bandIndex, seedTag, orderCell };
        });
        return { orderIndex, rows };
      });
    });

    for (const table of rowAudit) {
      expect(table.orderIndex).toBeGreaterThan(-1);
      expect(table.rows).toHaveLength(4);
      for (const row of table.rows) {
        const order = Number(row.orderCell);
        expect(Number.isInteger(order)).toBe(true);
        expect(row.seedTag).toBe(`Orden ${order}`);
        const range = legendRanges.get(row.bandIndex);
        expect(range).toBeDefined();
        if (range) {
          expect(order).toBeGreaterThanOrEqual(range.first);
          expect(order).toBeLessThanOrEqual(range.last);
        }
      }
    }

    // All three promotion bands carry distinct categorical colours on row rails, tags, and legend rails.
    const bandColors = await standingsSection.evaluate(() =>
      [0, 1, 2].map((index) => {
        const rowCell = document.querySelector<HTMLElement>(
          `.cl-standings-row--promotion[data-promotion-band-index="${index}"] > td:first-child`,
        );
        const tag = document.querySelector<HTMLElement>(
          `.cl-standings-qualification-tag[data-promotion-band-index="${index}"]`,
        );
        const legendRail = document.querySelector<HTMLElement>(
          `.cl-standings-promotion-legend__rail[data-promotion-band-index="${index}"]`,
        );
        return {
          rowRail: rowCell ? getComputedStyle(rowCell).borderInlineStartColor : '',
          tagRail: tag ? getComputedStyle(tag).borderInlineStartColor : '',
          legendRail: legendRail ? getComputedStyle(legendRail).backgroundColor : '',
        };
      }),
    );

    expect(new Set(bandColors.map((entry) => entry.rowRail)).size).toBe(3);
    expect(new Set(bandColors.map((entry) => entry.tagRail)).size).toBe(3);
    expect(new Set(bandColors.map((entry) => entry.legendRail)).size).toBe(3);
  });
});
