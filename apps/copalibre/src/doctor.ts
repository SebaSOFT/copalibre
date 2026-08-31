import { access, mkdir } from 'node:fs/promises';
import { lookup } from 'node:dns/promises';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { authConfigFromEnv } from '@copalibre/auth';
import { createObjectStorageAdapter, objectStorageConfigFromEnv } from '@copalibre/object-storage';
import {
  CompetitionRecordRepository,
  InstalledModuleRepository,
  createDatabase,
} from '@copalibre/persistence';
import { sql } from 'kysely';
import { createRemoteJWKSet, customFetch, type FetchImplementation } from 'jose';

export type DoctorCheckStatus = 'pass' | 'fail' | 'skip';

export interface DoctorCheck {
  readonly name: string;
  readonly status: DoctorCheckStatus;
  readonly message: string;
}

export interface DoctorReport {
  readonly checks: readonly DoctorCheck[];
  readonly ok: boolean;
}

export interface RetirableModule {
  readonly alias: string;
  readonly version: string;
}

export interface DoctorDependencies {
  readonly lookupHost: (hostname: string) => Promise<void>;
  readonly probeDatabase: (connectionString: string) => Promise<void>;
  readonly ensureWritable: (path: string) => Promise<void>;
  readonly fetch: typeof fetch;
  /** Installed community discipline versions no started/finished tournament references (task 4.7). */
  readonly retirableModules: (connectionString: string) => Promise<readonly RetirableModule[]>;
  /** Puts, reads back, and deletes a small probe object against the configured profile. */
  readonly objectStorageRoundTrip: (environment: NodeJS.ProcessEnv) => Promise<void>;
}

export interface DoctorOptions {
  readonly checkProxy?: boolean;
  readonly proxyUrl?: string;
}

const EMAIL_PROVIDERS = ['resend', 'brevo', 'mailgun', 'smtp'] as const;
type EmailProvider = (typeof EMAIL_PROVIDERS)[number];

export async function runDoctor(
  environment: NodeJS.ProcessEnv = process.env,
  dependencies: DoctorDependencies = systemDoctorDependencies(),
  options: DoctorOptions = {},
): Promise<DoctorReport> {
  const checks: DoctorCheck[] = [
    ...validateRequiredConfiguration(environment),
    ...validateServicePorts(environment),
  ];
  checks.push(...(await validatePublicUrls(environment, dependencies)));
  checks.push(...(await validateJwksContent(environment, dependencies)));
  checks.push(...(await validateDatabase(environment, dependencies)));
  checks.push(await validateRetirableModules(environment, dependencies));
  checks.push(await validateObjectStorage(environment, dependencies));
  checks.push(...(await validatePersistentPath(environment, dependencies)));
  if (options.checkProxy) checks.push(await validateReverseProxy(options, dependencies));
  return { checks, ok: checks.every((check) => check.status !== 'fail') };
}

export function validateRequiredConfiguration(
  environment: NodeJS.ProcessEnv,
): readonly DoctorCheck[] {
  const checks: DoctorCheck[] = [];
  for (const name of ['DATABASE_URL', 'COPALIBRE_APP_URL', 'COPALIBRE_BOOTSTRAP_TOKEN']) {
    checks.push(requiredCheck(environment, name));
  }

  try {
    authConfigFromEnv(environment);
    if (!environment.COPALIBRE_OIDC_CLIENT_ID?.trim()) {
      throw new Error('COPALIBRE_OIDC_CLIENT_ID is required');
    }
    checks.push(
      pass('oidc-config', 'OIDC JWKS, issuer, audience and browser client are configured'),
    );
  } catch (error) {
    checks.push(fail('oidc-config', errorMessage(error)));
  }
  checks.push(validateEmailConfiguration(environment));
  return checks;
}

