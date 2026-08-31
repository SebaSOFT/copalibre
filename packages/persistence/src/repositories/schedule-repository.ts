import {
  Alias,
  detectConflicts,
  generateScheduleSlots,
  ScheduleConflictError,
  validateOfficial,
  validateSchedule,
  validateVenue,
  type Official,
  type OfficialRole,
  type ResourceAssignment,
  type RestRule,
  type Schedule,
  type ScheduleConflict,
  type ScheduleContext,
  type ScheduleSlot,
  type SlotInfo,
  type Venue,
} from '@copalibre/domain';
import type { Kysely } from 'kysely';
import { InvariantViolationError, NotFoundError } from '../errors.js';
import { newId } from '../ids.js';
import {
  toOfficial,
  toResourceAssignment,
  toSchedule,
  toScheduleSlot,
  toVenue,
} from '../mapping.js';
import { lockRowsForMutation } from '../row-lock.js';
import type { Database } from '../schema.js';
import type { UnitOfWork } from '../transaction.js';
import type { AuditContext } from './enrollment-repository.js';

export interface SchedulePreview {
  readonly assignments: readonly ResourceAssignment[];
  readonly conflicts: readonly ScheduleConflict[];
  /** Matches already published that this batch would move. */
  readonly affectedPublishedMatches: readonly string[];
  readonly committable: boolean;
}

export interface ScheduleAssignmentDetail {
  readonly matchId: string;
  readonly fixtureId: string;
  readonly slotId: string;
  readonly venueId: string;
  readonly window: {
    readonly startsAt: number;
    readonly durationMinutes: number;
  };
  readonly officialIds?: readonly string[];
}

export class ScheduleRepository {
  constructor(private readonly db: Kysely<Database>) {}

  // ---------------------------------------------------------------------------
  // Venues
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Officials
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Schedules & Grid Generation
  // ---------------------------------------------------------------------------

  async createSchedule(
    uow: UnitOfWork,
    input: {
      readonly organizationId: string;
      readonly name: string;
      readonly startsAt: number;
      readonly endsAt: number;
      readonly slotMinutes: number;
      readonly turnaroundMinutes: number;
      readonly venueIds: readonly string[];
    } & Omit<AuditContext, 'organizationId'>,
  ): Promise<Schedule> {
    const scheduleId = newId();
    const schedule: Schedule = {
      scheduleId,
      organizationId: input.organizationId,
      name: input.name,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      slotMinutes: input.slotMinutes,
      turnaroundMinutes: input.turnaroundMinutes,
      venueIds: input.venueIds,
    };

    const valid = validateSchedule(schedule);
    if (!valid.ok) throw new InvariantViolationError(valid.error.message, { scheduleId });

    // Verify all venueIds belong to the organization
    const venues = await uow.tx
      .selectFrom('venues')
      .select('venue_id')
      .where('organization_id', '=', input.organizationId)
      .where('venue_id', 'in', input.venueIds)
      .execute();
    if (venues.length !== input.venueIds.length) {
      throw new InvariantViolationError('One or more venues do not belong to the organization', {
        organizationId: input.organizationId,
        venueIds: input.venueIds,
      });
    }

    const row = await uow.tx
      .insertInto('schedules')
      .values({
        schedule_id: scheduleId,
        organization_id: input.organizationId,
        name: input.name,
        starts_at: String(input.startsAt),
        ends_at: String(input.endsAt),
        slot_minutes: input.slotMinutes,
        turnaround_minutes: input.turnaroundMinutes,
        created_at: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    await uow.tx
      .insertInto('schedule_venues')
      .values(input.venueIds.map((venueId) => ({ schedule_id: scheduleId, venue_id: venueId })))
      .execute();

    const slots = generateScheduleSlots(schedule, newId);
    if (slots.length > 0) {
      await uow.tx
        .insertInto('schedule_slots')
        .values(
          slots.map((s) => ({
            slot_id: s.slotId,
            schedule_id: scheduleId,
            venue_id: s.venueId,
            starts_at: String(s.startsAt),
            created_at: new Date(),
          })),
        )
        .execute();
    }

    const created = toSchedule(row, input.venueIds);
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'schedule',
      entityId: scheduleId,
      action: 'schedule.created',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { ...created, slotCount: slots.length },
    });

    return created;
  }

