import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Astro's built Node-standalone `entry.mjs` serves prerendered/static routes
 * (the help/docs subsite, mostly) through `send`, bypassing `middleware.ts`
 * entirely — confirmed by building and curling a known-static route: its
 * response carries `ETag`/`Last-Modified` (static-file-serving headers) with
 * none of `middleware.ts`'s own logic ever running. Astro has no general
 * response-headers config for this case (`server.headers` only applies to
 * `astro dev`/`astro preview`; the adapter's own `headersMap` mechanism is
 * CSP-manifest-specific, populated only when `staticHeaders`/CSP support is
 * enabled). This wraps the adapter's raw `handler` at the Node HTTP layer
 * instead, so every response — prerendered or SSR — carries the baseline
 * security headers before Astro's own routing ever runs.
 */
export const SECURITY_HEADERS = Object.freeze({
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
});

export function applySecurityHeaders(response) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    response.setHeader(name, value);
  }
}

async function main() {
  // Set before importing the built entry point: its own top-level code
  // self-starts a second server on the same port unless this is disabled
  // first, which a static import (hoisted above any assignment) would race.
  process.env.ASTRO_NODE_AUTOSTART = 'disabled';

  const root = dirname(fileURLToPath(import.meta.url));
  const { handler } = await import(join(root, '../dist/server/entry.mjs'));

  const port = process.env.PORT ? Number(process.env.PORT) : 4321;
  const host = process.env.HOST ?? '0.0.0.0';

  const server = createServer((request, response) => {
    applySecurityHeaders(response);
    handler(request, response);
  });

  server.listen(port, host, () => {
    process.stdout.write(
      `[copalibre] web listening on http://${host}:${port} (security headers enabled)\n`,
    );
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
