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

/** The same discipline, also declaring single-elimination — for multi-stage tests. */
const disciplineWithBothFormatsFixture = [
  { ...disciplineFixture[0], supportedFormats: ['round-robin', 'single-elimination'] },
];

/** Declares a field policy (openspec 0161) so the wizard can render the reversibility sentence. */
const disciplineWithFieldPoliciesFixture = [
  {
    descriptorId: 'football.default',
    version: '1.0.0',
    name: 'Futbol',
    supportedFormats: ['round-robin'],
    fieldPolicies: {
      format: { permission: { kind: 'replaced' }, mutationClass: 'blocked_after_results' },
      'registration.capacity': {
        permission: { kind: 'replaced' },
        mutationClass: 'requires_rebuild',
      },
    },
  },
];

/** Declares a non-reserved field with a default (openspec 0265), for the ruleset step. */
const disciplineWithRulesetFieldFixture = [
  {
    descriptorId: 'football.default',
    version: '1.0.0',
    name: 'Futbol',
    supportedFormats: ['round-robin'],
    defaults: { scoring: { pointsPerWin: 3 } },
    fieldPolicies: {
      'scoring.pointsPerWin': {
        permission: { kind: 'replaced' },
        mutationClass: 'blocked_after_results',
      },
    },
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
    readonly disciplines?: typeof disciplineFixture;
    readonly profiles?: readonly unknown[];
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
      profiles,
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

        if (url.startsWith('/tournament-profiles/compatible')) {
          return Response.json(profiles ?? []);
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

        // Proves a stage the wizard declared is a real stage, reachable through
        // the existing per-stage stage-management surface — not just a claim in
        // the POST body.
        const stagesUrlMatch =
          /\/organizations\/liga-mendocina\/tournaments\/([^/]+)\/stages\/(\d+)\/(seeding|configuration|promotion-plans)$/.exec(
            url,
          );
        if (stagesUrlMatch && method === 'GET') {
          if (stagesUrlMatch[3] === 'seeding') {
            return Response.json({
              stageId: `stage-${stagesUrlMatch[2]}`,
              format: 'round-robin',
              seeds: [
                { seed: 1, entrantId: 'Deportivo Norte' },
                { seed: 2, entrantId: 'Atlético Sur' },
              ],
              zones: [],
              hasRecordedResults: false,
            });
          }
          if (stagesUrlMatch[3] === 'configuration') {
            return Response.json({ overrides: {} });
          }
          return Response.json([]);
        }

        return new Response('Not found', { status: 404 });
      };
    },
    {
      disciplines: options.disciplines ?? disciplineFixture,
      hookVocabulary: hookVocabularyFixture,
      registrations: registrationsFixture,
      tokenEndpoint: TOKEN_ENDPOINT,
      createRefusal: options.createRefusal,
      updateRefusal: options.updateRefusal,
      seedTournament: options.seedTournament,
      profiles: options.profiles ?? [],
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
  // The exports moved into the tournament card's own menu (openspec 0211).
  await page.getByRole('button', { name: 'Exportar' }).first().click();
  await page.getByRole('menuitem', { name: 'Exportar configuración JSON' }).click();
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
          stages: [expect.objectContaining({ number: 1, format: 'round-robin' })],
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

test('sets a discipline-declared rule field during creation, beyond format/registration (openspec 0265)', async ({
  page,
}) => {
  await mockControlApi(page, { disciplines: disciplineWithRulesetFieldFixture });
  const target = '/control/liga-mendocina/tournaments/new';
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  await page.getByLabel('Nombre').fill('Copa Reglas');
  await page.getByLabel('Alias').fill('copa-reglas');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();

  // The ruleset step reflects the discipline's own default until touched.
  const pointsPerWinControl = page.getByLabel('Scoring › Points Per Win');
  await expect(pointsPerWinControl).toHaveValue('3');
  await pointsPerWinControl.fill('4');

  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Crear torneo' }).click();

  await expect(page.getByText('Torneo creado: copa-reglas')).toBeVisible();
  await expect
    .poll(() => capturedRequests(page))
    .toContainEqual(
      expect.objectContaining({
        url: '/organizations/liga-mendocina/tournaments',
        method: 'POST',
        body: expect.objectContaining({
          ruleOverrides: { 'scoring.pointsPerWin': 4 },
        }),
      }),
    );
});

test('authors a three-stage tournament with a mix of allocation modes, and every declared stage is reachable afterward', async ({
  page,
}) => {
  await mockControlApi(page, {
    disciplines: disciplineWithBothFormatsFixture,
  });
  const target = '/control/liga-mendocina/tournaments/new';
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  await page.getByLabel('Nombre').fill('Copa Multi Fase');
  await page.getByLabel('Alias').fill('copa-multi-fase');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();

  // Stage 1 (declared by default): automatic seeding, round-robin.
  await page.getByLabel('Sembrado').selectOption('automatic');

  // Stage 2: manual seeding, single-elimination.
  await page.getByRole('button', { name: 'Agregar fase' }).click();
  await page.getByLabel('Nombre de la fase').nth(1).fill('Playoffs');
  await page.getByLabel('Formato de la fase').nth(1).selectOption('single-elimination');
  await page.getByLabel('Sembrado').nth(1).selectOption('manual');

  // Stage 3: weighted seeding on an entrant attribute.
  await page.getByRole('button', { name: 'Agregar fase' }).click();
  await page.getByLabel('Nombre de la fase').nth(2).fill('Gran Final');
  await page.getByLabel('Formato de la fase').nth(2).selectOption('single-elimination');
  await page.getByLabel('Sembrado').nth(2).selectOption('weighted');
  await page.getByLabel('Atributo').fill('rating');

  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Crear torneo' }).click();

  await expect(page.getByText('Torneo creado: copa-multi-fase')).toBeVisible();
  await expect
    .poll(() => capturedRequests(page))
    .toContainEqual(
      expect.objectContaining({
        url: '/organizations/liga-mendocina/tournaments',
        method: 'POST',
        body: expect.objectContaining({
          stages: [
            expect.objectContaining({
              number: 1,
              format: 'round-robin',
              allocation: { mode: 'automatic' },
            }),
            expect.objectContaining({
              number: 2,
              name: 'Playoffs',
              format: 'single-elimination',
              allocation: { mode: 'manual' },
            }),
            expect.objectContaining({
              number: 3,
              name: 'Gran Final',
              format: 'single-elimination',
              allocation: expect.objectContaining({ mode: 'weighted', attributeKey: 'rating' }),
            }),
          ],
        }),
      }),
    );

  // Each declared stage is a real stage, reachable through the existing
  // per-stage stage-management surface (SeedingBuilderPage) — not just a
  // claim in the create request. A fresh login transaction is required: the
  // access token lives only in the page's in-memory session, not storage
  // that survives a full navigation.
  const stage2Target = '/control/liga-mendocina/tournaments/copa-multi-fase/stages/2/seeding';
  await seedLoginTransaction(page, stage2Target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${stage2Target}`);
  await expect(page.getByRole('list', { name: 'Orden de siembra' })).toBeVisible();

  const stage3Target = '/control/liga-mendocina/tournaments/copa-multi-fase/stages/3/seeding';
  await seedLoginTransaction(page, stage3Target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${stage3Target}`);
  await expect(page.getByRole('list', { name: 'Orden de siembra' })).toBeVisible();
});

/**
 * Instantiates a tournament from a profile carrying per-stage allocation
 * defaults (task 5.2's `profile-builder-wizard.test.tsx` proves the other
 * half of this journey — declaring an allocation default and having it land
 * in the authored document — directly against `ProfileBuilderWizard`; this
 * test proves the receiving side, `TournamentSetupWizard`'s read-only
 * preview and verbatim submission, through the real route).
 */
test('instantiates a tournament from a profile, previewing its stages read-only and submitting them verbatim', async ({
  page,
}) => {
  const compatibleProfile = {
    profileId: 'profile-001',
    alias: 'grupos-y-final',
    version: '1.0.0',
    name: 'Grupos y Final',
    stages: [
      { number: 1, name: 'Grupos', format: 'round-robin', allocation: { mode: 'automatic' } },
      {
        number: 2,
        name: 'Final',
        format: 'single-elimination',
        allocation: { mode: 'weighted', attributeKey: 'rating', direction: 'higher-first' },
      },
    ],
  };
  await mockControlApi(page, {
    disciplines: disciplineWithBothFormatsFixture,
    profiles: [compatibleProfile],
  });
  const target = '/control/liga-mendocina/tournaments/new';
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  await page.getByLabel('Nombre').fill('Copa Desde Perfil');
  await page.getByLabel('Alias').fill('copa-desde-perfil');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();

  await page.getByLabel('Perfil de competición').selectOption('profile-001');

  // Read-only preview: both of the profile's own stages are shown, but not editable.
  const stageNames = page.getByLabel('Nombre de la fase');
  await expect(stageNames).toHaveCount(2);
  await expect(stageNames.nth(0)).toHaveValue('Grupos');
  await expect(stageNames.nth(0)).toBeDisabled();
  await expect(stageNames.nth(1)).toHaveValue('Final');
  await expect(stageNames.nth(1)).toBeDisabled();
  await expect(page.getByLabel('Sembrado').nth(0)).toHaveValue('automatic');
  await expect(page.getByLabel('Sembrado').nth(0)).toBeDisabled();
  await expect(page.getByLabel('Sembrado').nth(1)).toHaveValue('weighted');

  // Clearing the profile restores the single editable default stage.
  await page.getByLabel('Perfil de competición').selectOption('');
  await expect(page.getByLabel('Nombre de la fase')).toHaveCount(1);
  await expect(page.getByLabel('Nombre de la fase')).toBeEnabled();

  // Re-select it for submission.
  await page.getByLabel('Perfil de competición').selectOption('profile-001');

  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Crear torneo' }).click();

  await expect(page.getByText('Torneo creado: copa-desde-perfil')).toBeVisible();
  await expect
    .poll(() => capturedRequests(page))
    .toContainEqual(
      expect.objectContaining({
        url: '/organizations/liga-mendocina/tournaments',
        method: 'POST',
        body: expect.objectContaining({
          profileId: 'profile-001',
          profileVersion: '1.0.0',
          // The wizard submits the profile's own declared stages verbatim —
          // the read-only preview and the request never disagree.
          stages: compatibleProfile.stages,
        }),
      }),
    );
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
  await expect(page.getByLabel('Formato de la fase')).toBeVisible();
  await page.getByRole('button', { name: 'Continuar' }).click();

  // Step 4 (discipline rules)
  await page.getByRole('button', { name: 'Continuar' }).click();

  // Step 5 (rules)
  await expect(page.getByLabel('Agregar regla para cada evento registrado')).toBeVisible();
  await page.getByRole('button', { name: 'Continuar' }).click();

  // Step 6 (window)
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

test('explains every decision on every wizard step, reachable by keyboard with no hover, in the accessibility tree (0161)', async ({
  page,
}) => {
  await mockControlApi(page);
  const target = '/control/liga-mendocina/tournaments/new';
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  await page.getByLabel('Nombre').fill('Copa Explicada');
  await page.getByLabel('Alias').fill('copa-explicada');
  await page.getByRole('button', { name: 'Continuar' }).click();

  // Discipline step: the decision hint is bound to the control via
  // aria-describedby and visible without any hover or pointer interaction.
  const disciplineSelect = page.getByLabel('Disciplina');
  const disciplineHintId = await disciplineSelect.getAttribute('aria-describedby');
  expect(disciplineHintId).toBeTruthy();
  await expect(page.locator(`#${disciplineHintId}`)).toBeVisible();
  await expect(page.locator(`#${disciplineHintId}`)).toHaveText(
    'Determina las reglas, estadísticas y eventos disponibles para esta competición.',
  );

  await page.getByRole('button', { name: 'Continuar' }).click();

  // Format step: the field-level hint and the reversibility-free (safe by
  // default here) explanation are both present without opening the select.
  const formatSelect = page.getByLabel('Formato de la fase');
  const formatHintId = await formatSelect.getAttribute('aria-describedby');
  expect(formatHintId).toBeTruthy();
  await expect(page.locator(`#${formatHintId}`)).toContainText(
    'Decide cómo se generan los cruces y cómo avanzan los participantes.',
  );

  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();

  // Window step: region and capacity each carry their own reachable hint.
  const regionInput = page.getByLabel('Región');
  const regionHintId = await regionInput.getAttribute('aria-describedby');
  await expect(page.locator(`#${regionHintId}`)).toBeVisible();

  const capacityInput = page.getByLabel('Capacidad');
  const capacityHintId = await capacityInput.getAttribute('aria-describedby');
  await expect(page.locator(`#${capacityHintId}`)).toBeVisible();
});

test('states a blocked_after_results decision cannot change after the first result before it is chosen (0161)', async ({
  page,
}) => {
  await mockControlApi(page, { disciplines: disciplineWithFieldPoliciesFixture });
  const target = '/control/liga-mendocina/tournaments/new';
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  await page.getByLabel('Nombre').fill('Copa Bloqueada');
  await page.getByLabel('Alias').fill('copa-bloqueada');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();

  // The organizer has not chosen a format yet — the wizard states the
  // consequence up front, before the field is even touched.
  const formatSelect = page.getByLabel('Formato de la fase');
  const formatHintId = await formatSelect.getAttribute('aria-describedby');
  await expect(page.locator(`#${formatHintId}`)).toContainText(
    'Esto no se puede cambiar una vez que existe un resultado; usá el flujo de corrección auditado en su lugar.',
  );

  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();

  const capacityInput = page.getByLabel('Capacidad');
  const capacityHintId = await capacityInput.getAttribute('aria-describedby');
  await expect(page.locator(`#${capacityHintId}`)).toContainText(
    'Cambiar esto después de generar los cruces los invalida y los regenera.',
  );
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

test('previews first stage structure on the format step and updates on format change without reload', async ({
  page,
}) => {
  await mockControlApi(page, { disciplines: disciplineWithBothFormatsFixture });
  const target = '/control/liga-mendocina/tournaments/new';
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  await page.getByLabel('Nombre').fill('Apertura Preview Test');
  await page.getByLabel('Alias').fill('apertura-preview-test');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();

  const preview = page.getByTestId('stage-structure-preview');
  await expect(preview).toBeVisible();
  await expect(preview.getByText('Vista previa de la estructura')).toBeVisible();

  const illustrative = page.getByTestId('wizard-preview-demonstration');
  await expect(illustrative).toBeVisible();
  await expect(illustrative).toHaveText('Vista previa ilustrativa (8 participantes)');
  await expect(page.getByText('RR-R1-M1')).toBeVisible();

  await page.locator('#stage-1-format').selectOption('single-elimination');

  await expect(page.getByText('SE-R3-M1')).toBeVisible();
  await expect(page.getByText('RR-R1-M1')).not.toBeVisible();
});

test('setting registration capacity updates preview entrant count and removes illustrative label', async ({
  page,
}) => {
  await mockControlApi(page, { disciplines: disciplineWithBothFormatsFixture });
  const target = '/control/liga-mendocina/tournaments/new';
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  await page.getByLabel('Nombre').fill('Apertura Capacity Test');
  await page.getByLabel('Alias').fill('apertura-capacity-test');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();

  await page.locator('#stage-1-format').selectOption('single-elimination');
  await expect(page.getByTestId('wizard-preview-demonstration')).toBeVisible();
  await expect(page.getByText('SE-R3-M1')).toBeVisible();

  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();

  await page.getByLabel('Capacidad').fill('4');

  await page.getByRole('button', { name: 'Volver' }).click();
  await page.getByRole('button', { name: 'Volver' }).click();
  await page.getByRole('button', { name: 'Volver' }).click();

  await expect(page.getByTestId('wizard-preview-demonstration')).not.toBeVisible();

  const capacityLabel = page.getByTestId('wizard-preview-capacity');
  await expect(capacityLabel).toBeVisible();
  await expect(capacityLabel).toHaveText('4 participantes');

  await expect(page.getByText('SE-R2-M1')).toBeVisible();
  await expect(page.getByText('SE-R3-M1')).not.toBeVisible();
});
