import { expect, test } from './fixtures.js';
import { loginCallbackUrl, seedLoginTransaction } from './support/control-login.js';
import {
  ORGANIZATION,
  TOURNAMENT_ALIAS,
  mockControlApi,
} from './standings-and-rankings.fixtures.js';

test('A5: renders the discipline’s own GF/GC/Dif/Avg columns, switches to a fraction-cell layout, and exports CSV', async ({
  page,
}) => {
  await mockControlApi(page);

  const target = `/control/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/stages/1/standings`;
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  // The discipline's own declared columns, not a hardcoded control-web list.
  await expect(page.getByRole('button', { name: 'GF', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'GC', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Dif', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Avg', exact: true })).toBeVisible();
  // Table cells specifically — the distribution chart above repeats the
  // same leader's name and value as its own bar label.
  const table = page.locator('.cl-chamfer--control');
  await expect(table.getByText('Talleres', { exact: true })).toBeVisible();
  // A low-priority column's value is listed twice (the cell, and the row's phone disclosure,
  // which is out of the way on a wide screen), so assert on the table cells.
  await expect(table.getByRole('cell', { name: '9', exact: true })).toBeVisible();
  await expect(table.getByRole('cell', { name: '4.00', exact: true })).toBeVisible();

  // Switching tabs reads a different declared layout, including a composite
  // fraction cell no group-standings column ever produces.
  await page.getByRole('tab', { name: 'Top Scorers' }).click();
  await expect(table.getByText('Goleador Uno', { exact: true })).toBeVisible();
  await expect(table.getByRole('cell', { name: '4/5', exact: true })).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Exportar CSV' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe(`${TOURNAMENT_ALIAS}-top-scorers.csv`);
  const csvPath = await download.path();
  expect(csvPath).toBeTruthy();
});
