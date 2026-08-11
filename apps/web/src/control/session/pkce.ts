/**
 * Authorization Code + PKCE, browser side (0022).
 *
 * PKCE rather than a client secret because a browser cannot keep one: anything
 * shipped to the page is readable by anyone who opens the devtools. The
 * verifier is generated per attempt, never stored anywhere durable, and the
 * challenge is what travels.
 */

export interface PkcePair {
  readonly verifier: string;
  readonly challenge: string;
  readonly method: 'S256';
}

const VERIFIER_BYTES = 64;

export async function createPkcePair(
  random: (size: number) => Uint8Array = randomBytes,
  digest: (input: string) => Promise<ArrayBuffer> = sha256,
): Promise<PkcePair> {
  const verifier = base64Url(random(VERIFIER_BYTES));
  const challenge = base64Url(new Uint8Array(await digest(verifier)));
  return { verifier, challenge, method: 'S256' };
}

/**
 * The authorization URL.
 *
 * `state` is required, not optional: without it a page cannot tell its own
 * redirect from one somebody else started, which is the CSRF this parameter
 * exists for.
 */
export function authorizationUrl(input: {
  readonly authorizeEndpoint: string;
  readonly clientId: string;
  readonly redirectUri: string;
  readonly scopes: readonly string[];
  readonly challenge: string;
  readonly state: string;
}): string {
  const url = new URL(input.authorizeEndpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', input.clientId);
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('scope', input.scopes.join(' '));
  url.searchParams.set('code_challenge', input.challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', input.state);
  return url.toString();
}

/** Refuses a callback whose state is not the one this page started with. */
export function verifyCallbackState(expected: string, received: string | null): boolean {
  return received !== null && received.length > 0 && received === expected;
}

function randomBytes(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

async function sha256(input: string): Promise<ArrayBuffer> {
  return globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
