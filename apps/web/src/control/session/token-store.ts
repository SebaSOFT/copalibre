/**
 * Where the access token lives (0022): memory, and nowhere else.
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

export function createTokenStore(now: () => number = Date.now): TokenStore {
  let token: string | undefined;
  let expiresAt = 0;

  return {
    read: () => (token !== undefined && expiresAt > now() ? token : undefined),
    write: (value, expiresAtMs) => {
      token = value;
      expiresAt = expiresAtMs;
    },
    clear: () => {
      token = undefined;
      expiresAt = 0;
    },
    isExpired: (at = now()) => token === undefined || expiresAt <= at,
  };
}

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
