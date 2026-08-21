import {
  type DrawConstraint,
  IMPLICIT_GROUP_NAME,
  IMPLICIT_SEASON_NAME,
  IMPLICIT_ZONE_NAME,
  validateGroup,
  validateSeason,
  validateZone,
} from '@copalibre/domain';
import type {
  Fixture,
  Group,
  Match,
  MatchCommand,
  MatchResult,
  MatchRoster,
  MatchRosterMember,
  MatchStatus,
  RecordedEvent,
  Season,
  Segment,
  Stage,
  TournamentFormat,
  Zone,
} from '@copalibre/domain';
import type { Kysely, Transaction } from 'kysely';
import { InvariantViolationError, NotFoundError } from '../errors.js';
import { newId } from '../ids.js';
import {
  toFixture,
  toGroup,
  toMatch,
  toRecordedEvent,
  toSegment,
  toStage,
  toZone,
} from '../mapping.js';
import type { Database } from '../schema.js';
import type { UnitOfWork } from '../transaction.js';
import type { AuditContext } from './enrollment-repository.js';

export interface PersistedDraw<T> {
  readonly assignment: GroupAssignment;
  readonly entities: readonly T[];
  readonly seed?: number;
}

/** Structural output shared with the pure tournament-engine group draw. */
export interface GroupAssignment {
  readonly groups: Readonly<Record<string, number>>;
}

/**
 * Stage/Fixture/Match/Segment plus the append-only match-event log.
 *
 * Two product contracts are enforced here rather than trusted to callers:
 * the event log is insert-only (no update/delete method exists), and a match
 * result can never be overwritten — `recordResult` refuses when a result is
 * already present, leaving the audited correction workflow (phase 0008) as the
 * only path.
 */
export class CompetitionRepository {
  constructor(private readonly db: Kysely<Database>) {}

