import {
  Alias,
  detectConflicts,
  estimatedMatchMinutes,
  generateScheduleSlots,
  ScheduleConflictError,
  validateOfficial,
  validateSchedule,
  validateVenue,
  type Official,
  type OfficialRole,
  type DisciplineDescriptor,
  type ResourceAssignment,
  type Schedule,
  type ScheduleConflict,
  type ScheduleContext,
  type ScheduleSlot,
  type SlotInfo,
  type Venue,
} from '@copalibre/domain';
import type { Kysely } from 'kysely';
import { InvariantViolationError, NotFoundError, ScheduleReasonRequiredError } from '../errors.js';
import { newId } from '../ids.js';
import { ProjectionStore } from '../relay/projection-store.js';
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

/** Why a published placement changed: a preset's code and its rendered text, or typed text. */
export interface ScheduleReason {
  readonly code?: string;
  readonly text: string;
}

export interface SchedulePlacement extends ResourceAssignment {
  /** This match's own exception reason, overriding the batch's. */
  readonly reason?: ScheduleReason;
}

export interface ScheduleWithdrawal {
  readonly matchId: string;
  readonly reason?: ScheduleReason;
}

/** One atomic schedule batch: placements and withdrawals commit together or not at all. */
export interface ScheduleBatch {
  readonly organizationId: string;
  readonly assignments: readonly SchedulePlacement[];
  readonly withdrawals?: readonly ScheduleWithdrawal[];
  /** Applies to every changed published match without its own reason. */
  readonly reason?: ScheduleReason;
}

export interface SchedulePreview {
  readonly assignments: readonly ResourceAssignment[];
  /** Matches the batch withdraws from their slots. */
  readonly withdrawn: readonly string[];
  /** Slots those withdrawals free. */
  readonly freedSlotIds: readonly string[];
  readonly conflicts: readonly ScheduleConflict[];
  /** Matches already published that this batch would move. */
  readonly affectedPublishedMatches: readonly string[];
  /** Published matches the batch changes or withdraws, each needing a reason. */
  readonly reasonRequiredMatches: readonly string[];
  readonly committable: boolean;
}

export interface SchedulePlacementHistory {
  readonly historyId: string;
  readonly matchId: string;
  readonly priorSlotId: string;
  readonly priorStartsAt: number;
  readonly priorVenueId: string;
  readonly priorOfficialIds: readonly string[];
  /** Absent when the change withdrew the match. */
  readonly resultingSlotId?: string;
  readonly reasonCode?: string;
  readonly reason: string;
  readonly actor: string;
  readonly changedAt: string;
}

export interface OrganizationScheduleEntry {
  readonly matchId: string;
  readonly status: string;
  readonly tournamentId: string;
  readonly stageId: string;
  readonly zoneId?: string;
  readonly round: number;
  readonly entrantIds: readonly string[];
  readonly slotId: string;
  readonly venueId: string;
  readonly startsAt: number;
  /** Start plus the estimated match length (or the slot length without an estimate). */
  readonly estimatedEnd: number;
  readonly published: boolean;
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

    const slots = generateScheduleSlots(
      schedule,
      newId,
      await this.timeZoneOf(uow, input.organizationId),
    );
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

      const newSlots = generateScheduleSlots(
        updated,
        newId,
        await this.timeZoneOf(uow, input.organizationId),
      );
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

        const addedSlots = generateScheduleSlots(
          { ...updated, venueIds: addedVenues },
          newId,
          await this.timeZoneOf(uow, input.organizationId),
        );
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

  async previewSchedule(input: ScheduleBatch): Promise<SchedulePreview> {
    const withdrawnIds = (input.withdrawals ?? []).map((w) => w.matchId);
    const matchIds = [...input.assignments.map((a) => a.matchId), ...withdrawnIds];
    await this.refuseNotRequired(this.db, matchIds);
    await this.refuseUnplacedWithdrawals(this.db, withdrawnIds);

    const context = await this.contextFor(input.organizationId);
    const conflicts = detectConflicts(input.assignments, context, withdrawnIds);
    const current = await this.currentPlacements(this.db, matchIds);
    const published = new Set(
      [...current.values()].filter((p) => p.published).map((p) => p.matchId),
    );
    const changed = changedPublishedMatches(input, current);

    return {
      assignments: input.assignments,
      withdrawn: withdrawnIds,
      freedSlotIds: withdrawnIds
        .map((matchId) => current.get(matchId)?.slotId)
        .filter((slotId): slotId is string => slotId !== undefined),
      conflicts,
      affectedPublishedMatches: matchIds.filter((matchId) => published.has(matchId)),
      reasonRequiredMatches: changed,
      committable: conflicts.length === 0,
    };
  }

