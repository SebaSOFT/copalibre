import { type DrawConstraint, type RawSegmentStatusCount } from '@copalibre/domain';
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
  RawStageStatusCount,
  TournamentCompletionSummary,
} from '@copalibre/domain';
import type { Kysely, Transaction } from 'kysely';
import type { Database } from '../schema.js';
import type { UnitOfWork } from '../transaction.js';
import type { PersistedFixtureNode } from '../fixture-graph.js';
import type { AuditContext } from './enrollment-repository.js';

import { SeasonRepository } from './competition/season-repository.js';
import { ZoneGroupRepository } from './competition/zone-group-repository.js';
import { PromotionPlanRepository } from './competition/promotion-plan-repository.js';
import { DrawRepository } from './competition/draw-repository.js';
import { FixtureRepository } from './competition/fixture-repository.js';
import { StageRepository } from './competition/stage-repository.js';
import { MatchRepository } from './competition/match-repository.js';
import { SegmentTimerRepository } from './competition/segment-timer-repository.js';
import { MatchEventRepository } from './competition/match-event-repository.js';
import { MatchRosterRepository } from './competition/match-roster-repository.js';
import { FixtureSurplusRepository } from './competition/fixture-surplus-repository.js';
import { assertStageHasNoFixtures, findMatchIn } from './competition/competition-support.js';

import type { GroupAssignment, PersistedDraw } from './competition/draw-repository.js';
import type {
  StageDeletionConsequences,
  StageDeletionDatabase,
  StageDeletionResult,
} from './competition/stage-repository.js';
export type { GroupAssignment, PersistedDraw } from './competition/draw-repository.js';
export type {
  StageDeletionConsequences,
  StageDeletionResult,
} from './competition/stage-repository.js';

/**
 * Stage/Fixture/Match/Segment plus the append-only match-event log.
 *
 * Two product contracts are enforced here rather than trusted to callers:
 * the event log is insert-only (no update/delete method exists), and a match
 * result can never be overwritten — `recordResult` refuses when a result is
 * already present, leaving the audited correction workflow as the
 * only path.
 *
 * Compatibility facade: every method delegates to a focused repository in
 * `./competition/`. New code should use those classes (exported from the
 * package index) instead of this one.
 */
export class CompetitionRepository {
  private readonly seasons: SeasonRepository;
  private readonly zoneGroups: ZoneGroupRepository;
  private readonly promotionPlans: PromotionPlanRepository;
  private readonly draws: DrawRepository;
  private readonly fixtures: FixtureRepository;
  private readonly stages: StageRepository;
  private readonly matches: MatchRepository;
  private readonly segmentTimers: SegmentTimerRepository;
  private readonly matchEvents: MatchEventRepository;
  private readonly matchRosters: MatchRosterRepository;
  private readonly fixtureSurplus: FixtureSurplusRepository;

  constructor(private readonly db: Kysely<Database>) {
    this.seasons = new SeasonRepository(db);
    this.zoneGroups = new ZoneGroupRepository(db);
    this.promotionPlans = new PromotionPlanRepository(db);
    this.draws = new DrawRepository(db);
    this.fixtures = new FixtureRepository(db, this.zoneGroups);
    this.stages = new StageRepository(db, this.seasons);
    this.matches = new MatchRepository(db);
    this.segmentTimers = new SegmentTimerRepository(db);
    this.matchEvents = new MatchEventRepository(db, this.stages);
    this.matchRosters = new MatchRosterRepository(db);
    this.fixtureSurplus = new FixtureSurplusRepository(db);
  }

  createSeason(
    uow: UnitOfWork,
    input: {
      readonly tournamentId: string;
      readonly name: string;
      readonly ordinal: number;
    } & AuditContext,
  ): Promise<Season> {
    return this.seasons.createSeason(uow, input);
  }

  /** The edition a tournament is on, creating the implicit first one if needed. */
  currentSeason(
    uow: UnitOfWork,
    input: { readonly tournamentId: string } & AuditContext,
  ): Promise<Season> {
    return this.seasons.currentSeason(uow, input);
  }

  listSeasons(tournamentId: string): Promise<readonly Season[]> {
    return this.seasons.listSeasons(tournamentId);
  }

