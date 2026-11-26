import {
  type Official,
  type OfficialRole,
  type ResourceAssignment,
  type Schedule,
  type ScheduleConflict,
  type ScheduleContext,
  type ScheduleSlot,
  type Venue,
} from '@copalibre/domain';
import type { Kysely } from 'kysely';
import type { Database } from '../schema.js';
import type { UnitOfWork } from '../transaction.js';
import type { AuditContext } from './enrollment-repository.js';
import { VenueRepository } from './schedule/venue-repository.js';
import { OfficialRepository } from './schedule/official-repository.js';
import { ScheduleQueryRepository } from './schedule/schedule-queries.js';
import { SchedulePublicationRepository } from './schedule/schedule-publication.js';
import { ScheduleDefinitionRepository } from './schedule/schedule-definition-repository.js';
import {
  type ScheduleReason,
  type ScheduleBatch,
  type SchedulePreview,
  type SchedulePlacementHistory,
  type OrganizationScheduleEntry,
  type ScheduleAssignmentDetail,
  type CurrentPlacement,
} from './schedule/schedule-support.js';

/**
 * Schedule venues, officials, schedules and placements.
 *
 * Compatibility facade: every method delegates to a focused repository in
 * `./schedule/`. New code should use those classes (exported from the package
 * index) instead of this one.
 */
export class ScheduleRepository {
  private readonly venues: VenueRepository;
  private readonly officials: OfficialRepository;
  private readonly queries: ScheduleQueryRepository;
  private readonly publication: SchedulePublicationRepository;
  private readonly definitions: ScheduleDefinitionRepository;
  constructor(private readonly db: Kysely<Database>) {
    this.venues = new VenueRepository(db);
    this.officials = new OfficialRepository(db);
    this.queries = new ScheduleQueryRepository(db);
    this.publication = new SchedulePublicationRepository(db, this.queries);
    this.definitions = new ScheduleDefinitionRepository(db, this.publication);
  }

