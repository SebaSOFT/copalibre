import type { SitemapEntry } from '@copalibre/routing';
import { fetchOrganizations, fetchOrganizationTournaments } from './public-api-client.js';

export const NON_PRIMARY_LOCALES = ['es', 'fr', 'pt', 'it', 'de', 'ru', 'zh'] as const;

export interface OrgWithTournaments {
  readonly organizationAlias: string;
  readonly tournaments: readonly { readonly alias: string }[];
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
    }
  }

  return entries;
}

export async function fetchPublicSitemapRoutes(): Promise<readonly SitemapEntry[]> {
  const orgs = (await fetchOrganizations()) ?? [];
  const orgData: OrgWithTournaments[] = [];

  for (const org of orgs) {
    const tournamentList = await fetchOrganizationTournaments(org.alias);
    orgData.push({
      organizationAlias: org.alias,
      tournaments: (tournamentList?.tournaments ?? []).map((t) => ({ alias: t.alias })),
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
