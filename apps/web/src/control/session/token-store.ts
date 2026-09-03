/**
 * Where the access token lives: memory, and nowhere else.
 *
 * `localStorage` and `sessionStorage` are readable by any script that reaches
 * the page, and a cookie that JavaScript can set is a cookie XSS can read. A
 * token in a module variable dies with the tab, which costs a re-authentication
 * on reload and buys the one property worth having: it cannot be exfiltrated by
 * reading storage.
 *
 * The strict/pragmatic split is about the *refresh* credential, never the
 * access token. Strict re-authenticates on reload; pragmatic lets the
 * authorization server keep a session so the reload is silent. Neither writes
 * the access token down.
 */

export type SessionMode = 'strict-stateless' | 'pragmatic-persistent';

export interface TokenStore {
  read(): string | undefined;
  write(token: string, expiresAtMs: number): void;
  clear(): void;
  isExpired(now?: number): boolean;
}

/** RFC 9068 access-token scopes used only for client-side presentation guards. */
export function accessTokenScopes(token: string | undefined): readonly string[] {
  if (!token) return [];
  const payload = token.split('.')[1];
  if (!payload) return [];
  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const parsed = JSON.parse(atob(padded)) as { readonly scp?: unknown };
    if (typeof parsed.scp === 'string') return parsed.scp.split(/\s+/).filter(Boolean);
    if (Array.isArray(parsed.scp))
      return parsed.scp.filter((scope): scope is string => typeof scope === 'string');
  } catch {
    // Opaque/malformed tokens expose no presentation scopes; API authorization remains authoritative.
  }
  return [];
}

export function accessTokenHasScope(token: string | undefined, scope: string): boolean {
  return accessTokenScopes(token).includes(scope);
}

export function createTokenStore(
  now: () => number = Date.now,
  options?: { readonly storage?: Storage },
): TokenStore {
  let token: string | undefined;
  let expiresAt = 0;

  const storageKey = 'copalibre:session:v1';
  const storage = options?.storage;

  const restoreFromStorage = (): void => {
    if (!storage) return;
    try {
      const raw = storage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { token?: string; expiresAt?: number };
      if (parsed.token && typeof parsed.expiresAt === 'number' && parsed.expiresAt > now()) {
        token = parsed.token;
        expiresAt = parsed.expiresAt;
      } else {
        storage.removeItem(storageKey);
      }
    } catch {
      storage.removeItem(storageKey);
    }
  };

  restoreFromStorage();

  return {
    read: () => {
      if (token === undefined || expiresAt <= now()) {
        restoreFromStorage();
      }
      return token !== undefined && expiresAt > now() ? token : undefined;
    },
    write: (value, expiresAtMs) => {
      token = value;
      expiresAt = expiresAtMs;
      if (storage) {
        try {
          storage.setItem(storageKey, JSON.stringify({ token: value, expiresAt: expiresAtMs }));
        } catch {
          // Ignore quota errors in constrained environments
        }
      }
    },
    clear: () => {
      token = undefined;
      expiresAt = 0;
      if (storage) {
        try {
          storage.removeItem(storageKey);
        } catch {
          // Ignore
        }
      }
    },
    isExpired: (at = now()) => {
      if (token === undefined || expiresAt <= at) {
        restoreFromStorage();
      }
      return token === undefined || expiresAt <= at;
    },
  };
}

const defaultSessionStorage =
  typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined'
    ? window.sessionStorage
    : undefined;

/**
 * The one instance every control-panel screen actually uses: written
 * by the `/control/callback` or login screen on a successful login, read by every
 * screen's `ControlApiClient` and by `ControlApp`'s route guard.
 *
 * Scoped to the browser session tab (sessionStorage) so an accidental reload does
 * not log the operator out under live operational pressure, while ensuring the
 * token is purged as soon as the tab is closed.
 */
export const controlTokenStore: TokenStore = createTokenStore(Date.now, {
  storage: defaultSessionStorage,
});

/**
 * What a reload means in each mode.
 *
 * Stated as a function rather than an `if` inside a component, so the two modes
 * are one decision in one place instead of a branch every screen repeats.
 */
export function reloadBehaviour(mode: SessionMode): 'reauthenticate' | 'silent-renew' {
  return mode === 'strict-stateless' ? 'reauthenticate' : 'silent-renew';
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
  'refresh_token',
];
