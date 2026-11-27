import { test as base } from '@playwright/test';

export * from '@playwright/test';

/**
 * Fails a test when any page or frame it opened reports a Content Security
 * Policy violation. `astro preview` sends the production header (see
 * `apps/web/scripts/web-security-headers.mjs`) and each page carries the
 * build's hashed `<meta>` policy, so a script the policy blocks surfaces here
 * instead of as a silently missing feature. Only an in-page listener sees
 * violations of the `<meta>` policy: it cannot carry a report endpoint.
 *
 * A spec that triggers violations on purpose opts out with
 * `test.use({ allowCspViolations: true })` and asserts them itself.
 */
export const CSP_VIOLATION_PREFIX = '[csp-violation]';

export const test = base.extend<{ allowCspViolations: boolean; cspGuard: void }>({
  allowCspViolations: [false, { option: true }],
  cspGuard: [
    async ({ context, allowCspViolations }, use) => {
      const violations: string[] = [];
      await context.addInitScript((prefix) => {
        document.addEventListener('securitypolicyviolation', (event) => {
          console.error(
            `${prefix} ${event.effectiveDirective} blocked ${event.blockedURI || 'inline'}` +
              ` on ${event.documentURI}${event.sample ? `: ${event.sample}` : ''}`,
          );
        });
      }, CSP_VIOLATION_PREFIX);
      context.on('console', (message) => {
        if (message.text().startsWith(CSP_VIOLATION_PREFIX)) violations.push(message.text());
      });
      await use();
      if (!allowCspViolations && violations.length > 0) {
        throw new Error(
          `Content Security Policy violations:\n${[...new Set(violations)].join('\n')}`,
        );
      }
    },
    { auto: true },
  ],
});
