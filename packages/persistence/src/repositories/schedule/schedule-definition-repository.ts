import {
  generateScheduleSlots,
  validateSchedule,
  type Schedule,
  type ScheduleSlot,
} from '@copalibre/domain';
import type { Kysely } from 'kysely';
import { InvariantViolationError, NotFoundError } from '../../errors.js';
import { newId } from '../../ids.js';
import { ProjectionStore } from '../../relay/projection-store.js';
import { toSchedule, toScheduleSlot } from '../../mapping.js';
import { lockRowsForMutation } from '../../row-lock.js';
import type { Database } from '../../schema.js';
import type { UnitOfWork } from '../../transaction.js';
import type { AuditContext } from '../enrollment-repository.js';
import { SchedulePublicationRepository } from './schedule-publication.js';

/** Schedule definitions and their slots: create, list, find, update and remove. */
export class ScheduleDefinitionRepository {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly publication: SchedulePublicationRepository,
  ) {}

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
    await lockRowsForMutation(
      this.db,
      uow.tx
        .selectFrom('venues')
        .select('venue_id')
        .where('venue_id', 'in', input.venueIds)
        .orderBy('venue_id'),
    ).execute();
    const venues = await uow.tx
      .selectFrom('venues')
      .select('venue_id')
      .where('organization_id', '=', input.organizationId)
      .where('venue_id', 'in', input.venueIds)
      .where('deleted_at', 'is', null)
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
      await this.publication.timeZoneOf(uow, input.organizationId),
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
        await this.publication.timeZoneOf(uow, input.organizationId),
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
          await this.publication.timeZoneOf(uow, input.organizationId),
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

  async previewRemoveSchedule(scheduleId: string): Promise<{
    readonly slots: number;
    readonly matchesUnassigned: number;
  }> {
    const slots = await this.db
      .selectFrom('schedule_slots')
      .select('slot_id')
      .where('schedule_id', '=', scheduleId)
      .execute();
    const matches = await this.db
      .selectFrom('match_schedule_assignments')
      .innerJoin('schedule_slots', 'schedule_slots.slot_id', 'match_schedule_assignments.slot_id')
      .select('match_schedule_assignments.match_id')
      .where('schedule_slots.schedule_id', '=', scheduleId)
      .execute();
    return { slots: slots.length, matchesUnassigned: matches.length };
  }

  async removeSchedule(
    uow: UnitOfWork,
    input: {
      readonly scheduleId: string;
      readonly organizationId: string;
      readonly confirmationName: string;
    } & Omit<AuditContext, 'organizationId'>,
  ): Promise<{ readonly slots: number; readonly matchesUnassigned: number }> {
    const schedule = await uow.tx
      .selectFrom('schedules')
      .select(['schedule_id', 'name'])
      .where('schedule_id', '=', input.scheduleId)
      .forUpdate()
      .executeTakeFirst();
    if (!schedule) return { slots: 0, matchesUnassigned: 0 };
    if (schedule.name !== input.confirmationName) {
      throw new InvariantViolationError('Schedule name confirmation did not match', {
        scheduleId: input.scheduleId,
      });
    }

    const previous = await this.findSchedule(input.scheduleId);
    if (!previous) return { slots: 0, matchesUnassigned: 0 };

    const assignments = await uow.tx
      .selectFrom('match_schedule_assignments')
      .innerJoin('schedule_slots', 'schedule_slots.slot_id', 'match_schedule_assignments.slot_id')
      .innerJoin('matches', 'matches.match_id', 'match_schedule_assignments.match_id')
      .innerJoin('fixtures', 'fixtures.fixture_id', 'matches.fixture_id')
      .select([
        'match_schedule_assignments.match_id',
        'schedule_slots.slot_id',
        'schedule_slots.venue_id',
        'schedule_slots.starts_at',
        'fixtures.stage_id',
      ])
      .where('schedule_slots.schedule_id', '=', input.scheduleId)
      .execute();

    const slots = await uow.tx
      .selectFrom('schedule_slots')
      .select('slot_id')
      .where('schedule_id', '=', input.scheduleId)
      .execute();
    const matchIds = assignments.map((assignment) => assignment.match_id);
    const officials =
      matchIds.length === 0
        ? []
        : await uow.tx
            .selectFrom('match_schedule_officials')
            .select(['match_id', 'official_id'])
            .where('match_id', 'in', matchIds)
            .orderBy('official_id')
            .execute();
    const officialsByMatch = new Map<string, string[]>();
    for (const official of officials) {
      const list = officialsByMatch.get(official.match_id) ?? [];
      list.push(official.official_id);
      officialsByMatch.set(official.match_id, list);
    }
    const venues =
      assignments.length === 0
        ? []
        : await uow.tx
            .selectFrom('venues')
            .select(['venue_id', 'alias', 'name'])
            .where('venue_id', 'in', [
              ...new Set(assignments.map((assignment) => assignment.venue_id)),
            ])
            .where('deleted_at', 'is', null)
            .execute();
    const venueById = new Map(
      venues.map((venue) => [venue.venue_id, { alias: venue.alias, name: venue.name }]),
    );
    const projectionStore = new ProjectionStore(uow.tx);

    for (const assignment of assignments) {
      const priorOfficialIds = officialsByMatch.get(assignment.match_id) ?? [];
      await uow.tx
        .insertInto('match_schedule_history')
        .values({
          history_id: newId(),
          match_id: assignment.match_id,
          prior_slot_id: assignment.slot_id,
          prior_starts_at: String(assignment.starts_at),
          prior_venue_id: assignment.venue_id,
          prior_official_ids: JSON.stringify(priorOfficialIds),
          resulting_slot_id: null,
          reason_code: null,
          reason: 'Schedule deleted',
          actor: input.actor,
          changed_at: new Date(),
        })
        .execute();
      await uow.recordAudit({
        organizationId: input.organizationId,
        entityType: 'match',
        entityId: assignment.match_id,
        action: 'schedule.placement-withdrawn',
        actor: input.actor,
        authorizationContext: input.authorizationContext,
        previousState: {
          slotId: assignment.slot_id,
          startsAt: Number(assignment.starts_at),
          venueId: assignment.venue_id,
          officialIds: priorOfficialIds,
        },
        resultingState: { slotId: null, officialIds: [] },
        reason: 'Schedule deleted after consequence confirmation',
      });
      const projectionVersion = await projectionStore.nextVersion(uow, {
        projectionType: 'match-schedule',
        entityId: assignment.match_id,
      });
      await uow.publishEvent({
        organizationId: input.organizationId,
        stream: `match:${assignment.match_id}`,
        entityId: assignment.match_id,
        eventType: 'match.rescheduled',
        projectionVersion,
        payload: {
          matchId: assignment.match_id,
          stageId: assignment.stage_id,
          startsAt: null,
          estimatedEnd: null,
          venue: null,
          withdrawn: true,
          previous: {
            startsAt: Number(assignment.starts_at),
            venue: venueById.get(assignment.venue_id) ?? null,
          },
          actor: input.actor,
          actorName: input.actor,
          officialIds: [],
        },
      });
    }

    if (matchIds.length > 0) {
      await uow.tx
        .deleteFrom('match_schedule_officials')
        .where('match_id', 'in', matchIds)
        .execute();
      await uow.tx
        .deleteFrom('match_schedule_assignments')
        .where('match_id', 'in', matchIds)
        .execute();
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
      resultingState: { slots: slots.length, matchesUnassigned: matchIds.length },
      reason: 'Schedule deleted after consequence confirmation',
    });
    await uow.publishEvent({
      organizationId: input.organizationId,
      stream: `organization:${input.organizationId}`,
      entityId: input.scheduleId,
      eventType: 'schedule.deleted',
      projectionVersion: 1,
      payload: {
        scheduleId: input.scheduleId,
        slots: slots.length,
        matchesUnassigned: matchIds.length,
        actor: input.actor,
      },
    });
    return { slots: slots.length, matchesUnassigned: matchIds.length };
  }
}
