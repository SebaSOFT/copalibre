import {
  test as base,
  expect,
  type BrowserContext,
  type BrowserContextOptions,
} from './csp-guard.js';
import { installChromium100VisibilityShim } from './chromium-100-compat.js';

export { expect };

/**
 * First port of the per-worker mock API. The local development stack publishes 3001 (API),
 * 3002 (events) and 3005 (web SSR), so a base on those ports would reach the stack instead of
 * the mock. Override with COPALIBRE_E2E_API_PORT_BASE.
 */
const DEFAULT_API_PORT_BASE = 3101;

/**
 * The preview has no proxy in front, so browser requests for `/api/**` go to the worker's mock
 * API here, the way the gateway sends them to the API. A spec's own `page.route` still wins.
 */
async function forwardApiToMock(context: BrowserContext, workerPort: number): Promise<void> {
  await context.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    let response: Awaited<ReturnType<typeof route.fetch>> | undefined;
    try {
      response = await route.fetch({
        url: `http://127.0.0.1:${workerPort}${url.pathname}${url.search}`,
      });
    } catch {
      response = undefined;
    }
    // A request still in flight when its page navigates or closes can no longer be answered.
    // That is the page's business, not a test failure, so a failed answer is dropped.
    await route
      .fulfill(response ? { response } : { status: 404, body: 'No mock API is listening' })
      .catch(() => undefined);
  });
}

export interface WorkerPortFixture {
  workerPort: number;
}

export const test = base.extend<Record<string, never>, WorkerPortFixture>({
  page: async ({ page }, use, testInfo) => {
    const cdp = await installChromium100VisibilityShim(page, testInfo.project.name);
    try {
      await use(page);
    } finally {
      await cdp?.detach();
    }
  },
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
  context: async ({ context, workerPort }, use) => {
    await forwardApiToMock(context, workerPort);
    await use(context);
  },
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
      const context = await originalNewContext({
        ...options,
        extraHTTPHeaders: mergedHeaders,
      });
      await forwardApiToMock(context, workerPort);
      return context;
    };
    await use(browser);
  },
});