export function validateServicePorts(environment: NodeJS.ProcessEnv): readonly DoctorCheck[] {
  const ports = [
    ['api', environment.COPALIBRE_API_PORT ?? '3001'],
    ['events', environment.COPALIBRE_EVENTS_PORT ?? '3002'],
    ['worker', environment.COPALIBRE_WORKER_PORT ?? '3003'],
    ['scheduler', environment.COPALIBRE_SCHEDULER_PORT ?? '3004'],
  ] as const;
  const values = ports.map(([, value]) => Number(value));
  if (values.some((value) => !Number.isInteger(value) || value < 1 || value > 65535)) {
    return [fail('service-ports', 'Service ports must be integers between 1 and 65535')];
  }
  if (new Set(values).size !== values.length) {
    return [fail('service-ports', 'API, events, worker and scheduler ports must be distinct')];
  }
  return [
    pass(
      'service-ports',
      `Configured ports: ${ports.map(([role, port]) => `${role}=${port}`).join(', ')}`,
    ),
  ];
}

export async function validatePublicUrls(
  environment: NodeJS.ProcessEnv,
  dependencies: Pick<DoctorDependencies, 'lookupHost'>,
): Promise<readonly DoctorCheck[]> {
  const checks: DoctorCheck[] = [];
  for (const [name, value] of [
    ['COPALIBRE_APP_URL', environment.COPALIBRE_APP_URL],
    ['COPALIBRE_JWKS_URI', environment.COPALIBRE_JWKS_URI],
  ] as const) {
    if (!value) continue;
    try {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('must use http or https');
      if (!isLocalHost(url.hostname)) await dependencies.lookupHost(url.hostname);
      checks.push(pass(`dns:${name}`, `${name} resolves as ${url.hostname}`));
    } catch (error) {
      checks.push(fail(`dns:${name}`, `${name} is not reachable: ${errorMessage(error)}`));
    }
  }
  return checks;
}

/**
 * Resolvable is not the same as correct: a `COPALIBRE_JWKS_URI` that answers
 * with an unrelated 200 (a login page, an empty object) passes DNS
 * resolution and then breaks auth at runtime with nothing in `doctor` having
 * said so. `jose`'s own remote-JWKS fetch is reused here rather than a
 * hand-rolled fetch-and-parse, so "valid JWKS" means exactly what the JWT
 * verification path itself will require.
 */
export async function validateJwksContent(
  environment: NodeJS.ProcessEnv,
  dependencies: Pick<DoctorDependencies, 'fetch'>,
): Promise<readonly DoctorCheck[]> {
  const value = environment.COPALIBRE_JWKS_URI;
  if (!value) return [];

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    // Malformed as a URL at all: `validatePublicUrls` already reports this.
    return [];
  }

  try {
    const jwks = createRemoteJWKSet(url, {
      // jose's own doc: fetch-like implementations never line up with the
      // DOM lib's `typeof fetch` exactly enough to satisfy this without a
      // cast, `@ts-expect-error`-worthy per their own example.
      [customFetch]: dependencies.fetch as unknown as FetchImplementation,
      timeoutDuration: 5_000,
    });
    // `reload()` forces one fetch now, rather than the lazy fetch-on-first-use
    // the resolver function itself would perform — each `doctor` run gets a
    // fresh answer, never a cached one from a prior run.
    await jwks.reload();
    return [pass('jwks-content', 'COPALIBRE_JWKS_URI serves a valid JSON Web Key Set')];
  } catch (error) {
    return [
      fail(
        'jwks-content',
        `COPALIBRE_JWKS_URI (${url.toString()}) does not serve a valid JWKS document: ${errorMessage(error)}`,
      ),
    ];
  }
}

export async function validateDatabase(
  environment: NodeJS.ProcessEnv,
  dependencies: Pick<DoctorDependencies, 'probeDatabase'>,
): Promise<readonly DoctorCheck[]> {
  const connectionString = environment.DATABASE_URL;
  if (!connectionString) return [];
  try {
    new URL(connectionString);
    await dependencies.probeDatabase(connectionString);
    return [pass('postgresql', 'PostgreSQL accepts a query')];
  } catch (error) {
    return [fail('postgresql', `PostgreSQL is unreachable: ${errorMessage(error)}`)];
  }
}

