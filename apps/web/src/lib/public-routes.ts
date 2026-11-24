import type { SitemapEntry } from '@copalibre/routing';
import {
  fetchOrganizations,
  fetchOrganizationTournaments,
  fetchOverview,
} from './public-api-client.js';
import { isValidClubAlias } from './club-url.js';

export const NON_PRIMARY_LOCALES = ['es', 'fr', 'pt', 'it', 'de', 'ru', 'zh'] as const;

export interface OrgWithTournaments {
  readonly organizationAlias: string;
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

      for (const clubAlias of t.clubAliases ?? []) {
        if (!isValidClubAlias(clubAlias)) continue;
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

export async function fetchPublicSitemapRoutes(): Promise<readonly SitemapEntry[]> {
  const orgs = (await fetchOrganizations()) ?? [];
  const orgData: OrgWithTournaments[] = [];

  for (const org of orgs) {
    const tournamentList = await fetchOrganizationTournaments(org.alias);
    const tournaments = await Promise.all(
      (tournamentList?.tournaments ?? []).map(async (t) => {
        const overview = await fetchOverview(org.alias, t.alias).catch(() => undefined);
        const clubAliases = (overview?.clubs ?? [])
          .map((club) => club.alias)
          .filter((alias): alias is string => isValidClubAlias(alias));
        return { alias: t.alias, clubAliases };
      }),
    );
    orgData.push({
      organizationAlias: org.alias,
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
