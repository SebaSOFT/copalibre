import {
  detectConflicts,
  ScheduleConflictError,
  type ResourceAssignment,
  type ScheduleConflict,
  type ScheduleContext,
  type SlotInfo,
} from '@copalibre/domain';
import type { Kysely } from 'kysely';
import { InvariantViolationError, ScheduleReasonRequiredError } from '../../errors.js';
import { newId } from '../../ids.js';
import { ProjectionStore } from '../../relay/projection-store.js';
import { toResourceAssignment, toVenue } from '../../mapping.js';
import { lockRowsForMutation } from '../../row-lock.js';
import type { Database } from '../../schema.js';
import type { UnitOfWork } from '../../transaction.js';
import type { AuditContext } from '../enrollment-repository.js';
import { ScheduleQueryRepository } from './schedule-queries.js';
import {
  type ScheduleReason,
  type ScheduleBatch,
  type SchedulePreview,
  LOCKED_STATUSES,
  type CurrentPlacement,
  changedPublishedMatches,
  placementState,
  hasText,
  conflictsAmongPublished,
  conflictKey,
} from './schedule-support.js';

/** Preview, conflicts, publication and placement events of schedule batches. */
export class SchedulePublicationRepository {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly queries: ScheduleQueryRepository,
  ) {}

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
    const placed = await this.queries.listScheduleForStage(stageId);
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

  /**
   * Sets or clears one match's stream link, scoped to the stage and tournament the request names. The
   * write is audited, and publishes `match.stream-url-changed` through the outbox in the same transaction.
   * The event bumps its own `match-stream-link` projection version, not the public `match-schedule` one,
   * because a link does not move a match in the schedule. Returns `null` when the match is not in that
   * stage, so the caller reports it as not found.
   */
  async setMatchStreamUrl(
    uow: UnitOfWork,
    input: AuditContext & {
      readonly tournamentId: string;
      readonly stageId: string;
      readonly matchId: string;
      readonly streamUrl: string | null;
    },
  ): Promise<{ readonly previousStreamUrl: string | null } | null> {
    await lockRowsForMutation(
      this.db,
      uow.tx.selectFrom('matches').select('match_id').where('match_id', '=', input.matchId),
    ).execute();
    const match = await uow.tx
      .selectFrom('matches')
      .innerJoin('fixtures', 'fixtures.fixture_id', 'matches.fixture_id')
      .innerJoin('stages', 'stages.stage_id', 'fixtures.stage_id')
      .innerJoin('seasons', 'seasons.season_id', 'stages.season_id')
      .select(['matches.stream_url', 'seasons.tournament_id', 'stages.stage_id'])
      .where('matches.match_id', '=', input.matchId)
      .executeTakeFirst();
    if (!match || match.tournament_id !== input.tournamentId || match.stage_id !== input.stageId) {
      return null;
    }

    const previousStreamUrl = match.stream_url ?? null;
    await uow.tx
      .updateTable('matches')
      .set({ stream_url: input.streamUrl })
      .where('match_id', '=', input.matchId)
      .execute();
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'match',
      entityId: input.matchId,
      action: 'schedule.stream-url-changed',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      previousState: { streamUrl: previousStreamUrl },
      resultingState: { streamUrl: input.streamUrl },
    });
    const projectionVersion = await new ProjectionStore(uow.tx).nextVersion(uow, {
      projectionType: 'match-stream-link',
      entityId: input.matchId,
    });
    await uow.publishEvent({
      organizationId: input.organizationId,
      stream: `match:${input.matchId}`,
      entityId: input.matchId,
      eventType: 'match.stream-url-changed',
      projectionVersion,
      payload: {
        matchId: input.matchId,
        stageId: input.stageId,
        streamUrl: input.streamUrl,
      },
    });
    return { previousStreamUrl };
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
        batchId: newId(),
        actor: input.actor,
        ...(input.origin === undefined ? {} : { origin: input.origin }),
        changes: await this.publishedChanges(uow, input, context, current, changed, reasonFor),
      },
    });

    return input.assignments;
  }

  /**
   * Each published placement the batch changed or withdrew, with where it was, where it is now and
   * the reason that applies to it: its own exception, else the batch reason. First placements are
   * not changes, so a batch that only places matches lists none.
   */
  async publishedChanges(
    uow: UnitOfWork,
    input: ScheduleBatch,
    context: ScheduleContext,
    current: ReadonlyMap<string, CurrentPlacement>,
    changed: readonly string[],
    reasonFor: (matchId: string) => ScheduleReason | undefined,
  ): Promise<readonly Record<string, unknown>[]> {
    if (changed.length === 0) return [];
    const tournaments = await uow.tx
      .selectFrom('matches')
      .innerJoin('fixtures', 'fixtures.fixture_id', 'matches.fixture_id')
      .innerJoin('stages', 'stages.stage_id', 'fixtures.stage_id')
      .innerJoin('seasons', 'seasons.season_id', 'stages.season_id')
      .select(['matches.match_id', 'seasons.tournament_id'])
      .where('matches.match_id', 'in', [...changed])
      .execute();
    const placementOf = (venueId: string, startsAt: number) => {
      const venue = context.venues.get(venueId);
      return { startsAt, venue: venue ? { alias: venue.alias, name: venue.name } : null };
    };
    return changed.map((matchId) => {
      const prior = current.get(matchId) as CurrentPlacement;
      const resulting = input.assignments.find((entry) => entry.matchId === matchId);
      const slot = resulting ? context.slots.get(resulting.slotId) : undefined;
      const reason = reasonFor(matchId);
      return {
        matchId,
        tournamentId: tournaments.find((row) => row.match_id === matchId)?.tournament_id ?? null,
        previous: placementOf(prior.venueId, prior.startsAt),
        next: slot ? placementOf(slot.venueId, slot.window.startsAt) : null,
        withdrawn: resulting === undefined,
        reason: {
          ...(reason?.code === undefined ? {} : { code: reason.code }),
          text: reason?.text.trim() ?? '',
        },
      };
    });
  }

  async publishPlacementEvents(
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
  async refuseNotRequired(executor: Kysely<Database>, matchIds: readonly string[]): Promise<void> {
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
  async refuseUnplacedWithdrawals(
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
  async currentPlacements(
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
  async timeZoneOf(uow: UnitOfWork, organizationId: string): Promise<string | undefined> {
    const row = await uow.tx
      .selectFrom('organizations')
      .select('timezone')
      .where('organization_id', '=', organizationId)
      .executeTakeFirst();
    return row?.timezone || undefined;
  }

  async lockResources(
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

  async contextFor(organizationId: string, uow?: UnitOfWork): Promise<ScheduleContext> {
    const executor = uow?.tx ?? this.db;

    const venueRows = await executor
      .selectFrom('venues')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('deleted_at', 'is', null)
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

    const occupancyByTournament = await this.queries.occupancyByTournament(executor, [
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
}