/** Reports installed community discipline versions no live tournament references (task 4.7) — informational, never `fail`. */
export async function validateRetirableModules(
  environment: NodeJS.ProcessEnv,
  dependencies: Pick<DoctorDependencies, 'retirableModules'>,
): Promise<DoctorCheck> {
  const connectionString = environment.DATABASE_URL;
  if (!connectionString) return skip('retirable-modules', 'DATABASE_URL is not configured');
  try {
    const retirable = await dependencies.retirableModules(connectionString);
    return pass(
      'retirable-modules',
      retirable.length === 0
        ? 'No installed discipline versions are retirable'
        : `Retirable discipline versions: ${retirable.map((module_) => `${module_.alias}@${module_.version}`).join(', ')}`,
    );
  } catch (error) {
    // Never fail: doctor runs on a clean, unmigrated host too (this is
    // exactly what caught it — the schema doesn't exist yet at that point),
    // and this check is purely informational, not a readiness gate.
    return skip('retirable-modules', `Could not compute retirable modules: ${errorMessage(error)}`);
  }
}

/**
 * A real write/read/delete round-trip, replacing the
 * former URL-reachability-only check — reachability passes on a bucket that
 * exists but denies writes, or credentials that resolve DNS fine and then
 * fail every request. `objectStorageConfigFromEnv` never leaves this
 * unconfigured (a filesystem fallback always resolves), so this always
 * actually runs, against whichever profile is active.
 */
export async function validateObjectStorage(
  environment: NodeJS.ProcessEnv,
  dependencies: Pick<DoctorDependencies, 'objectStorageRoundTrip'>,
): Promise<DoctorCheck> {
  try {
    await dependencies.objectStorageRoundTrip(environment);
    return pass('object-storage', 'Object storage accepts a write, read and delete round-trip');
  } catch (error) {
    return fail('object-storage', `Object storage round-trip failed: ${errorMessage(error)}`);
  }
}

export async function validatePersistentPath(
  environment: NodeJS.ProcessEnv,
  dependencies: Pick<DoctorDependencies, 'ensureWritable'>,
): Promise<readonly DoctorCheck[]> {
  const path = environment.COPALIBRE_DATA_DIR ?? './data';
  try {
    await dependencies.ensureWritable(path);
    return [pass('persistent-path', `${path} is writable`)];
  } catch (error) {
    return [fail('persistent-path', `${path} is not writable: ${errorMessage(error)}`)];
  }
}

export async function validateReverseProxy(
  options: DoctorOptions,
  dependencies: Pick<DoctorDependencies, 'fetch'>,
): Promise<DoctorCheck> {
  const target = options.proxyUrl;
  if (!target) return fail('reverse-proxy', '--proxy-url is required with --check-proxy');
  try {
    const response = await dependencies.fetch(target, {
      headers: { Accept: 'text/event-stream' },
      signal: AbortSignal.timeout(5_000),
    });
    const cacheControl = response.headers.get('cache-control') ?? '';
    const contentType = response.headers.get('content-type') ?? '';
    const buffering = response.headers.get('x-accel-buffering');
    if (!response.ok) throw new Error(`returned HTTP ${response.status}`);
    if (!contentType.includes('text/event-stream'))
      throw new Error('does not preserve SSE content type');
    if (!cacheControl.includes('no-transform'))
      throw new Error('does not preserve Cache-Control: no-transform');
    if (buffering !== 'no')
      throw new Error('does not disable SSE buffering (X-Accel-Buffering: no)');
    await validateHeartbeatDelivery(response);
    return pass(
      'reverse-proxy',
      'SSE response preserves headers, immediate delivery and an idle heartbeat',
    );
  } catch (error) {
    return fail('reverse-proxy', `Proxy conformance failed: ${errorMessage(error)}`);
  }
}

async function validateHeartbeatDelivery(response: Response): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('does not provide an SSE response body');
  try {
    const decoder = new TextDecoder();
    const first = decoder.decode((await readWithin(reader, 1_000)).value);
    if (!first.includes(': copalibre-proxy-check-1')) {
      throw new Error('does not deliver the initial SSE heartbeat immediately');
    }
    let remaining = first;
    while (!remaining.includes(': copalibre-proxy-check-2')) {
      const next = await readWithin(reader, 4_000);
      if (next.done) throw new Error('does not preserve the SSE idle heartbeat');
      remaining += decoder.decode(next.value, { stream: true });
    }
  } finally {
    await reader.cancel();
  }
}