  createZone(
    uow: UnitOfWork,
    input: {
      readonly stageId: string;
      readonly number: number;
      readonly name: string;
      /** Omitted: the zone inherits its stage's format. */
      readonly format?: Zone['format'];
    } & AuditContext,
  ): Promise<Zone> {
    return this.zoneGroups.createZone(uow, input);
  }

  /** Renames a zone — permitted at any time, seeded or not. */
  renameZone(
    uow: UnitOfWork,
    input: { readonly zoneId: string; readonly name: string } & AuditContext,
  ): Promise<Zone> {
    return this.zoneGroups.renameZone(uow, input);
  }

  setZoneFormat(
    uow: UnitOfWork,
    input: { readonly zoneId: string; readonly format: Zone['format'] | null } & AuditContext,
  ): Promise<Zone> {
    return this.zoneGroups.setZoneFormat(uow, input);
  }

  /** Removes a zone while retaining its assignments for the undo window. */
  deleteZone(uow: UnitOfWork, input: { readonly zoneId: string } & AuditContext): Promise<Zone> {
    return this.zoneGroups.deleteZone(uow, input);
  }

  restoreZone(uow: UnitOfWork, input: { readonly zoneId: string } & AuditContext): Promise<Zone> {
    return this.zoneGroups.restoreZone(uow, input);
  }

  listZonesOfStage(stageId: string): Promise<readonly Zone[]> {
    return this.zoneGroups.listZonesOfStage(stageId);
  }

  findZoneById(zoneId: string): Promise<Zone | undefined> {
    return this.zoneGroups.findZoneById(zoneId);
  }

  findZoneByNumberIncludingDeleted(stageId: string, number: number): Promise<Zone | undefined> {
    return this.zoneGroups.findZoneByNumberIncludingDeleted(stageId, number);
  }

  currentOrImplicitZone(
    uow: UnitOfWork,
    input: { readonly stageId: string } & AuditContext,
  ): Promise<Zone> {
    return this.zoneGroups.currentOrImplicitZone(uow, input);
  }

  createGroup(
    uow: UnitOfWork,
    input: {
      readonly zoneId: string;
      readonly number: number;
      readonly name: string;
    } & AuditContext,
  ): Promise<Group> {
    return this.zoneGroups.createGroup(uow, input);
  }

  /** Renames a group — permitted at any time, seeded or not. */
  renameGroup(
    uow: UnitOfWork,
    input: { readonly groupId: string; readonly name: string } & AuditContext,
  ): Promise<Group> {
    return this.zoneGroups.renameGroup(uow, input);
  }

  /** Removes a group while retaining its assignments for the undo window. */
  deleteGroup(uow: UnitOfWork, input: { readonly groupId: string } & AuditContext): Promise<Group> {
    return this.zoneGroups.deleteGroup(uow, input);
  }

  restoreGroup(
    uow: UnitOfWork,
    input: { readonly groupId: string } & AuditContext,
  ): Promise<Group> {
    return this.zoneGroups.restoreGroup(uow, input);
  }

  listGroupsOfZone(zoneId: string): Promise<readonly Group[]> {
    return this.zoneGroups.listGroupsOfZone(zoneId);
  }

  findGroupByNumberIncludingDeleted(zoneId: string, number: number): Promise<Group | undefined> {
    return this.zoneGroups.findGroupByNumberIncludingDeleted(zoneId, number);
  }

  listGroupEntrantIdsOfZone(zoneId: string): Promise<ReadonlyMap<string, readonly string[]>> {
    return this.zoneGroups.listGroupEntrantIdsOfZone(zoneId);
  }

  listEntrantIdsOfZone(zoneId: string): Promise<readonly string[]> {
    return this.zoneGroups.listEntrantIdsOfZone(zoneId);
  }

  listEntrantIdsOfGroup(groupId: string): Promise<readonly string[]> {
    return this.zoneGroups.listEntrantIdsOfGroup(groupId);
  }

  createPromotionPlan(
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
    return this.promotionPlans.createPromotionPlan(uow, input);
  }

  findPromotionPlan(zoneId: string): Promise<
    | {
        readonly promotionPlanId: string;
        readonly zoneId: string;
        readonly nextStageId: string;
        readonly plan: Record<string, unknown>;
        readonly confirmedResolution?: Readonly<Record<string, string>>;
      }
    | undefined
  > {
    return this.promotionPlans.findPromotionPlan(zoneId);
  }

