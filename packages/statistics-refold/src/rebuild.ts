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
  readonly audit?: {
    readonly actor: string;
    readonly authorizationContext: string;
  };
}

export interface StatisticsRebuildResult {
  readonly organizationAlias: string;
  readonly tournamentAlias?: string;
  readonly matches: number;
  readonly figures: number;
}

async function resolveRebuildScope(
  db: Kysely<Database>,
  options: StatisticsRebuildOptions,
): Promise<{
  readonly organizationId: string;
  readonly matchIds: readonly string[];
}> {
  const organizations = new OrganizationRepository(db);
  const competition = new CompetitionRepository(db);
  const tournaments = new TournamentRepository(db);

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
  return { organizationId: organization.organizationId, matchIds };
}

/** Computes the exact result counts for a rebuild without writing projections, audits or events. */
export async function previewStatisticsRebuild(
  db: Kysely<Database>,
  options: StatisticsRebuildOptions,
): Promise<StatisticsRebuildResult> {
  const { matchIds } = await resolveRebuildScope(db, options);
  const refold = createRefold(db);
  let figures = 0;
  for (const matchId of matchIds) {
    figures += (await refold(matchId))?.length ?? 0;
  }

  return {
    organizationAlias: options.organization,
    ...(options.tournament === undefined ? {} : { tournamentAlias: options.tournament }),
    matches: matchIds.length,
    figures,
  };
}

export async function runStatisticsRebuild(
  db: Kysely<Database>,
  options: StatisticsRebuildOptions,
): Promise<StatisticsRebuildResult> {
  const { organizationId, matchIds } = await resolveRebuildScope(db, options);
  const statistics = new StatisticRepository(db);
  const projections = new ProjectionStore(db);

  const projection = new StatisticProjection(statistics, createRefold(db));
  const audit = options.audit;
  let figures = 0;
  for (const matchId of matchIds) {
    const outcome = await withTransaction(db, async (uow) => {
      const version = await projections.nextVersion(uow, {
        projectionType: 'statistic-totals',
        entityId: matchId,
      });
      const applied = await projection.apply(uow, {
        eventType: 'match.finalized',
        organizationId,
        entityId: matchId,
        projectionVersion: version,
      });
      if (audit !== undefined) {
        await uow.recordAudit({
          organizationId,
          entityType: 'match',
          entityId: matchId,
          action: 'statistics.rebuilt',
          actor: audit.actor,
          authorizationContext: audit.authorizationContext,
          resultingState: { figures: applied.figures },
          reason: 'Statistics recomputed from source facts',
        });
        await uow.publishEvent({
          organizationId,
          stream: `organization:${organizationId}`,
          entityId: matchId,
          eventType: 'statistics.rebuilt',
          projectionVersion: version,
          payload: { matchId, figures: applied.figures, actor: audit.actor },
        });
      }
      return applied;
    });
    figures += outcome.figures;
  }

  if (matchIds.length === 0 && audit !== undefined) {
    await withTransaction(db, async (uow) => {
      await uow.recordAudit({
        organizationId,
        entityType: 'organization',
        entityId: organizationId,
        action: 'statistics.rebuilt',
        actor: audit.actor,
        authorizationContext: audit.authorizationContext,
        resultingState: { matches: 0, figures: 0 },
        reason: 'Statistics recomputed from source facts',
      });
      await uow.publishEvent({
        organizationId,
        stream: `organization:${organizationId}`,
        entityId: organizationId,
        eventType: 'statistics.rebuilt',
        projectionVersion: 1,
        payload: { matches: 0, figures: 0, actor: audit.actor },
      });
    });
  }

  return {
    organizationAlias: options.organization,
    ...(options.tournament === undefined ? {} : { tournamentAlias: options.tournament }),
    matches: matchIds.length,
    figures,
  };
}
