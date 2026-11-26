import type { Stage, TournamentFormat } from '@copalibre/domain';
import type { Kysely, Transaction } from 'kysely';
import { sql } from 'kysely';
import { InvariantViolationError, NotFoundError } from '../../errors.js';
import { newId } from '../../ids.js';
import { toStage } from '../../mapping.js';
import type { Database } from '../../schema.js';
import type { UnitOfWork } from '../../transaction.js';
import type { AuditContext } from '../enrollment-repository.js';
import { assertStageHasNoFixtures } from './competition-support.js';
import { SeasonRepository } from './season-repository.js';

export interface StageDeletionConsequences {
  readonly stageId: string;
  readonly stageName: string;
  readonly fixtures: number;
  readonly matches: number;
  readonly zones: number;
  readonly groups: number;
  readonly matchEvents: number;
  readonly schedulePlacements: number;
  readonly scheduleOfficials: number;
  readonly participantReports: number;
  readonly reportEvidence: number;
  readonly statistics: number;
  readonly matchPermissions: number;
  readonly displayTokens: number;
  readonly stageConfigurations: number;
  readonly compiledRulesets: number;
  readonly thresholdConsumption: number;
  readonly promotionPlans: number;
  readonly commandRecords: number;
}

export interface StageDeletionResult {
  readonly stage: Stage;
  readonly consequences: StageDeletionConsequences;
}

export type StageDeletionDatabase = Kysely<Database> | Transaction<Database>;

async function countWhereIn(
  db: StageDeletionDatabase,
  table: string,
  column: string,
  ids: readonly string[],
): Promise<number> {
  if (ids.length === 0) return 0;
  const result = await sql<{ count: number }>`
    select count(*) as count from ${sql.table(table)}
    where ${sql.ref(column)} in (${sql.join(ids)})
  `.execute(db);
  return Number(result.rows[0]?.count ?? 0);
}

async function countWhereEqual(
  db: StageDeletionDatabase,
  table: string,
  column: string,
  value: string,
): Promise<number> {
  const result = await sql<{ count: number }>`
    select count(*) as count from ${sql.table(table)}
    where ${sql.ref(column)} = ${value}
  `.execute(db);
  return Number(result.rows[0]?.count ?? 0);
}

