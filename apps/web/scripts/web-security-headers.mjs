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
  const block = caddyfile.match(/\n\theader @page \{\n([\s\S]*?)\n\t\}/)?.[1];
  if (block === undefined) throw new Error('deploy/web/Caddyfile has no `header @page` block');

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
