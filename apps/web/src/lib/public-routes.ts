import type { SitemapEntry } from '@copalibre/routing';

/** Public canonical routes this build advertises. Replaced by a query in 0021. */
export const PUBLIC_ROUTES: readonly SitemapEntry[] = [
  {
    input: { organizationAlias: 'liga-mendocina' },
    changeFrequency: 'daily',
  },
  {
    input: { organizationAlias: 'liga-mendocina', tournamentAlias: 'apertura-2026' },
    changeFrequency: 'hourly',
  },
];
