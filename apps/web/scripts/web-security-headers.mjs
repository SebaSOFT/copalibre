import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The web role's security headers, read from `deploy/web/Caddyfile`, which is
 * the only place they are written. `astro preview` sends them too, so every
 * e2e test runs under the policy production enforces, and a Caddyfile edit is
 * tested by the whole suite. Caddy environment placeholders resolve to the
 * given values, or to their defaults.
 */

const CADDYFILE = join(dirname(fileURLToPath(import.meta.url)), '../../../deploy/web/Caddyfile');

/**
 * @param {Record<string, string>} [environment]
 * @param {string} [caddyfile]
 * @returns {Record<string, string>}
 */
export function readWebSecurityHeaders(
  environment = {},
  caddyfile = readFileSync(CADDYFILE, 'utf8'),
) {
  return readHeaderBlock('page', environment, caddyfile);
}

/**
 * The headers of one `header @<matcher> { … }` block. Directive-only lines such
 * as `defer` carry no value and are skipped.
 *
 * @param {string} matcher
 * @param {Record<string, string>} [environment]
 * @param {string} [caddyfile]
 * @returns {Record<string, string>}
 */
export function readHeaderBlock(
  matcher,
  environment = {},
  caddyfile = readFileSync(CADDYFILE, 'utf8'),
) {
  const block = caddyfile.match(
    new RegExp(`\\n\\theader @${matcher} \\{\\n([\\s\\S]*?)\\n\\t\\}`),
  )?.[1];
  if (block === undefined)
    throw new Error(`deploy/web/Caddyfile has no \`header @${matcher}\` block`);

  /** @type {Record<string, string>} */
  const headers = {};
  for (const line of block.split('\n')) {
    const entry = line.trim().match(/^\+?([A-Za-z-]+)\s+(?:"(.*)"|(\S+))$/);
    if (!entry) continue;
    const [, name, quoted, bare] = entry;
    const value = (quoted ?? bare ?? '').replace(
      /\{\$([A-Z0-9_]+)(?::([^}]*))?\}/g,
      (_, variable, fallback) => environment[variable] ?? fallback ?? '',
    );
    headers[name] = value.replace(/\s+;/g, ';').replace(/\s{2,}/g, ' ');
  }
  return headers;
}

/**
 * The background-removal worker's own headers and the paths they apply to,
 * from the `@removalWorker` matcher. Caddy gives the worker script this policy
 * instead of the page policy (the `@page` matcher excludes the same paths): the
 * worker loads onnxruntime's module from object URLs, which the page policy
 * forbids. A worker is governed by its own script's policy, so the e2e server
 * must make the same split or the worker runs under a stricter policy than
 * production.
 *
 * @param {Record<string, string>} [environment]
 * @param {string} [caddyfile]
 * @returns {{ readonly paths: RegExp, readonly headers: Record<string, string> }}
 */
export function readWorkerSecurityHeaders(
  environment = {},
  caddyfile = readFileSync(CADDYFILE, 'utf8'),
) {
  const globs = caddyfile
    .match(/\n\t@removalWorker path ([^\n]+)/)?.[1]
    ?.trim()
    .split(/\s+/);
  if (globs === undefined)
    throw new Error('deploy/web/Caddyfile has no `@removalWorker path` matcher');
  const alternatives = globs.map((glob) =>
    glob.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*'),
  );
  return {
    paths: new RegExp(`^(?:${alternatives.join('|')})$`),
    headers: readHeaderBlock('removalWorker', environment, caddyfile),
  };
}

/** Splits a policy into `{ directive: sources[] }`. */
export function parsePolicy(policy) {
  return Object.fromEntries(
    policy
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [directive, ...sources] = part.split(/\s+/);
        return [directive, sources];
      }),
  );
}