  /**
   * One running of a tournament. Every tournament has at least one, so
   * no reader ever meets a stage without an edition.
   */
  async createSeason(
    uow: UnitOfWork,
    input: {
      readonly tournamentId: string;
      readonly name: string;
      readonly ordinal: number;
    } & AuditContext,
  ): Promise<Season> {
    const season: Season = {
      seasonId: newId(),
      tournamentId: input.tournamentId,
      name: input.name,
      ordinal: input.ordinal,
    };
    const valid = validateSeason(season);
    if (!valid.ok) throw new InvariantViolationError(valid.error.message, valid.error.details);

    await uow.tx
      .insertInto('seasons')
      .values({
        season_id: season.seasonId,
        tournament_id: season.tournamentId,
        name: season.name,
        ordinal: season.ordinal,
        created_at: new Date(),
      })
      .execute();

    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'season',
      entityId: season.seasonId,
      action: 'season.created',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { ...season },
    });
    return season;
  }

  /** The edition a tournament is on, creating the implicit first one if needed. */
  async currentSeason(
    uow: UnitOfWork,
    input: { readonly tournamentId: string } & AuditContext,
  ): Promise<Season> {
    const row = await uow.tx
      .selectFrom('seasons')
      .selectAll()
      .where('tournament_id', '=', input.tournamentId)
      .orderBy('ordinal', 'desc')
      .limit(1)
      .executeTakeFirst();

    if (row) {
      return {
        seasonId: row.season_id,
        tournamentId: row.tournament_id,
        name: row.name,
        ordinal: row.ordinal,
      };
    }

    return this.createSeason(uow, {
      ...input,
      name: IMPLICIT_SEASON_NAME,
      ordinal: 1,
    });
  }

  async listSeasons(tournamentId: string): Promise<readonly Season[]> {
    const rows = await this.db
      .selectFrom('seasons')
      .selectAll()
      .where('tournament_id', '=', tournamentId)
      .orderBy('ordinal')
      .execute();
    return rows.map((row) => ({
      seasonId: row.season_id,
      tournamentId: row.tournament_id,
      name: row.name,
      ordinal: row.ordinal,
    }));
  }

  async createZone(
    uow: UnitOfWork,
    input: {
      readonly stageId: string;
      readonly number: number;
      readonly name: string;
    } & AuditContext,
  ): Promise<Zone> {
    await this.assertStageHasNoFixtures(uow, input.stageId);
    const zone: Zone = { zoneId: newId(), ...input };
    const valid = validateZone(zone);
    if (!valid.ok) throw new InvariantViolationError(valid.error.message, valid.error.details);
    const row = await uow.tx
      .insertInto('zones')
      .values({
        zone_id: zone.zoneId,
        stage_id: zone.stageId,
        number: zone.number,
        name: zone.name,
        draw_seed: null,
        draw_constraints: null,
        created_at: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'zone',
      entityId: zone.zoneId,
      action: 'zone.created',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { ...zone },
    });
    return toZone(row);
  }

  async listZonesOfStage(stageId: string): Promise<readonly Zone[]> {
    const rows = await this.db
      .selectFrom('zones')
      .selectAll()
      .where('stage_id', '=', stageId)
      .orderBy('number')
      .execute();
    return rows.map(toZone);
  }

  async findZoneById(zoneId: string): Promise<Zone | undefined> {
    const row = await this.db
      .selectFrom('zones')
      .selectAll()
      .where('zone_id', '=', zoneId)
      .executeTakeFirst();
    return row === undefined ? undefined : toZone(row);
  }

  async currentOrImplicitZone(
    uow: UnitOfWork,
    input: { readonly stageId: string } & AuditContext,
  ): Promise<Zone> {
    const row = await uow.tx
      .selectFrom('zones')
      .selectAll()
      .where('stage_id', '=', input.stageId)
      .orderBy('number')
      .limit(1)
      .executeTakeFirst();
    return row
      ? toZone(row)
      : this.createZone(uow, { ...input, number: 1, name: IMPLICIT_ZONE_NAME });
  }

  async createGroup(
    uow: UnitOfWork,
    input: {
      readonly zoneId: string;
      readonly number: number;
      readonly name: string;
    } & AuditContext,
  ): Promise<Group> {
    const zoneRow = await uow.tx
      .selectFrom('zones')
      .select('stage_id')
      .where('zone_id', '=', input.zoneId)
      .executeTakeFirst();
    if (!zoneRow) {
      throw new NotFoundError(`Zone ${input.zoneId} does not exist`, { zoneId: input.zoneId });
    }
    await this.assertStageHasNoFixtures(uow, zoneRow.stage_id);
    const group: Group = { groupId: newId(), ...input };
    const valid = validateGroup(group);
    if (!valid.ok) throw new InvariantViolationError(valid.error.message, valid.error.details);
    const row = await uow.tx
      .insertInto('groups')
      .values({
        group_id: group.groupId,
        zone_id: group.zoneId,
        number: group.number,
        name: group.name,
        draw_seed: null,
        draw_constraints: null,
        created_at: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'group',
      entityId: group.groupId,
      action: 'group.created',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { ...group },
    });
    return toGroup(row);
  }

  async listGroupsOfZone(zoneId: string): Promise<readonly Group[]> {
    const rows = await this.db
      .selectFrom('groups')
      .selectAll()
      .where('zone_id', '=', zoneId)
      .orderBy('number')
      .execute();
    return rows.map(toGroup);
  }

  async listEntrantIdsOfZone(zoneId: string): Promise<readonly string[]> {
    const rows = await this.db
      .selectFrom('zone_entrants')
      .select('entrant_id')
      .where('zone_id', '=', zoneId)
      .orderBy('entrant_id')
      .execute();
    return rows.map((row) => row.entrant_id);
  }

  async listEntrantIdsOfGroup(groupId: string): Promise<readonly string[]> {
    const rows = await this.db
      .selectFrom('group_entrants')
      .select('entrant_id')
      .where('group_id', '=', groupId)
      .orderBy('entrant_id')
      .execute();
    return rows.map((row) => row.entrant_id);
  }

  async createPromotionPlan(
    uow: UnitOfWork,
    input: {
      readonly zoneId: string;
      readonly nextStageId: string;
      readonly plan: Record<string, unknown>;
    } & AuditContext,
  ): Promise<{
    readonly promotionPlanId: string;
    readonly zoneId: string;
    readonly nextStageId: string;
    readonly plan: Record<string, unknown>;
  }> {
    const row = await uow.tx
      .insertInto('promotion_plans')
      .values({
        promotion_plan_id: newId(),
        zone_id: input.zoneId,
        next_stage_id: input.nextStageId,
        plan: JSON.stringify(input.plan),
        created_at: new Date(),
      })
      .onConflict((conflict) =>
        conflict.column('zone_id').doUpdateSet({
          next_stage_id: input.nextStageId,
          plan: JSON.stringify(input.plan),
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'zone',
      entityId: input.zoneId,
      action: 'promotion-plan.saved',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { nextStageId: input.nextStageId, plan: input.plan },
    });
    return {
      promotionPlanId: row.promotion_plan_id,
      zoneId: row.zone_id,
      nextStageId: row.next_stage_id,
      plan: row.plan as Record<string, unknown>,
    };
  }

  async findPromotionPlan(zoneId: string): Promise<
    | {
        readonly promotionPlanId: string;
        readonly zoneId: string;
        readonly nextStageId: string;
        readonly plan: Record<string, unknown>;
      }
    | undefined
  > {
    const row = await this.db
      .selectFrom('promotion_plans')
      .selectAll()
      .where('zone_id', '=', zoneId)
      .executeTakeFirst();
    return row === undefined
      ? undefined
      : {
          promotionPlanId: row.promotion_plan_id,
          zoneId: row.zone_id,
          nextStageId: row.next_stage_id,
          plan: row.plan as Record<string, unknown>,
        };
  }

  /** Every stored promotion plan whose `nextStageId` targets the given stage (0121). */
  async findPromotionPlansTargetingStage(nextStageId: string): Promise<
    readonly {
      readonly promotionPlanId: string;
      readonly zoneId: string;
      readonly nextStageId: string;
      readonly plan: Record<string, unknown>;
    }[]
  > {
    const rows = await this.db
      .selectFrom('promotion_plans')
      .selectAll()
      .where('next_stage_id', '=', nextStageId)
      .execute();
    return rows.map((row) => ({
      promotionPlanId: row.promotion_plan_id,
      zoneId: row.zone_id,
      nextStageId: row.next_stage_id,
      plan: row.plan as Record<string, unknown>,
    }));
  }

  async currentOrImplicitGroup(
    uow: UnitOfWork,
    input: { readonly zoneId: string } & AuditContext,
  ): Promise<Group> {
    const row = await uow.tx
      .selectFrom('groups')
      .selectAll()
      .where('zone_id', '=', input.zoneId)
      .orderBy('number')
      .limit(1)
      .executeTakeFirst();
    return row
      ? toGroup(row)
      : this.createGroup(uow, { ...input, number: 1, name: IMPLICIT_GROUP_NAME });
  }

  async assignZones(
    uow: UnitOfWork,
    input: {
      readonly stageId: string;
      readonly assignment: GroupAssignment;
      readonly constraints: readonly DrawConstraint[];
      readonly zoneCount: number;
      readonly seed: number;
    } & AuditContext,
  ): Promise<PersistedDraw<Zone>> {
    const zones = await this.persistZoneDraw(uow, input, input.assignment, input.zoneCount, {
      seed: input.seed,
      constraints: input.constraints,
    });
    return { assignment: input.assignment, entities: zones, seed: input.seed };
  }

  async assignZonesManually(
    uow: UnitOfWork,
    input: {
      readonly stageId: string;
      readonly assignment: GroupAssignment;
      readonly zoneCount: number;
    } & AuditContext,
  ): Promise<PersistedDraw<Zone>> {
    const zones = await this.persistZoneDraw(uow, input, input.assignment, input.zoneCount);
    return { assignment: input.assignment, entities: zones };
  }

  async assignGroups(
    uow: UnitOfWork,
    input: {
      readonly zoneId: string;
      readonly assignment: GroupAssignment;
      readonly constraints: readonly DrawConstraint[];
      readonly groupCount: number;
      readonly seed: number;
    } & AuditContext,
  ): Promise<PersistedDraw<Group>> {
    const groups = await this.persistGroupDraw(uow, input, input.assignment, input.groupCount, {
      seed: input.seed,
      constraints: input.constraints,
    });
    return { assignment: input.assignment, entities: groups, seed: input.seed };
  }

  async assignGroupsManually(
    uow: UnitOfWork,
    input: {
      readonly zoneId: string;
      readonly assignment: GroupAssignment;
      readonly groupCount: number;
    } & AuditContext,
  ): Promise<PersistedDraw<Group>> {
    const groups = await this.persistGroupDraw(uow, input, input.assignment, input.groupCount);
    return { assignment: input.assignment, entities: groups };
  }

  private async persistZoneDraw(
    uow: UnitOfWork,
    input: { readonly stageId: string } & AuditContext,
    assignment: GroupAssignment,
    zoneCount: number,
    replay?: { readonly seed: number; readonly constraints: readonly DrawConstraint[] },
  ): Promise<readonly Zone[]> {
    this.assertGroupAssignment(assignment, zoneCount);
    await this.assertStageHasNoFixtures(uow, input.stageId);
    const existing = await uow.tx
      .selectFrom('zones')
      .select('zone_id')
      .where('stage_id', '=', input.stageId)
      .executeTakeFirst();
    if (existing) {
      throw new InvariantViolationError('Zones have already been assigned for this stage', {
        stageId: input.stageId,
      });
    }
    const rows = await uow.tx
      .insertInto('zones')
      .values(
        Array.from({ length: zoneCount }, (_unused, index) => ({
          zone_id: newId(),
          stage_id: input.stageId,
          number: index + 1,
          name: `Zona ${index + 1}`,
          draw_seed: replay?.seed ?? null,
          draw_constraints: replay ? JSON.stringify(replay.constraints) : null,
          created_at: new Date(),
        })),
      )
      .returningAll()
      .execute();
    const zones = rows.map(toZone);
    const zoneByNumber = new Map(zones.map((zone) => [zone.number, zone.zoneId]));
    await uow.tx
      .insertInto('zone_entrants')
      .values(
        Object.entries(assignment.groups).map(([entrantId, zoneNumber]) => ({
          zone_id: zoneByNumber.get(zoneNumber) as string,
          entrant_id: entrantId,
        })),
      )
      .execute();
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'stage',
      entityId: input.stageId,
      action: replay ? 'zones.drawn' : 'zones.manually-assigned',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { assignment, ...(replay ?? {}) },
    });
    return zones;
  }

  private async persistGroupDraw(
    uow: UnitOfWork,
    input: { readonly zoneId: string } & AuditContext,
    assignment: GroupAssignment,
    groupCount: number,
    replay?: { readonly seed: number; readonly constraints: readonly DrawConstraint[] },
  ): Promise<readonly Group[]> {
    this.assertGroupAssignment(assignment, groupCount);
    const zone = await uow.tx
      .selectFrom('zones')
      .select(['zone_id', 'stage_id'])
      .where('zone_id', '=', input.zoneId)
      .executeTakeFirst();
    if (!zone)
      throw new NotFoundError(`Zone ${input.zoneId} does not exist`, { zoneId: input.zoneId });
    await this.assertStageHasNoFixtures(uow, zone.stage_id);
    const existing = await uow.tx
      .selectFrom('groups')
      .select('group_id')
      .where('zone_id', '=', input.zoneId)
      .executeTakeFirst();
    if (existing) {
      throw new InvariantViolationError('Groups have already been assigned for this zone', {
        zoneId: input.zoneId,
      });
    }
    const zoneEntrants = await uow.tx
      .selectFrom('zone_entrants')
      .select('entrant_id')
      .where('zone_id', '=', input.zoneId)
      .execute();
    this.assertAssignmentEntrants(
      assignment,
      zoneEntrants.map((entry) => entry.entrant_id),
      'group',
    );
    const rows = await uow.tx
      .insertInto('groups')
      .values(
        Array.from({ length: groupCount }, (_unused, index) => ({
          group_id: newId(),
          zone_id: input.zoneId,
          number: index + 1,
          name: `Grupo ${index + 1}`,
          draw_seed: replay?.seed ?? null,
          draw_constraints: replay ? JSON.stringify(replay.constraints) : null,
          created_at: new Date(),
        })),
      )
      .returningAll()
      .execute();
    const groups = rows.map(toGroup);
    const groupByNumber = new Map(groups.map((group) => [group.number, group.groupId]));
    await uow.tx
      .insertInto('group_entrants')
      .values(
        Object.entries(assignment.groups).map(([entrantId, groupNumber]) => ({
          group_id: groupByNumber.get(groupNumber) as string,
          entrant_id: entrantId,
        })),
      )
      .execute();
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'zone',
      entityId: input.zoneId,
      action: replay ? 'groups.drawn' : 'groups.manually-assigned',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { assignment, ...(replay ?? {}) },
    });
    return groups;
  }

  private assertGroupAssignment(assignment: GroupAssignment, count: number): void {
    if (!Number.isInteger(count) || count < 1 || Object.keys(assignment.groups).length === 0) {
      throw new InvariantViolationError(
        'A zone/group assignment needs at least one numbered group',
        {
          count,
        },
      );
    }
    for (const position of Object.values(assignment.groups)) {
      if (!Number.isInteger(position) || position < 1 || position > count) {
        throw new InvariantViolationError(
          `Assignment position ${position} is outside 1..${count}`,
          {
            position,
            count,
          },
        );
      }
    }
  }

  private assertAssignmentEntrants(
    assignment: GroupAssignment,
    expectedEntrantIds: readonly string[],
    kind: 'group',
  ): void {
    const supplied = Object.keys(assignment.groups).sort();
    const expected = [...expectedEntrantIds].sort();
    if (
      supplied.length !== expected.length ||
      supplied.some((entrantId, index) => entrantId !== expected[index])
    ) {
      throw new InvariantViolationError(
        `A ${kind} draw must assign every entrant in its source zone exactly once`,
        { expectedEntrantIds: expected, assignedEntrantIds: supplied },
      );
    }
  }

  private async assertStageHasNoFixtures(uow: UnitOfWork, stageId: string): Promise<void> {
    const fixture = await uow.tx
      .selectFrom('fixtures')
      .select('fixture_id')
      .where('stage_id', '=', stageId)
      .executeTakeFirst();
    if (fixture) {
      throw new InvariantViolationError('Cannot assign zones or groups after fixtures exist', {
        stageId,
      });
    }
  }

  private async resolveFixtureScope(
    uow: UnitOfWork,
    input: { readonly stageId: string } & AuditContext,
    fixture: { readonly zoneId?: string; readonly groupId?: string },
  ): Promise<{ readonly zoneId: string; readonly groupId: string }> {
    if (fixture.groupId) {
      const group = await uow.tx
        .selectFrom('groups')
        .innerJoin('zones', 'zones.zone_id', 'groups.zone_id')
        .select(['groups.group_id', 'groups.zone_id', 'zones.stage_id'])
        .where('groups.group_id', '=', fixture.groupId)
        .executeTakeFirst();
      if (!group || group.stage_id !== input.stageId) {
        throw new NotFoundError(
          `Group ${fixture.groupId} does not belong to stage ${input.stageId}`,
          {
            groupId: fixture.groupId,
            stageId: input.stageId,
          },
        );
      }
      if (fixture.zoneId && fixture.zoneId !== group.zone_id) {
        throw new InvariantViolationError('Fixture group does not belong to its declared zone', {
          groupId: fixture.groupId,
          zoneId: fixture.zoneId,
        });
      }
      return { zoneId: group.zone_id, groupId: group.group_id };
    }

    const zoneId = fixture.zoneId ?? (await this.currentOrImplicitZone(uow, input)).zoneId;
    if (fixture.zoneId) {
      const zone = await uow.tx
        .selectFrom('zones')
        .select('zone_id')
        .where('zone_id', '=', zoneId)
        .where('stage_id', '=', input.stageId)
        .executeTakeFirst();
      if (!zone) {
        throw new NotFoundError(`Zone ${zoneId} does not belong to stage ${input.stageId}`, {
          zoneId,
          stageId: input.stageId,
        });
      }
    }
    const group = await this.currentOrImplicitGroup(uow, { ...input, zoneId });
    return { zoneId, groupId: group.groupId };
  }

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
    const season = await this.currentSeason(uow, {
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

  /** Bulk fixture insert — the shape phase 0006's generator will hand over. */
  async createFixtures(
    uow: UnitOfWork,
    input: {
      readonly stageId: string;
      readonly fixtures: readonly {
        readonly round: number;
        readonly homeEntrantId?: string;
        readonly awayEntrantId?: string;
        readonly scheduledAt?: string;
        readonly zoneId?: string;
        readonly groupId?: string;
      }[];
    } & AuditContext,
  ): Promise<readonly Fixture[]> {
    if (input.fixtures.length === 0) {
      throw new InvariantViolationError('Cannot create an empty fixture set', {
        stageId: input.stageId,
      });
    }

    // Scope creation is intentionally ordered: the first unscoped fixture may
    // create the implicit zone/group, which every later fixture in this same
    // transaction must then reuse.
    const scopedFixtures = [] as Array<
      (typeof input.fixtures)[number] & { readonly zoneId: string; readonly groupId: string }
    >;
    for (const fixture of input.fixtures) {
      scopedFixtures.push({
        ...fixture,
        ...(await this.resolveFixtureScope(uow, input, fixture)),
      });
    }
    const rows = await uow.tx
      .insertInto('fixtures')
      .values(
        scopedFixtures.map((fixture) => ({
          fixture_id: newId(),
          stage_id: input.stageId,
          zone_id: fixture.zoneId,
          group_id: fixture.groupId,
          round: fixture.round,
          home_entrant_id: fixture.homeEntrantId ?? null,
          away_entrant_id: fixture.awayEntrantId ?? null,
          scheduled_at: fixture.scheduledAt ? new Date(fixture.scheduledAt) : null,
          created_at: new Date(),
        })),
      )
      .returningAll()
      .execute();

    const fixtures = rows.map(toFixture);

    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'stage',
      entityId: input.stageId,
      action: 'fixtures.generated',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { fixtureCount: fixtures.length },
    });
    await uow.publishEvent({
      organizationId: input.organizationId,
      stream: `stage:${input.stageId}`,
      entityId: input.stageId,
      eventType: 'fixtures.generated',
      projectionVersion: 1,
      payload: { stageId: input.stageId, fixtureCount: fixtures.length },
    });

    return fixtures;
  }

  /**
   * Replaces a stage's fixture graph in place — the write side of reseeding.
   * Only reachable once `classifyEngineMutation` has already refused a
   * `blocked_after_results` request, but a fixture with a match already
   * attached (started, even without a final result) is still a record this
   * would orphan, so that case is refused here too rather than trusted to the
   * classification alone.
   */
  async replaceFixtures(
    uow: UnitOfWork,
    input: {
      readonly stageId: string;
      readonly fixtures: readonly {
        readonly round: number;
        readonly homeEntrantId?: string;
        readonly awayEntrantId?: string;
        readonly scheduledAt?: string;
        readonly zoneId?: string;
        readonly groupId?: string;
      }[];
    } & AuditContext,
  ): Promise<readonly Fixture[]> {
    if (input.fixtures.length === 0) {
      throw new InvariantViolationError('Cannot replace a fixture set with an empty one', {
        stageId: input.stageId,
      });
    }

    const attached = await uow.tx
      .selectFrom('matches')
      .innerJoin('fixtures', 'fixtures.fixture_id', 'matches.fixture_id')
      .select('matches.match_id')
      .where('fixtures.stage_id', '=', input.stageId)
      .executeTakeFirst();
    if (attached) {
      throw new InvariantViolationError(
        'Cannot replace fixtures once a match has been created against them',
        { stageId: input.stageId },
      );
    }

    const previousCount = await uow.tx
      .selectFrom('fixtures')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .where('stage_id', '=', input.stageId)
      .executeTakeFirstOrThrow();

    await uow.tx.deleteFrom('fixtures').where('stage_id', '=', input.stageId).execute();

    const scopedFixtures = await Promise.all(
      input.fixtures.map(async (fixture) => ({
        ...fixture,
        ...(await this.resolveFixtureScope(uow, input, fixture)),
      })),
    );
    const rows = await uow.tx
      .insertInto('fixtures')
      .values(
        scopedFixtures.map((fixture) => ({
          fixture_id: newId(),
          stage_id: input.stageId,
          zone_id: fixture.zoneId,
          group_id: fixture.groupId,
          round: fixture.round,
          home_entrant_id: fixture.homeEntrantId ?? null,
          away_entrant_id: fixture.awayEntrantId ?? null,
          scheduled_at: fixture.scheduledAt ? new Date(fixture.scheduledAt) : null,
          created_at: new Date(),
        })),
      )
      .returningAll()
      .execute();

    const fixtures = rows.map(toFixture);

    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'stage',
      entityId: input.stageId,
      action: 'fixtures.regenerated',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      previousState: { fixtureCount: Number(previousCount.count) },
      resultingState: { fixtureCount: fixtures.length },
    });
    await uow.publishEvent({
      organizationId: input.organizationId,
      stream: `stage:${input.stageId}`,
      entityId: input.stageId,
      eventType: 'fixtures.regenerated',
      projectionVersion: 1,
      payload: { stageId: input.stageId, fixtureCount: fixtures.length },
    });

    return fixtures;
  }

  async createMatch(
    uow: UnitOfWork,
    input: { readonly fixtureId: string; readonly number: number } & AuditContext,
  ): Promise<Match> {
    const matchId = newId();
    const row = await uow.tx
      .insertInto('matches')
      .values({
        match_id: matchId,
        fixture_id: input.fixtureId,
        number: input.number,
        status: 'scheduled',
        result: null,
        created_at: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const match = toMatch(row);
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'match',
      entityId: matchId,
      action: 'match.created',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { ...match },
    });
    return match;
  }

  /**
   * Moves a match through the states `applyMatchCommand` permits.
   *
   * The transition itself was decided in the domain; this writes it and says
   * who was allowed to. A finalized match is refused here as well as there,
   * because an invariant enforced in one layer is enforced only until someone
   * calls the other one.
   */
  async applyCommand(
    uow: UnitOfWork,
    input: {
      readonly matchId: string;
      readonly command: MatchCommand;
      readonly status: MatchStatus;
      /** The appointment that authorised it, for the audit row. */
      readonly grantedBy: string;
    } & AuditContext,
  ): Promise<Match> {
    const existing = await this.findMatchIn(uow.tx, input.matchId);
    if (!existing) {
      throw new NotFoundError(`Match ${input.matchId} does not exist`, { matchId: input.matchId });
    }
    if (existing.status === 'finalized') {
      throw new InvariantViolationError(
        `Match ${input.matchId} is finalized; use the audited correction workflow`,
        { matchId: input.matchId },
      );
    }

    const row = await uow.tx
      .updateTable('matches')
      .set({ status: input.status })
      .where('match_id', '=', input.matchId)
      .returningAll()
      .executeTakeFirstOrThrow();

    const match = toMatch(row);
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'match',
      entityId: input.matchId,
      action: `match.${input.command}`,
      actor: input.actor,
      authorizationContext: `${input.authorizationContext} via ${input.grantedBy}`,
      previousState: { ...existing },
      resultingState: { ...match },
    });
    return match;
  }

  /** Starts, pauses or completes a segment; the clock is derived from this. */
  async setSegmentState(
    uow: UnitOfWork,
    input: {
      readonly segmentId: string;
      readonly state: Segment['state'];
    } & AuditContext,
  ): Promise<Segment> {
    const existing = await uow.tx
      .selectFrom('segments')
      .selectAll()
      .where('segment_id', '=', input.segmentId)
      .executeTakeFirst();
    if (!existing) {
      throw new NotFoundError(`Segment ${input.segmentId} does not exist`, {
        segmentId: input.segmentId,
      });
    }

    const now = new Date();
    let elapsedSeconds = existing.elapsed_seconds;
    if (
      input.state !== 'active' &&
      existing.state === 'active' &&
      existing.clock_started_at !== null
    ) {
      elapsedSeconds += Math.max(
        0,
        Math.floor((now.getTime() - existing.clock_started_at.getTime()) / 1000),
      );
    }
    const row = await uow.tx
      .updateTable('segments')
      .set({
        state: input.state,
        elapsed_seconds: elapsedSeconds,
        clock_started_at: input.state === 'active' ? (existing.clock_started_at ?? now) : null,
      })
      .where('segment_id', '=', input.segmentId)
      .returningAll()
      .executeTakeFirstOrThrow();

    const segment = toSegment(row);
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'segment',
      entityId: input.segmentId,
      action: `segment.${input.state}`,
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { ...segment },
    });
    return segment;
  }

  /** Explicit clock correction; elapsed time is a durable match fact, never browser state. */
  async adjustSegmentClock(
    uow: UnitOfWork,
    input: { readonly segmentId: string; readonly elapsedSeconds: number } & AuditContext,
  ): Promise<Segment> {
    if (!Number.isInteger(input.elapsedSeconds) || input.elapsedSeconds < 0) {
      throw new InvariantViolationError('Elapsed seconds must be a non-negative integer', {
        elapsedSeconds: input.elapsedSeconds,
      });
    }
    const existing = await uow.tx
      .selectFrom('segments')
      .selectAll()
      .where('segment_id', '=', input.segmentId)
      .executeTakeFirst();
    if (!existing) {
      throw new NotFoundError(`Segment ${input.segmentId} does not exist`, {
        segmentId: input.segmentId,
      });
    }
    const now = new Date();
    const row = await uow.tx
      .updateTable('segments')
      .set({
        elapsed_seconds: input.elapsedSeconds,
        clock_started_at: existing.state === 'active' ? now : null,
      })
      .where('segment_id', '=', input.segmentId)
      .returningAll()
      .executeTakeFirstOrThrow();
    const segment = toSegment(row);
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'segment',
      entityId: input.segmentId,
      action: 'segment.clock-adjusted',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      previousState: { ...toSegment(existing) },
      resultingState: { ...segment },
    });
    return segment;
  }

  async resolveTimer(
    uow: UnitOfWork,
    input: { readonly timerId: string; readonly matchId: string } & AuditContext,
  ): Promise<void> {
    const existing = await uow.tx
      .selectFrom('match_timer_resolutions')
      .select('timer_id')
      .where('timer_id', '=', input.timerId)
      .executeTakeFirst();
    if (existing) return;
    await uow.tx
      .insertInto('match_timer_resolutions')
      .values({
        timer_id: input.timerId,
        match_id: input.matchId,
        actor: input.actor,
        resolved_at: new Date(),
      })
      .execute();
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'match-timer',
      entityId: input.timerId,
      action: 'match-timer.resolved',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { matchId: input.matchId, resolved: true },
    });
  }

  async resolvedTimerIds(matchId: string): Promise<ReadonlySet<string>> {
    const rows = await this.db
      .selectFrom('match_timer_resolutions')
      .select('timer_id')
      .where('match_id', '=', matchId)
      .execute();
    return new Set(rows.map((row) => row.timer_id));
  }

  /**
   * Supersedes a result, keeping the one it replaced.
   *
   * The only write path over a finalized outcome, and it is not an update in
   * the ordinary sense: the audit row carries the prior state, the replacement
   * and the operator's reason, so the chain of what a result has been stays
   * readable in order. `recordResult` still refuses a match that has one, which
   * is what leaves this as the single door.
   */
  async supersedeResult(
    uow: UnitOfWork,
    input: {
      readonly matchId: string;
      readonly result: MatchResult;
      readonly reason: string;
      /** A participant report/dispute this correction cites. */
      readonly sourceReportId?: string;
      readonly blockedPropagation?: { readonly stageId: string; readonly reason: string };
    } & AuditContext,
  ): Promise<Match> {
    const existing = await this.findMatchIn(uow.tx, input.matchId);
    if (!existing?.result) {
      throw new InvariantViolationError(`Match ${input.matchId} has no result to supersede`, {
        matchId: input.matchId,
      });
    }

    const row = await uow.tx
      .updateTable('matches')
      .set({ result: JSON.stringify(input.result) })
      .where('match_id', '=', input.matchId)
      .returningAll()
      .executeTakeFirstOrThrow();

    const match = toMatch(row);
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'match',
      entityId: input.matchId,
      action: 'match.result-superseded',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      previousState: { ...existing.result },
      // Retained as supporting evidence in the audit trail — never
      // read back as authority for anything; the operator's own reason and
      // replacement above are what the correction actually rests on.
      resultingState:
        input.sourceReportId === undefined
          ? { ...input.result }
          : { ...input.result, sourceReportId: input.sourceReportId },
      reason: input.reason,
    });

    await uow.publishEvent({
      organizationId: input.organizationId,
      stream: `match:${input.matchId}`,
      entityId: input.matchId,
      eventType: 'result.superseded',
      projectionVersion: 1,
      payload: {
        matchId: input.matchId,
        reason: input.reason,
        // Named in the event so a downstream consumer does not have to infer
        // that a rebuild was deliberately withheld.
        ...(input.blockedPropagation
          ? { blockedPropagation: { ...input.blockedPropagation } }
          : {}),
      },
    });

    return match;
  }

  /**
   * The notification identities already published for a match.
   *
   * Threshold rules are a fold over the whole log, so recomputation after every
   * event re-derives every earlier crossing. Publishing only what is new is
   * what keeps a reconnect from raising an alert twice — delivery deduplicates
   * on the same key afterwards, which is the second line rather than the first.
   */
  async publishedNotificationKeys(matchId: string): Promise<ReadonlySet<string>> {
    const rows = await this.db
      .selectFrom('outbox_events')
      .select('payload')
      .where('entity_id', '=', matchId)
      .where('event_type', '=', 'notification.raised')
      .execute();

    const keys = new Set<string>();
    for (const row of rows) {
      const key = (row.payload as { identityKey?: unknown }).identityKey;
      if (typeof key === 'string') keys.add(key);
    }
    return keys;
  }

  /**
   * The stage after this one, and whether it has started.
   *
   * "Started" is read as *any match in it has been played or is being played*,
   * because that is what makes a rebuild destructive: a bracket nobody has
   * touched can be redrawn, and one that has been played cannot.
   */
  async nextStageState(
    tournamentId: string,
    stageId: string,
  ): Promise<
    | {
        readonly stageId: string;
        readonly started: boolean;
        readonly qualifiedEntrantIds: readonly string[];
      }
    | undefined
  > {
    const stages = await this.listStages(tournamentId);
    const current = stages.find((stage) => stage.stageId === stageId);
    const next = stages.find((stage) => stage.number === (current?.number ?? 0) + 1);
    if (!next) return undefined;

    const rows = await this.db
      .selectFrom('matches')
      .innerJoin('fixtures', 'fixtures.fixture_id', 'matches.fixture_id')
      .select(['matches.status', 'fixtures.home_entrant_id', 'fixtures.away_entrant_id'])
      .where('fixtures.stage_id', '=', next.stageId)
      .execute();

    const qualified = new Set<string>();
    for (const row of rows) {
      if (row.home_entrant_id) qualified.add(row.home_entrant_id);
      if (row.away_entrant_id) qualified.add(row.away_entrant_id);
    }

    return {
      stageId: next.stageId,
      started: rows.some((row) => row.status !== 'scheduled'),
      qualifiedEntrantIds: [...qualified],
    };
  }

  /**
   * Selects (or replaces) one entrant's roster for a match. One row per
   * `(matchId, entrantId)` — a second call for the same pair overwrites the
   * prior selection, audited each time; a match's roster is a revisable
   * match-time fact the console can correct, not an append-only log the way
   * events are (0107 design.md).
   */
  async setMatchRoster(
    uow: UnitOfWork,
    input: {
      readonly matchId: string;
      readonly entrantId: string;
      readonly members: readonly MatchRosterMember[];
    } & AuditContext,
  ): Promise<void> {
    const previous = await uow.tx
      .selectFrom('match_rosters')
      .select('roster_members')
      .where('match_id', '=', input.matchId)
      .where('entrant_id', '=', input.entrantId)
      .executeTakeFirst();

    await uow.tx
      .insertInto('match_rosters')
      .values({
        match_id: input.matchId,
        entrant_id: input.entrantId,
        roster_members: JSON.stringify(input.members),
        updated_at: new Date(),
      })
      .onConflict((conflict) =>
        conflict.columns(['match_id', 'entrant_id']).doUpdateSet({
          roster_members: JSON.stringify(input.members),
          updated_at: new Date(),
        }),
      )
      .execute();

    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'match-roster',
      // No dedicated roster id exists — the match itself is the audited
      // entity, with the entrant it was set for carried in the state.
      entityId: input.matchId,
      action: 'match-roster.set',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      ...(previous
        ? { previousState: { entrantId: input.entrantId, members: previous.roster_members } }
        : {}),
      resultingState: { entrantId: input.entrantId, members: input.members },
    });
  }

  /** Every entrant's current roster selection for a match, keyed by entrant id. */
  async matchRoster(matchId: string): Promise<readonly MatchRoster[]> {
    const rows = await this.db
      .selectFrom('match_rosters')
      .select(['entrant_id', 'roster_members'])
      .where('match_id', '=', matchId)
      .execute();
    return rows.map((row) => ({
      matchId,
      entrantId: row.entrant_id,
      members: row.roster_members,
    }));
  }

  /** The stage a match belongs to, which is what scopes an appointment. */
  async stageOfMatch(matchId: string): Promise<string | undefined> {
    const row = await this.db
      .selectFrom('matches')
      .innerJoin('fixtures', 'fixtures.fixture_id', 'matches.fixture_id')
      .select('fixtures.stage_id')
      .where('matches.match_id', '=', matchId)
      .executeTakeFirst();
    return row?.stage_id;
  }

  async listSegments(matchId: string): Promise<readonly Segment[]> {
    const rows = await this.db
      .selectFrom('segments')
      .selectAll()
      .where('match_id', '=', matchId)
      .orderBy('number')
      .execute();
    return rows.map(toSegment);
  }

  async createSegment(
    uow: UnitOfWork,
    input: {
      readonly matchId: string;
      readonly type: string;
      readonly number: number;
    } & AuditContext,
  ): Promise<Segment> {
    const segmentId = newId();
    const row = await uow.tx
      .insertInto('segments')
      .values({
        segment_id: segmentId,
        match_id: input.matchId,
        segment_type: input.type,
        number: input.number,
        state: 'pending',
        elapsed_seconds: 0,
        clock_started_at: null,
        created_at: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const segment = toSegment(row);
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'segment',
      entityId: segmentId,
      action: 'segment.created',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { ...segment },
    });
    return segment;
  }

  /**
   * Appends one domain fact. There is deliberately no update or delete
   * counterpart: the event log is the audit input, so corrections supersede
   * rather than rewrite (phase 0008 owns that workflow).
   */
  async appendEvent(
    uow: UnitOfWork,
    input: {
      readonly event: Omit<RecordedEvent, 'sequence'>;
      readonly sequence: number;
    } & AuditContext,
  ): Promise<RecordedEvent> {
    const { event } = input;
    const row = await uow.tx
      .insertInto('match_events')
      .values({
        event_id: event.eventId,
        match_id: event.matchId,
        segment_id: event.segmentId,
        definition_code: event.definitionCode,
        occurred_at: new Date(event.occurredAt),
        sequence: input.sequence,
        side: event.side ?? null,
        person_id: event.personId ?? null,
        payload: JSON.stringify(event.payload),
        notes: event.notes ?? null,
        segment_elapsed_seconds: event.segmentElapsedSeconds ?? null,
        created_at: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const recorded = toRecordedEvent(row);
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'match-event',
      entityId: recorded.eventId,
      action: 'event.recorded',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: {
        definitionCode: recorded.definitionCode,
        sequence: recorded.sequence,
      },
    });
    await uow.publishEvent({
      organizationId: input.organizationId,
      stream: `match:${recorded.matchId}`,
      entityId: recorded.matchId,
      eventType: 'match.event-recorded',
      projectionVersion: recorded.sequence,
      payload: { eventId: recorded.eventId, definitionCode: recorded.definitionCode },
    });

    return recorded;
  }

  /** Next sequence number for a match's event log. */
  async nextEventSequence(matchId: string): Promise<number> {
    const row = await this.db
      .selectFrom('match_events')
      .select('sequence')
      .where('match_id', '=', matchId)
      .orderBy('sequence', 'desc')
      .limit(1)
      .executeTakeFirst();
    return (row?.sequence ?? 0) + 1;
  }

  async listEvents(matchId: string): Promise<readonly RecordedEvent[]> {
    const rows = await this.db
      .selectFrom('match_events')
      .selectAll()
      .where('match_id', '=', matchId)
      .orderBy('sequence')
      .execute();
    return rows.map(toRecordedEvent);
  }

  /**
   * A collector-threshold rule's cross-match baseline: every event in
   * the stage's *other* matches whose definition code the collector watches.
   * A direct, scoped `match_events` read rather than a `statistic_totals`
   * read — the general fold engine (`0073`) does not exist yet, and this
   * rule needs to see the current stage's live, in-progress matches, which a
   * finalisation-triggered projection would not carry anyway. An empty
   * `definitionCodes` array (a non-event-sourced collector) short-circuits
   * without a query, since nothing in `match_events` could match it.
   */
  async eventsInStageExcludingMatch(
    stageId: string,
    excludeMatchId: string,
    definitionCodes: readonly string[] | undefined,
  ): Promise<readonly RecordedEvent[]> {
    if (definitionCodes !== undefined && definitionCodes.length === 0) return [];

    let query = this.db
      .selectFrom('match_events')
      .innerJoin('matches', 'matches.match_id', 'match_events.match_id')
      .innerJoin('fixtures', 'fixtures.fixture_id', 'matches.fixture_id')
      .selectAll('match_events')
      .where('fixtures.stage_id', '=', stageId)
      .where('match_events.match_id', '!=', excludeMatchId);
    if (definitionCodes !== undefined) {
      query = query.where('match_events.definition_code', 'in', definitionCodes);
    }

    const rows = await query.execute();
    return rows.map(toRecordedEvent);
  }

  /**
   * Records a calculated result exactly once. A second attempt is refused —
   * "The MVP permits no direct overwrite of an outcome" (tournament-engine
   * decision record); superseding requires the audited correction workflow.
   */
  async recordResult(
    uow: UnitOfWork,
    input: { readonly matchId: string; readonly result: MatchResult } & AuditContext,
  ): Promise<Match> {
    const existing = await this.findMatchIn(uow.tx, input.matchId);
    if (!existing) {
      throw new NotFoundError(`Match ${input.matchId} does not exist`, {
        matchId: input.matchId,
      });
    }
    if (existing.result) {
      throw new InvariantViolationError(
        `Match ${input.matchId} already has a result; use the audited correction workflow to supersede it`,
        { matchId: input.matchId },
      );
    }

    const row = await uow.tx
      .updateTable('matches')
      .set({ status: 'finalized', result: JSON.stringify(input.result) })
      .where('match_id', '=', input.matchId)
      .returningAll()
      .executeTakeFirstOrThrow();

    const match = toMatch(row);
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'match',
      entityId: input.matchId,
      action: 'match.finalized',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      previousState: { status: existing.status, result: null },
      resultingState: { status: match.status, result: { ...input.result } },
      reason: 'match finalized from recorded facts',
    });
    await uow.publishEvent({
      organizationId: input.organizationId,
      stream: `match:${input.matchId}`,
      entityId: input.matchId,
      eventType: 'match.finalized',
      projectionVersion: 1,
      payload: { matchId: input.matchId, result: { ...input.result } },
    });

    return match;
  }

  async findMatch(matchId: string): Promise<Match | undefined> {
    return this.findMatchIn(this.db, matchId);
  }

  private async findMatchIn(
    executor: Kysely<Database> | Transaction<Database>,
    matchId: string,
  ): Promise<Match | undefined> {
    const row = await executor
      .selectFrom('matches')
      .selectAll()
      .where('match_id', '=', matchId)
      .executeTakeFirst();
    return row ? toMatch(row) : undefined;
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

  /** The tournament an edition belongs to (0082's `CompetitionContext` chain). */
  async tournamentOfSeason(seasonId: string): Promise<string | undefined> {
    const row = await this.db
      .selectFrom('seasons')
      .select('tournament_id')
      .where('season_id', '=', seasonId)
      .executeTakeFirst();
    return row?.tournament_id;
  }

  /**
   * Every finalized match in scope for a statistics rebuild:
   * organization-wide, or narrowed to one tournament. Ordered so a rebuild's
   * output is deterministic across runs, which is what idempotence is checked
   * against.
   */
  async listFinalizedMatches(scope: {
    readonly organizationId: string;
    readonly tournamentId?: string;
  }): Promise<readonly string[]> {
    let query = this.db
      .selectFrom('matches')
      .innerJoin('fixtures', 'fixtures.fixture_id', 'matches.fixture_id')
      .innerJoin('stages', 'stages.stage_id', 'fixtures.stage_id')
      .innerJoin('seasons', 'seasons.season_id', 'stages.season_id')
      .innerJoin('tournaments', 'tournaments.tournament_id', 'seasons.tournament_id')
      .select('matches.match_id')
      .where('matches.status', '=', 'finalized')
      .where('tournaments.organization_id', '=', scope.organizationId);
    if (scope.tournamentId !== undefined) {
      query = query.where('tournaments.tournament_id', '=', scope.tournamentId);
    }

    const rows = await query.orderBy('matches.created_at').orderBy('matches.match_id').execute();
    return rows.map((row) => row.match_id);
  }
}
