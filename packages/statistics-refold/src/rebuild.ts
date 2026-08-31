import {
  CompetitionRepository,
  OrganizationRepository,
  ProjectionStore,
  StatisticProjection,
  StatisticRepository,
  TournamentRepository,
  withTransaction,
  type Database,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import { createRefold } from './refold.js';

/**
 * Recomputes every folded total from source facts, for an organization or
 * one tournament within it (moved here from `apps/copalibre`
 * so `apps/api`'s admin HTTP surface can call the exact same logic the CLI's
 * direct-database path already uses, instead of duplicating it).
 *
 * First-deployment backfill (facts recorded before the fold engine existed
 * carry no `statistic_totals` rows at all) and "trust but verify" in one
 * operation, idempotent by construction: it calls `refold` through
 * `StatisticProjection.apply`, the exact write path (delete-then-insert,
 * projection versioning) the event-driven trigger already uses, so running it
 * twice reproduces the same rows rather than drifting from them.
 */

export interface StatisticsRebuildOptions {
  readonly organization: string;
  readonly tournament?: string;
}

export interface StatisticsRebuildResult {
  readonly organizationAlias: string;
  readonly tournamentAlias?: string;
  readonly matches: number;
  readonly figures: number;
}

export async function runStatisticsRebuild(
  db: Kysely<Database>,
  options: StatisticsRebuildOptions,
): Promise<StatisticsRebuildResult> {
  const organizations = new OrganizationRepository(db);
  const competition = new CompetitionRepository(db);
  const tournaments = new TournamentRepository(db);
  const statistics = new StatisticRepository(db);
  const projections = new ProjectionStore(db);

  const organization = await organizations.findByAlias(options.organization);
  if (!organization) throw new Error(`No organization "${options.organization}"`);

  let tournamentId: string | undefined;
  if (options.tournament !== undefined) {
    const tournament = await tournaments.findByScopedAlias(
      options.organization,
      options.tournament,
    );
    if (!tournament) {
      throw new Error(
        `No tournament "${options.tournament}" in organization "${options.organization}"`,
      );
    }
    tournamentId = tournament.tournamentId;
  }

  const matchIds = await competition.listFinalizedMatches({
    organizationId: organization.organizationId,
    ...(tournamentId === undefined ? {} : { tournamentId }),
  });

  const projection = new StatisticProjection(statistics, createRefold(db));
  let figures = 0;
  for (const matchId of matchIds) {
    const outcome = await withTransaction(db, async (uow) => {
      const version = await projections.nextVersion(uow, {
        projectionType: 'statistic-totals',
        entityId: matchId,
      });
      return projection.apply(uow, {
        eventType: 'match.finalized',
        organizationId: organization.organizationId,
        entityId: matchId,
        projectionVersion: version,
      });
    });
    figures += outcome.figures;
  }

  return {
    organizationAlias: options.organization,
    ...(options.tournament === undefined ? {} : { tournamentAlias: options.tournament }),
    matches: matchIds.length,
    figures,
  };
}
