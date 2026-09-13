import { test as base, expect, type BrowserContextOptions } from '@playwright/test';

export { expect };

export interface WorkerPortFixture {
  workerPort: number;
}

export const test = base.extend<Record<string, never>, WorkerPortFixture>({
  workerPort: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use, workerInfo) => {
      const port = 3001 + workerInfo.workerIndex;
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
