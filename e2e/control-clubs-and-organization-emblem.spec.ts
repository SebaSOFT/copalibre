import { expect, test } from '@playwright/test';
import { loginCallbackUrl, seedLoginTransaction, TOKEN_ENDPOINT } from './support/control-login.js';

/**
 * 0109 task 6.1: sign in, create a club from the new club-management
 * screen, upload its emblem, then upload the organization's own emblem
 * from the preferences screen, confirming both leave the placeholder and
 * show an `<img>` in its place.
 */

const ORG_ALIAS = 'liga-mendocina';

interface ClubRecord {
  readonly clubId: string;
  readonly organizationId: string;
  readonly name: string;
  readonly alias?: string;
  readonly abbreviation?: string;
  emblemObjectId?: string;
}

let clubs: ClubRecord[] = [];
let organizationEmblemObjectId: string | undefined;
let nextClubId = 1;

async function mockControlApi(page: import('@playwright/test').Page): Promise<void> {
  clubs = [];
  organizationEmblemObjectId = undefined;
  nextClubId = 1;

  await page.addInitScript(
    ({ tokenEndpoint, orgAlias }) => {
      window.fetch = async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';

        if (url === tokenEndpoint) {
          return Response.json({ access_token: 'e2e-access-token', expires_in: 3600 });
        }

        if (url === `/organizations/${orgAlias}` && method === 'GET') {
          const org = await (
            window as unknown as { __organization: () => Promise<unknown> }
          ).__organization();
          return Response.json(org);
        }
        if (url === `/organizations/${orgAlias}/emblem` && method === 'POST') {
          const body = JSON.parse(String(init?.body)) as { filename: string };
          const created = await (
            window as unknown as { __uploadOrgEmblem: (filename: string) => Promise<unknown> }
          ).__uploadOrgEmblem(body.filename);
          return Response.json(created);
        }

        if (url === `/organizations/${orgAlias}/clubs` && method === 'GET') {
          const listed = await (window as unknown as { __clubs: () => Promise<unknown> }).__clubs();
          return Response.json(listed);
        }
        if (url === `/organizations/${orgAlias}/clubs` && method === 'POST') {
          const body = JSON.parse(String(init?.body)) as { name: string };
          const created = await (
            window as unknown as { __createClub: (name: string) => Promise<unknown> }
          ).__createClub(body.name);
          return Response.json(created);
        }
        const emblemMatch = /\/clubs\/([^/]+)\/emblem$/.exec(url);
        if (emblemMatch && method === 'POST') {
          const clubId = emblemMatch[1] ?? '';
          const body = JSON.parse(String(init?.body)) as { filename: string };
          const created = await (
            window as unknown as {
              __uploadClubEmblem: (clubId: string, filename: string) => Promise<unknown>;
            }
          ).__uploadClubEmblem(clubId, body.filename);
          return Response.json(created);
        }

        return new Response('Not found', { status: 404 });
      };
    },
    { tokenEndpoint: TOKEN_ENDPOINT, orgAlias: ORG_ALIAS },
  );

  await page.exposeFunction('__organization', () => ({
    organizationId: 'org-1',
    alias: ORG_ALIAS,
    name: 'Liga Mendocina',
    primaryLanguage: 'es',
    timezone: 'America/Argentina/San_Juan',
    ...(organizationEmblemObjectId === undefined
      ? {}
      : { emblemObjectId: organizationEmblemObjectId }),
  }));
  await page.exposeFunction('__uploadOrgEmblem', () => {
    organizationEmblemObjectId = 'object-org-emblem';
    return { objectId: organizationEmblemObjectId };
  });
  await page.exposeFunction('__clubs', () => clubs);
  await page.exposeFunction('__createClub', (name: string) => {
    const created: ClubRecord = { clubId: `club-${nextClubId}`, organizationId: 'org-1', name };
    nextClubId += 1;
    clubs = [...clubs, created];
    return created;
  });
  await page.exposeFunction('__uploadClubEmblem', (clubId: string) => {
    const objectId = `object-${clubId}-emblem`;
    clubs = clubs.map((club) =>
      club.clubId === clubId ? { ...club, emblemObjectId: objectId } : club,
    );
    return { objectId };
  });
}

test('creates a club, uploads its emblem, then uploads the organization emblem', async ({
  page,
}) => {
  await mockControlApi(page);

  const clubsTarget = `/control/${ORG_ALIAS}/clubs`;
  await seedLoginTransaction(page, clubsTarget);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${clubsTarget}`);

  await expect(page.getByText('Esta organización todavía no tiene clubes.')).toBeVisible();

  await page.getByLabel('Nombre del club nuevo').fill('Casa de Italia');
  await page.getByText('Agregar club').click();
  await expect(page.getByText('Club creado.')).toBeVisible();
  await expect(page.getByText('Casa de Italia')).toBeVisible();

  await page.getByText('Editar').click();
  await page.getByLabel('Subir escudo').setInputFiles({
    name: 'emblem.png',
    mimeType: 'image/png',
    buffer: Buffer.from('fake-emblem-bytes'),
  });
  await expect(page.getByText('Escudo subido.')).toBeVisible();
  await expect(page.getByAltText('Escudo de Casa de Italia').first()).toBeVisible();

  const preferencesTarget = `/control/${ORG_ALIAS}/preferences`;
  await seedLoginTransaction(page, preferencesTarget);
  await page.goto(loginCallbackUrl()).catch((error: Error) => {
    if (!error.message.includes('is interrupted by another navigation')) throw error;
  });
  await page.waitForURL(`**${preferencesTarget}`);

  await expect(page.getByRole('img', { name: 'Sin escudo cargado' })).toBeVisible();
  await page.getByLabel('Subir escudo').setInputFiles({
    name: 'org-emblem.png',
    mimeType: 'image/png',
    buffer: Buffer.from('fake-org-emblem-bytes'),
  });
  await expect(page.getByText('Escudo subido.')).toBeVisible();
  // The notice appears as soon as the upload resolves; the emblem `<img>`
  // only appears once the route's own follow-up reload completes — a
  // second round trip, so this needs more than the default timeout under
  // parallel load.
  await expect(page.getByAltText('Escudo de la organización')).toBeVisible({ timeout: 10000 });
});
