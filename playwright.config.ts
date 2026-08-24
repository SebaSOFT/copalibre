import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4321);
const baseURL = `http://localhost:${port}`;

/**
 * E2E scaffold (task 8.1 of 0001-bootstrap-monorepo-toolchain). No specs exist yet;
 * phase 0012-public-web-astro-shell writes the first ones into e2e/.
 */
export default defineConfig({
  testDir: '.',
  testMatch: ['e2e/**/*.spec.ts', 'apps/web/tests/**/*.spec.ts'],
  testIgnore: ['**/deployment-login.spec.ts', '**/.claude/worktrees/**'],
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // astro dev self-daemonizes when stdout is not a TTY (Astro 7), which Playwright's
    // webServer treats as an early exit. build+preview is a plain foreground server and
    // exercises the production output, which the public no-JS-baseline tests want anyway.
    command:
      `yarn workspace @copalibre/web build && ` +
      `ASTRO_PREVIEW_BACKGROUND=1 yarn workspace @copalibre/web preview --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
