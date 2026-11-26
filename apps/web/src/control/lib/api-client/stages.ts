import type { LocalizedLabel } from '@copalibre/domain';
import type { StandingsData } from '../standings.js';
import type {
  SeriesDeclaration,
  SeriesResolutionClass,
  StageAllocationDeclaration,
  StageGroupConfigurationDeclaration,
} from './tournaments.js';
import { requestJson, stagePath, tournamentPath, zoneStagePath } from './transport.js';
import type { EndpointDeps } from './transport.js';

export interface FixtureMatchResponse {
  readonly matchId: string;
  /** 1-based play order within the fixture. */
  readonly number: number;
  readonly status: 'scheduled' | 'in-progress' | 'finalized' | 'not-required';
  /** The slot this match had occupied before a decided series freed it. */
  readonly releasedSlotId?: string;
  /** This game's stream link, when one is attached to it. */
  readonly streamUrl?: string;
}

export interface FixtureSeriesResponse {
  readonly span: number;
  readonly resolutionClass?: SeriesResolutionClass;
  /** Games that will certainly be played whatever the results; the rest are contingent. */
  readonly guaranteedMatches: number;
  readonly status?: 'decided' | 'undecided' | 'finished-unresolved';
  readonly explanation?: string;
  readonly winnerEntrantId?: string;
  readonly matchesPlayed: number;
  readonly anulledMatchNumbers: readonly number[];
}

export interface FixtureResponse {
  readonly fixtureId: string;
  readonly matchId: string;
  readonly round: number;
  readonly homeEntrantId?: string;
  readonly awayEntrantId?: string;
  readonly homeName?: string;
  readonly homeAbbreviation?: string;
  readonly awayName?: string;
  readonly awayAbbreviation?: string;
  /** Every match of this fixture in play order; exactly one unless it declares a series. */
  readonly matches?: readonly FixtureMatchResponse[];
  readonly series?: FixtureSeriesResponse;
}

export interface StageFixturesResponse {
  readonly stageId: string;
  readonly fixtures: readonly FixtureResponse[];
}

export interface TiebreakTraceResponse {
  readonly entrantId: string;
  readonly lines: readonly string[];
}

export interface ZoneResponse {
  readonly zoneId: string;
  readonly stageId: string;
  readonly number: number;
  readonly name: string;
  /** The format this zone declares itself; absent means it inherits its stage's. */
  readonly format?: string;
  /** The format this zone plays: its own when it declares one, otherwise the stage's. */
  readonly effectiveFormat?: string;
  /** The series this zone declares itself; absent means it inherits its stage's. */
  readonly series?: SeriesDeclaration;
}

export interface NextRoundRequest {
  /** The 1-based number of the zone to advance. */
  readonly zoneNumber?: number;
}

/** Absent leaves a field unchanged; `null` clears it so the zone inherits its stage's again. */
export interface ZoneConfigurationRequest {
  readonly format?: string | null;
  readonly series?: SeriesDeclaration | null;
}

export interface GroupResponse {
  readonly groupId: string;
  readonly zoneId: string;
  readonly number: number;
  readonly name: string;
  readonly entrantIds?: readonly string[];
  readonly entrants?: readonly {
    readonly entrantId: string;
    readonly displayName?: string;
    readonly abbreviation?: string;
  }[];
}

/** Shared by a zone's and a group's rename action — the only field either edits. */
export interface RenameRequest {
  readonly name: string;
}

export interface StageResponse {
  readonly stageId: string;
  readonly seasonId: string;
  readonly number: number;
  readonly name: string;
  readonly format: string;
  readonly series?: SeriesDeclaration;
  readonly allocation?: StageAllocationDeclaration;
  /** Present on the list read only — whether this stage already holds a generated fixture. */
  readonly seeded?: boolean;
  /** Present on the list read only — the tournament's discipline-declared formats. */
  readonly availableFormats?: readonly string[];
  /** Present on the list read only — the discipline's own per-format explanation, unresolved. */
  readonly formatDescriptions?: Readonly<Record<string, string | LocalizedLabel>>;
}

