import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4321);
const baseURL = `http://localhost:${port}`;
// The external OIDC provider the sign-in tests stub; the policy allows it the
// way an installation with external OIDC sets COPALIBRE_CSP_IDENTITY_ORIGIN.
const E2E_IDENTITY_ORIGIN = 'https://identity.example';
const tvChromium100Path = process.env.PLAYWRIGHT_CHROMIUM_100_PATH;

/**
 * E2E scaffold. No specs exist yet;
 * the public-web setup writes the first ones into e2e/.
 */
export default defineConfig({
  testDir: '.',
  testMatch: ['e2e/**/*.spec.ts', 'apps/web/tests/**/*.spec.ts'],
  testIgnore: ['**/deployment-login.spec.ts', '**/.claude/worktrees/**'],
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  // The JSON report lets CI list tests a retry rescued; see scripts/summarize-playwright-flaky.mjs.
  reporter: process.env.CI
    ? [['html'], ['json', { outputFile: 'test-results/playwright-results.json' }]]
    : 'html',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    ...(tvChromium100Path
      ? [
          {
            name: 'chromium-100',
            testMatch: /(?:^|\/)(?:tv-[^/]+|broadcast-tv)\.spec\.ts$/,
            use: {
              ...devices['Desktop Chrome'],
              launchOptions: { executablePath: tvChromium100Path },
            },
          },
        ]
      : []),
  ],
  webServer: {
    // A built production server, not `astro dev` (which self-daemonizes when stdout is
    // not a TTY, an early exit to Playwright): it exercises the production output, which
    // the public no-JS-baseline tests want anyway. It is the production web server (the one `web-ssr` runs), with the headers the
    // web role's Caddy adds in front of it, read from deploy/web/Caddyfile: every
    // spec runs under the Content Security Policy production enforces.
    command:
      process.env.PLAYWRIGHT_EXISTING_BUILD === 'true' ||
      process.env.PLAYWRIGHT_EXISTING_BUILD === '1'
        ? `COPALIBRE_WEB_EDGE_HEADERS=1 COPALIBRE_CSP_IDENTITY_ORIGIN=${E2E_IDENTITY_ORIGIN} PORT=${port} HOST=localhost node apps/web/scripts/serve-with-security-headers.mjs`
        : `yarn workspace @copalibre/web build && ` +
          `COPALIBRE_WEB_EDGE_HEADERS=1 COPALIBRE_CSP_IDENTITY_ORIGIN=${E2E_IDENTITY_ORIGIN} PORT=${port} HOST=localhost node apps/web/scripts/serve-with-security-headers.mjs`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