  /** Every stored promotion plan whose `nextStageId` targets the given stage. */
  findPromotionPlansTargetingStage(nextStageId: string): Promise<
    readonly {
      readonly promotionPlanId: string;
      readonly zoneId: string;
      readonly nextStageId: string;
      readonly plan: Record<string, unknown>;
      readonly confirmedResolution?: Readonly<Record<string, string>>;
    }[]
  > {
    return this.promotionPlans.findPromotionPlansTargetingStage(nextStageId);
  }

  confirmPromotionPlan(
    uow: UnitOfWork,
    input: {
      readonly promotionPlanId: string;
      readonly resolution: Readonly<Record<string, string>>;
    } & AuditContext,
  ): Promise<void> {
    return this.promotionPlans.confirmPromotionPlan(uow, input);
  }

  currentOrImplicitGroup(
    uow: UnitOfWork,
    input: { readonly zoneId: string } & AuditContext,
  ): Promise<Group> {
    return this.zoneGroups.currentOrImplicitGroup(uow, input);
  }

  assignZones(
    uow: UnitOfWork,
    input: {
      readonly stageId: string;
      readonly assignment: GroupAssignment;
      readonly constraints: readonly DrawConstraint[];
      readonly zoneCount: number;
      readonly seed: number;
    } & AuditContext,
  ): Promise<PersistedDraw<Zone>> {
    return this.draws.assignZones(uow, input);
  }

  assignZonesManually(
    uow: UnitOfWork,
    input: {
      readonly stageId: string;
      readonly assignment: GroupAssignment;
      readonly zoneCount: number;
    } & AuditContext,
  ): Promise<PersistedDraw<Zone>> {
    return this.draws.assignZonesManually(uow, input);
  }

  assignGroups(
    uow: UnitOfWork,
    input: {
      readonly zoneId: string;
      readonly assignment: GroupAssignment;
      readonly constraints: readonly DrawConstraint[];
      readonly groupCount: number;
      readonly seed: number;
    } & AuditContext,
  ): Promise<PersistedDraw<Group>> {
    return this.draws.assignGroups(uow, input);
  }

  assignGroupsManually(
    uow: UnitOfWork,
    input: {
      readonly zoneId: string;
      readonly assignment: GroupAssignment;
      readonly groupCount: number;
    } & AuditContext,
  ): Promise<PersistedDraw<Group>> {
    return this.draws.assignGroupsManually(uow, input);
  }

  private persistZoneDraw(
    uow: UnitOfWork,
    input: { readonly stageId: string } & AuditContext,
    assignment: GroupAssignment,
    zoneCount: number,
    replay?: { readonly seed: number; readonly constraints: readonly DrawConstraint[] },
  ): Promise<readonly Zone[]> {
    return this.draws.persistZoneDraw(uow, input, assignment, zoneCount, replay);
  }

  private persistGroupDraw(
    uow: UnitOfWork,
    input: { readonly zoneId: string } & AuditContext,
    assignment: GroupAssignment,
    groupCount: number,
    replay?: { readonly seed: number; readonly constraints: readonly DrawConstraint[] },
  ): Promise<readonly Group[]> {
    return this.draws.persistGroupDraw(uow, input, assignment, groupCount, replay);
  }

  private assertGroupAssignment(assignment: GroupAssignment, count: number): void {
    return this.draws.assertGroupAssignment(assignment, count);
  }

  private assertAssignmentEntrants(
    assignment: GroupAssignment,
    expectedEntrantIds: readonly string[],
    kind: 'group',
  ): void {
    return this.draws.assertAssignmentEntrants(assignment, expectedEntrantIds, kind);
  }

  /** Public: also guards `TournamentRepository.updateStageConfiguration`, one layer over. */
  assertStageHasNoFixtures(uow: UnitOfWork, stageId: string): Promise<void> {
    return assertStageHasNoFixtures(uow, stageId);
  }

  private resolveFixtureScope(
    uow: UnitOfWork,
    input: { readonly stageId: string } & AuditContext,
    fixture: { readonly zoneId?: string; readonly groupId?: string },
  ): Promise<{ readonly zoneId: string; readonly groupId: string }> {
    return this.fixtures.resolveFixtureScope(uow, input, fixture);
  }

