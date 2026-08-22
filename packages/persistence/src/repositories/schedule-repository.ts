import {
  Alias,
  detectConflicts,
  ScheduleConflictError,
  validateOfficial,
  validateVenue,
  type Official,
  type OfficialRole,
  type ResourceAssignment,
  type RestRule,
  type ScheduleConflict,
  type Venue,
} from '@copalibre/domain';
import type { Kysely } from 'kysely';
import { InvariantViolationError } from '../errors.js';
import { newId } from '../ids.js';
import { toOfficial, toResourceAssignment, toVenue } from '../mapping.js';
import { lockRowsForMutation } from '../row-lock.js';
import type { Database } from '../schema.js';
import type { UnitOfWork } from '../transaction.js';
import type { AuditContext } from './enrollment-repository.js';

/**
 * Scheduling reads and writes.
 *
 * Conflict detection runs **synchronously inside the transaction that writes**,
 * never as a follow-up scan. A venue and a human official cannot be in two
 * places at once regardless of eventual consistency, so a conflicting schedule
 * must never exist in the database — not even briefly, not even unpublished.
 *
 * A batch publishes whole or not at all, in one transaction rather than one per
 * assignment, which is what "no partially-applied schedule is ever visible"
 * means in practice.
 */

export interface SchedulePreview {
  readonly assignments: readonly ResourceAssignment[];
  readonly conflicts: readonly ScheduleConflict[];
  /** Fixtures already published that this batch would move. */
  readonly affectedPublishedFixtures: readonly string[];
  readonly committable: boolean;
}

export class ScheduleRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async createVenue(uow: UnitOfWork, input: Omit<Venue, 'venueId'> & AuditContext): Promise<Venue> {
    assertVenueAlias(input.alias);
    const venueId = newId();
    const venue: Venue = {
      venueId,
      organizationId: input.organizationId,
      alias: input.alias,
      name: input.name,
      concurrentCapacity: input.concurrentCapacity,
      ...(input.address === undefined ? {} : { address: input.address }),
      ...(input.details === undefined ? {} : { details: input.details }),
    };

    const valid = validateVenue(venue);
    if (!valid.ok) throw valid.error;