  async listSchedules(organizationId: string): Promise<readonly Schedule[]> {
    const rows = await this.db
      .selectFrom('schedules')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .orderBy('name')
      .execute();

    const scheduleIds = rows.map((r) => r.schedule_id);
    if (scheduleIds.length === 0) return [];

    const venueLinks = await this.db
      .selectFrom('schedule_venues')
      .selectAll()
      .where('schedule_id', 'in', scheduleIds)
      .execute();

    return rows.map((row) => {
      const venues = venueLinks
        .filter((l) => l.schedule_id === row.schedule_id)
        .map((l) => l.venue_id);
      return toSchedule(row, venues);
    });
  }

  async findSchedule(scheduleId: string): Promise<Schedule | undefined> {
    const row = await this.db
      .selectFrom('schedules')
      .selectAll()
      .where('schedule_id', '=', scheduleId)
      .executeTakeFirst();
    if (!row) return undefined;

    const venueLinks = await this.db
      .selectFrom('schedule_venues')
      .selectAll()
      .where('schedule_id', '=', scheduleId)
      .execute();

    return toSchedule(
      row,
      venueLinks.map((l) => l.venue_id),
    );
  }

  async listScheduleSlots(
    scheduleId: string,
    uow?: UnitOfWork,
  ): Promise<readonly (ScheduleSlot & { readonly matchCount: number })[]> {
    const handle = uow?.tx ?? this.db;
    const slots = await handle
      .selectFrom('schedule_slots')
      .selectAll()
      .where('schedule_id', '=', scheduleId)
      .orderBy('starts_at')
      .execute();

    if (slots.length === 0) return [];

    const assignments = await handle
      .selectFrom('match_schedule_assignments')
      .select(['slot_id'])
      .where(
        'slot_id',
        'in',
        slots.map((s) => s.slot_id),
      )
      .execute();

    const countBySlot = new Map<string, number>();
    for (const a of assignments) {
      countBySlot.set(a.slot_id, (countBySlot.get(a.slot_id) ?? 0) + 1);
    }

    return slots.map((row) => ({
      ...toScheduleSlot(row),
      matchCount: countBySlot.get(row.slot_id) ?? 0,
    }));
  }

