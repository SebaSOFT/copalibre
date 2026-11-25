import type { SitemapEntry } from '@copalibre/routing';
import {
  fetchOrganizations,
  fetchOrganizationTournaments,
  fetchOverview,
} from './public-api-client.js';

export const NON_PRIMARY_LOCALES = ['es', 'fr', 'pt', 'it', 'de', 'ru', 'zh'] as const;

export interface OrgWithTournaments {
  readonly organizationAlias: string;
  /** The organization's aliased clubs, each with an organization club page. */
  readonly clubAliases?: readonly string[];
  readonly tournaments: readonly {
    readonly alias: string;
    readonly clubAliases?: readonly string[];
  }[];
}

export function buildSitemapEntries(data: readonly OrgWithTournaments[]): readonly SitemapEntry[] {
  const entries: SitemapEntry[] = [];

  for (const org of data) {
    entries.push({
      input: { organizationAlias: org.organizationAlias },
      changeFrequency: 'daily',
    });

    for (const locale of NON_PRIMARY_LOCALES) {
      entries.push({
        input: { organizationAlias: org.organizationAlias, locale },
        changeFrequency: 'daily',
      });
    }

    for (const clubAlias of org.clubAliases ?? []) {
      entries.push({
        input: { organizationAlias: org.organizationAlias, clubAlias },
        changeFrequency: 'daily',
      });
      for (const locale of NON_PRIMARY_LOCALES) {
        entries.push({
          input: { organizationAlias: org.organizationAlias, clubAlias, locale },
          changeFrequency: 'daily',
        });
      }
    }

    for (const t of org.tournaments) {
      entries.push({
        input: { organizationAlias: org.organizationAlias, tournamentAlias: t.alias },
        changeFrequency: 'hourly',
      });

      for (const locale of NON_PRIMARY_LOCALES) {
        entries.push({
          input: { organizationAlias: org.organizationAlias, tournamentAlias: t.alias, locale },
          changeFrequency: 'hourly',
        });
      }

      // A tournament without clubs has no club index and no club page to advertise.
      const clubAliases = t.clubAliases ?? [];
      if (clubAliases.length === 0) continue;

      entries.push({
        input: {
          organizationAlias: org.organizationAlias,
          tournamentAlias: t.alias,
          clubIndex: true,
        },
        changeFrequency: 'daily',
      });

      for (const locale of NON_PRIMARY_LOCALES) {
        entries.push({
          input: {
            organizationAlias: org.organizationAlias,
            tournamentAlias: t.alias,
            clubIndex: true,
            locale,
          },
          changeFrequency: 'daily',
        });
      }

      for (const clubAlias of clubAliases) {
        entries.push({
          input: {
            organizationAlias: org.organizationAlias,
            tournamentAlias: t.alias,
            clubAlias,
          },
          changeFrequency: 'daily',
        });

        for (const locale of NON_PRIMARY_LOCALES) {
          entries.push({
            input: {
              organizationAlias: org.organizationAlias,
              tournamentAlias: t.alias,
              clubAlias,
              locale,
            },
            changeFrequency: 'daily',
          });
        }
      }
    }
  }

  return entries;
}

/** Concurrent work over `items`, with at most `limit` calls in flight; results keep the input order. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await mapper(items[index] as T);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Overview fetches in flight at once while the sitemap is built; bounded so a large catalogue is not a burst. */
export const SITEMAP_OVERVIEW_CONCURRENCY = 4;

export async function fetchPublicSitemapRoutes(): Promise<readonly SitemapEntry[]> {
  const orgs = (await fetchOrganizations()) ?? [];
  const orgData: OrgWithTournaments[] = [];

  for (const org of orgs) {
    const tournamentList = await fetchOrganizationTournaments(org.alias);
    const tournaments = await mapWithConcurrency(
      tournamentList?.tournaments ?? [],
      SITEMAP_OVERVIEW_CONCURRENCY,
      async (t) => {
        const overview = await fetchOverview(org.alias, t.alias).catch(() => undefined);
        const clubAliases = (overview?.clubs ?? []).map((club) => club.alias);
        return { alias: t.alias, clubAliases };
      },
    );
    orgData.push({
      organizationAlias: org.alias,
      clubAliases: (tournamentList?.clubs ?? []).map((club) => club.alias),
      tournaments,
    });
  }

  return buildSitemapEntries(orgData);
}

/** Public canonical routes fallback/fixture for static testing. */
export const PUBLIC_ROUTES: readonly SitemapEntry[] = buildSitemapEntries([
  {
    organizationAlias: 'liga-mendocina',
    tournaments: [{ alias: 'apertura-2026' }],
  },
]);
