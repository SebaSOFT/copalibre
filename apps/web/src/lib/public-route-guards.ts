import { isSupportedLanguage, SUPPORTED_LANGUAGES } from '@copalibre/domain';

export const RESERVED_PREFIXES = new Set([
  'control',
  'help',
  'tv',
  'api',
  'objects',
  'organizations',
  'disciplines',
  'tournament-profiles',
  'health',
  'invitations',
  'runtime-config.json',
  'sitemap.xml',
  'robots.txt',
  ...SUPPORTED_LANGUAGES,
]);

export function isReservedOrganizationAlias(alias: string): boolean {
  return RESERVED_PREFIXES.has(alias.toLowerCase());
}

/**
 * Whether the `[...locale]` rest segment of a public route is a real locale
 * prefix: absent (English) or one supported language code. Astro's rest
 * parameter swallows every extra segment, so `/es/a/b/c` reaches the
 * organization route with `locale: 'es/a/b'`; such a path names nothing.
 */
export function isPublicLocaleSegment(locale: string | undefined): boolean {
  return locale === undefined || locale === '' || isSupportedLanguage(locale);
}