export interface StageDeletionResponse {
  readonly stageId: string;
  readonly stageName: string;
  readonly dryRun: boolean;
  readonly success: boolean;
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

export interface UpdateStageRequest {
  readonly name?: string;
  readonly format?: string;
  readonly allocation?: StageAllocationDeclaration;
}

/** Same shape one layer down: a stage's own configuration overrides. */
export interface StageConfigurationResponse {
  readonly overrides: Readonly<Record<string, unknown>>;
  readonly groupConfiguration?: StageGroupConfigurationDeclaration;
}

export interface StageConfigurationRequest {
  readonly overrides: Readonly<Record<string, unknown>>;
  readonly groupConfiguration?: StageGroupConfigurationDeclaration | null;
}

/** One field's classification from a mutation-preview endpoint. */
export interface MutationFieldPreview {
  readonly field: string;
  readonly mutationClass?: 'safe' | 'requires_rebuild' | 'blocked_after_results';
  readonly invalidatedFixtureCount?: number;
  readonly blocked?: boolean;
  readonly reason?: string;
}

export interface MutationPreviewResponse {
  readonly fields: readonly MutationFieldPreview[];
}

export interface CreateZoneOrGroupRequest {
  readonly number?: number;
  readonly name: string;
}

export interface DrawConstraintRequest {
  readonly kind: string;
  readonly hook: string;
  readonly attribute?: string;
  readonly scope?: string | { readonly beforeRound: string };
  readonly value?: string;
  readonly min?: number;
  readonly max?: number;
  readonly script?: Record<string, unknown>;
}

export interface DrawZonesRequest {
  readonly zoneCount: number;
  readonly seed: number;
  readonly constraints?: readonly DrawConstraintRequest[];
}

export interface DrawGroupsRequest {
  readonly groupCount: number;
  readonly seed: number;
  readonly constraints?: readonly DrawConstraintRequest[];
}

/** Accepted entrant UUID mapped to its 1-based zone or group number. */
export interface DrawAssignmentResponse {
  readonly groups: Readonly<Record<string, number>>;
}

export interface DrawPreviewResponse {
  readonly assignment: DrawAssignmentResponse;
  readonly seed: number;
  readonly steps: number;
}

export interface ConfirmZoneDrawResponse extends DrawPreviewResponse {
  readonly zones: readonly ZoneResponse[];
}

export interface ConfirmGroupDrawResponse extends DrawPreviewResponse {
  readonly groups: readonly GroupResponse[];
}

/** No seed/steps — a manual assignment has neither. */
export interface ManualZoneAssignmentRequest {
  readonly assignment: DrawAssignmentResponse;
  readonly zoneCount: number;
}

export interface ManualGroupAssignmentRequest {
  readonly assignment: DrawAssignmentResponse;
  readonly groupCount: number;
}

export interface ManualZoneAssignmentResponse {
  readonly assignment: DrawAssignmentResponse;
  readonly zones: readonly ZoneResponse[];
}

export interface ManualGroupAssignmentResponse {
  readonly assignment: DrawAssignmentResponse;
  readonly groups: readonly GroupResponse[];
}

export interface PromotionBandRequest {
  readonly zoneRef: string;
  readonly count: number;
}

export interface SavePromotionPlanRequest {
  readonly nextStageNumber: number;
  readonly perGroupAdvance: number | Readonly<Record<string, number>>;
  readonly combination: Readonly<Record<string, unknown>>;
  readonly bands?: readonly PromotionBandRequest[];
}

export interface PromotionPlanResponse {
  readonly promotionPlanId: string;
  readonly zoneId: string;
  readonly nextStageId: string;
  readonly plan: Readonly<Record<string, unknown>>;
  /** Set when the target stage was generated ahead from this plan and must be generated again. */
  readonly mutationClass?: 'requires_rebuild';
}

export interface QualifiedEntrantResponse {
  readonly entrantId: string;
  readonly groupId: string;
  readonly rank: number;
}

export interface PromotionPreviewResponse {
  readonly combined: readonly QualifiedEntrantResponse[];
  readonly bands?: Readonly<Record<string, readonly QualifiedEntrantResponse[]>>;
  readonly trace: readonly Readonly<Record<string, unknown>>[];
}

/** One prior-stage zone's resolved promotion preview, from the reverse lookup. */
export interface TargetingPromotionPreviewResponse {
  readonly zoneNumber: number;
  readonly zoneId: string;
  readonly combined: readonly QualifiedEntrantResponse[];
  readonly bands?: Readonly<Record<string, readonly QualifiedEntrantResponse[]>>;
}

export interface StagesApi {
  readonly fetchStandings: (
    organizationAlias: string,
    tournamentAlias: string,
    stageNumber: number,
  ) => Promise<StandingsData>;

