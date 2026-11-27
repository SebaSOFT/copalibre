import { expect, test, type Page } from './csp-guard.js';
import { loginCallbackUrl, seedLoginTransaction, TOKEN_ENDPOINT } from './support/control-login.js';

const ORG_ALIAS = 'liga-mendocina';
const TARGET = `/control/${ORG_ALIAS}/analytics`;

async function openAnalytics(page: Page): Promise<void> {
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    const path = new URL(url).pathname;
    if (url === TOKEN_ENDPOINT) {
      return route.fulfill({ json: { access_token: 'analytics-e2e-token', expires_in: 3600 } });
    }
    if (path === `/api/organizations/${ORG_ALIAS}/tournaments`) {
      return route.fulfill({
        json: [
          {
            tournamentId: 't-1',
            organizationId: 'org-1',
            alias: 'apertura',
            name: 'Apertura',
            status: 'started',
          },
          {
            tournamentId: 't-2',
            organizationId: 'org-1',
            alias: 'clausura',
            name: 'Clausura',
            status: 'started',
          },
          {
            tournamentId: 't-3',
            organizationId: 'org-1',
            alias: 'copa',
            name: 'Copa',
            status: 'finished',
          },
          {
            tournamentId: 't-4',
            organizationId: 'org-1',
            alias: 'juvenil',
            name: 'Juvenil',
            status: 'published',
          },
        ],
      });
    }
    if (path === `/api/organizations/${ORG_ALIAS}/storage-usage`) {
      return route.fulfill({ json: { totalBytes: 0, objectCount: 0 } });
    }
    if (
      path.startsWith(`/api/organizations/${ORG_ALIAS}/tournaments/`) &&
      path.endsWith('/completion')
    ) {
      return route.fulfill({ json: { totalMatches: 0, resolvedMatches: 0, liveMatches: 0 } });
    }
    if (path.startsWith('/api/organizations/')) return route.fulfill({ json: [] });
    return route.continue();
  });

  await seedLoginTransaction(page, TARGET);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${TARGET}`);
  await expect(
    page.getByRole('region', { name: 'Distribución de torneos por estado' }),
  ).toBeVisible();
}

test('analytics chart legend and table toggle show the same status values in Spanish', async ({
  page,
}) => {
  await openAnalytics(page);

  await expect(page.locator('.cl-badge--live')).toHaveCount(0);

  const legend = page.getByRole('list', { name: 'Leyenda' });
  const legendItems = legend.getByRole('listitem');
  await expect(legendItems).toHaveCount(5);
  await expect(legendItems.nth(0)).toContainText('En curso');
  await expect(legendItems.nth(1)).toContainText('Próximo');
  await expect(legendItems.nth(2)).toContainText('Finalizado');
  const chartRows = page.getByRole('list', { name: 'Distribución de torneos por estado' });
  await expect(chartRows.getByRole('listitem')).toHaveCount(5);
  await expect(chartRows.getByRole('listitem').nth(0)).toContainText('2');
  await expect(chartRows.getByRole('listitem').nth(1)).toContainText('1');
  await expect(chartRows.getByRole('listitem').nth(2)).toContainText('1');

  await page.getByRole('button', { name: 'Mostrar como tabla' }).click();
  const table = page
    .getByRole('region', { name: 'Distribución de torneos por estado: Mostrar como tabla' })
    .getByRole('table');
  await expect(table).toBeVisible();
  for (const [label, value] of [
    ['En curso', '2'],
    ['Próximo', '1'],
    ['Finalizado', '1'],
  ]) {
    const row = table.getByRole('row', { name: new RegExp(`${label}\\s+${value}`) });
    await expect(row).toBeVisible();
  }
});

test('analytics exports the tournament overview as a CSV file in Spanish', async ({ page }) => {
  await openAnalytics(page);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Exportar CSV' }).click(),
  ]);

  expect(download.suggestedFilename()).toBe(`${ORG_ALIAS}-tournaments.csv`);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Uint8Array));
  // The file opens with a byte-order mark so a spreadsheet reads the accents as UTF-8.
  const bytes = Buffer.concat(chunks);
  expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  const text = bytes.subarray(3).toString('utf8');
  expect(text.trimEnd().split('\n')).toEqual([
    'Torneo,Estado,Progreso de partidos,Partidos en vivo',
    'Apertura,En curso,0 / 0 partidos,0',
    'Clausura,En curso,0 / 0 partidos,0',
    'Copa,Finalizado,0 / 0 partidos,0',
    'Juvenil,Próximo,0 / 0 partidos,0',
  ]);
});
