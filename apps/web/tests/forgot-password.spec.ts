import { expect, test, type Page } from '@playwright/test';

async function mockForgotPasswordApi(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.fetch = async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (
        (url === '/auth/forgot-password' ||
          url === '/api/auth/forgot-password' ||
          url.endsWith('/auth/forgot-password')) &&
        method === 'POST'
      ) {
        const body = JSON.parse(String(init?.body));
        if (body.email) {
          return Response.json({ success: true }, { status: 200 });
        }
        return Response.json({ message: 'Error' }, { status: 400 });
      }
      return new Response('Not found', { status: 404 });
    };
  });
}

test('user can request password reset link', async ({ page }) => {
  await mockForgotPasswordApi(page);
  await page.goto('/control/forgot-password');

  await expect(page.getByLabel('Email')).toBeVisible({ timeout: 15_000 });

  await page.getByLabel('Email').fill('test@example.com');
  await page.getByRole('button', { name: 'Enviar enlace' }).click();

  await expect(page.getByText('Si el correo existe, se ha enviado un enlace.')).toBeVisible();
});
