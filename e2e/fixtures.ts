import { test as base, expect, type BrowserContextOptions } from '@playwright/test';

export { expect };

/**
 * First port of the per-worker mock API. The local development stack publishes 3001 (API),
 * 3002 (events) and 3005 (web SSR), so a base on those ports would reach the stack instead of
 * the mock. Override with COPALIBRE_E2E_API_PORT_BASE.
 */
const DEFAULT_API_PORT_BASE = 3101;

export interface WorkerPortFixture {
  workerPort: number;
}

export const test = base.extend<Record<string, never>, WorkerPortFixture>({
  workerPort: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use, workerInfo) => {
      const port =
        Number(process.env.COPALIBRE_E2E_API_PORT_BASE ?? DEFAULT_API_PORT_BASE) +
        workerInfo.workerIndex;
      await use(port);
    },
    { scope: 'worker' },
  ],
  extraHTTPHeaders: async ({ workerPort, extraHTTPHeaders }, use) => {
    await use({
      ...extraHTTPHeaders,
      'x-copalibre-api-port': String(workerPort),
    });
  },
  browser: async ({ browser, workerPort }, use) => {
    const originalNewContext = browser.newContext.bind(browser);
    browser.newContext = async (options?: BrowserContextOptions) => {
      const mergedHeaders = {
        'x-copalibre-api-port': String(workerPort),
        ...options?.extraHTTPHeaders,
      };
      return originalNewContext({
        ...options,
        extraHTTPHeaders: mergedHeaders,
      });
    };
    await use(browser);
  },
});
