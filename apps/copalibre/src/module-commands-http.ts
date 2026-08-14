/**
 * The authenticated HTTP path for `module add/list/remove/verify` (0085) —
 * mirrors `create-admin.ts`'s `fetch()` precedent. Used when a stored
 * credential exists for the target API URL (`module-commands.ts`'s
 * dual-path dispatch); the direct-database path there stays the fallback
 * otherwise.
 */

export interface ModuleListEntry {
  readonly alias: string;
  readonly version: string;
  readonly kind: string;
  readonly sourceKind: string;
  readonly attributionAuthor: string;
}

export interface OutdatedModuleEntry {
  readonly alias: string;
  readonly currentVersion: string;
  readonly latestVersion: string;
  readonly upgrade: string;
}

export interface InstallModuleReport {
  readonly kind: string;
  readonly alias: string;
  readonly version: string;
  readonly unsatisfiedRequiredCapabilities: readonly string[];
}

export interface RemoveModuleReport {
  readonly alias: string;
  readonly removedCount: number;
}

export interface ModuleVerifyFailure {
  readonly stage: string;
  readonly message: string;
}

export interface ModuleVerifyResult {
  readonly alias: string;
  readonly version: string;
  readonly ok: boolean;
  readonly failures: readonly ModuleVerifyFailure[];
}

function authorized(token: string): HeadersInit {
  return { authorization: `Bearer ${token}` };
}

async function parseOrThrow<T>(response: Response, action: string): Promise<T> {
  const body = (await response.json().catch(() => undefined)) as
    (T & { readonly message?: unknown }) | undefined;
  if (!response.ok) {
    const suffix = typeof body?.message === 'string' ? `: ${body.message}` : '';
    throw new Error(`${action} returned HTTP ${response.status}${suffix}`);
  }
  if (body === undefined) throw new Error(`${action} did not return a result`);
  return body;
}

export async function listModulesOverHttp(
  apiUrl: string,
  token: string,
  outdated: boolean,
  requestFetch: typeof fetch = fetch,
): Promise<readonly ModuleListEntry[] | readonly OutdatedModuleEntry[]> {
  const target = new URL('/admin/modules', apiUrl);
  if (outdated) target.searchParams.set('outdated', 'true');
  const response = await requestFetch(target, {
    headers: authorized(token),
    signal: AbortSignal.timeout(15_000),
  });
  return parseOrThrow(response, 'module list');
}

export async function installModuleOverHttp(
  apiUrl: string,
  token: string,
  body: {
    readonly alias: string;
    readonly range?: string;
    readonly source?: string;
    readonly allowUnsatisfiedCapabilities?: boolean;
  },
  requestFetch: typeof fetch = fetch,
): Promise<InstallModuleReport> {
  const target = new URL('/admin/modules', apiUrl);
  const response = await requestFetch(target, {
    method: 'POST',
    headers: { ...authorized(token), 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  return parseOrThrow(response, 'module add');
}

export async function removeModuleOverHttp(
  apiUrl: string,
  token: string,
  alias: string,
  requestFetch: typeof fetch = fetch,
): Promise<RemoveModuleReport> {
  const target = new URL(`/admin/modules/${encodeURIComponent(alias)}`, apiUrl);
  const response = await requestFetch(target, {
    method: 'DELETE',
    headers: authorized(token),
    signal: AbortSignal.timeout(15_000),
  });
  return parseOrThrow(response, 'module remove');
}

export async function verifyModulesOverHttp(
  apiUrl: string,
  token: string,
  requestFetch: typeof fetch = fetch,
): Promise<readonly ModuleVerifyResult[]> {
  const target = new URL('/admin/modules/verify', apiUrl);
  const response = await requestFetch(target, {
    method: 'POST',
    headers: authorized(token),
    signal: AbortSignal.timeout(30_000),
  });
  return parseOrThrow(response, 'module verify');
}
