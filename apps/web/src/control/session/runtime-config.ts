import type { SessionMode } from './token-store.js';

/**
 * `/runtime-config.json` is deployment-provided — served by the edge proxy,
 * never built by this repo — so every field is optional
 * and read defensively.
 */
export interface RuntimeConfig {
  readonly oidcIssuer?: string;
  readonly oidcClientId?: string;
  readonly sessionMode?: string;
}

const RUNTIME_CONFIG_PATH = '/runtime-config.json';

export async function readRuntimeConfig(
  fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<RuntimeConfig> {
  const response = await fetchImpl(RUNTIME_CONFIG_PATH, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`${RUNTIME_CONFIG_PATH} returned HTTP ${response.status}`);
  return (await response.json()) as RuntimeConfig;
}

/**
 * A deployment that says nothing about session mode gets the strict default —
 * an assumed silent session is a worse failure than an assumed
 * reauthentication prompt.
 */
export function resolveSessionMode(config: RuntimeConfig): SessionMode {
  return config.sessionMode === 'pragmatic-persistent'
    ? 'pragmatic-persistent'
    : 'strict-stateless';
}