  createVenue(uow: UnitOfWork, input: Omit<Venue, 'venueId'> & AuditContext): Promise<Venue> {
    return this.venues.createVenue(uow, input);
  }
  listVenues(organizationId: string): Promise<readonly Venue[]> {
    return this.venues.listVenues(organizationId);
  }
  findVenue(venueId: string): Promise<Venue | undefined> {
    return this.venues.findVenue(venueId);
  }
  deleteVenue(
    uow: UnitOfWork,
    input: { readonly venueId: string; readonly organizationId: string } & Omit<
      AuditContext,
      'organizationId'
    >,
  ): Promise<Venue> {
    return this.venues.deleteVenue(uow, input);
  }
  restoreVenue(
    uow: UnitOfWork,
    input: { readonly venueId: string; readonly organizationId: string } & Omit<
      AuditContext,
      'organizationId'
    >,
  ): Promise<Venue> {
    return this.venues.restoreVenue(uow, input);
  }
  updateVenue(
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
    return this.venues.updateVenue(uow, input);
  }
  createOfficial(
    uow: UnitOfWork,
    input: Omit<Official, 'officialId'> & AuditContext,
  ): Promise<Official> {
    return this.officials.createOfficial(uow, input);
  }
  listOfficials(organizationId: string): Promise<readonly Official[]> {
    return this.officials.listOfficials(organizationId);
  }
  findOfficial(officialId: string): Promise<Official | undefined> {
    return this.officials.findOfficial(officialId);
  }
  updateOfficial(
    uow: UnitOfWork,
    input: {
      readonly officialId: string;
      readonly organizationId: string;
      readonly displayName?: string;
      readonly roles?: readonly OfficialRole[];
    } & Omit<AuditContext, 'organizationId'>,
  ): Promise<Official> {
    return this.officials.updateOfficial(uow, input);
  }
  createSchedule(
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
    return this.definitions.createSchedule(uow, input);
  }
  listSchedules(organizationId: string): Promise<readonly Schedule[]> {
    return this.definitions.listSchedules(organizationId);
  }
  findSchedule(scheduleId: string): Promise<Schedule | undefined> {
    return this.definitions.findSchedule(scheduleId);
  }
  listScheduleSlots(
    scheduleId: string,
    uow?: UnitOfWork,
  ): Promise<readonly (ScheduleSlot & { readonly matchCount: number })[]> {
    return this.definitions.listScheduleSlots(scheduleId, uow);
  }
  updateSchedule(
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
    return this.definitions.updateSchedule(uow, input);
  }
  previewRemoveSchedule(scheduleId: string): Promise<{
    readonly slots: number;
    readonly matchesUnassigned: number;
  }> {
    return this.definitions.previewRemoveSchedule(scheduleId);
  }
  removeSchedule(
    uow: UnitOfWork,
    input: {
      readonly scheduleId: string;
      readonly organizationId: string;
      readonly confirmationName: string;
    } & Omit<AuditContext, 'organizationId'>,
  ): Promise<{ readonly slots: number; readonly matchesUnassigned: number }> {
    return this.definitions.removeSchedule(uow, input);
  }
  previewSchedule(input: ScheduleBatch): Promise<SchedulePreview> {
    return this.publication.previewSchedule(input);
  }
  currentConflicts(
    organizationId: string,
    matchIds: readonly string[],
    uow?: UnitOfWork,
  ): Promise<readonly ScheduleConflict[]> {
    return this.publication.currentConflicts(organizationId, matchIds, uow);
  }
  currentConflictsForStage(
    organizationId: string,
    stageId: string,
  ): Promise<readonly ScheduleConflict[]> {
    return this.publication.currentConflictsForStage(organizationId, stageId);
  }
  conflictsArisenFrom(
    uow: UnitOfWork,
    organizationId: string,
    changes: readonly {
      readonly matchId: string;
      readonly previousEntrantIds: readonly string[];
    }[],
  ): Promise<readonly ScheduleConflict[]> {
    return this.publication.conflictsArisenFrom(uow, organizationId, changes);
  }
  setMatchStreamUrl(
    uow: UnitOfWork,
    input: AuditContext & {
      readonly tournamentId: string;
      readonly stageId: string;
      readonly matchId: string;
      readonly streamUrl: string | null;
    },
  ): Promise<{ readonly previousStreamUrl: string | null } | null> {
    return this.publication.setMatchStreamUrl(uow, input);
  }
  publishSchedule(
    uow: UnitOfWork,
    input: ScheduleBatch & AuditContext,
  ): Promise<readonly ResourceAssignment[]> {
    return this.publication.publishSchedule(uow, input);
  }
  private publishedChanges(
    uow: UnitOfWork,
    input: ScheduleBatch,
    context: ScheduleContext,
    current: ReadonlyMap<string, CurrentPlacement>,
    changed: readonly string[],
    reasonFor: (matchId: string) => ScheduleReason | undefined,
  ): Promise<readonly Record<string, unknown>[]> {
    return this.publication.publishedChanges(uow, input, context, current, changed, reasonFor);
  }
  private publishPlacementEvents(
    uow: UnitOfWork,
    input: ScheduleBatch & AuditContext,
    context: ScheduleContext,
    current: ReadonlyMap<string, CurrentPlacement>,
    matchIds: readonly string[],
  ): Promise<void> {
    return this.publication.publishPlacementEvents(uow, input, context, current, matchIds);
  }
  private refuseNotRequired(
    executor: Kysely<Database>,
    matchIds: readonly string[],
  ): Promise<void> {
    return this.publication.refuseNotRequired(executor, matchIds);
  }
  private refuseUnplacedWithdrawals(
    executor: Kysely<Database>,
    matchIds: readonly string[],
  ): Promise<void> {
    return this.publication.refuseUnplacedWithdrawals(executor, matchIds);
  }
  private currentPlacements(
    executor: Kysely<Database>,
    matchIds: readonly string[],
  ): Promise<ReadonlyMap<string, CurrentPlacement>> {
    return this.publication.currentPlacements(executor, matchIds);
  }
  private timeZoneOf(uow: UnitOfWork, organizationId: string): Promise<string | undefined> {
    return this.publication.timeZoneOf(uow, organizationId);
  }
  private lockResources(
    uow: UnitOfWork,
    assignments: readonly ResourceAssignment[],
    context: ScheduleContext,
  ): Promise<void> {
    return this.publication.lockResources(uow, assignments, context);
  }
  listScheduleForStage(stageId: string): Promise<readonly ResourceAssignment[]> {
    return this.queries.listScheduleForStage(stageId);
  }
  listScheduleDetailsForStage(stageId: string): Promise<readonly ScheduleAssignmentDetail[]> {
    return this.queries.listScheduleDetailsForStage(stageId);
  }
  private contextFor(organizationId: string, uow?: UnitOfWork): Promise<ScheduleContext> {
    return this.publication.contextFor(organizationId, uow);
  }
  private occupancyByTournament(
    executor: Kysely<Database>,
    tournamentIds: readonly string[],
  ): Promise<ReadonlyMap<string, number>> {
    return this.queries.occupancyByTournament(executor, tournamentIds);
  }
  listScheduleHistory(matchId: string): Promise<readonly SchedulePlacementHistory[]> {
    return this.queries.listScheduleHistory(matchId);
  }
  recentScheduleReasons(organizationId: string, limit = 10): Promise<readonly string[]> {
    return this.queries.recentScheduleReasons(organizationId, limit);
  }
  listOrganizationSchedule(input: {
    readonly organizationId: string;
    readonly from: number;
    readonly to: number;
    readonly tournamentId?: string;
    readonly stageId?: string;
    readonly venueId?: string;
  }): Promise<readonly OrganizationScheduleEntry[]> {
    return this.queries.listOrganizationSchedule(input);
  }
}

export type {
  ScheduleReason,
  SchedulePlacement,
  ScheduleWithdrawal,
  ScheduleBatch,
  SchedulePreview,
  SchedulePlacementHistory,
  OrganizationScheduleEntry,
  ScheduleAssignmentDetail,
} from './schedule/schedule-support.js';
export { conflictsAmongPublished, conflictKey } from './schedule/schedule-support.js';
