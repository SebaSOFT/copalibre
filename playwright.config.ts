import { defineConfig, devices } from '@playwright/test';

/**
 * E2E scaffold (task 8.1 of 0001-bootstrap-monorepo-toolchain). No specs exist yet;
 * phase 0012-public-web-astro-shell writes the first ones into e2e/.
 */
export default defineConfig({
  testDir: './e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:4321',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // astro dev self-daemonizes when stdout is not a TTY (Astro 7), which Playwright's
    // webServer treats as an early exit. build+preview is a plain foreground server and
    // exercises the production output, which the public no-JS-baseline tests want anyway.
    command: 'yarn workspace @copalibre/web build && yarn workspace @copalibre/web preview',
    url: 'http://localhost:4321',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