  /**
   * One row's comparator chain, fetched when it is expanded.
   *
   * Lazy on purpose: a forty-row table would otherwise carry forty chains
   * nobody asked for, on a screen an operator refreshes between every match.
   */
  readonly fetchTiebreakTrace: (
    organizationAlias: string,
    tournamentAlias: string,
    stageNumber: number,
    entrantId: string,
  ) => Promise<TiebreakTraceResponse>;

  /** A tournament's stages, in order, each with whether it already holds a generated fixture. */
  readonly listStages?: (
    organizationAlias: string,
    tournamentAlias: string,
  ) => Promise<readonly StageResponse[]>;

  /** Rename applies regardless of seeding; a format change is refused once the stage holds a fixture. */
  readonly updateStage?: (
    organizationAlias: string,
    tournamentAlias: string,
    stageNumber: number,
    request: UpdateStageRequest,
  ) => Promise<StageResponse>;

  /** Read-only consequence counts for a stage removal. */
  readonly previewDeleteStage?: (
    organizationAlias: string,
    tournamentAlias: string,
    stageNumber: number,
  ) => Promise<StageDeletionResponse>;

  /** Removes the stage after the server verifies its exact current name. */
  readonly deleteStage?: (
    organizationAlias: string,
    tournamentAlias: string,
    stageNumber: number,
    confirmationName: string,
  ) => Promise<StageDeletionResponse>;

  readonly fetchStageConfiguration?: (
    organizationAlias: string,
    tournamentAlias: string,
    stageNumber: number,
  ) => Promise<StageConfigurationResponse>;

  readonly previewStageConfiguration?: (
    organizationAlias: string,
    tournamentAlias: string,
    stageNumber: number,
    request: StageConfigurationRequest,
  ) => Promise<MutationPreviewResponse>;

  readonly updateStageConfiguration?: (
    organizationAlias: string,
    tournamentAlias: string,
    stageNumber: number,
    request: StageConfigurationRequest,
  ) => Promise<StageConfigurationResponse>;

  /**
   * Generates the next round of one zone of a Swiss or single-elimination stage. The zone is
   * required when the stage has several; rounds, pairings and results are per zone.
   */
  readonly generateNextRound?: (
    organizationAlias: string,
    tournamentAlias: string,
    stageNumber: number,
    request: NextRoundRequest,
  ) => Promise<StageFixturesResponse>;

  /** Zone/Group management, entrant assignment, and promotion plans. */
  readonly listZones?: (
    organizationAlias: string,
    tournamentAlias: string,
    stageNumber: number,
  ) => Promise<readonly ZoneResponse[]>;

  readonly createZone?: (
    organizationAlias: string,
    tournamentAlias: string,
    stageNumber: number,
    request: CreateZoneOrGroupRequest,
  ) => Promise<ZoneResponse>;

  readonly listGroups?: (
    organizationAlias: string,
    tournamentAlias: string,
    stageNumber: number,
    zoneNumber: number,
  ) => Promise<readonly GroupResponse[]>;

  readonly createGroup?: (
    organizationAlias: string,
    tournamentAlias: string,
    stageNumber: number,
    zoneNumber: number,
    request: CreateZoneOrGroupRequest,
  ) => Promise<GroupResponse>;

  readonly renameZone?: (
    organizationAlias: string,
    tournamentAlias: string,
    stageNumber: number,
    zoneNumber: number,
    request: RenameRequest,
  ) => Promise<ZoneResponse>;

