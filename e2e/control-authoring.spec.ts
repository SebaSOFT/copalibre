import { expect, test, type Page } from '@playwright/test';

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

async function mockControlApi(page: Page): Promise<void> {
  await page.addInitScript(
    ({ disciplines, registrations }) => {
      const captured: CapturedRequest[] = [];
      Object.assign(window, { __controlRequests: captured });

      window.fetch = async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
        captured.push({ url, method, ...(body === undefined ? {} : { body }) });

        if (url === '/disciplines') {
          return Response.json(disciplines);
        }

        if (url === '/organizations/liga-mendocina/tournaments') {
          return Response.json({
            tournamentId: 'tournament-002',
            alias: 'apertura-local',
            name: 'Apertura Local',
            rulesetId: 'ruleset-002',
          });
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
    { disciplines: disciplineFixture, registrations: registrationsFixture },
  );
}

async function capturedRequests(page: Page): Promise<readonly CapturedRequest[]> {
  return page.evaluate(() => {
    const state = window as typeof window & { readonly __controlRequests?: CapturedRequest[] };
    return state.__controlRequests ?? [];
  });
}

test('creates a tournament from the control authoring wizard', async ({ page }) => {
  await mockControlApi(page);

  await page.goto('/control/liga-mendocina/tournaments/new');

  await page.getByLabel('Nombre').fill('Apertura Local');
  await page.getByLabel('Alias').fill('apertura-local');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
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
        }),
      }),
    );
});

test('bulk-approves visible registrations from the review queue', async ({ page }) => {
  await mockControlApi(page);

  await page.goto('/control/liga-mendocina/tournaments/apertura-2026/registrations');

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

  await page.goto('/control/liga-mendocina/tournaments/apertura-2026/registrations');

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
