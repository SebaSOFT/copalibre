import { expect, test, type Page } from '@playwright/test';

async function mockControlApis(page: Page, includeTournament = false): Promise<void> {
  await page.addInitScript((includeTournament) => {
    // Write valid session into sessionStorage before app loads
    const payload = btoa(JSON.stringify({ scp: 'copalibre.control' }));
    const fakeToken = `header.${payload}.signature`;
    window.sessionStorage.setItem(
      'copalibre:session:v1',
      JSON.stringify({
        token: fakeToken,
        expiresAtMs: Date.now() + 3600 * 1000,
      }),
    );

    window.fetch = async (input) => {
      const url = String(input);
      if (url.includes('/organizations?mine=true')) {
        return Response.json([
          {
            organizationId: 'org-1',
            organizationAlias: 'liga-mendocina',
            organizationName: 'Liga Mendocina',
            role: 'admin',
          },
        ]);
      }
      if (url.includes('/organizations/liga-mendocina/tournaments')) {
        return Response.json(
          includeTournament
            ? [
                {
                  tournamentId: '01935bd3-7b4a-7a19-9c20-5a1a44600001',
                  organizationId: '01935bd3-7b4a-7a19-9c20-5a1a44600002',
                  alias: 'apertura-2026',
                  name: 'Torneo Apertura 2026',
                  status: 'published',
                },
              ]
            : [],
        );
      }
      if (url.includes('/organizations/liga-mendocina/storage/usage')) {
        return Response.json({
          totalBytes: 1048576,
          objectCount: 4,
          unreferencedBytes: 0,
          unreferencedCount: 0,
        });
      }
      if (
        url.endsWith('/organizations/liga-mendocina') ||
        url.includes('/organizations/liga-mendocina?')
      ) {
        return Response.json({
          organizationId: 'org-1',
          alias: 'liga-mendocina',
          name: 'Liga Mendocina',
        });
      }
      return Response.json([]);
    };
  }, includeTournament);
}

test('navigates to sidebar sections without 404 (Tournaments, Live Console, Organization, Analytics)', async ({
  page,
}) => {
  await mockControlApis(page);
  await page.goto('/control/liga-mendocina');

  await expect(
    page.getByRole('link', { name: 'Página pública de la organización' }),
  ).toHaveAttribute('href', '/liga-mendocina');

  // Verify no 404 screen is shown
  await expect(page.locator('text=Pantalla no encontrada')).not.toBeVisible();

  // Navigate to Torneos
  await page.getByRole('link', { name: 'Torneos' }).click();
  await expect(page).toHaveURL(/\/control\/liga-mendocina\/tournaments/);
  await expect(page.locator('text=Pantalla no encontrada')).not.toBeVisible();

  // Navigate to Consola en vivo
  await page.getByRole('link', { name: 'Consola en vivo' }).click();
  await expect(page).toHaveURL(/\/control\/liga-mendocina\/live/);
  await expect(page.locator('text=Pantalla no encontrada')).not.toBeVisible();

  // Navigate to Organización
  await page.getByRole('link', { name: 'Organización', exact: true }).click();
  await expect(page).toHaveURL(/\/control\/liga-mendocina\/organization/);
  await expect(page.locator('text=Pantalla no encontrada')).not.toBeVisible();

  // Navigate to Analítica
  await page.getByRole('link', { name: 'Analítica' }).click();
  await expect(page).toHaveURL(/\/control\/liga-mendocina\/analytics/);
  await expect(page.locator('text=Pantalla no encontrada')).not.toBeVisible();
});

test('mobile viewport provides accessible drawer navigation', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await mockControlApis(page);
  await page.goto('/control/liga-mendocina');

  // The hamburger button should be visible on mobile
  const hamburger = page.getByRole('button', { name: 'Abrir menú de navegación' });
  await expect(hamburger).toBeVisible();

  // Open the drawer
  await hamburger.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole('link', { name: 'Página pública de la organización' }),
  ).toHaveAttribute('href', '/liga-mendocina');

  // Click a navigation link in the drawer
  await dialog.getByRole('link', { name: 'Torneos' }).click();
  await expect(page).toHaveURL(/\/control\/liga-mendocina\/tournaments/);
  await expect(page.locator('text=Pantalla no encontrada')).not.toBeVisible();
});

test('mobile tournament card links directly to public and TV displays', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mockControlApis(page, true);
  await page.goto('/control/liga-mendocina');

  await expect(page.getByText('Torneo Apertura 2026')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sitio público' })).toHaveAttribute(
    'href',
    '/liga-mendocina/tournaments/apertura-2026',
  );
  await expect(page.getByRole('link', { name: 'Pantalla TV' })).toHaveAttribute(
    'href',
    '/tv/liga-mendocina/tournaments/apertura-2026',
  );
});

test('desktop tournament card links directly to public and TV displays', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockControlApis(page, true);
  await page.goto('/control/liga-mendocina');

  await expect(page.getByText('Torneo Apertura 2026')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sitio público' })).toHaveAttribute(
    'href',
    '/liga-mendocina/tournaments/apertura-2026',
  );
  await expect(page.getByRole('link', { name: 'Pantalla TV' })).toHaveAttribute(
    'href',
    '/tv/liga-mendocina/tournaments/apertura-2026',
  );
});

test('session survives hard reload across navigation', async ({ page }) => {
  await mockControlApis(page);
  await page.goto('/control/liga-mendocina/tournaments');

  await expect(page).toHaveURL(/\/control\/liga-mendocina\/tournaments/);
  await expect(page.locator('text=Pantalla no encontrada')).not.toBeVisible();

  // Reload the page
  await page.reload();

  // Should stay on the protected route and not be kicked to /control/login
  await expect(page).toHaveURL(/\/control\/liga-mendocina\/tournaments/);
  await expect(page.locator('text=Iniciar sesión')).not.toBeVisible();
  await expect(page.locator('text=Pantalla no encontrada')).not.toBeVisible();
});