  /** Refused once the stage holds a fixture, and for a format the discipline does not offer. */
  readonly configureZone?: (
    organizationAlias: string,
    tournamentAlias: string,
    stageNumber: number,
    zoneNumber: number,
    request: ZoneConfigurationRequest,
  ) => Promise<ZoneResponse>;

  readonly deleteZone?: (
    organizationAlias: string,
    tournamentAlias: string,
    stageNumber: number,
    zoneNumber: number,
  ) => Promise<ZoneResponse>;

  readonly restoreZone?: (
    organizationAlias: string,
    tournamentAlias: string,
    stageNumber: number,
    zoneNumber: number,
  ) => Promise<ZoneResponse>;

  readonly renameGroup?: (
    organizationAlias: string,
    tournamentAlias: string,
    stageNumber: number,
    zoneNumber: number,
    groupNumber: number,
    request: RenameRequest,
  ) => Promise<GroupResponse>;

  readonly deleteGroup?: (
    organizationAlias: string,
    tournamentAlias: string,
    stageNumber: number,
    zoneNumber: number,
    groupNumber: number,
  ) => Promise<GroupResponse>;

  readonly restoreGroup?: (
    organizationAlias: string,
    tournamentAlias: string,
    stageNumber: number,
    zoneNumber: number,
    groupNumber: number,
  ) => Promise<GroupResponse>;

  readonly previewZoneDraw?: (
    organizationAlias: string,
    tournamentAlias: string,
    stageNumber: number,
    request: DrawZonesRequest,
  ) => Promise<DrawPreviewResponse>;

  readonly confirmZoneDraw?: (
    organizationAlias: string,
    tournamentAlias: string,
    stageNumber: number,
    request: DrawZonesRequest,
  ) => Promise<ConfirmZoneDrawResponse>;

  readonly assignZonesManually?: (
    organizationAlias: string,
    tournamentAlias: string,
    stageNumber: number,
    request: ManualZoneAssignmentRequest,
  ) => Promise<ManualZoneAssignmentResponse>;

  readonly previewGroupDraw?: (
    organizationAlias: string,
    tournamentAlias: string,
    stageNumber: number,
    zoneNumber: number,
    request: DrawGroupsRequest,
  ) => Promise<DrawPreviewResponse>;

  readonly confirmGroupDraw?: (
    organizationAlias: string,
    tournamentAlias: string,
    stageNumber: number,
    zoneNumber: number,
    request: DrawGroupsRequest,
  ) => Promise<ConfirmGroupDrawResponse>;

  readonly assignGroupsManually?: (
    organizationAlias: string,
    tournamentAlias: string,
    stageNumber: number,
    zoneNumber: number,
    request: ManualGroupAssignmentRequest,
  ) => Promise<ManualGroupAssignmentResponse>;

  readonly savePromotionPlan?: (
    organizationAlias: string,
    tournamentAlias: string,
    stageNumber: number,
    zoneNumber: number,
    request: SavePromotionPlanRequest,
  ) => Promise<PromotionPlanResponse>;

  readonly fetchPromotionPreview?: (
    organizationAlias: string,
    tournamentAlias: string,
    stageNumber: number,
    zoneNumber: number,
  ) => Promise<PromotionPreviewResponse>;

  /** Reverse lookup: prior-stage zones whose stored plan targets this stage, already resolved. */
  readonly fetchPromotionPlansTargetingStage?: (
    organizationAlias: string,
    tournamentAlias: string,
    stageNumber: number,
  ) => Promise<readonly TargetingPromotionPreviewResponse[]>;

  /** Entrant ids already assigned to a zone — needed to offer manual group placement. */
  readonly fetchZoneEntrants?: (
    organizationAlias: string,
    tournamentAlias: string,
    stageNumber: number,
    zoneNumber: number,
  ) => Promise<readonly string[]>;