  private assertLegacyFixtureWritesAllowed(
    uow: UnitOfWork,
    stageId: string,
    zoneIds?: readonly string[],
  ): Promise<void> {
    return this.fixtures.assertLegacyFixtureWritesAllowed(uow, stageId, zoneIds);
  }

  private insertFixtureGraph(
    uow: UnitOfWork,
    input: {
      readonly stageId: string;
      readonly zoneId: string;
      readonly nodes: readonly PersistedFixtureNode[];
    } & AuditContext,
  ): Promise<readonly Fixture[]> {
    return this.fixtures.insertFixtureGraph(uow, input);
  }

  createStageInTournament(
    uow: UnitOfWork,
    input: {
      readonly tournamentId: string;
      readonly number: number;
      readonly name: string;
      readonly format: TournamentFormat;
    } & AuditContext,
  ): Promise<Stage> {
    return this.stages.createStageInTournament(uow, input);
  }

  createStage(
    uow: UnitOfWork,
    input: {
      readonly seasonId: string;
      readonly number: number;
      readonly name: string;
      readonly format: TournamentFormat;
    } & AuditContext,
  ): Promise<Stage> {
    return this.stages.createStage(uow, input);
  }

  /** Renames a stage — carries no structural consequence, permitted whether the stage is seeded or not. */
  renameStage(
    uow: UnitOfWork,
    input: { readonly stageId: string; readonly name: string } & AuditContext,
  ): Promise<Stage> {
    return this.stages.renameStage(uow, input);
  }

  /** Changes a stage's format, refused once it holds a fixture (`assertStageHasNoFixtures`). */
  changeStageFormat(
    uow: UnitOfWork,
    input: { readonly stageId: string; readonly format: TournamentFormat } & AuditContext,
  ): Promise<Stage> {
    return this.stages.changeStageFormat(uow, input);
  }

  /** Read-only consequence counts for the stage removal confirmation. */
  previewDeleteStage(stageId: string): Promise<StageDeletionConsequences> {
    return this.stages.previewDeleteStage(stageId);
  }

  deleteStage(
    uow: UnitOfWork,
    input: { readonly stageId: string; readonly confirmationName: string } & AuditContext,
  ): Promise<StageDeletionResult> {
    return this.stages.deleteStage(uow, input);
  }

  private stageDeletionConsequences(
    db: StageDeletionDatabase,
    stageId: string,
  ): Promise<StageDeletionConsequences> {
    return this.stages.stageDeletionConsequences(db, stageId);
  }

  /** Bulk fixture insert — the shape the generator will hand over. */
  createFixtures(
    uow: UnitOfWork,
    input: {
      readonly stageId: string;
      readonly matchCount?: number;
      readonly fixtures: readonly {
        readonly round: number;
        readonly homeEntrantId?: string;
        readonly awayEntrantId?: string;
        readonly zoneId?: string;
        readonly groupId?: string;
        readonly role?: string;
        readonly matchCount?: number;
      }[];
    } & AuditContext,
  ): Promise<readonly Fixture[]> {
    return this.fixtures.createFixtures(uow, input);
  }

  findFixtureZoneId(fixtureId: string, uow?: UnitOfWork): Promise<string | undefined> {
    return this.fixtures.findFixtureZoneId(fixtureId, uow);
  }

  /** The zone a group belongs to, or `undefined` for a group that does not exist. */
  findGroupZoneId(groupId: string): Promise<string | undefined> {
    return this.fixtures.findGroupZoneId(groupId);
  }

  listFixturesOfStage(stageId: string, uow?: UnitOfWork): Promise<readonly Fixture[]> {
    return this.fixtures.listFixturesOfStage(stageId, uow);
  }

  replaceFixtures(
    uow: UnitOfWork,
    input: {
      readonly stageId: string;
      readonly matchCount?: number;
      readonly fixtures: readonly {
        readonly round: number;
        readonly homeEntrantId?: string;
        readonly awayEntrantId?: string;
        readonly zoneId?: string;
        readonly groupId?: string;
        readonly matchCount?: number;
      }[];
    } & AuditContext,
  ): Promise<readonly Fixture[]> {
    return this.fixtures.replaceFixtures(uow, input);
  }

