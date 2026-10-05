import { isSupportedLanguage } from '@copalibre/domain';

/**
 * Replace or add the leading public locale prefix while leaving the resource path intact.
 * English is the canonical unprefixed locale.
 */
export function swapLocale(pathname: string, targetLocale: string): string {
  const normalized = pathname.startsWith('/') ? pathname : `/${pathname}`;
  if (!isSupportedLanguage(targetLocale)) return normalized;

  const segments = normalized.split('/');

  while (isSupportedLanguage(segments[1])) {
    segments.splice(1, 1);
  }

  const unprefixed = segments.join('/') || '/';
  if (targetLocale === 'en') return unprefixed;
  return unprefixed === '/' ? `/${targetLocale}` : `/${targetLocale}${unprefixed}`;
}
