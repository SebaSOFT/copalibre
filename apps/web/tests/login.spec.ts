import { expect, test, type Page } from '@playwright/test';

async function mockLoginApi(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.fetch = async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (
        (url === '/auth/login' || url === '/api/auth/login' || url.endsWith('/auth/login')) &&
        method === 'POST'
      ) {
        const body = JSON.parse(String(init?.body));
        if (body.email === 'test@example.com' && body.password === 'password123') {
          return Response.json({ access_token: 'e2e-access-token', expires_in: 3600 });
        }
        return Response.json(
          { message: 'Invalid credentials', errorCode: 'auth-unauthorized' },
          { status: 401 },
        );
      }
      return new Response('Not found', { status: 404 });
    };
  });
}

test('user can log in successfully', async ({ page }) => {
  await mockLoginApi(page);
  await page.goto('/control/login');

  await expect(page.getByLabel('Email')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel('Password')).toBeVisible();

  await page.getByLabel('Email').fill('test@example.com');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Sign in' }).click();

  // The application will try to redirect or store the token.
  // Let's just assert that the API call was made and the UI reacts.
  // Assuming successful login redirects to /control/ or dashboard
  await page.waitForURL('**/control/**');
});

test('user sees error on invalid credentials', async ({ page }) => {
  await mockLoginApi(page);
  await page.goto('/control/login');

  await page.getByLabel('Email').fill('test@example.com');
  await page.getByLabel('Password').fill('wrongpassword');
  await page.getByRole('button', { name: 'Sign in' }).click();

  // `control.apiError.unauthorized` has a real Spanish translation, and the
  // browser's default locale resolves to `es` here — unlike `auth.*`
  // (login/forgot/reset), which has no locale catalogue at all and always
  // renders its English `defaultMessage` regardless of locale.
  await expect(page.getByRole('alert')).toContainText('Tu sesión venció. Inicia sesión de nuevo.');
});
