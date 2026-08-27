import { expect, test, type Page } from '@playwright/test';
import { loginCallbackUrl, seedLoginTransaction, TOKEN_ENDPOINT } from './support/control-login.js';

interface CapturedRequest {
  readonly url: string;
  readonly method: string;
  readonly body?: unknown;
}

const disciplineFixture = [
  {
    descriptorId: 'football.default',
    version: '1.0.0',
    name: 'Futbol',
    supportedFormats: ['round-robin'],
  },
];

const hookVocabularyFixture = {
  hooks: ['event.recorded'],
  entries: [
    {
      kind: 'action',
      type: 'notify',
      description: 'Declare notification',
      authoring: {
        parameters: [
          {
            name: 'title',
            description: 'Notification title',
            required: true,
            parameterTypes: ['simple_string'],
            allowExpression: true,
            valueSchema: { type: 'string', minLength: 1 },
          },
          {
            name: 'message',
            description: 'Notification message',
            required: true,
            parameterTypes: ['simple_string'],
            allowExpression: true,
            valueSchema: { type: 'string', minLength: 1 },
          },
        ],
      },
    },
  ],
};

const registrationsFixture = [
  {
    entrantId: 'entrant-001',
    tournamentId: 'tournament-001',
    status: 'pending',
    teamId: 'Deportivo Norte',
  },
  {
    entrantId: 'entrant-002',
    tournamentId: 'tournament-001',
    status: 'pending',
    teamId: 'Atlético Sur',
  },
];

async function mockControlApi(
  page: Page,
  options: {
    readonly createRefusal?: string;
    readonly updateRefusal?: string;
    readonly seedTournament?: boolean;
  } = {},
): Promise<void> {
  await page.addInitScript(
    ({
      disciplines,
      hookVocabulary,
      registrations,
      tokenEndpoint,
      createRefusal,
      updateRefusal,
      seedTournament,
    }) => {
      const captured: CapturedRequest[] = [];
      Object.assign(window, { __controlRequests: captured });
      // Stateful across requests within this test: the dashboard's real
      // tournament list reads back whatever the wizard just created.
      const createdTournaments: unknown[] = seedTournament
        ? [
            {
              tournamentId: 'tournament-001',
              organizationId: 'org-liga-mendocina',
              alias: 'apertura-2026',
              name: 'Apertura 2026',
              rulesetId: 'ruleset-001',
              status: 'published',
            },
          ]
        : [];

      window.fetch = async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
        captured.push({ url, method, ...(body === undefined ? {} : { body }) });

        if (url === tokenEndpoint) {
          return Response.json({ access_token: 'e2e-access-token', expires_in: 3600 });
        }

        if (url === '/disciplines') {
          return Response.json(disciplines);
        }

        if (url === '/organizations/liga-mendocina/tournaments/custom-script-vocabulary') {
          return Response.json(hookVocabulary);
        }

        if (url === '/organizations/liga-mendocina/tournaments' && method === 'GET') {
          return Response.json(createdTournaments);
        }

        if (url === '/organizations/liga-mendocina/tournaments' && method === 'POST') {
          if (createRefusal) {
            return Response.json({ message: createRefusal }, { status: 400 });
          }
          const created = {
            tournamentId: 'tournament-002',
            organizationId: 'org-liga-mendocina',
            alias: (body as { alias?: string })?.alias ?? 'apertura-local',
            name: (body as { name?: string })?.name ?? 'Apertura Local',
            rulesetId: 'ruleset-002',
            status: 'draft',
          };
          createdTournaments.push(created);
          return Response.json(created);
        }

        if (
          url === '/organizations/liga-mendocina/tournaments/apertura-2026/custom-scripts' &&
          method === 'PUT'
        ) {
          return Response.json(
            { message: updateRefusal ?? 'Custom scripts updated' },
            { status: updateRefusal ? 409 : 200 },
          );
        }

        if (
          url === '/organizations/liga-mendocina/tournaments/apertura-2026/export' &&
          method === 'GET'
        ) {
          return Response.json({
            kind: 'copalibre-tournament-configuration',
            schemaVersion: '1.0.0',
            tournament: {
              alias: 'apertura-2026',
              name: 'Apertura 2026',
              status: 'published',
              disciplineRef: { descriptorId: 'football.default', version: '1.0.0' },
            },
            ruleset: { version: 1, rawOverrides: {}, customScripts: [], effective: {} },
            seasons: [],
          });
        }

        if (
          url ===
          '/organizations/liga-mendocina/tournaments/apertura-local/registrations?status=pending'
        ) {
          return Response.json([]);
        }

        if (
          url ===
          '/organizations/liga-mendocina/tournaments/apertura-2026/registrations?status=pending'
        ) {
          return Response.json(registrations);
        }

        if (url === '/organizations/liga-mendocina/tournaments/apertura-2026/registrations') {
          return Response.json(registrations);
        }

        if (
          url ===
          '/organizations/liga-mendocina/tournaments/apertura-2026/registrations/entrant-001/review'
        ) {
          return Response.json({ ...registrations[0], status: 'withdrawn' });
        }

        if (
          url ===
          '/organizations/liga-mendocina/tournaments/apertura-2026/registrations/bulk-review'
        ) {
          return Response.json({
            applied: registrations.map((row) => ({ ...row, status: 'accepted' })),
            refused: [],
          });
        }

        return new Response('Not found', { status: 404 });
      };
    },
    {
      disciplines: disciplineFixture,
      hookVocabulary: hookVocabularyFixture,
      registrations: registrationsFixture,
      tokenEndpoint: TOKEN_ENDPOINT,
      createRefusal: options.createRefusal,
      updateRefusal: options.updateRefusal,
      seedTournament: options.seedTournament,
    },
  );
}

