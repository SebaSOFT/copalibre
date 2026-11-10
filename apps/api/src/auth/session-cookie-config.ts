import { sessionCookieConfigFromEnv, type SessionCookieConfig } from '@copalibre/auth';

/** DI token for the installation's session cookie settings. */
export const SESSION_COOKIE_CONFIG = Symbol('SESSION_COOKIE_CONFIG');

export function sessionCookieConfigProvider(): SessionCookieConfig {
  return sessionCookieConfigFromEnv();
}