  /**
   * The conflicts that exist now among published assignments, involving the given matches. The
   * same detector as preview and publish, run with the scope's own placements as the batch, so
   * each clash is compared against every other placement in the organization exactly once.
   */
  async currentConflicts(
    organizationId: string,
    matchIds: readonly string[],
    uow?: UnitOfWork,
  ): Promise<readonly ScheduleConflict[]> {
    if (matchIds.length === 0) return [];
    return conflictsAmongPublished(await this.contextFor(organizationId, uow), new Set(matchIds));
  }

  /** {@link currentConflicts} for every placed match of a stage. */
  async currentConflictsForStage(
    organizationId: string,
    stageId: string,
  ): Promise<readonly ScheduleConflict[]> {
    const placed = await this.listScheduleForStage(stageId);
    return this.currentConflicts(
      organizationId,
      placed.map((assignment) => assignment.matchId),
    );
  }

  /**
   * The conflicts a change of entrants made real: present among the changed matches' published
   * placements now, and absent under the entrants they had before. Venues and officials do not
   * move with entrants, so only rest conflicts can arise this way, but every kind is compared.
   */
  async conflictsArisenFrom(
    uow: UnitOfWork,
    organizationId: string,
    changes: readonly {
      readonly matchId: string;
      readonly previousEntrantIds: readonly string[];
    }[],
  ): Promise<readonly ScheduleConflict[]> {
    if (changes.length === 0) return [];
    const context = await this.contextFor(organizationId, uow);
    const placed = new Set(context.existing.map((assignment) => assignment.matchId));
    const scope = new Set(changes.map((change) => change.matchId).filter((id) => placed.has(id)));
    if (scope.size === 0) return [];
    const before = new Map(context.entrantsByMatch);
    for (const change of changes) before.set(change.matchId, change.previousEntrantIds);
    const prior = new Set(
      conflictsAmongPublished({ ...context, entrantsByMatch: before }, scope).map(conflictKey),
    );
    return conflictsAmongPublished(context, scope).filter(
      (conflict) => !prior.has(conflictKey(conflict)),
    );
  }