test('downloads tournament configuration JSON from the dashboard', async ({ page }) => {
  await mockControlApi(page, { seedTournament: true });
  const target = '/control/liga-mendocina';
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  await expect(page.getByText('Apertura 2026')).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar configuración JSON' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('apertura-2026-configuration.json');
  await expect
    .poll(() => capturedRequests(page))
    .toContainEqual(
      expect.objectContaining({
        url: '/organizations/liga-mendocina/tournaments/apertura-2026/export',
        method: 'GET',
      }),
    );
});

async function capturedRequests(page: Page): Promise<readonly CapturedRequest[]> {
  return page.evaluate(() => {
    const state = window as typeof window & { readonly __controlRequests?: CapturedRequest[] };
    return state.__controlRequests ?? [];
  });
}

test('creates a tournament from the control authoring wizard', async ({ page }) => {
  await mockControlApi(page);
  const target = '/control/liga-mendocina/tournaments/new';
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  await page.getByLabel('Nombre').fill('Apertura Local');
  await page.getByLabel('Alias').fill('apertura-local');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByLabel('Agregar regla para cada evento registrado').check();
  await page.getByLabel('Acción').selectOption('notify');
  await page.getByLabel('Notification title *').fill('Actualización del partido');
  await page.getByLabel('Notification message *').fill('{{ event.definitionCode }}');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByLabel('Región').fill('Mendoza');
  await page.getByLabel('Capacidad').fill('16');
  await page.getByLabel('Registro público abierto').check();
  await page.getByLabel('Requiere check-in').check();
  await page.getByRole('button', { name: 'Crear torneo' }).click();

  await expect(page.getByText('Torneo creado: apertura-local')).toBeVisible();
  await expect
    .poll(() => capturedRequests(page))
    .toContainEqual(
      expect.objectContaining({
        url: '/organizations/liga-mendocina/tournaments',
        method: 'POST',
        body: expect.objectContaining({
          alias: 'apertura-local',
          name: 'Apertura Local',
          descriptorId: 'football.default',
          descriptorVersion: '1.0.0',
          format: 'round-robin',
          publicRegistration: true,
          requiresCheckIn: true,
          region: 'Mendoza',
          capacity: 16,
          customScripts: [
            expect.objectContaining({
              hook: 'event.recorded',
              script: expect.objectContaining({
                rules: [
                  expect.objectContaining({
                    conditions: [],
                    actions: [expect.objectContaining({ type: 'notify' })],
                  }),
                ],
              }),
            }),
          ],
        }),
      }),
    );

  // The dashboard's tournament list is real data now, not sample
  // data — the tournament this test just created through the real write
  // path shows up on it. Client-side navigation (no reload) keeps the
  // in-memory session.
  await page.getByRole('link', { name: 'Panel' }).click();
  await page.waitForURL('**/control/liga-mendocina');
  await expect(page.getByText('Apertura Local')).toBeVisible();
});

