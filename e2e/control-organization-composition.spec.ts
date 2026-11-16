import { expect, test, type Page } from './csp-guard.js';
import { loginCallbackUrl, seedLoginTransaction, TOKEN_ENDPOINT } from './support/control-login.js';

/**
 * The organization screen, in Spanish: the form starts where the card's heading starts at the
 * widths Control is used at, the settings the API updates sit together, and a role without settings
 * authority is offered nothing it cannot use.
 */

const ORG_ALIAS = 'liga-mendocina';
const TARGET = `/control/${ORG_ALIAS}/organization`;

async function mockOrganizationApi(page: Page, role: 'admin' | 'referee'): Promise<void> {
  await page.addInitScript(
    ({ tokenEndpoint, orgAlias, memberRole }) => {
      const originalFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';

        if (url === tokenEndpoint) {
          return Response.json({ access_token: 'e2e-access-token', expires_in: 3600 });
        }
        if (url === '/api/organizations?mine=true' && method === 'GET') {
          return Response.json([
            {
              organizationId: 'org-1',
              organizationAlias: orgAlias,
              organizationName: 'Liga Mendocina',
              timezone: 'America/Argentina/San_Juan',
              role: memberRole,
            },
          ]);
        }
        if (url === `/api/organizations/${orgAlias}` && method === 'GET') {
          return Response.json({
            organizationId: 'org-1',
            alias: orgAlias,
            name: 'Liga Mendocina',
            primaryLanguage: 'es',
            timezone: 'America/Argentina/San_Juan',
          });
        }
        if (url === `/api/organizations/${orgAlias}/storage-usage` && method === 'GET') {
          return Response.json({ totalBytes: 0, objectCount: 0 });
        }
        if (url === `/api/organizations/${orgAlias}/storage-usage/objects` && method === 'GET') {
          return Response.json([]);
        }
        if (url === '/api/auth/pat/scopes' && method === 'GET') {
          return Response.json({ scopes: ['copalibre.control'] });
        }
        if (url === '/api/auth/pat' && method === 'GET') return Response.json([]);

        return originalFetch(input, init);
      };
    },
    { tokenEndpoint: TOKEN_ENDPOINT, orgAlias: ORG_ALIAS, memberRole: role },
  );
}

async function openOrganization(page: Page, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  await seedLoginTransaction(page, TARGET);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${TARGET}`);
}

for (const width of [1440, 768]) {
  test(`the organization form starts on its heading's left edge at ${width}px`, async ({
    page,
  }) => {
    await mockOrganizationApi(page, 'admin');
    await openOrganization(page, width);

    const heading = page.getByRole('heading', { name: 'Identidad de la organización' });
    await expect(heading).toBeVisible();
    // Each field is measured by its own wrapper: the visible control of a select is not the
    // hidden native element that carries its id.
    const fieldOf = (id: string) => page.locator('.cl-form-field', { has: page.locator(`#${id}`) });
    const name = fieldOf('org-name');
    const language = fieldOf('org-language');
    const timeZone = fieldOf('org-timezone');
    await expect(name).toBeVisible();
    await expect(language).toBeVisible();
    await expect(timeZone).toBeVisible();

    const [headingBox, nameBox, languageBox, timeZoneBox] = await Promise.all([
      heading.boundingBox(),
      name.boundingBox(),
      language.boundingBox(),
      timeZone.boundingBox(),
    ]);
    expect(headingBox).not.toBeNull();
    expect(nameBox).not.toBeNull();
    // The first field of the form is on the heading's left edge, not floating inside the card.
    expect(Math.abs((nameBox?.x ?? 0) - (headingBox?.x ?? 0))).toBeLessThanOrEqual(1);
    // Language and time zone sit beside the name, in one row, left to right.
    expect(Math.abs((languageBox?.y ?? 0) - (nameBox?.y ?? 0))).toBeLessThanOrEqual(1);
    expect(Math.abs((timeZoneBox?.y ?? 0) - (nameBox?.y ?? 0))).toBeLessThanOrEqual(1);
    expect(languageBox?.x ?? 0).toBeGreaterThan((nameBox?.x ?? 0) + (nameBox?.width ?? 0) - 1);
    expect(timeZoneBox?.x ?? 0).toBeGreaterThan(
      (languageBox?.x ?? 0) + (languageBox?.width ?? 0) - 1,
    );

    // Identity leads the page; the theme control belongs to the personal page.
    await expect(page.getByLabel('Tema', { exact: true })).toHaveCount(0);
    expect(
      await page
        .getByRole('heading', { level: 2 })
        .evaluateAll((items) => items.map((item) => item.textContent)),
    ).toEqual([
      'Identidad de la organización',
      'Uso de almacenamiento',
      'Reconstrucción de estadísticas',
      'Tokens de acceso personal',
    ]);
  });
}

test('a role without settings authority is offered no editable form and is told who can', async ({
  page,
}) => {
  await mockOrganizationApi(page, 'referee');
  await openOrganization(page, 1440);

  await expect(page.getByRole('heading', { name: 'Identidad de la organización' })).toBeVisible();
  await expect(page.getByText('Solo el rol Admin puede editar estos datos.')).toBeVisible();
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Subir escudo')).toHaveCount(0);
  await expect(page.getByText('Solo el rol Admin puede usar esta sección.')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Reconstruir estadísticas' })).toHaveCount(0);
});

test('the personal page offers the theme and the tokens, and nothing of the organization', async ({
  page,
}) => {
  await mockOrganizationApi(page, 'admin');
  const personal = `/control/${ORG_ALIAS}/preferences`;
  await seedLoginTransaction(page, personal);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${personal}`);

  await expect(page.getByRole('heading', { name: 'Apariencia' })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Tokens de acceso personal', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Identidad de la organización' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Uso de almacenamiento' })).toHaveCount(0);
});
