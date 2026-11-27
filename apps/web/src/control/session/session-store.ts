import { API_PATH_PREFIX } from '../../lib/api-path.js';

/**
 * What Control knows about the signed-in session: who, which scopes, until
 * when, and how it was established. Never the access token.
 *
 * The token lives only in the `HttpOnly` session cookie the API sets, which no
 * script on this origin can read. Public pages share the origin and Control
 * links to them in the same tab, so anything a script could read here — any
 * storage, a readable cookie, a module variable — a script on any page could
 * read too. Control therefore keeps only this metadata, in memory, and asks
 * the API for it again after a reload (`GET /api/auth/session`). Nothing here
 * is written to `localStorage`, `sessionStorage` or IndexedDB.
 */

/** Whether a background renewal keeps the session alive; read from the runtime config. */
export type SessionMode = 'strict-stateless' | 'pragmatic-persistent';

/** Which mechanism established the session — decides how a silent renewal is attempted. */
export type AuthMethod = 'native' | 'oidc';

export interface SessionMetadata {
  readonly subject: string;
  readonly scopes: readonly string[];
  readonly expiresAtMs: number;
  readonly method: AuthMethod;
}

export interface SessionStore {
  /** The current session, or nothing once it has expired or been cleared. */
  read(): SessionMetadata | undefined;
  write(session: SessionMetadata): void;
  clear(): void;
  /**
   * How the last session was established, even once it has expired: a renewal
   * after expiry still has to know which mechanism to use.
   */
  method(): AuthMethod | undefined;
}

/** Parses the API's session metadata body (`subject`, `scopes`, `expiresAt`, `method`). */
export function parseSessionMetadata(body: unknown): SessionMetadata | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const candidate = body as Record<string, unknown>;
  const expiresAtMs =
    typeof candidate.expiresAt === 'string' ? Date.parse(candidate.expiresAt) : Number.NaN;
  if (
    typeof candidate.subject !== 'string' ||
    candidate.subject.length === 0 ||
    !Array.isArray(candidate.scopes) ||
    !Number.isFinite(expiresAtMs) ||
    (candidate.method !== 'native' && candidate.method !== 'oidc')
  ) {
    return undefined;
  }
  return {
    subject: candidate.subject,
    scopes: candidate.scopes.filter((scope): scope is string => typeof scope === 'string'),
    expiresAtMs,
    method: candidate.method,
  };
}

export function createSessionStore(now: () => number = Date.now): SessionStore {
  let current: SessionMetadata | undefined;
  return {
    read: () => (current !== undefined && current.expiresAtMs > now() ? current : undefined),
    write: (session) => {
      current = session;
    },
    clear: () => {
      current = undefined;
    },
    method: () => current?.method,
  };
}

/** Client-side presentation guard only; the API's authorization stays authoritative. */
export function sessionHasScope(session: SessionMetadata | undefined, scope: string): boolean {
  return session?.scopes.includes(scope) ?? false;
}

/** The one session every Control screen reads. */
export const controlSession: SessionStore = createSessionStore();

/**
 * Keys older builds wrote to `sessionStorage`: the first held the access token
 * itself, the second only which login screen was used. Both are deleted on
 * load, before any request, so a token an older build left behind does not
 * outlive the upgrade.
 */
export const LEGACY_SESSION_STORAGE_KEYS: readonly string[] = [
  'copalibre:session:v1',
  'copalibre:session:authMethod:v1',
];

export function removeLegacySessionStorage(storage: Storage | undefined): void {
  if (!storage) return;
  for (const key of LEGACY_SESSION_STORAGE_KEYS) {
    try {
      storage.removeItem(key);
    } catch {
      // Storage blocked: there is nothing an older build could have left in it.
    }
  }
}

removeLegacySessionStorage(
  typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined'
    ? window.sessionStorage
    : undefined,
);

let restoring: Promise<SessionMetadata | undefined> | undefined;

/**
 * Restores the session after a reload from `GET /api/auth/session`, which the
 * session cookie authenticates. Any answer but a usable 200 means signed out.
 * At most one request per page load; a later call shares it.
 */
export function restoreControlSession(
  fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<SessionMetadata | undefined> {
  const known = controlSession.read();
  if (known !== undefined) return Promise.resolve(known);
  restoring ??= fetchImpl(`${API_PATH_PREFIX}/auth/session`, { credentials: 'same-origin' })
    .then(async (response) => {
      if (!response.ok) return undefined;
      const session = parseSessionMetadata(await response.json());
      if (session !== undefined) controlSession.write(session);
      return session;
    })
    .catch(() => undefined)
    .finally(() => {
      restoring = undefined;
    });
  return restoring;
}

/**
 * The storage keys nothing may ever write.
 *
 * Named so a test can assert their absence — a rule that only exists in a
 * comment is a rule the next component silently breaks.
 */
export const FORBIDDEN_STORAGE_KEYS: readonly string[] = [
  'access_token',
  'accessToken',
  'copalibre.token',
  'copalibre_access_token',
  'refresh_token',
  ...LEGACY_SESSION_STORAGE_KEYS,
];
