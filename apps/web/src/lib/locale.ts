import { isSupportedLanguage, type SupportedLanguage } from '@copalibre/domain';

/**
 * Returns the URL path prefix for a locale.
 * Primary locale ('en') has an empty prefix; non-primary locales return `/${locale}`.
 */
export function getLocalePrefix(locale: string): string {
  if (!locale || locale === 'en') return '';
  return `/${locale}`;
}

/**
 * Returns the root home path for a locale: '/' for English, '/es/' for Spanish, etc.
 */
export function getLocaleHomePath(locale: string): string {
  const prefix = getLocalePrefix(locale);
  return prefix ? `${prefix}/` : '/';
}

/**
 * Resolves a SupportedLanguage from a URL pathname.
 * Extracts the first path segment (e.g. '/es/...' -> 'es') if it is a supported language;
 * otherwise falls back to 'en'.
 */
export function resolvePathLocale(pathname: string): SupportedLanguage {
  const normalized = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const segments = normalized.split('/').filter(Boolean);
  if (segments.length > 0 && isSupportedLanguage(segments[0])) {
    return segments[0];
  }
  return 'en';
}