    const row = await uow.tx
      .insertInto('venues')
      .values({
        venue_id: venueId,
        organization_id: input.organizationId,
        alias: input.alias,
        name: input.name,
        concurrent_capacity: input.concurrentCapacity,
        address: input.address ?? null,
        details: input.details === undefined ? null : JSON.stringify(input.details),
        created_at: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'venue',
      entityId: venueId,
      action: 'venue.created',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { ...toVenue(row) },
    });
    return toVenue(row);
  }

  /** Every venue of an organization, for a management screen listing. */
  async listVenues(organizationId: string): Promise<readonly Venue[]> {
    const rows = await this.db
      .selectFrom('venues')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .orderBy('name')
      .execute();
    return rows.map(toVenue);
  }

  async findVenue(venueId: string): Promise<Venue | undefined> {
    const row = await this.db
      .selectFrom('venues')
      .selectAll()
      .where('venue_id', '=', venueId)
      .executeTakeFirst();
    return row ? toVenue(row) : undefined;
  }

  /** Corrects a venue's name, capacity, address, or details — a mistyped entry, not a new one. */
  async updateVenue(
    uow: UnitOfWork,
    input: {
      readonly venueId: string;
      readonly organizationId: string;
      readonly name?: string;
      readonly concurrentCapacity?: number;
      readonly address?: string;
      readonly details?: Readonly<Record<string, string>>;
    } & Omit<AuditContext, 'organizationId'>,
  ): Promise<Venue> {
    const previous = await this.findVenue(input.venueId);
    const row = await uow.tx
      .updateTable('venues')
      .set({
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.concurrentCapacity === undefined
          ? {}
          : { concurrent_capacity: input.concurrentCapacity }),
        ...(input.address === undefined ? {} : { address: input.address }),
        ...(input.details === undefined ? {} : { details: JSON.stringify(input.details) }),
      })
      .where('venue_id', '=', input.venueId)
      .returningAll()
      .executeTakeFirstOrThrow();

    const venue = toVenue(row);
    const valid = validateVenue(venue);
    if (!valid.ok) throw valid.error;

    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'venue',
      entityId: input.venueId,
      action: 'venue.updated',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      ...(previous === undefined ? {} : { previousState: { ...previous } }),
      resultingState: { ...venue },
    });
    return venue;
  }

  async createOfficial(
    uow: UnitOfWork,
    input: Omit<Official, 'officialId'> & AuditContext,
  ): Promise<Official> {
    const officialId = newId();
    const official: Official = {
      officialId,
      organizationId: input.organizationId,
      displayName: input.displayName,
      roles: input.roles,
    };

    const valid = validateOfficial(official);
    if (!valid.ok) throw valid.error;

    const row = await uow.tx
      .insertInto('officials')
      .values({
        official_id: officialId,
        organization_id: input.organizationId,
        display_name: input.displayName,
        roles: JSON.stringify(input.roles),
        created_at: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'official',
      entityId: officialId,
      action: 'official.created',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { ...toOfficial(row) },
    });
    return toOfficial(row);
  }

  /** Every official of an organization, for a management screen listing. */
  async listOfficials(organizationId: string): Promise<readonly Official[]> {
    const rows = await this.db
      .selectFrom('officials')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .orderBy('display_name')
      .execute();
    return rows.map(toOfficial);
  }

  async findOfficial(officialId: string): Promise<Official | undefined> {
    const row = await this.db
      .selectFrom('officials')
      .selectAll()
      .where('official_id', '=', officialId)
      .executeTakeFirst();
    return row ? toOfficial(row) : undefined;
  }

  /** Corrects an official's name or declared roles — a mistyped entry, not a new one. */
  async updateOfficial(
    uow: UnitOfWork,
    input: {
      readonly officialId: string;
      readonly organizationId: string;
      readonly displayName?: string;
      readonly roles?: readonly OfficialRole[];
    } & Omit<AuditContext, 'organizationId'>,
  ): Promise<Official> {
    const previous = await this.findOfficial(input.officialId);
    const row = await uow.tx
      .updateTable('officials')
      .set({
        ...(input.displayName === undefined ? {} : { display_name: input.displayName }),
        ...(input.roles === undefined ? {} : { roles: JSON.stringify(input.roles) }),
      })
      .where('official_id', '=', input.officialId)
      .returningAll()
      .executeTakeFirstOrThrow();

    const official = toOfficial(row);
    const valid = validateOfficial(official);
    if (!valid.ok) throw valid.error;

    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'official',
      entityId: input.officialId,
      action: 'official.updated',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      ...(previous === undefined ? {} : { previousState: { ...previous } }),
      resultingState: { ...official },
    });
    return official;
  }

  /**
   * What a batch would do, without doing it.
   *
   * Runs the identical detection the commit runs, against the identical state,
   * and reports instead of writing — so a preview cannot promise something the
   * commit then refuses.
   */
  async previewSchedule(input: {
    readonly stageId: string;
    readonly assignments: readonly ResourceAssignment[];
    readonly restRule?: RestRule;
  }): Promise<SchedulePreview> {
    const context = await this.contextFor(input.stageId, input.restRule);
    const conflicts = detectConflicts(input.assignments, context);

    const publishedIds = new Set(
      (await this.publishedFixtureIds(input.stageId)).map((fixtureId) => fixtureId),
    );

    return {
      assignments: input.assignments,
      conflicts,
      // The blast radius an operator needs before committing: which already
      // published fixtures this batch moves.
      affectedPublishedFixtures: input.assignments
        .map((assignment) => assignment.fixtureId)
        .filter((fixtureId) => publishedIds.has(fixtureId)),
      committable: conflicts.length === 0,
    };
  }

  /**
   * Applies a batch, or none of it.
   *
   * The detection runs again here rather than trusting a preview: between a
   * preview and a commit another operator may have scheduled something, and the
   * only check that can be relied on is the one holding the transaction.
   */
  async publishSchedule(
    uow: UnitOfWork,
    input: {
      readonly stageId: string;
      readonly assignments: readonly ResourceAssignment[];
      readonly restRule?: RestRule;
    } & AuditContext,
  ): Promise<readonly ResourceAssignment[]> {
    if (input.assignments.length === 0) {
      throw new InvariantViolationError('Cannot publish an empty schedule', {
        stageId: input.stageId,
      });
    }

    // Detection reads, then writes — and two concurrent publishes could both
    // read "no conflict" and both write, which is write skew and exactly how a
    // venue ends up double-booked despite a check that ran. Locking the
    // contested rows first serialises publishes that touch the same resource
    // and leaves publishes that touch different ones fully parallel.
    await this.lockResources(uow, input.assignments);

    const context = await this.contextFor(input.stageId, input.restRule, uow);
    const conflicts = detectConflicts(input.assignments, context);
    if (conflicts.length > 0) {
      // One invalid assignment rejects the batch: a schedule that publishes
      // "most of" itself is the state this phase exists to make impossible.
      throw new ScheduleConflictError(conflicts);
    }

    for (const assignment of input.assignments) {
      await uow.tx
        .deleteFrom('fixture_schedules')
        .where('fixture_id', '=', assignment.fixtureId)
        .execute();

      const scheduleId = newId();
      await uow.tx
        .insertInto('fixture_schedules')
        .values({
          fixture_schedule_id: scheduleId,
          fixture_id: assignment.fixtureId,
          venue_id: assignment.venueId ?? null,
          starts_at: String(assignment.window.startsAt),
          duration_minutes: assignment.window.durationMinutes,
          published: true,
          created_at: new Date(),
        })
        .execute();

      if (assignment.officialIds && assignment.officialIds.length > 0) {
        await uow.tx
          .insertInto('fixture_schedule_officials')
          .values(
            assignment.officialIds.map((officialId) => ({
              fixture_schedule_id: scheduleId,
              official_id: officialId,
            })),
          )
          .execute();
      }
    }

    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'stage',
      entityId: input.stageId,
      action: 'schedule.published',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { assignments: input.assignments.map((a) => ({ ...a })) },
    });
    await uow.publishEvent({
      organizationId: input.organizationId,
      stream: `stage:${input.stageId}`,
      entityId: input.stageId,
      eventType: 'schedule.published',
      projectionVersion: 1,
      payload: { stageId: input.stageId, fixtures: input.assignments.length },
    });

    return input.assignments;
  }

  /**
   * Locks every venue and official the batch touches, in id order.
   *
   * Ordering is what keeps two batches sharing two resources from deadlocking:
   * both take them in the same sequence, so one waits rather than each holding
   * what the other needs.
   */
  private async lockResources(
    uow: UnitOfWork,
    assignments: readonly ResourceAssignment[],
  ): Promise<void> {
    const venueIds = [
      ...new Set(
        assignments
          .map((assignment) => assignment.venueId)
          .filter((venueId): venueId is string => venueId !== undefined),
      ),
    ].sort();
    const officialIds = [
      ...new Set(assignments.flatMap((assignment) => assignment.officialIds ?? [])),
    ].sort();

    if (venueIds.length > 0) {
      await lockRowsForMutation(
        this.db,
        uow.tx
          .selectFrom('venues')
          .select('venue_id')
          .where('venue_id', 'in', venueIds)
          .orderBy('venue_id'),
      ).execute();
    }
    if (officialIds.length > 0) {
      await lockRowsForMutation(
        this.db,
        uow.tx
          .selectFrom('officials')
          .select('official_id')
          .where('official_id', 'in', officialIds)
          .orderBy('official_id'),
      ).execute();
    }
  }

  async listSchedule(stageId: string): Promise<readonly ResourceAssignment[]> {
    return this.assignmentsFor(stageId, this.db);
  }

  /**
   * Everything the detection needs, read through the caller's transaction when
   * there is one — a fixture scheduled earlier in the same unit of work is
   * invisible to the pool, and a conflict check that cannot see it is not a
   * check.
   */
  private async contextFor(stageId: string, restRule?: RestRule, uow?: UnitOfWork) {
    const executor = uow?.tx ?? this.db;

    const venueRows = await executor.selectFrom('venues').selectAll().execute();
    const fixtures = await executor
      .selectFrom('fixtures')
      .select(['fixture_id', 'home_entrant_id', 'away_entrant_id'])
      .where('stage_id', '=', stageId)
      .execute();

    const fixtureIds = fixtures.map((fixture) => fixture.fixture_id);
    const finalizedRows =
      fixtureIds.length === 0
        ? []
        : await executor
            .selectFrom('matches')
            .select('fixture_id')
            .where('fixture_id', 'in', fixtureIds)
            .where('status', '=', 'finalized')
            .execute();

    return {
      existing: await this.assignmentsFor(stageId, executor),
      entrantsByFixture: new Map(
        fixtures.map((fixture) => [
          fixture.fixture_id,
          [fixture.home_entrant_id, fixture.away_entrant_id].filter(
            (entrantId): entrantId is string => entrantId !== null,
          ),
        ]),
      ),
      venues: new Map(venueRows.map((row) => [row.venue_id, toVenue(row)])),
      finalizedFixtureIds: new Set(finalizedRows.map((row) => row.fixture_id)),
      ...(restRule ? { restRule } : {}),
    };
  }

  private async assignmentsFor(
    stageId: string,
    executor: Kysely<Database> | UnitOfWork['tx'],
  ): Promise<readonly ResourceAssignment[]> {
    const rows = await executor
      .selectFrom('fixture_schedules')
      .innerJoin('fixtures', 'fixtures.fixture_id', 'fixture_schedules.fixture_id')
      .select([
        'fixture_schedules.fixture_schedule_id',
        'fixture_schedules.fixture_id',
        'fixture_schedules.venue_id',
        'fixture_schedules.starts_at',
        'fixture_schedules.duration_minutes',
      ])
      .where('fixtures.stage_id', '=', stageId)
      .execute();

    const officials = await executor.selectFrom('fixture_schedule_officials').selectAll().execute();

    return rows.map((row) =>
      toResourceAssignment(
        row,
        officials
          .filter((link) => link.fixture_schedule_id === row.fixture_schedule_id)
          .map((link) => link.official_id),
      ),
    );
  }

  private async publishedFixtureIds(stageId: string): Promise<readonly string[]> {
    const rows = await this.db
      .selectFrom('fixture_schedules')
      .innerJoin('fixtures', 'fixtures.fixture_id', 'fixture_schedules.fixture_id')
      .select('fixture_schedules.fixture_id')
      .where('fixtures.stage_id', '=', stageId)
      .where('fixture_schedules.published', '=', true)
      .execute();
    return rows.map((row) => row.fixture_id);
  }
}

function assertVenueAlias(value: string): void {
  const alias = Alias.create('venue', value);
  if (!alias.ok) {
    throw new InvariantViolationError(alias.error.message, { alias: value });
  }
}