/** Stages: create, rename, format change, deletion preview and deletion, and stage listings. */
export class StageRepository {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly seasons: SeasonRepository,
  ) {}

  /**
   * A stage in a competition that has one edition.
   *
   * Not a shortcut around the season: it *resolves* the tournament's current
   * edition, creating the implicit one the first time. A caller that runs a
   * competition every year names the season itself; a caller that will only
   * ever run it once should not have to invent a name for that fact.
   */
  async createStageInTournament(
    uow: UnitOfWork,
    input: {
      readonly tournamentId: string;
      readonly number: number;
      readonly name: string;
      readonly format: TournamentFormat;
    } & AuditContext,
  ): Promise<Stage> {
    const season = await this.seasons.currentSeason(uow, {
      tournamentId: input.tournamentId,
      organizationId: input.organizationId,
      actor: input.actor,
      authorizationContext: input.authorizationContext,
    });
    return this.createStage(uow, { ...input, seasonId: season.seasonId });
  }

  async createStage(
    uow: UnitOfWork,
    input: {
      readonly seasonId: string;
      readonly number: number;
      readonly name: string;
      readonly format: TournamentFormat;
    } & AuditContext,
  ): Promise<Stage> {
    const stageId = newId();
    const row = await uow.tx
      .insertInto('stages')
      .values({
        stage_id: stageId,
        season_id: input.seasonId,
        number: input.number,
        name: input.name,
        format: input.format,
        stage_configuration_id: null,
        created_at: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const stage = toStage(row);
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'stage',
      entityId: stageId,
      action: 'stage.created',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { ...stage },
    });
    return stage;
  }

  /** Renames a stage — carries no structural consequence, permitted whether the stage is seeded or not. */
  async renameStage(
    uow: UnitOfWork,
    input: { readonly stageId: string; readonly name: string } & AuditContext,
  ): Promise<Stage> {
    const row = await uow.tx
      .updateTable('stages')
      .set({ name: input.name })
      .where('stage_id', '=', input.stageId)
      .returningAll()
      .executeTakeFirst();
    if (!row) {
      throw new NotFoundError(`Stage ${input.stageId} does not exist`, { stageId: input.stageId });
    }
    const stage = toStage(row);
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'stage',
      entityId: input.stageId,
      action: 'stage.renamed',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { name: input.name },
    });
    return stage;
  }

  /** Changes a stage's format, refused once it holds a fixture (`assertStageHasNoFixtures`). */
  async changeStageFormat(
    uow: UnitOfWork,
    input: { readonly stageId: string; readonly format: TournamentFormat } & AuditContext,
  ): Promise<Stage> {
    await assertStageHasNoFixtures(uow, input.stageId);
    const row = await uow.tx
      .updateTable('stages')
      .set({ format: input.format })
      .where('stage_id', '=', input.stageId)
      .returningAll()
      .executeTakeFirst();
    if (!row) {
      throw new NotFoundError(`Stage ${input.stageId} does not exist`, { stageId: input.stageId });
    }
    const stage = toStage(row);
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'stage',
      entityId: input.stageId,
      action: 'stage.format-changed',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { format: input.format },
    });
    return stage;
  }

  /** Read-only consequence counts for the stage removal confirmation. */
  async previewDeleteStage(stageId: string): Promise<StageDeletionConsequences> {
    return this.stageDeletionConsequences(this.db, stageId);
  }

  /**
   * Irreversibly removes a named stage and every record owned by its fixtures.
   * The name is checked again inside the transaction so a stale preview cannot
   * authorize deleting a renamed stage.
   */
  async deleteStage(
    uow: UnitOfWork,
    input: { readonly stageId: string; readonly confirmationName: string } & AuditContext,
  ): Promise<StageDeletionResult> {
    const consequences = await this.stageDeletionConsequences(uow.tx, input.stageId);
    if (consequences.stageName !== input.confirmationName) {
      throw new InvariantViolationError('Stage name confirmation did not match', {
        stageId: input.stageId,
      });
    }

    const fixtureRows = await uow.tx
      .selectFrom('fixtures')
      .select('fixture_id')
      .where('stage_id', '=', input.stageId)
      .execute();
    const fixtureIds = fixtureRows.map((fixture) => fixture.fixture_id);
    const matchRows =
      fixtureIds.length === 0
        ? []
        : await uow.tx
            .selectFrom('matches')
            .select('match_id')
            .where('fixture_id', 'in', fixtureIds)
            .execute();
    const matchIds = matchRows.map((match) => match.match_id);
    const zones = await uow.tx
      .selectFrom('zones')
      .select('zone_id')
      .where('stage_id', '=', input.stageId)
      .execute();
    const zoneIds = zones.map((zone) => zone.zone_id);
    const groups =
      zoneIds.length === 0
        ? []
        : await uow.tx
            .selectFrom('groups')
            .select('group_id')
            .where('zone_id', 'in', zoneIds)
            .execute();
    const groupIds = groups.map((group) => group.group_id);
    const reports =
      matchIds.length === 0
        ? []
        : await uow.tx
            .selectFrom('participant_reports')
            .select('report_id')
            .where('match_id', 'in', matchIds)
            .execute();
    const reportIds = reports.map((report) => report.report_id);

    if (reportIds.length > 0) {
      await uow.tx.deleteFrom('report_evidence').where('report_id', 'in', reportIds).execute();
      await uow.tx.deleteFrom('participant_reports').where('report_id', 'in', reportIds).execute();
    }

    if (matchIds.length > 0) {
      await uow.tx
        .deleteFrom('match_timer_resolutions')
        .where('match_id', 'in', matchIds)
        .execute();
      await uow.tx.deleteFrom('declared_effects').where('match_id', 'in', matchIds).execute();
      await uow.tx.deleteFrom('match_events').where('match_id', 'in', matchIds).execute();
      await uow.tx.deleteFrom('segments').where('match_id', 'in', matchIds).execute();
      await uow.tx.deleteFrom('match_schedule_history').where('match_id', 'in', matchIds).execute();
      await uow.tx
        .deleteFrom('match_schedule_officials')
        .where('match_id', 'in', matchIds)
        .execute();
      await uow.tx
        .deleteFrom('match_schedule_assignments')
        .where('match_id', 'in', matchIds)
        .execute();
      await uow.tx.deleteFrom('materialised_standings').where('match_id', 'in', matchIds).execute();
      await uow.tx
        .deleteFrom('statistic_totals')
        .where('source_match_id', 'in', matchIds)
        .execute();
      await uow.tx.deleteFrom('statistic_adjustments').where('match_id', 'in', matchIds).execute();
      await uow.tx.deleteFrom('match_rosters').where('match_id', 'in', matchIds).execute();
      await uow.tx
        .deleteFrom('match_command_idempotency')
        .where('match_id', 'in', matchIds)
        .execute();
      await uow.tx.deleteFrom('match_assignments').where('match_id', 'in', matchIds).execute();
      await uow.tx
        .updateTable('display_tokens')
        .set({ match_id: null, revoked_at: new Date() })
        .where('match_id', 'in', matchIds)
        .execute();
      await uow.tx.deleteFrom('projection_versions').where('entity_id', 'in', matchIds).execute();
    }

    if (matchIds.length > 0) {
      await uow.tx.deleteFrom('matches').where('match_id', 'in', matchIds).execute();
    }
    await uow.tx.deleteFrom('fixtures').where('stage_id', '=', input.stageId).execute();

    await uow.tx.deleteFrom('match_assignments').where('stage_id', '=', input.stageId).execute();
    await uow.tx
      .deleteFrom('materialised_standings')
      .where('stage_id', '=', input.stageId)
      .execute();
    await uow.tx.deleteFrom('compiled_rulesets').where('stage_id', '=', input.stageId).execute();
    await uow.tx
      .deleteFrom('collector_threshold_consumption')
      .where('stage_id', '=', input.stageId)
      .execute();
    await uow.tx
      .deleteFrom('promotion_plans')
      .where((eb) =>
        zoneIds.length === 0
          ? eb('next_stage_id', '=', input.stageId)
          : eb('next_stage_id', '=', input.stageId).or('zone_id', 'in', zoneIds),
      )
      .execute();

    if (zoneIds.length > 0) {
      if (groupIds.length > 0) {
        await uow.tx.deleteFrom('group_entrants').where('group_id', 'in', groupIds).execute();
        await uow.tx.deleteFrom('groups').where('group_id', 'in', groupIds).execute();
      }
      await uow.tx.deleteFrom('zone_entrants').where('zone_id', 'in', zoneIds).execute();
      await uow.tx.deleteFrom('zones').where('zone_id', 'in', zoneIds).execute();
    }

    await uow.tx.deleteFrom('stage_configurations').where('stage_id', '=', input.stageId).execute();

    const deleted = await uow.tx
      .deleteFrom('stages')
      .where('stage_id', '=', input.stageId)
      .returningAll()
      .executeTakeFirst();
    if (!deleted) {
      throw new NotFoundError(`Stage ${input.stageId} does not exist`, { stageId: input.stageId });
    }

    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'stage',
      entityId: input.stageId,
      action: 'stage.deleted',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      previousState: { ...toStage(deleted) },
      resultingState: { consequences },
      reason: 'Deleted after consequence confirmation',
    });
    await uow.publishEvent({
      organizationId: input.organizationId,
      stream: `stage:${input.stageId}`,
      entityId: input.stageId,
      eventType: 'stage.deleted',
      projectionVersion: 1,
      payload: { stageId: input.stageId, consequences, actor: input.actor },
    });
    return { stage: toStage(deleted), consequences };
  }

  async stageDeletionConsequences(
    db: StageDeletionDatabase,
    stageId: string,
  ): Promise<StageDeletionConsequences> {
    const stage = await db
      .selectFrom('stages')
      .select(['stage_id', 'name'])
      .where('stage_id', '=', stageId)
      .executeTakeFirst();
    if (!stage) throw new NotFoundError(`Stage ${stageId} does not exist`, { stageId });

    const [fixtureRows, zoneRows] = await Promise.all([
      db.selectFrom('fixtures').select('fixture_id').where('stage_id', '=', stageId).execute(),
      db.selectFrom('zones').select('zone_id').where('stage_id', '=', stageId).execute(),
    ]);
    const fixtureIds = fixtureRows.map((row) => row.fixture_id);
    const zoneIds = zoneRows.map((row) => row.zone_id);
    const [matchRows, groupRows] = await Promise.all([
      fixtureIds.length === 0
        ? Promise.resolve([])
        : db
            .selectFrom('matches')
            .select('match_id')
            .where('fixture_id', 'in', fixtureIds)
            .execute(),
      zoneIds.length === 0
        ? Promise.resolve([])
        : db.selectFrom('groups').select('group_id').where('zone_id', 'in', zoneIds).execute(),
    ]);
    const matchIds = matchRows.map((row) => row.match_id);
    const groupIds = groupRows.map((row) => row.group_id);
    const reportRows =
      matchIds.length === 0
        ? []
        : await db
            .selectFrom('participant_reports')
            .select('report_id')
            .where('match_id', 'in', matchIds)
            .execute();
    const reportIds = reportRows.map((row) => row.report_id);
    const promotionPlans =
      zoneIds.length === 0
        ? await countWhereEqual(db, 'promotion_plans', 'next_stage_id', stageId)
        : await sql<{ count: number }>`
            select count(*) as count from promotion_plans
            where next_stage_id = ${stageId}
              or zone_id in (${sql.join(zoneIds)})
          `
            .execute(db)
            .then((result) => Number(result.rows[0]?.count ?? 0));

    const [
      matchEvents,
      schedulePlacements,
      scheduleOfficials,
      participantReports,
      reportEvidence,
      statisticTotals,
      statisticAdjustments,
      standings,
      matchPermissions,
      stagePermissions,
      displayTokens,
      stageConfigurations,
      compiledRulesets,
      thresholdConsumption,
      commandRecords,
    ] = await Promise.all([
      countWhereIn(db, 'match_events', 'match_id', matchIds),
      countWhereIn(db, 'match_schedule_assignments', 'match_id', matchIds),
      countWhereIn(db, 'match_schedule_officials', 'match_id', matchIds),
      Promise.resolve(reportIds.length),
      countWhereIn(db, 'report_evidence', 'report_id', reportIds),
      countWhereIn(db, 'statistic_totals', 'source_match_id', matchIds),
      countWhereIn(db, 'statistic_adjustments', 'match_id', matchIds),
      countWhereEqual(db, 'materialised_standings', 'stage_id', stageId),
      countWhereIn(db, 'match_assignments', 'match_id', matchIds),
      countWhereEqual(db, 'match_assignments', 'stage_id', stageId),
      countWhereIn(db, 'display_tokens', 'match_id', matchIds),
      countWhereEqual(db, 'stage_configurations', 'stage_id', stageId),
      countWhereEqual(db, 'compiled_rulesets', 'stage_id', stageId),
      countWhereEqual(db, 'collector_threshold_consumption', 'stage_id', stageId),
      countWhereIn(db, 'match_command_idempotency', 'match_id', matchIds),
    ]);

    return {
      stageId,
      stageName: stage.name,
      fixtures: fixtureIds.length,
      matches: matchIds.length,
      zones: zoneIds.length,
      groups: groupIds.length,
      matchEvents,
      schedulePlacements,
      scheduleOfficials,
      participantReports,
      reportEvidence,
      statistics: statisticTotals + statisticAdjustments + standings,
      matchPermissions: matchPermissions + stagePermissions,
      displayTokens,
      stageConfigurations,
      compiledRulesets,
      thresholdConsumption,
      promotionPlans,
      commandRecords,
    };
  }

  /** The stages of one edition, in order. */
  async listStages(seasonId: string): Promise<readonly Stage[]> {
    const rows = await this.db
      .selectFrom('stages')
      .selectAll()
      .where('season_id', '=', seasonId)
      .orderBy('number')
      .execute();
    return rows.map(toStage);
  }

  /** Every stage a tournament has ever played, across its editions. */
  async listStagesOfTournament(tournamentId: string): Promise<readonly Stage[]> {
    const rows = await this.db
      .selectFrom('stages')
      .innerJoin('seasons', 'seasons.season_id', 'stages.season_id')
      .selectAll('stages')
      .where('seasons.tournament_id', '=', tournamentId)
      .orderBy('seasons.ordinal')
      .orderBy('stages.number')
      .execute();
    return rows.map(toStage);
  }

  /** The edition a stage belongs to, which is what scopes "the next stage". */
  async seasonOfStage(stageId: string): Promise<string | undefined> {
    const row = await this.db
      .selectFrom('stages')
      .select('season_id')
      .where('stage_id', '=', stageId)
      .executeTakeFirst();
    return row?.season_id;
  }

  /** The tournament an edition belongs to (`CompetitionContext` chain). */
  async tournamentOfSeason(seasonId: string): Promise<string | undefined> {
    const row = await this.db
      .selectFrom('seasons')
      .select('tournament_id')
      .where('season_id', '=', seasonId)
      .executeTakeFirst();
    return row?.tournament_id;
  }
}