  /**
   * A stage's real generated fixtures, with `fixtureId`s, resolved from the URL's `stageNumber`.
   * Also resolves `stageId`, which the schedule routes below address directly.
   */
  readonly getStageFixtures?: (
    organizationAlias: string,
    tournamentAlias: string,
    stageNumber: number,
  ) => Promise<StageFixturesResponse>;
}

export function stagesEndpoints({ fetch, baseUrl }: EndpointDeps): StagesApi {
  return {
    fetchStandings: (organizationAlias, tournamentAlias, stageNumber) =>
      requestJson<StandingsData>(
        fetch,
        `${stagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber)}/standings`,
      ),

    fetchTiebreakTrace: (organizationAlias, tournamentAlias, stageNumber, entrantId) =>
      requestJson<TiebreakTraceResponse>(
        fetch,
        `${stagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber)}/standings/entrants/${encodeURIComponent(
          entrantId,
        )}/trace`,
      ),

    listStages: (organizationAlias, tournamentAlias) =>
      requestJson<readonly StageResponse[]>(
        fetch,
        `${tournamentPath(baseUrl, organizationAlias, tournamentAlias)}/stages`,
      ),

    updateStage: (organizationAlias, tournamentAlias, stageNumber, body) =>
      requestJson<StageResponse>(
        fetch,
        stagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber),
        { method: 'PATCH', body },
      ),

    previewDeleteStage: (organizationAlias, tournamentAlias, stageNumber) =>
      requestJson<StageDeletionResponse>(
        fetch,
        `${stagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber)}?dryRun=true`,
        { method: 'DELETE', body: {} },
      ),

    deleteStage: (organizationAlias, tournamentAlias, stageNumber, confirmationName) =>
      requestJson<StageDeletionResponse>(
        fetch,
        stagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber),
        { method: 'DELETE', body: { confirmationName } },
      ),

    fetchStageConfiguration: (organizationAlias, tournamentAlias, stageNumber) =>
      requestJson<StageConfigurationResponse>(
        fetch,
        `${stagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber)}/configuration`,
      ),

    previewStageConfiguration: (organizationAlias, tournamentAlias, stageNumber, body) =>
      requestJson<MutationPreviewResponse>(
        fetch,
        `${stagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber)}/configuration/preview`,
        { method: 'POST', body },
      ),

    updateStageConfiguration: (organizationAlias, tournamentAlias, stageNumber, body) =>
      requestJson<StageConfigurationResponse>(
        fetch,
        `${stagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber)}/configuration`,
        { method: 'PUT', body },
      ),

    generateNextRound: (organizationAlias, tournamentAlias, stageNumber, body) =>
      requestJson<StageFixturesResponse>(
        fetch,
        `${stagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber)}/rounds/next`,
        { method: 'POST', body },
      ),

    listZones: (organizationAlias, tournamentAlias, stageNumber) =>
      requestJson<readonly ZoneResponse[]>(
        fetch,
        `${stagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber)}/zones`,
      ),

    createZone: (organizationAlias, tournamentAlias, stageNumber, body) =>
      requestJson<ZoneResponse>(
        fetch,
        `${stagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber)}/zones`,
        { method: 'POST', body },
      ),

    listGroups: (organizationAlias, tournamentAlias, stageNumber, zoneNumber) =>
      requestJson<readonly GroupResponse[]>(
        fetch,
        `${zoneStagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber, zoneNumber)}/groups`,
      ),

    createGroup: (organizationAlias, tournamentAlias, stageNumber, zoneNumber, body) =>
      requestJson<GroupResponse>(
        fetch,
        `${zoneStagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber, zoneNumber)}/groups`,
        { method: 'POST', body },
      ),