async function readWithin(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeoutMilliseconds: number,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error('does not deliver an SSE heartbeat before timeout')),
          timeoutMilliseconds,
        );
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

function validateEmailConfiguration(environment: NodeJS.ProcessEnv): DoctorCheck {
  const provider = environment.COPALIBRE_EMAIL_PROVIDER;
  const common = ['COPALIBRE_APP_URL', 'COPALIBRE_EMAIL_FROM'];
  const missing = common.filter((name) => !environment[name]?.trim());
  if (!isEmailProvider(provider)) {
    return fail('smtp', 'COPALIBRE_EMAIL_PROVIDER must be resend, brevo, mailgun, or smtp');
  }
  const providerSecrets: Record<EmailProvider, readonly string[]> = {
    resend: ['COPALIBRE_RESEND_API_KEY'],
    brevo: ['COPALIBRE_BREVO_API_KEY'],
    mailgun: ['COPALIBRE_MAILGUN_API_KEY', 'COPALIBRE_MAILGUN_DOMAIN'],
    smtp: ['COPALIBRE_SMTP_URL'],
  };
  missing.push(...providerSecrets[provider].filter((name) => !environment[name]?.trim()));
  return missing.length === 0
    ? pass('smtp', `Email provider ${provider} is configured`)
    : fail('smtp', `Email delivery is missing: ${missing.join(', ')}`);
}

function requiredCheck(environment: NodeJS.ProcessEnv, name: string): DoctorCheck {
  return environment[name]?.trim()
    ? pass(`secret:${name}`, `${name} is configured`)
    : fail(`secret:${name}`, `${name} is required`);
}

/* istanbul ignore next -- exercised through the doctor integration command. */
function systemDoctorDependencies(): DoctorDependencies {
  return {
    lookupHost: async (hostname) => {
      await lookup(hostname);
    },
    probeDatabase: async (connectionString) => {
      const database = createDatabase({ connectionString, maxConnections: 1 });
      try {
        await sql`select 1`.execute(database);
      } finally {
        await database.destroy();
      }
    },
    ensureWritable: async (path) => {
      await mkdir(path, { recursive: true });
      await access(dirname(path));
      await access(path);
    },
    retirableModules: async (connectionString) => {
      const database = createDatabase({ connectionString, maxConnections: 1 });
      try {
        // Scoped to community-installed modules — installed_modules
        // only tracks those; the first-party catalogue's own aliases are
        // reserved, not candidates for retirement.
        const retirable = await new CompetitionRecordRepository(
          database,
        ).retirableDescriptorVersions();
        const modules = await new InstalledModuleRepository(database).list();
        const aliasByDescriptor = new Map(
          modules
            .filter((module_) => module_.kind === 'discipline')
            .map((module_) => [`${module_.documentId}@${module_.version}`, module_.alias]),
        );
        return retirable
          .map((row) => ({
            alias: aliasByDescriptor.get(`${row.descriptorId}@${row.version}`),
            version: row.version,
          }))
          .filter((row): row is RetirableModule => row.alias !== undefined);
      } finally {
        await database.destroy();
      }
    },
    fetch,
    objectStorageRoundTrip: async (environment) => {
      const adapter = createObjectStorageAdapter(objectStorageConfigFromEnv(environment));
      const key = `doctor-probe/${randomUUID()}`;
      const probe = new TextEncoder().encode('copalibre doctor round-trip probe');
      const reference = await adapter.put(key, probe, 'text/plain');
      const read = await adapter.get(reference);
      if (Buffer.compare(Buffer.from(read.body), Buffer.from(probe)) !== 0) {
        throw new Error('read back different bytes than were written');
      }
      await adapter.delete(reference);
    },
  };
}

function pass(name: string, message: string): DoctorCheck {
  return { name, status: 'pass', message };
}

function fail(name: string, message: string): DoctorCheck {
  return { name, status: 'fail', message };
}

function skip(name: string, message: string): DoctorCheck {
  return { name, status: 'skip', message };
}

function isEmailProvider(value: string | undefined): value is EmailProvider {
  return (EMAIL_PROVIDERS as readonly string[]).includes(value ?? '');
}

function isLocalHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
