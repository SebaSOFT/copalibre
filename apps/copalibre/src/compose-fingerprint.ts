import { createHash } from 'node:crypto';
import { RELEASED_COMPOSE_FINGERPRINTS } from './released-compose-fingerprints.js';

/**
 * The shipped `docker-compose.yml` with the edits earlier upgrades made put back to one form: the
 * product image tags (`ghcr.io/sebasoft/copalibre[-web]:<tag>`), the `${COPALIBRE_VERSION:-<tag>}`
 * default, and a port mapping bound to `127.0.0.1:`. Anything else an operator changed survives
 * normalisation and makes the file "modified".
 *
 * `scripts/generate-compose-fingerprints.mjs` applies the same rules to each release tag; the test
 * compares the two on every shipped file it can read.
 */
export function normalizeCompose(content: string): string {
  return content
    .replace(/\r\n/g, '\n')
    .replace(/(ghcr\.io\/sebasoft\/copalibre(?:-web)?:)[A-Za-z0-9_.-]+/g, '$1<version>')
    .replace(/(\$\{COPALIBRE_VERSION:-)[^}]*(\})/g, '$1<version>$2')
    .replace(
      /^(\s*-\s*)(['"]?)(?:127\.0\.0\.1:)?(\d+:\d+)\2(\s*)$/gm,
      (_line, prefix: string, _quote: string, mapping: string) => `${prefix}${mapping}`,
    )
    .replace(/\n*$/, '\n');
}

export function composeFingerprint(content: string): string {
  return createHash('sha256').update(normalizeCompose(content), 'utf8').digest('hex');
}

/** What the installation's Compose file is, compared with the releases and the file this CLI ships. */
export type ComposeOrigin =
  | { readonly kind: 'current' }
  | { readonly kind: 'released'; readonly versions: readonly string[] }
  | { readonly kind: 'modified' };

export function identifyCompose(
  content: string,
  shippedContent: string,
  released: Readonly<Record<string, string>> = RELEASED_COMPOSE_FINGERPRINTS,
): ComposeOrigin {
  const fingerprint = composeFingerprint(content);
  if (fingerprint === composeFingerprint(shippedContent)) return { kind: 'current' };
  const versions = Object.entries(released)
    .filter(([, value]) => value === fingerprint)
    .map(([version]) => version);
  return versions.length > 0 ? { kind: 'released', versions } : { kind: 'modified' };
}
