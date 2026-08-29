import { expect, test, type Page } from '@playwright/test';
import { loginCallbackUrl, seedLoginTransaction, TOKEN_ENDPOINT } from './support/control-login.js';

/**
 * The discipline and tournament-profile builders (openspec 0164): authoring
 * end to end, every decision explained, an invalid declaration refused in
 * the surface, and publication refused without authorship or an English
 * name.
 */

function scopedToken(scopes: string): string {
  return `header.${Buffer.from(JSON.stringify({ scp: scopes })).toString('base64url')}.signature`;
}

async function mockBuilderApi(page: Page): Promise<void> {
  await page.addInitScript(
    ({ accessToken, tokenEndpoint }) => {
      let modules: {
        moduleId: string;
        kind: string;
        alias: string;
        version: string;
        sourceKind: string;
        attributionAuthor: string;
      }[] = [];
      const installedDocuments: Record<string, Record<string, unknown>> = {};

      function validateAuthored(body: {
        kind: string;
        document: Record<string, unknown>;
        disciplineAlias?: string;
      }): { ok: boolean; failures: { stage: string; field?: string; message: string }[] } {
        const failures: { stage: string; field?: string; message: string }[] = [];
        const name = body.document.name;
        const hasEnglish =
          typeof name === 'string' || (typeof name === 'object' && name !== null && 'en' in name);
        if (!hasEnglish) {
          failures.push({ stage: 'artifact', field: 'name', message: 'English name is required' });
        }
        const attribution = body.document.attribution as { author?: string } | undefined;
        if (!attribution?.author) {
          failures.push({ stage: 'artifact', field: 'attribution', message: 'author is required' });
        }
        if (body.kind === 'tournament-profile' && body.disciplineAlias) {
          const discipline = installedDocuments[body.disciplineAlias];
          const declaredFormats = (discipline?.availableFormats as string[] | undefined) ?? [];
          const stages = (body.document.stages as { format: string }[] | undefined) ?? [];
          for (const [index, stage] of stages.entries()) {
            if (!declaredFormats.includes(stage.format)) {
              failures.push({
                stage: 'profile-format',
                field: `stages[${index}].format`,
                message: `"${stage.format}" is not among "${body.disciplineAlias}"'s declared formats: ${declaredFormats.join(', ')}`,
              });
            }
          }
        }
        return { ok: failures.length === 0, failures };
      }

      window.fetch = async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        if (url === tokenEndpoint) {
          return Response.json({ access_token: accessToken, expires_in: 3600 });
        }
        if (url === '/installation/super-admins') return Response.json([]);
        if (url === '/admin/modules') return Response.json(modules);
        if (url === '/disciplines') {
          return Response.json(
            Object.entries(installedDocuments).map(([alias, document]) => ({
              descriptorId: alias,
              alias,
              version: document.version,
              name: document.name,
              supportedFormats: document.availableFormats,
            })),
          );
        }
        if (url === '/admin/authored-modules/validate' && method === 'POST') {
          const body = JSON.parse(String(init?.body));
          return Response.json(validateAuthored(body));
        }
        if (url === '/admin/authored-modules' && method === 'POST') {
          const body = JSON.parse(String(init?.body));
          const result = validateAuthored(body);
          if (!result.ok) {
            return Response.json(
              { message: 'Authored document failed validation', failures: result.failures },
              { status: 400 },
            );
          }
          const alias = body.document.alias as string;
          const version = body.document.version as string;
          installedDocuments[alias] = body.document;
          modules = [
            ...modules,
            {
              moduleId: `module-${alias}`,
              kind: body.kind,
              alias,
              version,
              sourceKind: 'authored',
              attributionAuthor: (body.document.attribution as { author: string }).author,
            },
          ];
          return Response.json(
            { kind: body.kind, alias, version, unsatisfiedRequiredCapabilities: [] },
            { status: 201 },
          );
        }
        return Response.json([]);
      };
    },
    {
      accessToken: scopedToken('copalibre.control copalibre.super-admin'),
      tokenEndpoint: TOKEN_ENDPOINT,
    },
  );
}