  async publishSchedule(
    uow: UnitOfWork,
    input: ScheduleBatch & AuditContext,
  ): Promise<readonly ResourceAssignment[]> {
    const withdrawals = input.withdrawals ?? [];
    if (input.assignments.length === 0 && withdrawals.length === 0) {
      throw new InvariantViolationError('Cannot publish an empty schedule assignment batch', {
        organizationId: input.organizationId,
      });
    }

    const withdrawnIds = withdrawals.map((w) => w.matchId);
    const matchIds = [...input.assignments.map((a) => a.matchId), ...withdrawnIds];
    // Serialize publications of the same match before reading its previous placement.
    // The match lock also orders a publication against start and series anulling.
    await lockRowsForMutation(
      this.db,
      uow.tx
        .selectFrom('matches')
        .select('match_id')
        .where('match_id', 'in', matchIds)
        .orderBy('match_id'),
    ).execute();
    await this.refuseNotRequired(uow.tx, matchIds);
    await this.refuseUnplacedWithdrawals(uow.tx, withdrawnIds);

    const current = await this.currentPlacements(uow.tx, matchIds);
    const slotIds = [
      ...new Set([
        ...input.assignments.map((a) => a.slotId),
        ...[...current.values()].map((p) => p.slotId),
      ]),
    ].sort();
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

    const context = await this.contextFor(input.organizationId, uow);
    const conflicts = detectConflicts(input.assignments, context, withdrawnIds);
    if (conflicts.length > 0) {
      throw new ScheduleConflictError(conflicts);
    }

    const changed = changedPublishedMatches(input, current);
    const reasonFor = (matchId: string): ScheduleReason | undefined =>
      [...input.assignments, ...withdrawals].find((entry) => entry.matchId === matchId)?.reason ??
      input.reason;
    const uncovered = changed.filter((matchId) => !hasText(reasonFor(matchId)));
    if (uncovered.length > 0) {
      throw new ScheduleReasonRequiredError(uncovered);
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

    if (withdrawnIds.length > 0) {
      await uow.tx
        .deleteFrom('match_schedule_officials')
        .where('match_id', 'in', withdrawnIds)
        .execute();
      await uow.tx
        .deleteFrom('match_schedule_assignments')
        .where('match_id', 'in', withdrawnIds)
        .execute();
    }

    for (const matchId of changed) {
      const prior = current.get(matchId) as CurrentPlacement;
      const reason = reasonFor(matchId) as ScheduleReason;
      const resulting = input.assignments.find((a) => a.matchId === matchId);
      const resultingSlot = resulting ? context.slots.get(resulting.slotId) : undefined;
      await uow.tx
        .insertInto('match_schedule_history')
        .values({
          history_id: newId(),
          match_id: matchId,
          prior_slot_id: prior.slotId,
          prior_starts_at: String(prior.startsAt),
          prior_venue_id: prior.venueId,
          prior_official_ids: JSON.stringify(prior.officialIds),
          resulting_slot_id: resulting?.slotId ?? null,
          reason_code: reason.code ?? null,
          reason: reason.text.trim(),
          actor: input.actor,
          changed_at: new Date(),
        })
        .execute();
      await uow.recordAudit({
        organizationId: input.organizationId,
        entityType: 'match',
        entityId: matchId,
        action: resulting ? 'schedule.placement-changed' : 'schedule.placement-withdrawn',
        actor: input.actor,
        authorizationContext: input.authorizationContext,
        previousState: placementState(prior),
        resultingState: resulting
          ? {
              slotId: resulting.slotId,
              venueId: resultingSlot?.venueId ?? null,
              startsAt: resultingSlot?.window.startsAt ?? null,
              officialIds: [...(resulting.officialIds ?? [])],
            }
          : { slotId: null },
        reason: reason.text.trim(),
      });
    }

    const publishedChanges = new Set(changed);
    for (const assignment of input.assignments) {
      if (!current.get(assignment.matchId)?.published) publishedChanges.add(assignment.matchId);
    }
    await this.publishPlacementEvents(uow, input, context, current, [...publishedChanges]);

    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'organization',
      entityId: input.organizationId,
      action: 'schedule.published',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: {
        assignments: input.assignments.map((a) => ({
          matchId: a.matchId,
          slotId: a.slotId,
          ...(a.officialIds ? { officialIds: [...a.officialIds] } : {}),
        })),
        withdrawn: withdrawnIds,
      },
    });
    await uow.publishEvent({
      organizationId: input.organizationId,
      stream: `organization:${input.organizationId}`,
      entityId: input.organizationId,
      eventType: 'schedule.published',
      projectionVersion: 1,
      payload: {
        organizationId: input.organizationId,
        matches: input.assignments.length,
        withdrawn: withdrawnIds.length,
      },
    });