  /** Publishes a complete stage draw, including stages mixing elimination and legacy formats. */
  publishFixturePlans(
    uow: UnitOfWork,
    input: {
      readonly stageId: string;
      readonly plans: readonly {
        readonly zoneId?: string;
        readonly nodes?: readonly PersistedFixtureNode[];
        readonly fixtures?: readonly {
          readonly round: number;
          readonly homeEntrantId?: string;
          readonly awayEntrantId?: string;
        }[];
        readonly matchCount?: number;
      }[];
    } & AuditContext,
  ): Promise<readonly Fixture[]> {
    return this.fixtures.publishFixturePlans(uow, input);
  }

  /** Persists every node and its complete series span for one zone. */
  createFixtureGraph(
    uow: UnitOfWork,
    input: {
      readonly stageId: string;
      readonly zoneId: string;
      readonly nodes: readonly PersistedFixtureNode[];
    } & AuditContext,
  ): Promise<readonly Fixture[]> {
    return this.fixtures.createFixtureGraph(uow, input);
  }

  /** Replaces one zone's complete graph only while none of its matches progressed. */
  replaceFixtureGraph(
    uow: UnitOfWork,
    input: {
      readonly stageId: string;
      readonly zoneId: string;
      readonly nodes: readonly PersistedFixtureNode[];
    } & AuditContext,
  ): Promise<readonly Fixture[]> {
    return this.fixtures.replaceFixtureGraph(uow, input);
  }

  anullSurplusMatches(
    uow: UnitOfWork,
    input: {
      readonly fixtureId: string;
      readonly anulledMatchNumbers: readonly number[];
    } & AuditContext,
  ): Promise<readonly Match[]> {
    return this.fixtureSurplus.anullSurplusMatches(uow, input);
  }

  reinstateAnulledMatches(
    uow: UnitOfWork,
    input: {
      readonly fixtureId: string;
      readonly matchNumbers: readonly number[];
      /** The correction that revived them, named in the audit record. */
      readonly reason: string;
    } & AuditContext,
  ): Promise<readonly Match[]> {
    return this.fixtureSurplus.reinstateAnulledMatches(uow, input);
  }

  createMatch(
    uow: UnitOfWork,
    input: { readonly fixtureId: string; readonly number: number } & AuditContext,
  ): Promise<Match> {
    return this.matches.createMatch(uow, input);
  }

  listMatchesForStage(stageId: string, uow?: UnitOfWork): Promise<readonly Match[]> {
    return this.matches.listMatchesForStage(stageId, uow);
  }

  listReleasedSlotsOfStage(stageId: string): Promise<ReadonlyMap<string, string>> {
    return this.matches.listReleasedSlotsOfStage(stageId);
  }

  applyCommand(
    uow: UnitOfWork,
    input: {
      readonly matchId: string;
      readonly command: MatchCommand;
      readonly status: MatchStatus;
      /** The appointment that authorised it, for the audit row. */
      readonly grantedBy: string;
    } & AuditContext,
  ): Promise<Match> {
    return this.matches.applyCommand(uow, input);
  }

  setSegmentState(
    uow: UnitOfWork,
    input: {
      readonly segmentId: string;
      readonly state: Segment['state'];
      readonly reason?: string;
    } & AuditContext,
  ): Promise<Segment> {
    return this.segmentTimers.setSegmentState(uow, input);
  }

  /** Explicit clock correction; elapsed time is a durable match fact, never browser state. */
  adjustSegmentClock(
    uow: UnitOfWork,
    input: { readonly segmentId: string; readonly elapsedSeconds: number } & AuditContext,
  ): Promise<Segment> {
    return this.segmentTimers.adjustSegmentClock(uow, input);
  }

  resolveTimer(
    uow: UnitOfWork,
    input: { readonly timerId: string; readonly matchId: string } & AuditContext,
  ): Promise<void> {
    return this.segmentTimers.resolveTimer(uow, input);
  }

  resolvedTimerIds(matchId: string, uow?: UnitOfWork): Promise<ReadonlySet<string>> {
    return this.segmentTimers.resolvedTimerIds(matchId, uow);
  }

  supersedeResult(
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
    return this.matchEvents.supersedeResult(uow, input);
  }

  publishedNotificationKeys(matchId: string): Promise<ReadonlySet<string>> {
    return this.matchEvents.publishedNotificationKeys(matchId);
  }

  nextStageState(
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
    return this.matchEvents.nextStageState(tournamentId, stageId);
  }

