import { createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';
import { decodeJwt } from 'jose';
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME, readCookie } from '@copalibre/auth';
import { ForbiddenException } from '../http/error-contract.js';
import { getLocalKeys } from './local-signing-keys.js';
import type { RequestWithSubject } from './request-context.js';

/**
 * Signed double-submit CSRF protection for cookie-authenticated requests.
 *
 * `SameSite=Strict` on the session cookie is the first layer; this is the
 * second. On every session-cookie issue the API also sets a script-readable
 * CSRF cookie whose value is `<random>.<HMAC(key, random + "." + binding)>`,
 * where `binding` identifies the access token in the session cookie (its
 * `jti`, or a SHA-256 of the token when the provider issues none). Control
 * echoes the cookie in a header on unsafe methods.
 *
 * Plain double-submit lets a planted cookie win; signing the value and
 * binding it to the session means a value minted for one session never
 * validates for another. The key is derived from the installation's native
 * signing key, so every API node shares it without new configuration and the
 * API stays stateless.
 */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const RANDOM_BYTES = 32;
const HKDF_INFO = 'copalibre-csrf-v1';

let cachedKey: Buffer | undefined;

function csrfKey(): Buffer {
  if (cachedKey) return cachedKey;
  const material = getLocalKeys().privateKey;
  cachedKey = Buffer.from(hkdfSync('sha256', material, 'copalibre-csrf', HKDF_INFO, 32));
  return cachedKey;
}

/** The value a CSRF token is bound to: the token's `jti`, else a hash of the token. */
export function sessionBinding(accessToken: string): string {
  try {
    const { jti } = decodeJwt(accessToken);
    if (typeof jti === 'string' && jti.length > 0) return `jti:${jti}`;
  } catch {
    // Not a decodable JWT: fall through to the hash, which still binds it.
  }
  return `sha256:${createHash('sha256').update(accessToken).digest('base64url')}`;
}

function sign(random: string, binding: string, key: Buffer): string {
  return createHmac('sha256', key).update(`${random}.${binding}`).digest('base64url');
}

/** Mints a CSRF value bound to this access token. */
export function mintCsrfToken(accessToken: string, key: Buffer = csrfKey()): string {
  const random = randomBytes(RANDOM_BYTES).toString('base64url');
  return `${random}.${sign(random, sessionBinding(accessToken), key)}`;
}

function equalStrings(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export type CsrfFailure = 'missing' | 'mismatch' | 'invalid-signature';

/**
 * Checks the header against the cookie (constant time), then the signature and
 * its binding to the access token the request authenticated with.
 */
export function verifyCsrf(
  header: string | undefined,
  cookie: string | undefined,
  accessToken: string,
  key: Buffer = csrfKey(),
): CsrfFailure | undefined {
  if (!header || !cookie) return 'missing';
  if (!equalStrings(header, cookie)) return 'mismatch';
  const separator = cookie.indexOf('.');
  if (separator <= 0) return 'invalid-signature';
  const random = cookie.slice(0, separator);
  const signature = cookie.slice(separator + 1);
  const expected = sign(random, sessionBinding(accessToken), key);
  return equalStrings(signature, expected) ? undefined : 'invalid-signature';
}

/** DI token for the CSRF key; tests override it, production derives it lazily. */
export const CSRF_KEY = Symbol('CSRF_KEY');

/**
 * Global guard, registered after `JwtAuthGuard`. It acts only on requests that
 * authenticated by the session cookie with an unsafe method; a Bearer client
 * carries no ambient credential a forged request could ride, so it needs none.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(@Optional() @Inject(CSRF_KEY) private readonly key?: Buffer) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithSubject>();
    if (request.authSource !== 'cookie' || request.accessToken === undefined) return true;
    if (SAFE_METHODS.has((request.method ?? 'GET').toUpperCase())) return true;

    const rawHeader = request.headers[CSRF_HEADER_NAME];
    const header = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
    const cookie = readCookie(request.headers.cookie, CSRF_COOKIE_NAME);
    const failure = verifyCsrf(header, cookie, request.accessToken, this.key ?? csrfKey());
    if (failure !== undefined) {
      throw new ForbiddenException('CSRF token missing or invalid', { errorCode: 'auth-csrf' });
    }
    return true;
  }
}