    return input.assignments;
  }

  private async publishPlacementEvents(
    uow: UnitOfWork,
    input: ScheduleBatch & AuditContext,
    context: ScheduleContext,
    current: ReadonlyMap<string, CurrentPlacement>,
    matchIds: readonly string[],
  ): Promise<void> {
    if (matchIds.length === 0) return;
    const matches = await uow.tx
      .selectFrom('matches')
      .innerJoin('fixtures', 'fixtures.fixture_id', 'matches.fixture_id')
      .select(['matches.match_id', 'fixtures.stage_id'])
      .where('matches.match_id', 'in', [...matchIds])
      .execute();
    const stages = new Map(matches.map((match) => [match.match_id, match.stage_id]));
    const subject = input.actor.startsWith('user:') ? input.actor.slice(5) : undefined;
    const actor = subject
      ? await uow.tx
          .selectFrom('identity_principals')
          .select('name')
          .where(
            /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(subject)
              ? 'principal_id'
              : 'oidc_subject_id',
            '=',
            subject,
          )
          .executeTakeFirst()
      : undefined;
    const venueOf = (venueId: string) => {
      const venue = context.venues.get(venueId);
      return venue ? { alias: venue.alias, name: venue.name } : null;
    };
    for (const matchId of matchIds) {
      const assignment = input.assignments.find((entry) => entry.matchId === matchId);
      const slot = assignment ? context.slots.get(assignment.slotId) : undefined;
      const prior = current.get(matchId);
      const previous = prior?.published
        ? { startsAt: prior.startsAt, venue: venueOf(prior.venueId) }
        : null;
      const projectionVersion = await new ProjectionStore(uow.tx).nextVersion(uow, {
        projectionType: 'match-schedule',
        entityId: matchId,
      });
      await uow.publishEvent({
        organizationId: input.organizationId,
        stream: `match:${matchId}`,
        entityId: matchId,
        eventType: 'match.rescheduled',
        projectionVersion,
        payload: {
          matchId,
          stageId: stages.get(matchId),
          startsAt: slot?.window.startsAt ?? null,
          estimatedEnd: slot
            ? slot.window.startsAt +
              (context.occupancyMinutesByMatch?.get(matchId) ?? slot.window.durationMinutes) *
                60_000
            : null,
          venue: slot ? venueOf(slot.venueId) : null,
          withdrawn: assignment === undefined,
          previous,
          actor: input.actor,
          actorName: actor?.name ?? input.actor,
          officialIds: [...(assignment?.officialIds ?? [])],
        },
      });
    }
  }

  /** A match anulled by a series decision has a history, not a plan. */
  private async refuseNotRequired(
    executor: Kysely<Database>,
    matchIds: readonly string[],
  ): Promise<void> {
    if (matchIds.length === 0) return;
    const notRequiredMatches = await executor
      .selectFrom('matches')
      .select('match_id')
      .where('match_id', 'in', [...matchIds])
      .where('status', '=', 'not-required')
      .execute();
    if (notRequiredMatches.length > 0) {
      throw new InvariantViolationError('Cannot schedule a not-required match', {
        notRequiredMatchIds: notRequiredMatches.map((m) => m.match_id),
      });
    }
  }

  /** Only a placed match can be withdrawn from its slot. */
  private async refuseUnplacedWithdrawals(
    executor: Kysely<Database>,
    matchIds: readonly string[],
  ): Promise<void> {
    if (matchIds.length === 0) return;
    const placed = await executor
      .selectFrom('match_schedule_assignments')
      .select('match_id')
      .where('match_id', 'in', [...matchIds])
      .execute();
    const placedIds = new Set(placed.map((row) => row.match_id));
    const unplaced = matchIds.filter((matchId) => !placedIds.has(matchId));
    if (unplaced.length > 0) {
      throw new InvariantViolationError('Cannot withdraw a match that holds no slot', {
        unplacedMatchIds: unplaced,
      });
    }
  }

  /** Where each match currently stands: its slot, venue, start, officials and visibility. */
  private async currentPlacements(
    executor: Kysely<Database>,
    matchIds: readonly string[],
  ): Promise<ReadonlyMap<string, CurrentPlacement>> {
    if (matchIds.length === 0) return new Map();
    const rows = await executor
      .selectFrom('match_schedule_assignments')
      .innerJoin('schedule_slots', 'schedule_slots.slot_id', 'match_schedule_assignments.slot_id')
      .select([
        'match_schedule_assignments.match_id',
        'match_schedule_assignments.slot_id',
        'match_schedule_assignments.published',
        'schedule_slots.venue_id',
        'schedule_slots.starts_at',
      ])
      .where('match_schedule_assignments.match_id', 'in', [...matchIds])
      .execute();
    const officials =
      rows.length === 0
        ? []
        : await executor
            .selectFrom('match_schedule_officials')
            .selectAll()
            .where(
              'match_id',
              'in',
              rows.map((row) => row.match_id),
            )
            .execute();
    return new Map(
      rows.map((row) => [
        row.match_id,
        {
          matchId: row.match_id,
          slotId: row.slot_id,
          published: Boolean(row.published),
          venueId: row.venue_id,
          startsAt: Number(row.starts_at),
          officialIds: officials
            .filter((official) => official.match_id === row.match_id)
            .map((official) => official.official_id)
            .sort(),
        },
      ]),
    );
  }

  /** The organization's IANA zone, whose wall clock schedule slots step in. */
  private async timeZoneOf(uow: UnitOfWork, organizationId: string): Promise<string | undefined> {
    const row = await uow.tx
      .selectFrom('organizations')
      .select('timezone')
      .where('organization_id', '=', organizationId)
      .executeTakeFirst();
    return row?.timezone || undefined;
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

  private async contextFor(organizationId: string, uow?: UnitOfWork): Promise<ScheduleContext> {
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
        'schedules.turnaround_minutes',
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
          changeoverMinutes: r.turnaround_minutes,
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

    const matchRows = await executor
      .selectFrom('matches')
      .innerJoin('fixtures', 'fixtures.fixture_id', 'matches.fixture_id')
      .innerJoin('stages', 'stages.stage_id', 'fixtures.stage_id')
      .innerJoin('seasons', 'seasons.season_id', 'stages.season_id')
      .innerJoin('tournaments', 'tournaments.tournament_id', 'seasons.tournament_id')
      .select([
        'matches.match_id',
        'matches.status',
        'fixtures.home_entrant_id',
        'fixtures.away_entrant_id',
        'tournaments.tournament_id',
        'tournaments.minimum_rest_minutes',
      ])
      .where('tournaments.organization_id', '=', organizationId)
      .where('matches.status', '!=', 'not-required')
      .execute();

    const occupancyByTournament = await this.occupancyByTournament(executor, [
      ...new Set(matchRows.map((m) => m.tournament_id)),
    ]);

    const entrantsByMatch = new Map<string, readonly string[]>();
    const lockedMatches = new Map<string, 'finalized' | 'in-progress'>();
    const restMinutesByMatch = new Map<string, number>();
    const occupancyMinutesByMatch = new Map<string, number>();
    for (const m of matchRows) {
      entrantsByMatch.set(
        m.match_id,
        [m.home_entrant_id, m.away_entrant_id].filter((id): id is string => id !== null),
      );
      const lock = LOCKED_STATUSES.get(m.status);
      if (lock !== undefined) lockedMatches.set(m.match_id, lock);
      if (m.minimum_rest_minutes !== null) {
        restMinutesByMatch.set(m.match_id, m.minimum_rest_minutes);
      }
      const occupancy = occupancyByTournament.get(m.tournament_id);
      if (occupancy !== undefined) occupancyMinutesByMatch.set(m.match_id, occupancy);
    }

    return {
      existing,
      slots,
      entrantsByMatch,
      venues: new Map(venueRows.map((r) => [r.venue_id, toVenue(r)])),
      lockedMatches,
      restMinutesByMatch,
      occupancyMinutesByMatch,
    };
  }

  /**
   * Each tournament's estimated match length, from its discipline and its latest ruleset's
   * overrides — the one duration conflict detection and every timeline drawing share.
   */
  private async occupancyByTournament(
    executor: Kysely<Database>,
    tournamentIds: readonly string[],
  ): Promise<ReadonlyMap<string, number>> {
    if (tournamentIds.length === 0) return new Map();
    const descriptors = await executor
      .selectFrom('tournaments')
      .innerJoin('discipline_descriptors', (join) =>
        join
          .onRef('discipline_descriptors.descriptor_id', '=', 'tournaments.descriptor_id')
          .onRef('discipline_descriptors.version', '=', 'tournaments.descriptor_version'),
      )
      .select(['tournaments.tournament_id', 'discipline_descriptors.document'])
      .where('tournaments.tournament_id', 'in', [...tournamentIds])
      .execute();
    const rulesets = await executor
      .selectFrom('tournament_rulesets')
      .select(['tournament_id', 'version', 'overrides'])
      .where('tournament_id', 'in', [...tournamentIds])
      .orderBy('version', 'asc')
      .execute();
    const overridesOf = new Map<string, Readonly<Record<string, unknown>>>();
    for (const ruleset of rulesets) {
      overridesOf.set(ruleset.tournament_id, parseJson(ruleset.overrides) ?? {});
    }

    const occupancy = new Map<string, number>();
    for (const row of descriptors) {
      const document = parseJson(row.document) as DisciplineDescriptor | undefined;
      if (!document) continue;
      const minutes = estimatedMatchMinutes(document, overridesOf.get(row.tournament_id));
      if (minutes !== undefined) occupancy.set(row.tournament_id, minutes);
    }
    return occupancy;
  }

  // ---------------------------------------------------------------------------
  // History & organization reads
  // ---------------------------------------------------------------------------

  /** A match's published-placement history, oldest first. */
  async listScheduleHistory(matchId: string): Promise<readonly SchedulePlacementHistory[]> {
    const rows = await this.db
      .selectFrom('match_schedule_history')
      .selectAll()
      .where('match_id', '=', matchId)
      .orderBy('changed_at')
      .orderBy('history_id')
      .execute();
    return rows.map((row) => ({
      historyId: row.history_id,
      matchId: row.match_id,
      priorSlotId: row.prior_slot_id,
      priorStartsAt: Number(row.prior_starts_at),
      priorVenueId: row.prior_venue_id,
      priorOfficialIds: (parseJson(row.prior_official_ids) as readonly string[] | undefined) ?? [],
      ...(row.resulting_slot_id === null ? {} : { resultingSlotId: row.resulting_slot_id }),
      ...(row.reason_code === null ? {} : { reasonCode: row.reason_code }),
      reason: row.reason,
      actor: row.actor,
      changedAt: new Date(row.changed_at).toISOString(),
    }));
  }

  /** The organization's most recent distinct typed reasons, newest first. */
  async recentScheduleReasons(organizationId: string, limit = 10): Promise<readonly string[]> {
    const rows = await this.db
      .selectFrom('match_schedule_history')
      .innerJoin('matches', 'matches.match_id', 'match_schedule_history.match_id')
      .innerJoin('fixtures', 'fixtures.fixture_id', 'matches.fixture_id')
      .innerJoin('stages', 'stages.stage_id', 'fixtures.stage_id')
      .innerJoin('seasons', 'seasons.season_id', 'stages.season_id')
      .innerJoin('tournaments', 'tournaments.tournament_id', 'seasons.tournament_id')
      .select((eb) => [
        'match_schedule_history.reason',
        eb.fn.max('match_schedule_history.changed_at').as('last_used'),
      ])
      .where('tournaments.organization_id', '=', organizationId)
      .where('match_schedule_history.reason_code', 'is', null)
      .groupBy('match_schedule_history.reason')
      .orderBy('last_used', 'desc')
      .limit(limit)
      .execute();
    return rows.map((row) => row.reason);
  }

  /**
   * An organization's assignments whose start falls in `[from, to)`, across its tournaments,
   * optionally narrowed to one tournament, stage or venue. The range is capped so one read
   * never scans a season.
   */
  async listOrganizationSchedule(input: {
    readonly organizationId: string;
    readonly from: number;
    readonly to: number;
    readonly tournamentId?: string;
    readonly stageId?: string;
    readonly venueId?: string;
  }): Promise<readonly OrganizationScheduleEntry[]> {
    if (!(input.to > input.from) || input.to - input.from > MAX_ORGANIZATION_RANGE_MS) {
      throw new InvariantViolationError(
        'An organization schedule read covers a positive range of at most 31 days',
        { from: input.from, to: input.to },
      );
    }
    let query = this.db
      .selectFrom('match_schedule_assignments')
      .innerJoin('schedule_slots', 'schedule_slots.slot_id', 'match_schedule_assignments.slot_id')
      .innerJoin('schedules', 'schedules.schedule_id', 'schedule_slots.schedule_id')
      .innerJoin('matches', 'matches.match_id', 'match_schedule_assignments.match_id')
      .innerJoin('fixtures', 'fixtures.fixture_id', 'matches.fixture_id')
      .innerJoin('stages', 'stages.stage_id', 'fixtures.stage_id')
      .innerJoin('seasons', 'seasons.season_id', 'stages.season_id')
      .innerJoin('tournaments', 'tournaments.tournament_id', 'seasons.tournament_id')
      .select([
        'matches.match_id',
        'matches.status',
        'tournaments.tournament_id',
        'stages.stage_id',
        'fixtures.zone_id',
        'fixtures.round',
        'fixtures.home_entrant_id',
        'fixtures.away_entrant_id',
        'schedule_slots.slot_id',
        'schedule_slots.venue_id',
        'schedule_slots.starts_at',
        'schedules.slot_minutes',
        'match_schedule_assignments.published',
      ])
      .where('tournaments.organization_id', '=', input.organizationId)
      .where('schedules.organization_id', '=', input.organizationId)
      .where('matches.status', '!=', 'not-required')
      .where('schedule_slots.starts_at', '>=', String(input.from))
      .where('schedule_slots.starts_at', '<', String(input.to));
    if (input.tournamentId !== undefined) {
      query = query.where('tournaments.tournament_id', '=', input.tournamentId);
    }
    if (input.stageId !== undefined) query = query.where('stages.stage_id', '=', input.stageId);
    if (input.venueId !== undefined) {
      query = query.where('schedule_slots.venue_id', '=', input.venueId);
    }
    const rows = await query
      .orderBy('schedule_slots.starts_at')
      .orderBy('matches.match_id')
      .execute();
    const occupancy = await this.occupancyByTournament(this.db, [
      ...new Set(rows.map((row) => row.tournament_id)),
    ]);

    return rows.map((row) => {
      const startsAt = Number(row.starts_at);
      const minutes = occupancy.get(row.tournament_id) ?? row.slot_minutes;
      return {
        matchId: row.match_id,
        status: row.status,
        tournamentId: row.tournament_id,
        stageId: row.stage_id,
        ...(row.zone_id === null ? {} : { zoneId: row.zone_id }),
        round: row.round,
        entrantIds: [row.home_entrant_id, row.away_entrant_id].filter(
          (id): id is string => id !== null,
        ),
        slotId: row.slot_id,
        venueId: row.venue_id,
        startsAt,
        estimatedEnd: startsAt + minutes * 60_000,
        published: Boolean(row.published),
      };
    });
  }
}

