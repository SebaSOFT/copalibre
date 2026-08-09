import type { SitemapEntry } from '@copalibre/routing';

/**
 * Locale variants this build advertises for every route below (0055): English
 * (the primary locale, `input.locale` left unset so `publicPath` emits no
 * prefix) plus every non-primary locale with populated content. The remaining
 * five supported languages are a separate follow-up (0056).
 */
const NON_PRIMARY_LOCALES = ['es'] as const;

/** Public canonical routes this build advertises. Replaced by a query in 0021. */
export const PUBLIC_ROUTES: readonly SitemapEntry[] = [
  {
    input: { organizationAlias: 'liga-mendocina' },
    changeFrequency: 'daily',
  },
  ...NON_PRIMARY_LOCALES.map((locale): SitemapEntry => ({
    input: { organizationAlias: 'liga-mendocina', locale },
    changeFrequency: 'daily',
  })),
  {
    input: { organizationAlias: 'liga-mendocina', tournamentAlias: 'apertura-2026' },
    changeFrequency: 'hourly',
  },
  ...NON_PRIMARY_LOCALES.map((locale): SitemapEntry => ({
    input: { organizationAlias: 'liga-mendocina', tournamentAlias: 'apertura-2026', locale },
    changeFrequency: 'hourly',
  })),
];
