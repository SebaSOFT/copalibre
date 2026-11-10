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
  // SAMEORIGIN, not DENY: Control frames this renderer's own TV overlay in
  // the Broadcaster Studio preview. Other sites still cannot frame it.
  'x-frame-options': 'SAMEORIGIN',
  'referrer-policy': 'strict-origin-when-cross-origin',
});

export function applySecurityHeaders(response) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    response.setHeader(name, value);
  }
}

/**
 * Emulates the web role's Caddy in front of this server, for the e2e suite:
 * adds the headers `deploy/web/Caddyfile` sends, appending its Content
 * Security Policy as a second policy next to the one Astro sends with the
 * page's hashes, as Caddy does. A browser enforces both. Off in production,
 * where Caddy itself adds them.
 */
export function appendEdgeHeaders(response, edgeHeaders) {
  const writeHead = response.writeHead;
  response.writeHead = function writeHeadWithEdgeHeaders(statusCode, ...rest) {
    const headersArgument = rest.find((argument) => argument && typeof argument === 'object');
    for (const [name, value] of Object.entries(edgeHeaders)) {
      if (name.toLowerCase() !== 'content-security-policy') {
        this.setHeader(name, value);
        continue;
      }
      const fromArgument = headersArgument
        ? Object.keys(headersArgument).find((key) => key.toLowerCase() === name.toLowerCase())
        : undefined;
      if (fromArgument !== undefined) {
        headersArgument[fromArgument] = [headersArgument[fromArgument], value].flat();
      } else {
        const existing = this.getHeader(name);
        this.setHeader(name, existing === undefined ? value : [existing, value].flat());
      }
    }
    return writeHead.call(this, statusCode, ...rest);
  };
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

  const edgeHeaders =
    process.env.COPALIBRE_WEB_EDGE_HEADERS === '1'
      ? (await import('./web-security-headers.mjs')).readWebSecurityHeaders(process.env)
      : undefined;

  const server = createServer((request, response) => {
    applySecurityHeaders(response);
    if (edgeHeaders) appendEdgeHeaders(response, edgeHeaders);
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