/** A match whose schedule can no longer change, and why. */
const LOCKED_STATUSES: ReadonlyMap<string, 'finalized' | 'in-progress'> = new Map([
  ['finalized', 'finalized'],
  ['forfeited', 'finalized'],
  ['in-progress', 'in-progress'],
]);

const MAX_ORGANIZATION_RANGE_MS = 31 * 24 * 60 * 60_000;

interface CurrentPlacement {
  readonly matchId: string;
  readonly slotId: string;
  readonly published: boolean;
  readonly venueId: string;
  readonly startsAt: number;
  readonly officialIds: readonly string[];
}

/**
 * Published matches this batch moves to another slot, re-officiates, or withdraws — the ones
 * that need a reason and leave a history row. A first placement is not among them, and neither
 * is a published match re-sent exactly as it stands.
 */
function changedPublishedMatches(
  batch: ScheduleBatch,
  current: ReadonlyMap<string, CurrentPlacement>,
): readonly string[] {
  const changed: string[] = [];
  for (const assignment of batch.assignments) {
    const prior = current.get(assignment.matchId);
    if (!prior?.published) continue;
    const officials = [...(assignment.officialIds ?? [])].sort();
    if (
      prior.slotId !== assignment.slotId ||
      officials.length !== prior.officialIds.length ||
      officials.some((officialId, index) => officialId !== prior.officialIds[index])
    ) {
      changed.push(assignment.matchId);
    }
  }
  for (const withdrawal of batch.withdrawals ?? []) {
    if (current.get(withdrawal.matchId)?.published) changed.push(withdrawal.matchId);
  }
  return changed;
}

