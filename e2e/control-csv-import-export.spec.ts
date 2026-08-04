import { expect, test } from '@playwright/test';

const registrations = [
  { entrantId: 'entrant-1', tournamentId: 't-1', status: 'pending', teamId: 'Alpha' },
];

async function mockImportApi(page: import('@playwright/test').Page, valid: boolean): Promise<void> {
  await page.addInitScript(
    ({ valid, registrations }) => {
      window.fetch = async (input, init) => {
        const url = String(input);
        if (url.endsWith('/registrations')) return Response.json(registrations);
        if (url.endsWith('/imports') && init?.method === 'POST') {
          return Response.json({
            importId: 'import-1',
            target: 'team',
            status: 'queued',
            sourceHash: 'hash-1',
          });
        }
        if (url.endsWith('/imports/import-1') && init?.method !== 'POST') {
          return Response.json({
            importId: 'import-1',
            target: 'team',
            status: valid ? 'review-ready' : 'invalid',
            sourceHash: 'hash-1',
            preview: valid
              ? { valid: true, rows: [], errors: [] }
              : {
                  valid: false,
                  rows: [{ rowNumber: 2, errors: [{ message: 'name is required' }] }],
                  errors: [],
                },
          });
        }
        if (url.endsWith('/imports/import-1/commit'))
          return Response.json({
            importId: 'import-1',
            target: 'team',
            status: 'committed',
            sourceHash: 'hash-1',
          });
        return new Response('Not found', { status: 404 });
      };
    },
    { valid, registrations },
  );
}

test('uploads, reviews and confirms a valid participant CSV', async ({ page }) => {
  await mockImportApi(page, true);
  await page.goto('/control/liga-mendocina/tournaments/apertura-2026/registrations');
  await page.getByLabel('CSV de participantes').setInputFiles({
    name: 'teams.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('alias,name\nalpha,Alpha\n'),
  });
  await expect(page.getByText('Preview válido.')).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar importación' }).click();
  await expect(page.getByText('Importación confirmada.')).toBeVisible();
});

test('shows row errors and cannot confirm an invalid participant CSV', async ({ page }) => {
  await mockImportApi(page, false);
  await page.goto('/control/liga-mendocina/tournaments/apertura-2026/registrations');
  await page.getByLabel('CSV de participantes').setInputFiles({
    name: 'teams.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('alias,name\nalpha,\n'),
  });
  await expect(page.getByText('Fila 2: name is required')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirmar importación' })).toBeDisabled();
});

test('re-import flow accepts participant CSV exported by CopaLibre', async ({ page }) => {
  await mockImportApi(page, true);
  await page.goto('/control/liga-mendocina/tournaments/apertura-2026/registrations');
  await page.getByLabel('CSV de participantes').setInputFiles({
    name: 'exported-teams.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('alias,name\nalpha,Alpha\n'),
  });
  await expect(page.getByText('Preview válido.')).toBeVisible();
});
