import { createServer, type Server } from 'node:http';
import { expect, test } from './fixtures.js';

const route = '/liga-mendocina/tournaments/apertura-2026/stages/1';
const base = '/organizations/liga-mendocina/tournaments/apertura-2026';
const ids = ['01936f4a-0001-7000-8000-000000000001', '01936f4a-0002-7000-8000-000000000002'];
const matches = [
  {
    matchId: 'WB-R1-M1',
    bracket: 'winners',
    round: 1,
    position: 1,
    status: 'finalized',
    slots: [
      { kind: 'entrant', entrantId: ids[0], name: 'Talleres', score: 2 },
      { kind: 'entrant', entrantId: ids[1], name: 'Independiente', score: 0 },
    ],
  },
  {
    matchId: 'WB-R1-M2',
    bracket: 'winners',
    round: 1,
    position: 2,
    status: 'scheduled',
    slots: [
      { kind: 'entrant', name: 'Gimnasia' },
      { kind: 'entrant', name: 'Maipú' },
    ],
  },
  {
    matchId: 'WB-R2-M1',
    bracket: 'winners',
    round: 2,
    position: 1,
    status: 'scheduled',
    slots: [
      { kind: 'winner-of', matchId: 'WB-R1-M1' },
      { kind: 'winner-of', matchId: 'WB-R1-M2' },
    ],
  },
];
let server: Server;
test.beforeAll(async ({ workerPort }) => {
  server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === `${base}/overview`) {
      res.end(
        JSON.stringify({
          organizationAlias: 'liga-mendocina',
          organizationName: 'Liga Mendocina',
          tournamentAlias: 'apertura-2026',
          tournamentName: 'Apertura 2026',
          matches: [],
          clubs: [],
          ruleset: {},
        }),
      );
    } else if (req.url === `${base}/stages/1/bracket`) {
      res.end(JSON.stringify({ format: 'single-elimination', matches }));
    } else {
      res.statusCode = 404;
      res.end('{}');
    }
  });
  await new Promise<void>((resolve) => server.listen(workerPort, '127.0.0.1', resolve));
});
test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

for (const width of [375, 1440]) {
  test(`highlights the winning continuation and clears by keyboard at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(route);
    const button = page.getByRole('button', { name: 'Highlight path for Talleres' });
    await button.focus();
    await button.press('Enter');
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    const bracket = page.locator('.cl-bracket-stage');
    await expect(
      bracket.locator('[data-journey-match="WB-R2-M1"][data-entrant-path="included"]'),
    ).toHaveCount(2);
    await expect(
      bracket.locator('[data-journey-match="WB-R1-M2"][data-entrant-path="excluded"]'),
    ).toHaveCount(2);
    const marked = bracket.locator('[data-entrant-path="included"]:visible').first();
    if (width === 375) {
      await expect(marked).toHaveCSS('border-left-style', 'solid');
    } else {
      await expect(marked.locator('.cl-card')).toHaveCSS('box-shadow', /rgb\(0, 212, 255\)/);
    }
    await expect(page).toHaveURL(new RegExp(`${route}$`));
    await button.press('Escape');
    await expect(bracket.locator('[data-entrant-path]')).toHaveCount(0);
    await button.click();
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    // Both responsive presentations share the same selection after resizing.
    await button.click();
    await page.setViewportSize({ width: width === 375 ? 1440 : 375, height: 900 });
    await expect(page.getByRole('button', { name: 'Highlight path for Talleres' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
}

test('an eliminated entrant has no hypothetical future match', async ({ page }) => {
  await page.goto(route);
  await page.getByRole('button', { name: 'Highlight path for Independiente' }).click();
  await expect(
    page.locator('[data-journey-match="WB-R2-M1"][data-entrant-path="excluded"]'),
  ).toHaveCount(2);
  await expect(page.locator('[data-entrant-path="included"]')).toHaveCount(2);
  expect(await page.locator('a button').count()).toBe(0);
});

test('without JavaScript names and match report navigation remain available', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(`${baseURL}${route}`);
  await expect(page.getByRole('button', { name: /Highlight path/ })).toHaveCount(0);
  await expect(page.locator('[data-entrant-path]')).toHaveCount(0);
  await expect(
    page.locator('.cl-bracket-stage__rounds').getByText('Talleres', { exact: true }).first(),
  ).toBeVisible();
  await expect(page.locator('.cl-bracket-stage__rounds a').first()).toHaveAttribute(
    'href',
    /\/matches\/1$/,
  );
  await context.close();
});