    renameZone: (organizationAlias, tournamentAlias, stageNumber, zoneNumber, body) =>
      requestJson<ZoneResponse>(
        fetch,
        zoneStagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber, zoneNumber),
        { method: 'PATCH', body },
      ),

    configureZone: (organizationAlias, tournamentAlias, stageNumber, zoneNumber, body) =>
      requestJson<ZoneResponse>(
        fetch,
        `${zoneStagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber, zoneNumber)}/configuration`,
        { method: 'PUT', body },
      ),

    deleteZone: (organizationAlias, tournamentAlias, stageNumber, zoneNumber) =>
      requestJson<ZoneResponse>(
        fetch,
        zoneStagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber, zoneNumber),
        { method: 'DELETE' },
      ),

    restoreZone: (organizationAlias, tournamentAlias, stageNumber, zoneNumber) =>
      requestJson<ZoneResponse>(
        fetch,
        `${zoneStagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber, zoneNumber)}/restore`,
        { method: 'POST' },
      ),

    renameGroup: (organizationAlias, tournamentAlias, stageNumber, zoneNumber, groupNumber, body) =>
      requestJson<GroupResponse>(
        fetch,
        `${zoneStagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber, zoneNumber)}/groups/${groupNumber}`,
        { method: 'PATCH', body },
      ),

    deleteGroup: (organizationAlias, tournamentAlias, stageNumber, zoneNumber, groupNumber) =>
      requestJson<GroupResponse>(
        fetch,
        `${zoneStagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber, zoneNumber)}/groups/${groupNumber}`,
        { method: 'DELETE' },
      ),

    restoreGroup: (organizationAlias, tournamentAlias, stageNumber, zoneNumber, groupNumber) =>
      requestJson<GroupResponse>(
        fetch,
        `${zoneStagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber, zoneNumber)}/groups/${groupNumber}/restore`,
        { method: 'POST' },
      ),

    previewZoneDraw: (organizationAlias, tournamentAlias, stageNumber, body) =>
      requestJson<DrawPreviewResponse>(
        fetch,
        `${stagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber)}/zones/draw/preview`,
        { method: 'POST', body },
      ),

    confirmZoneDraw: (organizationAlias, tournamentAlias, stageNumber, body) =>
      requestJson<ConfirmZoneDrawResponse>(
        fetch,
        `${stagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber)}/zones/draw`,
        { method: 'POST', body },
      ),

    assignZonesManually: (organizationAlias, tournamentAlias, stageNumber, body) =>
      requestJson<ManualZoneAssignmentResponse>(
        fetch,
        `${stagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber)}/zones/assign`,
        { method: 'POST', body },
      ),

    previewGroupDraw: (organizationAlias, tournamentAlias, stageNumber, zoneNumber, body) =>
      requestJson<DrawPreviewResponse>(
        fetch,
        `${zoneStagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber, zoneNumber)}/groups/draw/preview`,
        { method: 'POST', body },
      ),

    confirmGroupDraw: (organizationAlias, tournamentAlias, stageNumber, zoneNumber, body) =>
      requestJson<ConfirmGroupDrawResponse>(
        fetch,
        `${zoneStagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber, zoneNumber)}/groups/draw`,
        { method: 'POST', body },
      ),

    assignGroupsManually: (organizationAlias, tournamentAlias, stageNumber, zoneNumber, body) =>
      requestJson<ManualGroupAssignmentResponse>(
        fetch,
        `${zoneStagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber, zoneNumber)}/groups/assign`,
        { method: 'POST', body },
      ),

    savePromotionPlan: (organizationAlias, tournamentAlias, stageNumber, zoneNumber, body) =>
      requestJson<PromotionPlanResponse>(
        fetch,
        `${zoneStagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber, zoneNumber)}/promotion-plan`,
        { method: 'POST', body },
      ),

    fetchPromotionPreview: (organizationAlias, tournamentAlias, stageNumber, zoneNumber) =>
      requestJson<PromotionPreviewResponse>(
        fetch,
        `${zoneStagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber, zoneNumber)}/promotion-preview`,
      ),

    fetchPromotionPlansTargetingStage: (organizationAlias, tournamentAlias, stageNumber) =>
      requestJson<readonly TargetingPromotionPreviewResponse[]>(
        fetch,
        `${stagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber)}/promotion-plans`,
      ),

    fetchZoneEntrants: (organizationAlias, tournamentAlias, stageNumber, zoneNumber) =>
      requestJson<readonly string[]>(
        fetch,
        `${zoneStagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber, zoneNumber)}/entrants`,
      ),

    getStageFixtures: (organizationAlias, tournamentAlias, stageNumber) =>
      requestJson<StageFixturesResponse>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}/stages/${stageNumber}/fixtures`,
      ),
  };
}
