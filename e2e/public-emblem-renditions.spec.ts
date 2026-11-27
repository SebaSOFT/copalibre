import type { Page } from '@playwright/test';
import { PERFORMANCE_ROUTES } from '../scripts/lighthouse/budgets.mjs';
import { startPerformanceFixtureApi } from '../scripts/lighthouse/performance-fixture-api.mjs';
import { expect, test } from './fixtures.js';

/**
 * Emblems are requested at the size they are shown.
 *
 * Each emblem offers the API's renditions (64, 128 and 256 pixels wide) and the
 * stored original through `srcset`, so a phone downloads small WebP files
 * instead of 410-pixel PNGs, and emblems below the first screen wait until the
 * reader scrolls toward them. The pages and their data are the ones the
 * performance budgets measure, served by the same fixture API.
 */

const PHONE = { width: 412, height: 823 };
const ORIGINAL_WIDTH = 410;
const EMBLEM_REQUEST = /\/api\/organizations\/[^?]+\/emblem(?:\?|$)/;

let fixture: Awaited<ReturnType<typeof startPerformanceFixtureApi>> | undefined;

test.beforeAll(async ({ workerPort }) => {
  fixture = await startPerformanceFixtureApi({ port: workerPort });
});

test.afterAll(async () => {
  await fixture?.close();
});

interface EmblemDownload {
  readonly url: string;
  readonly bytes: number;
}

function recordEmblemDownloads(page: Page): EmblemDownload[] {
  const downloads: EmblemDownload[] = [];
  page.on('response', async (response) => {
    if (!EMBLEM_REQUEST.test(response.url())) return;
    const body = await response.body().catch(() => Buffer.alloc(0));
    downloads.push({ url: response.url(), bytes: body.length });
  });
  return downloads;
}

function widthOf(url: string): number {
  return Number(new URL(url).searchParams.get('width') ?? ORIGINAL_WIDTH);
}

/** Every loaded emblem: its frame's CSS width and the width of the file the browser picked. */
async function loadedEmblems(page: Page): Promise<{ frame: number; picked: string }[]> {
  return page.locator('.cl-entrant-emblem img[srcset]').evaluateAll((images) =>
    (images as HTMLImageElement[])
      .filter((image) => image.complete && image.naturalWidth > 0)
      .map((image) => ({
        frame: (image.closest('.cl-entrant-emblem') as HTMLElement).getBoundingClientRect().width,
        picked: image.currentSrc,
      })),
  );
}

test.describe('on a phone', () => {
  test.use({ viewport: PHONE, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true });

  test('the matches page downloads small renditions, and only for the first screen', async ({
    page,
  }) => {
    const downloads = recordEmblemDownloads(page);
    await page.goto(PERFORMANCE_ROUTES[1], { waitUntil: 'load' });
    await page.waitForLoadState('networkidle');

    // Every emblem the page offers: the cards' and, on a phone, the day rows'.
    const offered = await page.locator('img[srcset*="/emblem"]').count();
    const onLoad = [...downloads];
    expect(offered).toBeGreaterThan(0);
    expect(onLoad.length).toBeGreaterThan(0);
    // Below the first screen, nothing is requested yet.
    expect(onLoad.length).toBeLessThan(offered);
    for (const download of onLoad) {
      expect(download.url).toContain('width=');
      expect(widthOf(download.url)).toBeLessThanOrEqual(128);
    }
    const bytesOnLoad = onLoad.reduce((total, download) => total + download.bytes, 0);
    expect(bytesOnLoad).toBeLessThan(200 * 1024);

    // A closed day's emblems load once the spectator opens it. Its clubs have usually played on the
    // open day already, so the files come from cache rather than as new downloads.
    const closedDay = page.locator('.cl-match-day:not([open])').last();
    await closedDay.locator('summary').click();
    const lastRow = closedDay.locator('.cl-match-day-row').last();
    await lastRow.scrollIntoViewIfNeeded();
    await page.waitForLoadState('networkidle');
    const images = lastRow.locator('img[srcset*="/emblem"]');
    expect(await images.count()).toBeGreaterThan(0);
    await expect
      .poll(() =>
        images.evaluateAll((all) =>
          (all as HTMLImageElement[]).every(
            (image) => image.currentSrc.includes('width=') && image.naturalWidth > 0,
          ),
        ),
      )
      .toBe(true);
  });
});

test.describe('on a high-density desktop', () => {
  test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });

  test('every emblem picks a file at least as wide as it is drawn, never a stretched one', async ({
    page,
  }) => {
    await page.goto(PERFORMANCE_ROUTES[0], { waitUntil: 'load' });
    await page.waitForLoadState('networkidle');

    const emblems = await loadedEmblems(page);
    expect(emblems.length).toBeGreaterThan(0);
    for (const emblem of emblems) {
      expect(widthOf(emblem.picked)).toBeGreaterThanOrEqual(Math.ceil(emblem.frame * 2));
    }
  });
});

test.describe('the emblem frame', () => {
  test('cuts and pads in proportion to the emblem size, keeping room for the image', async ({
    page,
  }) => {
    await page.goto(PERFORMANCE_ROUTES[0], { waitUntil: 'load' });
    const measured = await page.evaluate(() =>
      [16, 24, 32, 48].map((size) => {
        const frame = document.createElement('span');
        frame.className = 'cl-image-frame cl-entrant-emblem';
        frame.style.setProperty('--entrant-emblem-size', `${size}px`);
        const image = document.createElement('img');
        frame.append(image);
        document.body.append(frame);
        const style = getComputedStyle(frame);
        const padding = Number.parseFloat(getComputedStyle(image).paddingTop);
        const border = Number.parseFloat(style.borderTopWidth);
        const result = {
          size,
          cut: Number.parseFloat(style.borderTopRightRadius),
          padding,
          room: size - 2 * border - 2 * padding,
        };
        frame.remove();
        return result;
      }),
    );

    expect(measured.map(({ cut }) => cut)).toEqual([4, 5, 8, 14]);
    expect(measured.map(({ padding }) => padding)).toEqual([1, 2, 4, 8]);
    expect(measured[0]?.room).toBeGreaterThanOrEqual(12);
  });
});
