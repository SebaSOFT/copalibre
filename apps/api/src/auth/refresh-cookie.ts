export const REFRESH_COOKIE_NAME = 'copalibre_refresh_token';

export function readRefreshCookie(cookieHeader?: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(';')) {
    const [rawName, ...rawValue] = part.trim().split('=');
    if (rawName === REFRESH_COOKIE_NAME) return rawValue.join('=');
  }
  return undefined;
}