test('completes tournament authoring via keyboard and without overflow at 375px', async ({
  page,
}) => {
  await mockControlApi(page);
  await page.setViewportSize({ width: 375, height: 800 });

  const target = '/control/liga-mendocina/tournaments/new';
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  // Assert no body horizontal overflow on initial step
  const overflowStep1 = await page.evaluate(
    () => document.body.scrollWidth <= document.documentElement.clientWidth,
  );
  expect(overflowStep1).toBe(true);

  // Fill Step 1 (name & alias)
  await page.getByLabel('Nombre').fill('Copa Teclado');
  await page.getByLabel('Alias').fill('copa-teclado');
  await page.getByRole('button', { name: 'Continuar' }).click();

  // Step 2 (discipline)
  await expect(page.getByLabel('Disciplina')).toBeVisible();
  await page.getByRole('button', { name: 'Continuar' }).click();

  // Step 3 (format & profile)
  await expect(page.getByLabel('Formato')).toBeVisible();
  await page.getByRole('button', { name: 'Continuar' }).click();

  // Step 4 (rules)
  await expect(page.getByLabel('Agregar regla para cada evento registrado')).toBeVisible();
  await page.getByRole('button', { name: 'Continuar' }).click();

  // Step 5 (window)
  await page.getByLabel('Región').fill('Mendoza');
  await page.getByLabel('Capacidad').fill('8');
  await page.getByRole('button', { name: 'Crear torneo' }).click();

  await expect(page.getByText('Torneo creado: copa-teclado')).toBeVisible();

  // Assert no body horizontal overflow after completion
  const overflowFinal = await page.evaluate(
    () => document.body.scrollWidth <= document.documentElement.clientWidth,
  );
  expect(overflowFinal).toBe(true);
});

test('shows a named backend rule refusal without replacing it with a generic error', async ({
  page,
}) => {
  const refusal = 'Action "stale-action" is not registered for event.recorded';
  await mockControlApi(page, { createRefusal: refusal });
  const target = '/control/liga-mendocina/tournaments/new';
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  await page.getByLabel('Nombre').fill('Copa Regla Inválida');
  await page.getByLabel('Alias').fill('copa-regla-invalida');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByLabel('Agregar regla para cada evento registrado').check();
  await page.getByLabel('Acción').selectOption('notify');
  await page.getByLabel('Notification title *').fill('Actualización');
  await page.getByLabel('Notification message *').fill('Evento');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Crear torneo' }).click();

  await expect(page.getByText(refusal)).toBeVisible();
});

test('blocks a custom-script edit after a qualifying result', async ({ page }) => {
  const refusal = 'Custom scripts cannot change after tournament results exist';
  await mockControlApi(page, { updateRefusal: refusal });
  const target = '/control/liga-mendocina';
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  const response = await page.evaluate(async () => {
    const result = await fetch(
      '/organizations/liga-mendocina/tournaments/apertura-2026/custom-scripts',
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ customScripts: [] }),
      },
    );
    return { status: result.status, body: (await result.json()) as { message: string } };
  });

  expect(response).toEqual({ status: 409, body: { message: refusal } });
  await expect
    .poll(() => capturedRequests(page))
    .toContainEqual(
      expect.objectContaining({
        url: '/organizations/liga-mendocina/tournaments/apertura-2026/custom-scripts',
        method: 'PUT',
        body: { customScripts: [] },
      }),
    );
});

test('bulk-approves visible registrations from the review queue', async ({ page }) => {
  await mockControlApi(page);
  const target = '/control/liga-mendocina/tournaments/apertura-2026/registrations';
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  await expect(page.getByText('Deportivo Norte').first()).toBeVisible();
  await expect(page.getByText('Atlético Sur').first()).toBeVisible();
  await page.getByLabel('Seleccionar visibles').check();
  await page.getByRole('button', { name: 'Aprobar' }).click();

  await expect(page.getByText('Aceptada')).toHaveCount(2);
  await expect
    .poll(() => capturedRequests(page))
    .toContainEqual(
      expect.objectContaining({
        url: '/organizations/liga-mendocina/tournaments/apertura-2026/registrations/bulk-review',
        method: 'POST',
        body: {
          entrantIds: ['entrant-001', 'entrant-002'],
          decision: 'accepted',
        },
      }),
    );
});

test('revokes an expanded registration from the review queue', async ({ page }) => {
  await mockControlApi(page);
  const target = '/control/liga-mendocina/tournaments/apertura-2026/registrations';
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  await page.locator('summary').filter({ hasText: 'Deportivo Norte' }).click();
  const expandedRegistration = page.locator('details[open]');
  await expect(expandedRegistration.getByText('Miembros del equipo')).toBeVisible();
  await expect(expandedRegistration.getByRole('button', { name: 'Editar miembros' })).toBeEnabled();
  await expect(page.locator('body')).not.toContainText(/roster/i);
  await page.getByRole('button', { name: 'Revocar' }).click();

  await expect(page.getByText('Retirada')).toBeVisible();
  await expect
    .poll(() => capturedRequests(page))
    .toContainEqual(
      expect.objectContaining({
        url: '/organizations/liga-mendocina/tournaments/apertura-2026/registrations/entrant-001/review',
        method: 'POST',
        body: {
          decision: 'withdrawn',
          reason: 'Revoked from registration review',
        },
      }),
    );
});