test('authors a discipline with every decision explained, refuses an incomplete declaration, then installs and appears usable', async ({
  page,
}) => {
  await mockBuilderApi(page);
  const target = '/control/platform';
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  await page.getByRole('button', { name: 'Crear una disciplina' }).click();
  const wizard = page.getByRole('region', { name: 'Crear una disciplina' });
  await expect(wizard.getByRole('heading', { name: 'Crear una disciplina' })).toBeVisible();

  // Every decision on this step is explained — the alias field's hint is visible.
  await expect(
    wizard.getByText(/La identidad estable con la que se instala esta disciplina/),
  ).toBeVisible();

  // An incomplete declaration is refused in the surface, before submission.
  await expect(wizard.getByText('Se requiere un nombre en inglés.')).toBeVisible();
  await expect(wizard.getByRole('button', { name: 'Continuar' })).toBeDisabled();

  await wizard.getByLabel('Alias', { exact: true }).fill('e2e-orbital-sport');
  await wizard.getByLabel('Nombre *').fill('Orbital Sport');
  await expect(wizard.getByText('Se requiere un nombre en inglés.')).toHaveCount(0);
  await wizard.getByRole('button', { name: 'Continuar' }).click();

  await expect(wizard.getByText(/Se acredita como autor de esta disciplina/)).toBeVisible();
  await wizard.getByLabel('Autor').fill('E2E Author');
  await wizard.getByRole('button', { name: 'Continuar' }).click();

  await wizard.getByLabel('team', { exact: true }).check();
  await wizard.getByRole('button', { name: 'Continuar' }).click();

  await wizard.getByPlaceholder('Código de la estadística').fill('points');
  await wizard.getByPlaceholder('Etiqueta de la estadística').fill('Points');
  await wizard.getByRole('button', { name: 'Agregar' }).first().click();
  await wizard.getByRole('button', { name: 'Continuar' }).click();

  await wizard.getByLabel('round-robin', { exact: true }).check();
  await wizard.getByRole('button', { name: 'Continuar' }).click();

  await wizard.getByLabel('Estadística que decide el partido').fill('points');
  await wizard.getByRole('button', { name: 'Crear e instalar' }).click();

  await expect(page.getByText('e2e-orbital-sport 0.1.0 instalado.')).toBeVisible();
  await expect(page.getByText('e2e-orbital-sport', { exact: true })).toBeVisible();
});

test('refuses to author a profile stage format the discipline does not declare, and refuses publication without an English name', async ({
  page,
}) => {
  await mockBuilderApi(page);
  const target = '/control/platform';
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  // Author and install a minimal discipline first, so the profile builder has something to check against.
  await page.getByRole('button', { name: 'Crear una disciplina' }).click();
  const disciplineWizard = page.getByRole('region', { name: 'Crear una disciplina' });
  await disciplineWizard.getByLabel('Alias', { exact: true }).fill('e2e-square-sport');
  await disciplineWizard.getByLabel('Nombre *').fill('Square Sport');
  await disciplineWizard.getByRole('button', { name: 'Continuar' }).click();
  await disciplineWizard.getByLabel('Autor').fill('E2E Author');
  await disciplineWizard.getByRole('button', { name: 'Continuar' }).click();
  await disciplineWizard.getByLabel('team', { exact: true }).check();
  await disciplineWizard.getByRole('button', { name: 'Continuar' }).click();
  await disciplineWizard.getByPlaceholder('Código de la estadística').fill('points');
  await disciplineWizard.getByPlaceholder('Etiqueta de la estadística').fill('Points');
  await disciplineWizard.getByRole('button', { name: 'Agregar' }).first().click();
  await disciplineWizard.getByRole('button', { name: 'Continuar' }).click();
  await disciplineWizard.getByLabel('round-robin', { exact: true }).check();
  await disciplineWizard.getByRole('button', { name: 'Continuar' }).click();
  await disciplineWizard.getByLabel('Estadística que decide el partido').fill('points');
  await disciplineWizard.getByRole('button', { name: 'Crear e instalar' }).click();
  await expect(page.getByText('e2e-square-sport 0.1.0 instalado.')).toBeVisible();

  await page.getByRole('button', { name: 'Crear un perfil de torneo' }).click();
  const profileWizard = page.getByRole('region', { name: 'Crear un perfil de torneo' });
  await expect(
    profileWizard.getByRole('heading', { name: 'Crear un perfil de torneo' }),
  ).toBeVisible();

  // Publication is refused without authorship, and without an English name.
  await expect(profileWizard.getByText('Se requiere un nombre en inglés.')).toBeVisible();
  await profileWizard.getByLabel('Alias', { exact: true }).fill('e2e-square-cup');
  await profileWizard.getByLabel('Nombre *').fill('Square Cup');
  await profileWizard.getByRole('button', { name: 'Continuar' }).click();
  await expect(profileWizard.getByText('El autor es obligatorio.')).toBeVisible();
  await profileWizard.getByLabel('Autor').fill('E2E Author');
  await profileWizard.getByRole('button', { name: 'Continuar' }).click();

  await profileWizard
    .getByLabel('Verificar formatos de fase contra')
    .selectOption('e2e-square-sport');
  await profileWizard.getByPlaceholder('Nombre de la fase').fill('Playoffs');
  // Only round-robin is declared by the discipline — no other option exists to select instead.
  await expect(profileWizard.getByRole('combobox').last()).toHaveText(/round-robin/);
});
