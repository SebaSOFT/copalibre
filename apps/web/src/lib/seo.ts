import {
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
  isSupportedLanguage,
} from '@copalibre/domain';

export interface HreflangAlternate {
  readonly hreflang: string;
  readonly href: string;
}

export type JsonLdStructuredData =
  | {
      readonly '@type': 'SportsEvent';
      readonly name: string;
      readonly url: string;
      readonly startDate?: string;
      readonly endDate?: string;
      readonly description?: string;
    }
  | {
      readonly '@type': 'SportsOrganization';
      readonly name: string;
      readonly url: string;
      readonly logo?: string;
      readonly description?: string;
    };

export function stripLocalePrefix(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const segments = normalized.split('/').filter(Boolean);
  if (segments.length > 0 && isSupportedLanguage(segments[0]) && segments[0] !== 'en') {
    const remaining = segments.slice(1).join('/');
    return remaining ? `/${remaining}` : '/';
  }
  return normalized;
}

export function buildHreflangAlternates(
  site: string,
  canonicalPath: string,
  _currentLocale?: string,
  localeVariants: readonly SupportedLanguage[] | readonly string[] = SUPPORTED_LANGUAGES,
): readonly HreflangAlternate[] {
  const cleanSite = site.replace(/\/$/, '');
  const unprefixed = stripLocalePrefix(canonicalPath);
  const pathForLocale = (loc: string) => {
    if (loc === 'en') {
      return unprefixed === '' ? '/' : unprefixed;
    }
    return unprefixed === '/' ? `/${loc}` : `/${loc}${unprefixed}`;
  };

  const alternates: HreflangAlternate[] = localeVariants.map((loc) => ({
    hreflang: loc,
    href: `${cleanSite}${pathForLocale(loc)}`,
  }));

  alternates.push({
    hreflang: 'x-default',
    href: `${cleanSite}${pathForLocale('en')}`,
  });

  return alternates;
}

export function serializeJsonLd(data: JsonLdStructuredData): string {
  return JSON.stringify({
    '@context': 'https://schema.org',
    ...data,
  });
}

export function isCanonicalPathValidForLocale(canonicalPath: string, locale: string): boolean {
  const normalized = canonicalPath.startsWith('/') ? canonicalPath : `/${canonicalPath}`;
  if (locale === 'en') {
    const segments = normalized.split('/').filter(Boolean);
    if (segments.length > 0 && isSupportedLanguage(segments[0]) && segments[0] !== 'en') {
      return false;
    }
    return true;
  }
  return normalized === `/${locale}` || normalized.startsWith(`/${locale}/`);
}

export function assertCanonicalPathLocalePrefix(canonicalPath: string, locale: string): void {
  if (!isCanonicalPathValidForLocale(canonicalPath, locale)) {
    throw new Error(
      `canonicalPath "${canonicalPath}" does not match requested non-primary locale "${locale}" prefix`,
    );
  }
}
