import type { SitemapEntry } from '@copalibre/routing';

/**
 * Locale variants this build advertises for every route below: English
 * (the primary locale, `input.locale` left unset so `publicPath` emits no
 * prefix) plus every non-primary locale with populated content.
 */
const NON_PRIMARY_LOCALES = ['es', 'fr', 'pt', 'it', 'de', 'ru', 'zh'] as const;

/** Public canonical routes this build advertises. Replaced by a query later. */
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
  {
    input: {
      organizationAlias: 'liga-mendocina',
      tournamentAlias: 'apertura-2026',
      stageNumber: 1,
      matchNumber: 1,
    },
    changeFrequency: 'hourly',
  },
  ...NON_PRIMARY_LOCALES.map((locale): SitemapEntry => ({
    input: {
      organizationAlias: 'liga-mendocina',
      tournamentAlias: 'apertura-2026',
      stageNumber: 1,
      matchNumber: 1,
      locale,
    },
    changeFrequency: 'hourly',
  })),
];