  async updateSchedule(
    uow: UnitOfWork,
    input: {
      readonly scheduleId: string;
      readonly organizationId: string;
      readonly name?: string;
      readonly startsAt?: number;
      readonly endsAt?: number;
      readonly slotMinutes?: number;
      readonly turnaroundMinutes?: number;
      readonly venueIds?: readonly string[];
    } & Omit<AuditContext, 'organizationId'>,
  ): Promise<Schedule> {
    const previous = await this.findSchedule(input.scheduleId);
    if (!previous) {
      throw new NotFoundError(`Schedule ${input.scheduleId} does not exist`, {
        scheduleId: input.scheduleId,
      });
    }

    const updated: Schedule = {
      scheduleId: input.scheduleId,
      organizationId: input.organizationId,
      name: input.name ?? previous.name,
      startsAt: input.startsAt ?? previous.startsAt,
      endsAt: input.endsAt ?? previous.endsAt,
      slotMinutes: input.slotMinutes ?? previous.slotMinutes,
      turnaroundMinutes: input.turnaroundMinutes ?? previous.turnaroundMinutes,
      venueIds: input.venueIds ?? previous.venueIds,
    };

    const valid = validateSchedule(updated);
    if (!valid.ok)
      throw new InvariantViolationError(valid.error.message, { scheduleId: input.scheduleId });

    const gridReshaped =
      updated.startsAt !== previous.startsAt ||
      updated.endsAt !== previous.endsAt ||
      updated.slotMinutes !== previous.slotMinutes ||
      updated.turnaroundMinutes !== previous.turnaroundMinutes;

    const removedVenues = previous.venueIds.filter((v) => !updated.venueIds.includes(v));
    const addedVenues = updated.venueIds.filter((v) => !previous.venueIds.includes(v));

    if (gridReshaped) {
      // Refuse if any slot of the schedule holds a match
      const occupied = await uow.tx
        .selectFrom('match_schedule_assignments')
        .innerJoin('schedule_slots', 'schedule_slots.slot_id', 'match_schedule_assignments.slot_id')
        .select('schedule_slots.slot_id')
        .where('schedule_slots.schedule_id', '=', input.scheduleId)
        .execute();

      if (occupied.length > 0) {
        throw new InvariantViolationError(
          'Cannot reshape schedule while its slots hold matches; unassign matches first',
          { scheduleId: input.scheduleId, occupiedSlots: occupied.map((o) => o.slot_id) },
        );
      }

      // Safe to regenerate all slots
      await uow.tx
        .deleteFrom('schedule_slots')
        .where('schedule_id', '=', input.scheduleId)
        .execute();
      await uow.tx
        .deleteFrom('schedule_venues')
        .where('schedule_id', '=', input.scheduleId)
        .execute();
      await uow.tx
        .insertInto('schedule_venues')
        .values(
          updated.venueIds.map((venueId) => ({ schedule_id: input.scheduleId, venue_id: venueId })),
        )
        .execute();

      const newSlots = generateScheduleSlots(updated, newId);
      if (newSlots.length > 0) {
        await uow.tx
          .insertInto('schedule_slots')
          .values(
            newSlots.map((s) => ({
              slot_id: s.slotId,
              schedule_id: input.scheduleId,
              venue_id: s.venueId,
              starts_at: String(s.startsAt),
              created_at: new Date(),
            })),
          )
          .execute();
      }
    } else {
      // Grid timing did not change, check venue removals/additions
      if (removedVenues.length > 0) {
        const occupied = await uow.tx
          .selectFrom('match_schedule_assignments')
          .innerJoin(
            'schedule_slots',
            'schedule_slots.slot_id',
            'match_schedule_assignments.slot_id',
          )
          .select('schedule_slots.slot_id')
          .where('schedule_slots.schedule_id', '=', input.scheduleId)
          .where('schedule_slots.venue_id', 'in', removedVenues)
          .execute();

        if (occupied.length > 0) {
          throw new InvariantViolationError(
            'Cannot remove venue from schedule while its slots hold matches; unassign matches first',
            { scheduleId: input.scheduleId, occupiedSlots: occupied.map((o) => o.slot_id) },
          );
        }

        await uow.tx
          .deleteFrom('schedule_slots')
          .where('schedule_id', '=', input.scheduleId)
          .where('venue_id', 'in', removedVenues)
          .execute();
        await uow.tx
          .deleteFrom('schedule_venues')
          .where('schedule_id', '=', input.scheduleId)
          .where('venue_id', 'in', removedVenues)
          .execute();
      }

      if (addedVenues.length > 0) {
        await uow.tx
          .insertInto('schedule_venues')
          .values(
            addedVenues.map((venueId) => ({ schedule_id: input.scheduleId, venue_id: venueId })),
          )
          .execute();

        const addedSlots = generateScheduleSlots({ ...updated, venueIds: addedVenues }, newId);
        if (addedSlots.length > 0) {
          await uow.tx
            .insertInto('schedule_slots')
            .values(
              addedSlots.map((s) => ({
                slot_id: s.slotId,
                schedule_id: input.scheduleId,
                venue_id: s.venueId,
                starts_at: String(s.startsAt),
                created_at: new Date(),
              })),
            )
            .execute();
        }
      }
    }

    const row = await uow.tx
      .updateTable('schedules')
      .set({
        name: updated.name,
        starts_at: String(updated.startsAt),
        ends_at: String(updated.endsAt),
        slot_minutes: updated.slotMinutes,
        turnaround_minutes: updated.turnaroundMinutes,
      })
      .where('schedule_id', '=', input.scheduleId)
      .returningAll()
      .executeTakeFirstOrThrow();

    const result = toSchedule(row, updated.venueIds);
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'schedule',
      entityId: input.scheduleId,
      action: 'schedule.updated',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      previousState: { ...previous },
      resultingState: { ...result },
    });

    return result;
  }

  async removeSchedule(
    uow: UnitOfWork,
    input: { readonly scheduleId: string; readonly organizationId: string } & Omit<
      AuditContext,
      'organizationId'
    >,
  ): Promise<void> {
    const previous = await this.findSchedule(input.scheduleId);
    if (!previous) return;

    const occupied = await uow.tx
      .selectFrom('match_schedule_assignments')
      .innerJoin('schedule_slots', 'schedule_slots.slot_id', 'match_schedule_assignments.slot_id')
      .select('schedule_slots.slot_id')
      .where('schedule_slots.schedule_id', '=', input.scheduleId)
      .execute();

    if (occupied.length > 0) {
      throw new InvariantViolationError(
        'Cannot delete schedule while its slots hold matches; unassign matches first',
        { scheduleId: input.scheduleId, occupiedSlots: occupied.map((o) => o.slot_id) },
      );
    }

    await uow.tx.deleteFrom('schedule_slots').where('schedule_id', '=', input.scheduleId).execute();
    await uow.tx
      .deleteFrom('schedule_venues')
      .where('schedule_id', '=', input.scheduleId)
      .execute();
    await uow.tx.deleteFrom('schedules').where('schedule_id', '=', input.scheduleId).execute();

    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'schedule',
      entityId: input.scheduleId,
      action: 'schedule.deleted',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      previousState: { ...previous },
    });
  }

  // ---------------------------------------------------------------------------
  // Publishing & Conflict Detection
  // ---------------------------------------------------------------------------

  async previewSchedule(input: {
    readonly organizationId: string;
    readonly assignments: readonly ResourceAssignment[];
    readonly restRule?: RestRule;
  }): Promise<SchedulePreview> {
    const matchIds = input.assignments.map((a) => a.matchId);
    if (matchIds.length > 0) {
      const notRequiredMatches = await this.db
        .selectFrom('matches')
        .select('match_id')
        .where('match_id', 'in', matchIds)
        .where('status', '=', 'not-required')
        .execute();

      if (notRequiredMatches.length > 0) {
        throw new InvariantViolationError('Cannot schedule a not-required match', {
          notRequiredMatchIds: notRequiredMatches.map((m) => m.match_id),
        });
      }
    }

    const context = await this.contextFor(input.organizationId, input.restRule);
    const conflicts = detectConflicts(input.assignments, context);

    const publishedMatches =
      matchIds.length === 0
        ? []
        : await this.db
            .selectFrom('match_schedule_assignments')
            .select('match_id')
            .where('match_id', 'in', matchIds)
            .where('published', '=', true)
            .execute();

    const publishedSet = new Set(publishedMatches.map((m) => m.match_id));

    return {
      assignments: input.assignments,
      conflicts,
      affectedPublishedMatches: input.assignments
        .map((a) => a.matchId)
        .filter((matchId) => publishedSet.has(matchId)),
      committable: conflicts.length === 0,
    };
  }

  async publishSchedule(
    uow: UnitOfWork,
    input: {
      readonly organizationId: string;
      readonly assignments: readonly ResourceAssignment[];
      readonly restRule?: RestRule;
    } & AuditContext,
  ): Promise<readonly ResourceAssignment[]> {
    if (input.assignments.length === 0) {
      throw new InvariantViolationError('Cannot publish an empty schedule assignment batch', {
        organizationId: input.organizationId,
      });
    }

    const matchIds = input.assignments.map((a) => a.matchId);
    const notRequiredMatches = await uow.tx
      .selectFrom('matches')
      .select('match_id')
      .where('match_id', 'in', matchIds)
      .where('status', '=', 'not-required')
      .execute();

    if (notRequiredMatches.length > 0) {
      throw new InvariantViolationError('Cannot schedule a not-required match', {
        notRequiredMatchIds: notRequiredMatches.map((m) => m.match_id),
      });
    }

    const slotIds = [...new Set(input.assignments.map((a) => a.slotId))].sort();
    if (slotIds.length > 0) {
      await lockRowsForMutation(
        this.db,
        uow.tx
          .selectFrom('schedule_slots')
          .select('slot_id')
          .where('slot_id', 'in', slotIds)
          .orderBy('slot_id'),
      ).execute();
    }

    const context = await this.contextFor(input.organizationId, input.restRule, uow);
    const conflicts = detectConflicts(input.assignments, context);
    if (conflicts.length > 0) {
      throw new ScheduleConflictError(conflicts);
    }

    await this.lockResources(uow, input.assignments, context);

    for (const assignment of input.assignments) {
      await uow.tx
        .deleteFrom('match_schedule_assignments')
        .where('match_id', '=', assignment.matchId)
        .execute();

      await uow.tx
        .insertInto('match_schedule_assignments')
        .values({
          match_id: assignment.matchId,
          slot_id: assignment.slotId,
          published: true,
          created_at: new Date(),
        })
        .execute();

      await uow.tx
        .deleteFrom('match_schedule_officials')
        .where('match_id', '=', assignment.matchId)
        .execute();

      if (assignment.officialIds && assignment.officialIds.length > 0) {
        await uow.tx
          .insertInto('match_schedule_officials')
          .values(
            assignment.officialIds.map((officialId) => ({
              match_id: assignment.matchId,
              official_id: officialId,
            })),
          )
          .execute();
      }
    }

    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'organization',
      entityId: input.organizationId,
      action: 'schedule.published',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { assignments: input.assignments.map((a) => ({ ...a })) },
    });
    await uow.publishEvent({
      organizationId: input.organizationId,
      stream: `organization:${input.organizationId}`,
      entityId: input.organizationId,
      eventType: 'schedule.published',
      projectionVersion: 1,
      payload: { organizationId: input.organizationId, matches: input.assignments.length },
    });

    return input.assignments;
  }

  private async lockResources(
    uow: UnitOfWork,
    assignments: readonly ResourceAssignment[],
    context: ScheduleContext,
  ): Promise<void> {
    const venueIds = [
      ...new Set(
        assignments
          .map((a) => context.slots.get(a.slotId)?.venueId)
          .filter((v): v is string => v !== undefined),
      ),
    ].sort();

    const officialIds = [...new Set(assignments.flatMap((a) => a.officialIds ?? []))].sort();

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

  async listScheduleForStage(stageId: string): Promise<readonly ResourceAssignment[]> {
    const rows = await this.db
      .selectFrom('match_schedule_assignments')
      .innerJoin('matches', 'matches.match_id', 'match_schedule_assignments.match_id')
      .innerJoin('fixtures', 'fixtures.fixture_id', 'matches.fixture_id')
      .select(['match_schedule_assignments.match_id', 'match_schedule_assignments.slot_id'])
      .where('fixtures.stage_id', '=', stageId)
      .where('matches.status', '!=', 'not-required')
      .execute();

    if (rows.length === 0) return [];

    const matchIds = rows.map((r) => r.match_id);
    const officials = await this.db
      .selectFrom('match_schedule_officials')
      .selectAll()
      .where('match_id', 'in', matchIds)
      .execute();

    return rows.map((row) =>
      toResourceAssignment(
        row,
        officials.filter((o) => o.match_id === row.match_id).map((o) => o.official_id),
      ),
    );
  }

  async listScheduleDetailsForStage(stageId: string): Promise<readonly ScheduleAssignmentDetail[]> {
    const rows = await this.db
      .selectFrom('match_schedule_assignments')
      .innerJoin('matches', 'matches.match_id', 'match_schedule_assignments.match_id')
      .innerJoin('fixtures', 'fixtures.fixture_id', 'matches.fixture_id')
      .innerJoin('schedule_slots', 'schedule_slots.slot_id', 'match_schedule_assignments.slot_id')
      .innerJoin('schedules', 'schedules.schedule_id', 'schedule_slots.schedule_id')
      .select([
        'matches.match_id',
        'fixtures.fixture_id',
        'schedule_slots.slot_id',
        'schedule_slots.venue_id',
        'schedule_slots.starts_at',
        'schedules.slot_minutes',
      ])
      .where('fixtures.stage_id', '=', stageId)
      .where('matches.status', '!=', 'not-required')
      .execute();

    if (rows.length === 0) return [];

    const matchIds = rows.map((r) => r.match_id);
    const officials = await this.db
      .selectFrom('match_schedule_officials')
      .selectAll()
      .where('match_id', 'in', matchIds)
      .execute();

    return rows.map((row) => {
      const matchOfficials = officials
        .filter((o) => o.match_id === row.match_id)
        .map((o) => o.official_id);
      return {
        matchId: row.match_id,
        fixtureId: row.fixture_id,
        slotId: row.slot_id,
        venueId: row.venue_id,
        window: {
          startsAt: Number(row.starts_at),
          durationMinutes: row.slot_minutes,
        },
        ...(matchOfficials.length === 0 ? {} : { officialIds: matchOfficials }),
      };
    });
  }

  private async contextFor(
    organizationId: string,
    restRule?: RestRule,
    uow?: UnitOfWork,
  ): Promise<ScheduleContext> {
    const executor = uow?.tx ?? this.db;

    const venueRows = await executor
      .selectFrom('venues')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .execute();

    const slotRows = await executor
      .selectFrom('schedule_slots')
      .innerJoin('schedules', 'schedules.schedule_id', 'schedule_slots.schedule_id')
      .select([
        'schedule_slots.slot_id',
        'schedule_slots.venue_id',
        'schedule_slots.starts_at',
        'schedules.slot_minutes',
      ])
      .where('schedules.organization_id', '=', organizationId)
      .execute();

    const slots = new Map<string, SlotInfo>(
      slotRows.map((r) => [
        r.slot_id,
        {
          slotId: r.slot_id,
          venueId: r.venue_id,
          window: {
            startsAt: Number(r.starts_at),
            durationMinutes: r.slot_minutes,
          },
        },
      ]),
    );

    const assignmentRows = await executor
      .selectFrom('match_schedule_assignments')
      .innerJoin('matches', 'matches.match_id', 'match_schedule_assignments.match_id')
      .innerJoin('schedule_slots', 'schedule_slots.slot_id', 'match_schedule_assignments.slot_id')
      .innerJoin('schedules', 'schedules.schedule_id', 'schedule_slots.schedule_id')
      .select(['match_schedule_assignments.match_id', 'match_schedule_assignments.slot_id'])
      .where('schedules.organization_id', '=', organizationId)
      .where('matches.status', '!=', 'not-required')
      .execute();

    const officialRows =
      assignmentRows.length === 0
        ? []
        : await executor
            .selectFrom('match_schedule_officials')
            .selectAll()
            .where(
              'match_id',
              'in',
              assignmentRows.map((a) => a.match_id),
            )
            .execute();

    const existing = assignmentRows.map((row) =>
      toResourceAssignment(
        row,
        officialRows.filter((o) => o.match_id === row.match_id).map((o) => o.official_id),
      ),
    );

    // Entrants per match
    const matchEntrantRows = await executor
      .selectFrom('matches')
      .innerJoin('fixtures', 'fixtures.fixture_id', 'matches.fixture_id')
      .innerJoin('stages', 'stages.stage_id', 'fixtures.stage_id')
      .innerJoin('seasons', 'seasons.season_id', 'stages.season_id')
      .innerJoin('tournaments', 'tournaments.tournament_id', 'seasons.tournament_id')
      .select([
        'matches.match_id',
        'fixtures.home_entrant_id',
        'fixtures.away_entrant_id',
        'matches.status',
      ])
      .where('tournaments.organization_id', '=', organizationId)
      .where('matches.status', '!=', 'not-required')
      .execute();

    const entrantsByMatch = new Map<string, readonly string[]>();
    const finalizedMatchIds = new Set<string>();

    for (const m of matchEntrantRows) {
      const entrants = [m.home_entrant_id, m.away_entrant_id].filter(
        (id): id is string => id !== null,
      );
      entrantsByMatch.set(m.match_id, entrants);
      if (m.status === 'finalized') {
        finalizedMatchIds.add(m.match_id);
      }
    }

    return {
      existing,
      slots,
      entrantsByMatch,
      venues: new Map(venueRows.map((r) => [r.venue_id, toVenue(r)])),
      finalizedMatchIds,
      ...(restRule ? { restRule } : {}),
    };
  }
}

function assertVenueAlias(value: string): void {
  const alias = Alias.create('venue', value);
  if (!alias.ok) {
    throw new InvariantViolationError(alias.error.message, { alias: value });
  }
}
