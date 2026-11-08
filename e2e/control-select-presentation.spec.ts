import { expect, test, type Page } from '@playwright/test';

const ZONES_PATH = '/control/liga-mendocina/tournaments/apertura-2026/stages/1/zones';

/** A stage that already holds fixtures, so every zone select renders disabled. */
async function mockSeededStage(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const payload = btoa(JSON.stringify({ scp: 'copalibre.control' }));
    window.sessionStorage.setItem(
      'copalibre:session:v1',
      JSON.stringify({
        token: `header.${payload}.signature`,
        expiresAtMs: Date.now() + 3600 * 1000,
      }),
    );

    const stageId = '01935bd3-7b4a-7a19-9c20-5a1a44600003';
    window.fetch = async (input) => {
      const url = String(input).split('?')[0] ?? '';
      if (String(input).includes('/api/organizations?mine=true')) {
        return Response.json([
          {
            organizationId: 'org-1',
            organizationAlias: 'liga-mendocina',
            organizationName: 'Liga Mendocina',
            role: 'admin',
          },
        ]);
      }
      if (url.endsWith('/stages/1/zones')) {
        return Response.json([
          {
            zoneId: '01935bd3-7b4a-7a19-9c20-5a1a44600004',
            stageId,
            number: 1,
            name: 'Zona 1',
            effectiveFormat: 'single-elimination',
            series: { span: 3, resolutionClass: 'best-of' },
          },
        ]);
      }
      if (url.endsWith('/stages')) {
        return Response.json([
          {
            stageId,
            number: 1,
            name: 'Fase 1',
            format: 'single-elimination',
            availableFormats: ['single-elimination', 'round-robin'],
            seeded: true,
          },
        ]);
      }
      if (url.endsWith('/api/organizations/liga-mendocina')) {
        return Response.json({
          organizationId: 'org-1',
          alias: 'liga-mendocina',
          name: 'Liga Mendocina',
        });
      }
      return Response.json([]);
    };
  });
}

test('a disabled select with a long value keeps the control height in Zones', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockSeededStage(page);
  await page.goto(ZONES_PATH);

  await page.getByText('Cambiar el formato de la zona').click();
  const disabledSelects = page.locator('main button.cl-select[disabled]');
  await expect(disabledSelects.first()).toBeVisible();

  const heights = await disabledSelects.evaluateAll((triggers) =>
    triggers.map((trigger) => trigger.getBoundingClientRect().height),
  );
  expect(heights.length).toBeGreaterThan(0);
  expect(new Set(heights)).toEqual(new Set([44]));
});

test('a select value sits at the start of the control, as an input value does', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockSeededStage(page);
  await page.goto(ZONES_PATH);

  const trigger = page.locator('main button.cl-select:not([disabled])').first();
  await expect(trigger).toBeVisible();
  const offset = await trigger.evaluate((element) => {
    const value = element.querySelector('.cl-select__value');
    return (value?.getBoundingClientRect().left ?? 0) - element.getBoundingClientRect().left;
  });
  // The 1px border plus the 12px control padding, and nothing centring it further.
  expect(offset).toBe(13);
});
