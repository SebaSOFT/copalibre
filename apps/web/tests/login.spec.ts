import { expect, test, type Page } from '../../../e2e/csp-guard.js';

async function mockLoginApi(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.fetch = async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (
        (url === '/api/auth/login' ||
          url === '/api/auth/login' ||
          url.endsWith('/api/auth/login')) &&
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

  await expect(page.getByRole('link', { name: 'Volver al sitio público' })).toHaveAttribute(
    'href',
    '/',
  );

  await expect(page.getByLabel('Correo electrónico')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel('Contraseña')).toBeVisible();

  await page.getByLabel('Correo electrónico').fill('test@example.com');
  await page.getByLabel('Contraseña').fill('password123');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();

  // The application will try to redirect or store the token.
  // Let's just assert that the API call was made and the UI reacts.
  // Assuming successful login redirects to /control/ or dashboard
  await page.waitForURL('**/control/**');
});

test('user sees error on invalid credentials', async ({ page }) => {
  await mockLoginApi(page);
  await page.goto('/control/login');

  await page.getByLabel('Correo electrónico').fill('test@example.com');
  await page.getByLabel('Contraseña').fill('wrongpassword');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();

  // The browser's default locale resolves to `es` here.
  await expect(page.getByRole('alert')).toContainText('Tu sesión venció. Inicia sesión de nuevo.');
});

for (const [language, title, submit] of [
  ['es', 'Iniciá sesión para operar', 'Iniciar sesión'],
  ['de', 'Zum Arbeiten anmelden', 'Anmelden'],
] as const) {
  test(`login speaks ${language} and declares it on the document`, async ({ page }) => {
    await page.addInitScript((stored) => {
      localStorage.setItem('copalibre.language', stored);
    }, language);
    await page.goto('/control/login');

    await expect(page.getByRole('button', { name: submit, exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', language);

    const text = await page.locator('main').innerText();
    for (const english of ['Sign in', 'Password', 'Forgot your', 'Return to', 'Tournament']) {
      expect(text).not.toContain(english);
    }
  });
}
