import { expect, test as base } from '@playwright/test';
import { installChromium100VisibilityShim } from '../../../e2e/chromium-100-compat.js';

export { expect };

export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    const cdp = await installChromium100VisibilityShim(page, testInfo.project.name);
    try {
      await use(page);
    } finally {
      await cdp?.detach();
    }
  },
});
