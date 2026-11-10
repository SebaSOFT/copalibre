import { isIP } from 'node:net';

/**
 * Which peers may tell an API or events process who the client is.
 *
 * Fastify takes the client address from `X-Forwarded-For` only when the peer
 * that sent the request is trusted. Trusting every peer lets any client that
 * reaches a role directly name its own address, and the per-address rate
 * limits key on that address. The default trusts loopback, link-local and
 * private networks: the gateway, an ingress controller or a reverse proxy on
 * the same host or cluster network. A proxy on a public address has to be
 * named.
 */

export const TRUSTED_PROXIES_ENV = 'COPALIBRE_TRUSTED_PROXIES';

const PRESETS = new Set(['loopback', 'linklocal', 'uniquelocal']);
export const DEFAULT_TRUSTED_PROXIES: readonly string[] = ['loopback', 'linklocal', 'uniquelocal'];

/** Fastify's `trustProxy`: a list of addresses, ranges and presets, or nothing trusted. */
export type TrustedProxies = readonly string[] | false;

function validEntry(entry: string): boolean {
  if (PRESETS.has(entry)) return true;
  const [address, prefix, ...rest] = entry.split('/');
  if (rest.length > 0 || !address) return false;
  const family = isIP(address);
  if (family === 0) return false;
  if (prefix === undefined) return true;
  if (!/^\d{1,3}$/.test(prefix)) return false;
  const bits = Number(prefix);
  return family === 4 ? bits <= 32 : bits <= 128;
}

function trustsEveryone(entry: string): boolean {
  const [address, prefix] = entry.split('/');
  return prefix === '0' && address !== undefined && isIP(address) !== 0;
}

/**
 * Reads `COPALIBRE_TRUSTED_PROXIES`: a comma-separated list of addresses,
 * CIDR ranges and the presets `loopback`, `linklocal` and `uniquelocal`, or
 * `none`. Unset or empty means the default. Anything unreadable, or a range
 * that covers every address, refuses to start rather than trusting more than
 * the operator meant.
 */
export function trustedProxiesFromEnv(env: NodeJS.ProcessEnv = process.env): TrustedProxies {
  const raw = env[TRUSTED_PROXIES_ENV]?.trim() ?? '';
  if (raw === '') return DEFAULT_TRUSTED_PROXIES;
  if (raw.toLowerCase() === 'none') return false;

  const entries = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  const invalid = entries.filter((entry) => !validEntry(entry));
  if (invalid.length > 0) {
    throw new Error(
      `${TRUSTED_PROXIES_ENV} has entries that are not an address, a CIDR range or a preset: ${invalid.join(', ')}`,
    );
  }
  const everyone = entries.filter(trustsEveryone);
  if (everyone.length > 0) {
    throw new Error(
      `${TRUSTED_PROXIES_ENV} must not trust every address (${everyone.join(', ')}); name the proxy's own range`,
    );
  }
  return entries;
}