function placementState(prior: CurrentPlacement): Record<string, unknown> {
  return {
    slotId: prior.slotId,
    venueId: prior.venueId,
    startsAt: prior.startsAt,
    officialIds: [...prior.officialIds],
  };
}

function hasText(reason: ScheduleReason | undefined): boolean {
  return reason !== undefined && reason.text.trim() !== '';
}

/** A JSON column: text on SQLite, already parsed on PostgreSQL. */
function parseJson<T = Record<string, unknown>>(raw: unknown): T | undefined {
  if (raw === null || raw === undefined) return undefined;
  return (typeof raw === 'string' ? JSON.parse(raw) : raw) as T;
}

function assertVenueAlias(value: string): void {
  const alias = Alias.create('venue', value);
  if (!alias.ok) {
    throw new InvariantViolationError(alias.error.message, { alias: value });
  }
}

/**
 * Conflicts among published placements involving `scope`. A finalized or running match is a
 * record, not a proposal, so the locks that refuse moving one are not conflicts here.
 */
export function conflictsAmongPublished(
  context: ScheduleContext,
  scope: ReadonlySet<string>,
): readonly ScheduleConflict[] {
  const proposed = context.existing.filter((assignment) => scope.has(assignment.matchId));
  return detectConflicts(proposed, { ...context, lockedMatches: new Map() });
}

/** One conflict's identity, whichever of its two matches it is reported from. */
export function conflictKey(conflict: ScheduleConflict): string {
  const pair = [conflict.matchId, conflict.conflictsWithMatchId].sort().join('|');
  return `${conflict.kind}|${pair}|${conflict.resourceId}`;
}
