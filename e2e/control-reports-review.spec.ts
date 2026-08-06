import { expect, test, type Page } from '@playwright/test';

/**
 * The operator's pending reports/disputes queue (0032, tasks 7.1-7.2).
 *
 * No participant self-service submission view exists in this codebase (a
 * real gap found while implementing 0032 — proposal.md's own file list only
 * commits to the operator-side queue as new control-web UI) and building one
 * was out of this change's scope; submission itself is proven end-to-end
 * against the real HTTP stack in `apps/api/src/controllers/
 * reports.integration.test.ts`. This spec covers what the proposal actually
 * commits to: an operator seeing a pending submission and dismissing it
 * without applying a correction.
 */

const REPORTS_PATH = '/control/liga-mendocina/tournaments/apertura-2026/reports';

interface CapturedRequest {
  readonly url: string;
  readonly method: string;
}

function pendingDispute() {
  return {
    reportId: '00000000-0000-7000-8000-000000000001',
    matchId: '00000000-0000-7000-8000-000000000002',
    kind: 'dispute',
    submittedByPersonId: '00000000-0000-7000-8000-000000000003',
    submittedAt: '2026-08-06T12:00:00.000Z',
    reason: 'El marcador registrado no coincide con lo ocurrido',
    status: 'pending',
    createdAt: '2026-08-06T12:00:00.000Z',
    evidence: [
      {
        evidenceId: '00000000-0000-7000-8000-000000000004',
        filename: 'captura.png',
        contentType: 'image/png',
        sizeBytes: 1024,
        uploadedBy: '00000000-0000-7000-8000-000000000003',
        uploadedAt: '2026-08-06T12:00:00.000Z',
        validationStatus: 'passed',
      },
    ],
  };
}

async function mockReportsApi(page: Page): Promise<void> {
  await page.addInitScript(
    ({ dispute }) => {
      let dismissed = false;
      const captured: CapturedRequest[] = [];
      Object.assign(window, { __reportsRequests: captured });

      window.fetch = async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        captured.push({ url, method });

        if (url.endsWith('/reports') && method === 'GET') {
          return Response.json(dismissed ? [] : [dispute]);
        }
        if (url.endsWith(`/reports/${dispute.reportId}/review`) && method === 'POST') {
          dismissed = true;
          return Response.json({ ...dispute, status: 'dismissed' });
        }
        return new Response('Not found', { status: 404 });
      };
    },
    { dispute: pendingDispute() },
  );
}

async function capturedRequests(page: Page): Promise<readonly CapturedRequest[]> {
  return page.evaluate(
    () =>
      (window as typeof window & { readonly __reportsRequests?: CapturedRequest[] })
        .__reportsRequests ?? [],
  );
}

test('shows a pending dispute with its evidence in the operator queue (7.1)', async ({ page }) => {
  await mockReportsApi(page);
  await page.goto(REPORTS_PATH);

  await expect(page.getByText('Disputa', { exact: true })).toBeVisible();
  await expect(page.getByText('El marcador registrado no coincide')).toBeVisible();
  await expect(page.getByText('captura.png')).toBeVisible();
});

test('dismisses a dispute without ever calling a correction endpoint (7.2)', async ({ page }) => {
  await mockReportsApi(page);
  await page.goto(REPORTS_PATH);

  await expect(page.getByText('Disputa', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Descartar' }).click();

  await expect(page.getByText('No hay reportes ni disputas pendientes.')).toBeVisible();

  const requests = await capturedRequests(page);
  expect(requests.some((request) => request.url.includes('/review'))).toBe(true);
  // A dismiss is not a correction — nothing here ever calls the corrections
  // endpoint, and the result an operator would see elsewhere is unaffected.
  expect(requests.some((request) => request.url.includes('/corrections'))).toBe(false);
});
