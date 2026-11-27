import { readCookie, REFRESH_COOKIE_NAME } from '@copalibre/auth';

export { REFRESH_COOKIE_NAME } from '@copalibre/auth';

export function readRefreshCookie(cookieHeader?: string | string[]): string | undefined {
  return readCookie(cookieHeader, REFRESH_COOKIE_NAME);
}