  setMatchRoster(
    uow: UnitOfWork,
    input: {
      readonly matchId: string;
      readonly entrantId: string;
      readonly members: readonly MatchRosterMember[];
    } & AuditContext,
  ): Promise<void> {
    return this.matchRosters.setMatchRoster(uow, input);
  }

  /** Every entrant's current roster selection for a match, keyed by entrant id. */
  matchRoster(matchId: string): Promise<readonly MatchRoster[]> {
    return this.matchRosters.matchRoster(matchId);
  }

  /** The stage a match belongs to, which is what scopes an appointment. */
  stageOfMatch(matchId: string): Promise<string | undefined> {
    return this.matches.stageOfMatch(matchId);
  }

  /** With a unit of work, reads on its transaction, so a caller holding a row lock needs no second connection. */
  listSegments(matchId: string, uow?: UnitOfWork): Promise<readonly Segment[]> {
    return this.segmentTimers.listSegments(matchId, uow);
  }

  createSegment(
    uow: UnitOfWork,
    input: {
      readonly matchId: string;
      readonly type: string;
      readonly number: number;
    } & AuditContext,
  ): Promise<Segment> {
    return this.segmentTimers.createSegment(uow, input);
  }

  appendEvent(
    uow: UnitOfWork,
    input: {
      readonly event: Omit<RecordedEvent, 'sequence'>;
      readonly sequence: number;
    } & AuditContext,
  ): Promise<RecordedEvent> {
    return this.matchEvents.appendEvent(uow, input);
  }

  nextEventSequence(matchId: string, uow?: UnitOfWork): Promise<number> {
    return this.matchEvents.nextEventSequence(matchId, uow);
  }

  listEvents(matchId: string, uow?: UnitOfWork): Promise<readonly RecordedEvent[]> {
    return this.matchEvents.listEvents(matchId, uow);
  }

  eventsInStageExcludingMatch(
    stageId: string,
    excludeMatchId: string,
    definitionCodes: readonly string[] | undefined,
  ): Promise<readonly RecordedEvent[]> {
    return this.matchEvents.eventsInStageExcludingMatch(stageId, excludeMatchId, definitionCodes);
  }

  recordResult(
    uow: UnitOfWork,
    input: { readonly matchId: string; readonly result: MatchResult } & AuditContext,
  ): Promise<Match> {
    return this.matchEvents.recordResult(uow, input);
  }

  /** Reads through the caller's transaction when given one, so a write it just made is visible. */
  findMatch(matchId: string, uow?: UnitOfWork): Promise<Match | undefined> {
    return this.matches.findMatch(matchId, uow);
  }

  private findMatchIn(
    executor: Kysely<Database> | Transaction<Database>,
    matchId: string,
  ): Promise<Match | undefined> {
    return findMatchIn(executor, matchId);
  }

  /** The stages of one edition, in order. */
  listStages(seasonId: string): Promise<readonly Stage[]> {
    return this.stages.listStages(seasonId);
  }

  /** Every stage a tournament has ever played, across its editions. */
  listStagesOfTournament(tournamentId: string): Promise<readonly Stage[]> {
    return this.stages.listStagesOfTournament(tournamentId);
  }

  /** The edition a stage belongs to, which is what scopes "the next stage". */
  seasonOfStage(stageId: string): Promise<string | undefined> {
    return this.stages.seasonOfStage(stageId);
  }

  /** The tournament an edition belongs to (`CompetitionContext` chain). */
  tournamentOfSeason(seasonId: string): Promise<string | undefined> {
    return this.stages.tournamentOfSeason(seasonId);
  }

  listFinalizedMatches(scope: {
    readonly organizationId: string;
    readonly tournamentId?: string;
  }): Promise<readonly string[]> {
    return this.matches.listFinalizedMatches(scope);
  }

  countTournamentMatchesByStatus(tournamentId: string): Promise<readonly RawStageStatusCount[]> {
    return this.matches.countTournamentMatchesByStatus(tournamentId);
  }

  countTournamentMatchesBySegment(tournamentId: string): Promise<readonly RawSegmentStatusCount[]> {
    return this.matches.countTournamentMatchesBySegment(tournamentId);
  }

  getTournamentCompletion(tournamentId: string): Promise<TournamentCompletionSummary> {
    return this.matches.getTournamentCompletion(tournamentId);
  }
}
