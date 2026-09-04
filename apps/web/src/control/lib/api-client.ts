import type { LocalizedLabel } from '@copalibre/domain';
import type {
  CreateOrganizationRequest,
  OrganizationResponse as ContractOrganizationResponse,
  components,
} from '@copalibre/contracts';
import type { CanvasMatch } from './bracket-canvas.js';
import type { RegistrationStatus } from './review.js';
import type { StandingsData } from './standings.js';
import type { DisciplineOption, TournamentProfileOption } from './wizard.js';
import type { MatchCardData } from '../../lib/matches-view.js';

export interface ControlApiClient {
  /** Every organization the authenticated caller belongs to, with their role. */
  readonly listMyOrganizations: () => Promise<readonly MyOrganizationResponse[]>;
  readonly createOrganization?: (
    request: CreateOrganizationRequest,
  ) => Promise<ContractOrganizationResponse>;
  readonly listInstalledModules?: () => Promise<readonly InstalledModuleResponse[]>;
  readonly listOutdatedModules?: () => Promise<readonly OutdatedModuleResponse[]>;
  readonly installModule?: (request: InstallModuleRequest) => Promise<InstallModuleResponse>;
  readonly removeModule?: (alias: string) => Promise<RemoveModuleResponse>;
  readonly verifyModules?: () => Promise<readonly ModuleVerifyResultResponse[]>;
  /** Validates an authored discipline/profile document without installing it. */
  readonly validateAuthoredModule?: (
    request: AuthoredModuleRequest,
  ) => Promise<AuthoredModuleValidationResponse>;
  /** Packages, validates and installs an authored document, exactly as `installModule` would. */
  readonly installAuthoredModule?: (
    request: AuthoredModuleRequest,
  ) => Promise<InstallModuleResponse>;
  /** Contributes an already-installed authored module upstream. */
  readonly submitAuthoredModule?: (
    request: AuthoredModuleSubmitRequest,
  ) => Promise<AuthoredModuleSubmitResponse>;
  readonly listDisciplines: () => Promise<readonly DisciplineOption[]>;
  readonly listCompatibleProfiles?: (
    descriptorId: string,
    descriptorVersion: string,
    format?: string,
  ) => Promise<readonly TournamentProfileOption[]>;
  readonly createTournament: (
    organizationAlias: string,
    request: CreateTournamentRequest,
  ) => Promise<TournamentResponse>;
  readonly downloadTournamentConfiguration?: (
    organizationAlias: string,
    tournamentAlias: string,
  ) => Promise<TournamentConfigurationExportResponse>;
  readonly fetchCustomScriptVocabulary?: (
    organizationAlias: string,
  ) => Promise<HookScriptVocabulary>;
  /** The organization's active (non-archived) tournaments, for the dashboard. */
  readonly listActiveTournaments?: (
    organizationAlias: string,
  ) => Promise<readonly TournamentResponse[]>;
  readonly listRegistrations: (
    organizationAlias: string,
    tournamentAlias: string,
    status?: RegistrationStatus | 'all',
  ) => Promise<readonly RegistrationResponse[]>;
  /** Registers a new person directly, without a CSV file, and enters them as an entrant. */
  readonly createPerson?: (
    organizationAlias: string,
    tournamentAlias: string,
    request: CreatePersonRequest,
  ) => Promise<RegistrationResponse>;
  /** Registers a new team directly, without a CSV file, and enters them as an entrant. */
  readonly createTeam?: (
    organizationAlias: string,
    tournamentAlias: string,
    request: CreateTeamRequest,
  ) => Promise<RegistrationResponse>;
  readonly updatePersonIdentity?: (
    organizationAlias: string,
    tournamentAlias: string,
    personId: string,
    request: UpdatePersonIdentityRequest,
  ) => Promise<PersonIdentityResponse>;
  readonly updateTeamIdentity?: (
    organizationAlias: string,
    tournamentAlias: string,
    teamId: string,
    request: UpdateTeamIdentityRequest,
  ) => Promise<TeamIdentityResponse>;
  /** A person with no entrant registration, roster membership, identity link, or report. */
  readonly removePerson?: (
    organizationAlias: string,
    tournamentAlias: string,
    personId: string,
  ) => Promise<PersonIdentityResponse>;
  /** A team with no entrant registration or rostered player. */
  readonly removeTeam?: (
    organizationAlias: string,
    tournamentAlias: string,
    teamId: string,
  ) => Promise<TeamIdentityResponse>;
  /** Pre-links a participant to an email before their first login. */
  readonly linkParticipantIdentity?: (
    organizationAlias: string,
    personId: string,
    request: LinkParticipantIdentityRequest,
  ) => Promise<ParticipantIdentityLinkResponse>;
  /** Frees the person to be linked again; does not delete the person record. */
  readonly unlinkParticipantIdentity?: (
    organizationAlias: string,
    personId: string,
  ) => Promise<ParticipantIdentityLinkResponse>;
  readonly bulkReview: (
    organizationAlias: string,
    tournamentAlias: string,
    request: BulkReviewRequest,
  ) => Promise<BulkReviewResponse>;
  readonly reviewRegistration: (
    organizationAlias: string,
    tournamentAlias: string,
    entrantId: string,
    request: ReviewRegistrationRequest,
  ) => Promise<RegistrationResponse>;
  /** Entrants that registered with no abbreviation because every derived candidate collided. */
  readonly listEntrantsNeedingAbbreviation?: (
    organizationAlias: string,
    tournamentAlias: string,
  ) => Promise<readonly RegistrationResponse[]>;
  readonly setEntrantAbbreviation?: (
    organizationAlias: string,
    tournamentAlias: string,
    entrantId: string,
    request: SetEntrantAbbreviationRequest,
  ) => Promise<RegistrationResponse>;
  readonly editTeamMemberships?: (
    organizationAlias: string,
    tournamentAlias: string,
    entrantId: string,
    body: {
      readonly personIds?: readonly string[];
      readonly members?: readonly {
        readonly personId: string;
        readonly role?: 'player' | 'substitute' | 'coach' | 'staff';
      }[];
    },
  ) => Promise<RegistrationResponse>;
  readonly fetchStandings: (
    organizationAlias: string,
    tournamentAlias: string,
    stageNumber: number,
  ) => Promise<StandingsData>;
  /**
   * The matches view (openspec 0172): tournament-scoped by default, one
   * stage/group/state when filtered — a query, not a distinct route.
   */
  readonly fetchMatchesView?: (
    organizationAlias: string,
    tournamentAlias: string,
    filter?: {
      readonly stageNumber?: number;
      readonly groupId?: string;
      readonly state?: 'all' | 'live' | 'upcoming' | 'final';
    },
  ) => Promise<{ readonly matches: readonly MatchCardData[] }>;
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
  /** Every declared table layout in effect, for building a tab bar. */
  readonly fetchTableLayouts: (
    organizationAlias: string,
    tournamentAlias: string,
  ) => Promise<readonly TableLayoutSummaryResponse[]>;
  /**
   * One projected table. `stageNumber` absent reads a tournament-wide layout
   * (`player-ranking`/`team-ranking`); present reads a stage-scoped one
   * (`group-phase`/`match-roster`/`schedule-timeframe`).
   */
  readonly fetchTableProjection: (
    organizationAlias: string,
    tournamentAlias: string,
    layoutCode: string,
    scope: { readonly stageNumber?: number; readonly groupId?: string },
  ) => Promise<TableProjectionResponseData>;
  readonly downloadTableProjectionCsv?: (
    organizationAlias: string,
    tournamentAlias: string,
    layoutCode: string,
    scope: { readonly stageNumber?: number; readonly groupId?: string },
  ) => Promise<string>;
  readonly fetchSeeding: (
    organizationAlias: string,
    tournamentAlias: string,
    stageNumber: number,
  ) => Promise<SeedingResponse>;
  readonly publishSeeding: (
    organizationAlias: string,
    tournamentAlias: string,
    stageNumber: number,
    request: PublishSeedingRequest,
  ) => Promise<SeedingClassificationResponse>;
  /** Rename applies regardless of seeding; a format change is refused once the stage holds a fixture. */
  readonly updateStage?: (
    organizationAlias: string,
    tournamentAlias: string,
    stageNumber: number,
    request: UpdateStageRequest,
  ) => Promise<StageResponse>;
  /** Refused once the stage holds a fixture or a promotion plan already targets it. */
  readonly deleteStage?: (
    organizationAlias: string,
    tournamentAlias: string,
    stageNumber: number,
  ) => Promise<StageResponse>;
  readonly fetchTournamentSettings?: (
    organizationAlias: string,
    tournamentAlias: string,
  ) => Promise<TournamentSettingsResponse>;
  readonly previewTournamentSettings?: (
    organizationAlias: string,
    tournamentAlias: string,
    request: TournamentSettingsRequest,
  ) => Promise<MutationPreviewResponse>;
  readonly updateTournamentSettings?: (
    organizationAlias: string,
    tournamentAlias: string,
    request: TournamentSettingsRequest,
  ) => Promise<TournamentSettingsResponse>;
  readonly fetchRulesetOverrides?: (
    organizationAlias: string,
    tournamentAlias: string,
  ) => Promise<RulesetOverridesResponse>;
  readonly previewRulesetOverrides?: (
    organizationAlias: string,
    tournamentAlias: string,
    request: RulesetOverridesRequest,
  ) => Promise<MutationPreviewResponse>;
  readonly updateRulesetOverrides?: (
    organizationAlias: string,
    tournamentAlias: string,
    request: RulesetOverridesRequest,
  ) => Promise<RulesetOverridesResponse>;
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
  readonly deleteZone?: (
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
  readonly listOrganizationRoles: (
    organizationAlias: string,
  ) => Promise<readonly OrganizationRoleResponse[]>;
  readonly fetchAuditTrail?: (
    organizationAlias: string,
    options?: { readonly actor?: string; readonly limit?: number; readonly offset?: number },
  ) => Promise<AuditTrailResponse>;
  readonly inviteOrganizationUser: (
    organizationAlias: string,
    request: InviteOrganizationUserRequest,
  ) => Promise<InvitationResponse>;
  /** Not yet accepted, not rescinded, not expired (openspec 0170). */
  readonly listPendingInvitations?: (
    organizationAlias: string,
  ) => Promise<readonly PendingOrganizationInvitationResponse[]>;
  readonly rescindInvitation?: (
    organizationAlias: string,
    invitationId: string,
  ) => Promise<InvitationResponse>;
  readonly changeOrganizationRole: (
    organizationAlias: string,
    assignmentId: string,
    request: ChangeOrganizationRoleRequest,
  ) => Promise<OrganizationRoleResponse>;
  readonly deleteOrganizationRole: (
    organizationAlias: string,
    assignmentId: string,
  ) => Promise<void>;
  readonly listGrantableRoles?: (organizationAlias: string) => Promise<GrantableRolesResponse>;
  readonly listInstallationSuperAdmins?: () => Promise<readonly InstallationSuperAdminResponse[]>;
  readonly createInstallationSuperAdmin?: (
    request: CreateSuperAdminRequest,
  ) => Promise<InstallationSuperAdminResponse>;
  readonly changeInstallationSuperAdminStatus?: (
    assignmentId: string,
    request: ChangeInstallationRoleStatusRequest,
  ) => Promise<InstallationSuperAdminResponse>;
  readonly deleteInstallationSuperAdmin?: (assignmentId: string) => Promise<void>;
  readonly createCsvImport?: (
    organizationAlias: string,
    tournamentAlias: string,
    request: CreateCsvImportRequest,
  ) => Promise<CsvImportPreviewResponse>;
  readonly fetchCsvImport?: (
    organizationAlias: string,
    tournamentAlias: string,
    importId: string,
  ) => Promise<CsvImportPreviewResponse>;
  readonly commitCsvImport?: (
    organizationAlias: string,
    tournamentAlias: string,
    importId: string,
    sourceHash: string,
  ) => Promise<CsvImportPreviewResponse>;
  readonly downloadCsvExport?: (
    organizationAlias: string,
    tournamentAlias: string,
    kind: 'participants/individual' | 'participants/team' | 'results' | 'standings',
  ) => Promise<string>;
  /** The A1 dashboard's device-health panel reads this per tournament. */
  readonly listDisplayTokens?: (
    organizationAlias: string,
    tournamentAlias: string,
  ) => Promise<readonly DisplayTokenResponse[]>;
  /** The pending participant reports/disputes queue. */
  readonly listPendingReports?: (
    organizationAlias: string,
    tournamentAlias: string,
  ) => Promise<readonly ParticipantReportResponse[]>;
  readonly reviewReport?: (
    organizationAlias: string,
    tournamentAlias: string,
    reportId: string,
    request: ReviewReportRequest,
  ) => Promise<ParticipantReportResponse>;
  /** Archives a finished tournament; legal only from finished. */
  readonly archiveTournament?: (
    organizationAlias: string,
    tournamentAlias: string,
  ) => Promise<{ readonly status: string }>;
  /** A person's profile — display name, nationality, photo, natural key. */
  readonly getPerson?: (organizationAlias: string, personId: string) => Promise<PersonResponse>;
  readonly setPersonNationality?: (
    organizationAlias: string,
    personId: string,
    nationality: string | null,
  ) => Promise<{ readonly personId: string; readonly nationality: string | null }>;
  readonly uploadPersonPhoto?: (
    organizationAlias: string,
    personId: string,
    request: UploadImageRequest,
  ) => Promise<{ readonly objectId: string }>;
  /** An organization's public identity — name, locale defaults, emblem. */
  readonly getOrganization?: (organizationAlias: string) => Promise<OrganizationResponse>;
  readonly updateOrganizationSettings?: (
    organizationAlias: string,
    request: UpdateOrganizationSettingsRequest,
  ) => Promise<OrganizationResponse>;
  readonly uploadOrganizationEmblem?: (
    organizationAlias: string,
    request: UploadImageRequest,
  ) => Promise<{ readonly objectId: string }>;
  /** An organization's aggregate storage usage. */
  readonly getStorageUsage?: (
    organizationAlias: string,
  ) => Promise<OrganizationStorageUsageResponse>;
  /** Stored objects no entity currently references — cleanup candidates for the storage-usage screen. */
  readonly listUnreferencedObjects?: (
    organizationAlias: string,
  ) => Promise<readonly UnreferencedObjectResponse[]>;
  /** Refused, naming what references it, while the object is an entity's current emblem or photo. */
  readonly deleteObject?: (
    organizationAlias: string,
    objectId: string,
  ) => Promise<UnreferencedObjectResponse>;
  /** Recomputes every stored statistic total from recorded events; optionally one tournament. */
  readonly rebuildStatistics?: (
    organizationAlias: string,
    tournamentAlias?: string,
  ) => Promise<StatisticsRebuildResponse>;
  /** An organization's clubs — list/create/edit identity; emblem upload is `uploadClubEmblem`. */
  readonly listClubs?: (organizationAlias: string) => Promise<readonly ClubResponse[]>;
  readonly createClub?: (
    organizationAlias: string,
    request: CreateClubRequest,
  ) => Promise<ClubResponse>;
  readonly updateClub?: (
    organizationAlias: string,
    clubId: string,
    request: UpdateClubRequest,
  ) => Promise<ClubResponse>;
  readonly uploadClubEmblem?: (
    organizationAlias: string,
    clubId: string,
    request: UploadImageRequest,
  ) => Promise<{ readonly objectId: string }>;
  /** An organization's venues and officials — the resource pool a schedule assigns from. */
  readonly listVenues?: (organizationAlias: string) => Promise<readonly VenueResponse[]>;
  readonly createVenue?: (
    organizationAlias: string,
    request: CreateVenueRequest,
  ) => Promise<VenueResponse>;
  readonly updateVenue?: (
    organizationAlias: string,
    venueId: string,
    request: UpdateVenueRequest,
  ) => Promise<VenueResponse>;
  readonly listOfficials?: (organizationAlias: string) => Promise<readonly OfficialResponse[]>;
  readonly createOfficial?: (
    organizationAlias: string,
    request: CreateOfficialRequest,
  ) => Promise<OfficialResponse>;
  readonly updateOfficial?: (
    organizationAlias: string,
    officialId: string,
    request: UpdateOfficialRequest,
  ) => Promise<OfficialResponse>;
  /** Organization schedule grids */
  readonly listSchedules?: (
    organizationAlias: string,
  ) => Promise<readonly ScheduleDetailResponse[]>;
  readonly createSchedule?: (
    organizationAlias: string,
    request: CreateScheduleRequest,
  ) => Promise<ScheduleDetailResponse>;
  readonly updateSchedule?: (
    organizationAlias: string,
    scheduleId: string,
    request: UpdateScheduleRequest,
  ) => Promise<ScheduleDetailResponse>;
  readonly deleteSchedule?: (
    organizationAlias: string,
    scheduleId: string,
  ) => Promise<{ readonly success: boolean }>;
  /**
   * A stage's real generated fixtures, with `fixtureId`s, resolved from the URL's `stageNumber`.
   * Also resolves `stageId`, which the schedule routes below address directly.
   */
  readonly getStageFixtures?: (
    organizationAlias: string,
    tournamentAlias: string,
    stageNumber: number,
  ) => Promise<StageFixturesResponse>;
  /** A stage's schedule — read/preview/publish over the manual-assignment batch API. */
  readonly getSchedule?: (
    organizationAlias: string,
    tournamentAlias: string,
    stageId: string,
  ) => Promise<ScheduleResponse>;
  readonly previewSchedule?: (
    organizationAlias: string,
    tournamentAlias: string,
    stageId: string,
    request: ScheduleRequest,
  ) => Promise<SchedulePreviewResponse>;
  readonly publishSchedule?: (
    organizationAlias: string,
    tournamentAlias: string,
    stageId: string,
    request: ScheduleRequest,
  ) => Promise<ScheduleResponse>;
}

export type InstalledModuleResponse = components['schemas']['InstalledModuleResponse'];
export type OutdatedModuleResponse = components['schemas']['OutdatedModuleResponse'];
export type InstallModuleRequest = components['schemas']['InstallModuleRequest'];
export type InstallModuleResponse = components['schemas']['InstallModuleResponse'];
export type RemoveModuleResponse = components['schemas']['RemoveModuleResponse'];
export type ModuleVerifyResultResponse = components['schemas']['ModuleVerifyResultResponse'];
export type AuthoredModuleRequest = components['schemas']['AuthoredModuleRequest'];
export type AuthoredModuleValidationResponse =
  components['schemas']['AuthoredModuleValidationResponse'];
export type AuthoredModuleValidationFailureResponse =
  components['schemas']['AuthoredModuleValidationFailureResponse'];
export type AuthoredModuleSubmitRequest = components['schemas']['AuthoredModuleSubmitRequest'];
export type AuthoredModuleSubmitResponse = components['schemas']['AuthoredModuleSubmitResponse'];

export interface OrganizationResponse {
  readonly organizationId: string;
  readonly alias: string;
  readonly name: string;
  readonly primaryLanguage: string;
  readonly timezone: string;
  readonly emblemObjectId?: string;
}

export interface UpdateOrganizationSettingsRequest {
  readonly name?: string;
  readonly primaryLanguage?: string;
  readonly timezone?: string;
}

export interface OrganizationStorageUsageResponse {
  readonly totalBytes: number;
  readonly objectCount: number;
}

export interface UnreferencedObjectResponse {
  readonly objectId: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly createdAt: string;
}

export interface StatisticsRebuildResponse {
  readonly organizationAlias: string;
  readonly tournamentAlias?: string;
  readonly matches: number;
  readonly figures: number;
}

export interface ClubResponse {
  readonly clubId: string;
  readonly organizationId: string;
  readonly alias?: string;
  readonly name: string;
  readonly abbreviation?: string;
  readonly emblemObjectId?: string;
}

export interface CreateClubRequest {
  readonly name: string;
  readonly alias?: string;
  readonly abbreviation?: string;
}

export interface UpdateClubRequest {
  readonly name?: string;
  readonly alias?: string;
  readonly abbreviation?: string;
}

export interface UploadImageRequest {
  readonly filename: string;
  readonly contentType: string;
  readonly contentBase64: string;
}

export interface VenueResponse {
  readonly venueId: string;
  readonly organizationId: string;
  readonly alias: string;
  readonly name: string;
  readonly concurrentCapacity: number;
  readonly address?: string;
  readonly details?: Record<string, string>;
}

export interface CreateVenueRequest {
  readonly alias: string;
  readonly name: string;
  readonly concurrentCapacity: number;
  readonly address?: string;
  readonly details?: Record<string, string>;
}

export interface UpdateVenueRequest {
  readonly name?: string;
  readonly concurrentCapacity?: number;
  readonly address?: string;
  readonly details?: Record<string, string>;
}

export type OfficialRole = 'referee' | 'assistant' | 'table-official' | 'observer';

export interface OfficialResponse {
  readonly officialId: string;
  readonly organizationId: string;
  readonly displayName: string;
  readonly roles: readonly OfficialRole[];
}

export interface CreateOfficialRequest {
  readonly displayName: string;
  readonly roles: readonly OfficialRole[];
}

export interface UpdateOfficialRequest {
  readonly displayName?: string;
  readonly roles?: readonly OfficialRole[];
}

export interface ScheduleSlotResponse {
  readonly slotId: string;
  readonly scheduleId: string;
  readonly venueId: string;
  readonly startsAt: number;
  readonly matchCount: number;
}

export interface ScheduleDetailResponse {
  readonly scheduleId: string;
  readonly organizationId: string;
  readonly name: string;
  readonly startsAt: number;
  readonly endsAt: number;
  readonly slotMinutes: number;
  readonly turnaroundMinutes: number;
  readonly venueIds: readonly string[];
  readonly slots: readonly ScheduleSlotResponse[];
}

export interface CreateScheduleRequest {
  readonly name: string;
  readonly startsAt: number;
  readonly endsAt: number;
  readonly slotMinutes: number;
  readonly turnaroundMinutes: number;
  readonly venueIds: readonly string[];
}

export interface UpdateScheduleRequest {
  readonly name?: string;
  readonly startsAt?: number;
  readonly endsAt?: number;
  readonly slotMinutes?: number;
  readonly turnaroundMinutes?: number;
  readonly venueIds?: readonly string[];
}

export interface TimeWindowDto {
  readonly startsAt: number;
  readonly durationMinutes: number;
}

export interface ScheduleAssignmentDto {
  readonly matchId: string;
  readonly slotId: string;
  readonly officialIds?: readonly string[];
}

export interface ScheduleAssignmentResponse {
  readonly matchId: string;
  readonly fixtureId: string;
  readonly slotId: string;
  readonly venueId: string;
  readonly window: TimeWindowDto;
  readonly officialIds?: readonly string[];
}

export interface RestRuleDto {
  readonly minimumMinutes: number;
}

export interface ScheduleRequest {
  readonly assignments: readonly ScheduleAssignmentDto[];
  readonly restRule?: RestRuleDto;
}

export interface ScheduleConflictDto {
  readonly kind: string;
  readonly matchId: string;
  readonly conflictsWithMatchId: string;
  readonly resourceId: string;
  readonly detail: string;
}

export interface SchedulePreviewResponse {
  readonly committable: boolean;
  readonly conflicts: readonly ScheduleConflictDto[];
  readonly affectedPublishedMatches: readonly string[];
}

export interface ScheduleResponse {
  readonly assignments: readonly ScheduleAssignmentResponse[];
}

export interface FixtureMatchResponse {
  readonly matchId: string;
  /** 1-based play order within the fixture. */
  readonly number: number;
  readonly status: 'scheduled' | 'in-progress' | 'finalized' | 'not-required';
  /** The slot this match had occupied before a decided series freed it. */
  readonly releasedSlotId?: string;
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
  /** Every match of this fixture in play order; exactly one unless it declares a series. */
  readonly matches?: readonly FixtureMatchResponse[];
  readonly series?: FixtureSeriesResponse;
}

export interface StageFixturesResponse {
  readonly stageId: string;
  readonly fixtures: readonly FixtureResponse[];
}

export interface DisplayTokenResponse {
  readonly displayTokenId: string;
  readonly tournamentId: string;
  readonly matchId?: string;
  readonly label?: string;
  readonly revoked: boolean;
  readonly lastSeenAt?: string;
  readonly createdAt: string;
}

export interface ParticipantReportResponse {
  readonly reportId: string;
  readonly matchId: string;
  readonly kind: string;
  readonly submittedByPersonId: string;
  readonly submittedAt: string;
  readonly reason?: string;
  readonly proposedResult?: Record<string, unknown>;
  readonly status: string;
  readonly reviewedBy?: string;
  readonly reviewedAt?: string;
  readonly reviewNote?: string;
  readonly createdAt: string;
  readonly evidence: readonly {
    readonly evidenceId: string;
    readonly filename: string;
    readonly contentType: string;
    readonly sizeBytes: number;
    readonly uploadedBy: string;
    readonly uploadedAt: string;
    readonly validationStatus: string;
  }[];
}

export interface ReviewReportRequest {
  readonly status: 'reviewed' | 'dismissed';
  readonly reviewNote?: string;
}

export interface MatchConsoleApiClient {
  readonly fetchMatchConsole: (
    organizationAlias: string,
    tournamentAlias: string,
    matchId: string,
  ) => Promise<MatchConsoleResponse>;
  readonly fetchMatchRosters: (
    organizationAlias: string,
    tournamentAlias: string,
    matchId: string,
  ) => Promise<readonly ConsoleRoster[]>;
  readonly fetchRosterCandidates: (
    organizationAlias: string,
    tournamentAlias: string,
    matchId: string,
    entrantId: string,
  ) => Promise<readonly RosterCandidate[]>;
  readonly setMatchRoster: (
    organizationAlias: string,
    tournamentAlias: string,
    matchId: string,
    entrantId: string,
    request: SetMatchRosterRequest,
    idempotencyKey: string,
  ) => Promise<MatchConsoleResponse>;
  readonly adjustMatchClock: (
    organizationAlias: string,
    tournamentAlias: string,
    matchId: string,
    request: ClockAdjustmentRequest,
    idempotencyKey: string,
  ) => Promise<MatchConsoleResponse>;
  readonly resolveMatchTimer: (
    organizationAlias: string,
    tournamentAlias: string,
    matchId: string,
    timerId: string,
    idempotencyKey: string,
  ) => Promise<MatchConsoleResponse>;
  readonly recordMatchEvent: (
    organizationAlias: string,
    tournamentAlias: string,
    matchId: string,
    request: RecordMatchEventRequest,
    idempotencyKey: string,
  ) => Promise<RecordedMatchEventResponse>;
  readonly finalizeMatch: (
    organizationAlias: string,
    tournamentAlias: string,
    matchId: string,
    request: FinalizeMatchRequest,
    idempotencyKey: string,
  ) => Promise<MatchStateResponse>;
  /**
   * A whole match — roster, event history, result — submitted as one batch,
   * for a match played with no live console session.
   */
  readonly bulkLoadMatch: (
    organizationAlias: string,
    tournamentAlias: string,
    matchId: string,
    request: BulkLoadMatchDataRequest,
  ) => Promise<BulkLoadMatchDataResponse>;
  /** Authenticated stream configuration; events never carry console details. */
  readonly matchConsoleStream?: (organizationAlias: string) => MatchConsoleStream;
}

export interface MatchConsoleStream {
  readonly url: string;
  readonly accessToken?: () => string | undefined;
}

export interface TiebreakTraceResponse {
  readonly entrantId: string;
  readonly lines: readonly string[];
}

export interface TableLayoutSummaryResponse {
  readonly code: string;
  readonly target:
    'group-phase' | 'match-roster' | 'player-ranking' | 'team-ranking' | 'schedule-timeframe';
  readonly label: string | LocalizedLabel;
  readonly entityGranularity: string;
}

export interface TableCellResponse {
  readonly raw?: number | string | boolean;
  readonly formatted: string;
  /** Present only for a `composite` column source. */
  readonly numerator?: number;
  readonly denominator?: number;
}

export interface TableRowResponseData {
  readonly actorId: string;
  readonly entrantId?: string;
  readonly entrantName?: string;
  readonly entrantAbbreviation?: string;
  readonly rank: number;
  readonly sharedRank: boolean;
  readonly cells: Readonly<Record<string, TableCellResponse>>;
}

export interface TableColumnResponseData {
  readonly code: string;
  readonly header: string | LocalizedLabel;
  readonly shortHeader?: string | LocalizedLabel;
  readonly format: 'text' | 'number' | 'decimal-1' | 'decimal-2' | 'percentage' | 'fraction';
}

export interface TableSortRuleResponse {
  readonly columnCode: string;
  readonly direction: 'asc' | 'desc';
}

export interface TableProjectionResponseData {
  readonly layoutCode: string;
  readonly target: TableLayoutSummaryResponse['target'];
  readonly label: string | LocalizedLabel;
  readonly columns: readonly TableColumnResponseData[];
  /** The layout's declared ranking order; `[0]` is the chart's scaling metric. */
  readonly defaultSort: readonly TableSortRuleResponse[];
  readonly rows: readonly TableRowResponseData[];
  readonly projectionVersion: number;
  /** Absent for a stage declaring no series — there is no grain to report. */
  readonly grain?: SeriesAccountingGrain;
  /** The `code` of the column `grain` changes the unit of. Present only alongside `grain`. */
  readonly countColumnCode?: string;
}

export interface SeedingResponse {
  readonly stageId: string;
  readonly format: string;
  readonly seeds: readonly { readonly seed: number; readonly entrantId: string }[];
  readonly matches: readonly CanvasMatch[];
  readonly hasRecordedResults: boolean;
}

export interface PublishSeedingRequest {
  readonly seeds: readonly { readonly seed: number; readonly entrantId: string }[];
}

export interface SeedingClassificationResponse {
  readonly mutationClass: 'safe' | 'requires_rebuild' | 'blocked_after_results';
  readonly reason: string;
  readonly invalidates: readonly string[];
  /** True once the new seed order and fixtures are durably persisted. */
  readonly persisted: boolean;
}

export interface ZoneResponse {
  readonly zoneId: string;
  readonly stageId: string;
  readonly number: number;
  readonly name: string;
}

export interface GroupResponse {
  readonly groupId: string;
  readonly zoneId: string;
  readonly number: number;
  readonly name: string;
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
}

export interface UpdateStageRequest {
  readonly name?: string;
  readonly format?: string;
}

export interface TournamentSettingsResponse {
  readonly name: string;
  readonly region?: string;
  readonly capacity?: number;
  readonly checkInClosesAt?: string;
}

export type TournamentSettingsRequest = Partial<TournamentSettingsResponse>;

/** Dot-path → value for a tournament ruleset's override fields (openspec 0169). */
export interface RulesetOverridesResponse {
  readonly overrides: Readonly<Record<string, unknown>>;
}

export interface RulesetOverridesRequest {
  readonly overrides: Readonly<Record<string, unknown>>;
}

/** Same shape one layer down: a stage's own configuration overrides (openspec 0169). */
export interface StageConfigurationResponse {
  readonly overrides: Readonly<Record<string, unknown>>;
}

export interface StageConfigurationRequest {
  readonly overrides: Readonly<Record<string, unknown>>;
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

export interface CreateTournamentRequest {
  readonly alias: string;
  readonly name: string;
  readonly descriptorId: string;
  readonly descriptorVersion: string;
  readonly format: string;
  readonly publicRegistration: boolean;
  readonly requiresCheckIn: boolean;
  readonly checkInClosesAt?: string;
  readonly region?: string;
  readonly capacity?: number;
  readonly profileId?: string;
  readonly profileVersion?: string;
  readonly customScripts: readonly HookScriptAttachment[];
  readonly series?: SeriesDeclaration;
}

/**
 * Declared here rather than at a stage, because the wizard authors one tournament
 * before any stage exists. It rides the same dot-path override layer server-side.
 */
export type SeriesResolutionClass = 'best-of' | 'aggregate' | 'points-per-leg';

export interface SeriesDeclaration {
  readonly span: number;
  readonly resolutionClass?: SeriesResolutionClass;
  readonly neutralGround?: boolean;
  /** Absent accounts per match — an undeclared grain has always meant this. */
  readonly standingsAccounting?: SeriesAccountingGrain;
}

export type SeriesAccountingGrain = 'series' | 'match';

export interface HookScriptAttachment {
  readonly hook: string;
  readonly script: Readonly<Record<string, unknown>>;
  readonly description?: string;
}

export interface RegistryParameterDefinition {
  readonly name: string;
  readonly description: string;
  readonly required: boolean;
  readonly parameterTypes: readonly string[];
  readonly allowExpression: boolean;
  readonly valueSchema: Readonly<Record<string, unknown>>;
}

export interface HookVocabularyEntry {
  readonly kind: 'parameter' | 'condition' | 'action' | 'rule';
  readonly type: string;
  readonly description: string;
  readonly authoring?: {
    readonly parameters?: readonly RegistryParameterDefinition[];
    readonly optionsSchema?: Readonly<Record<string, unknown>>;
    readonly valueSchema?: Readonly<Record<string, unknown>>;
    readonly allowExpression?: boolean;
  };
}

export interface HookScriptVocabulary {
  readonly hooks: readonly string[];
  readonly entries: readonly HookVocabularyEntry[];
}

export interface TournamentResponse {
  readonly tournamentId: string;
  readonly alias: string;
  readonly name: string;
  readonly rulesetId?: string;
  readonly organizationId?: string;
  readonly status?: 'draft' | 'published' | 'started' | 'finished' | 'archived';
}

export type TournamentConfigurationExportResponse =
  components['schemas']['TournamentConfigurationExportResponse'];

export interface TeamMemberResponse {
  readonly personId: string;
  readonly displayName: string;
  readonly role: 'player' | 'substitute' | 'coach' | 'staff';
  readonly nationality?: string;
  readonly photoObjectId?: string;
}

export interface RegistrationResponse {
  readonly entrantId: string;
  readonly tournamentId: string;
  readonly status: RegistrationStatus;
  /** Tournament-scoped, distinct entrant short label; absent until one is derived or set. */
  readonly abbreviation?: string;
  readonly teamId?: string;
  readonly personId?: string;
  /** A person entrant's display name; absent for a team entrant. */
  readonly displayName?: string;
  readonly nationality?: string;
  readonly photoObjectId?: string;
  readonly teamMembers?: readonly TeamMemberResponse[];
  /** Whether this person entrant already carries a participant identity link (openspec 0170). */
  readonly hasIdentityLink?: boolean;
}

export interface PersonResponse {
  readonly personId: string;
  readonly displayName: string;
  readonly nationality?: string;
  readonly photoObjectId?: string;
  readonly naturalKey?: { readonly kind: string; readonly value: string };
}

export interface CreatePersonRequest {
  readonly displayName: string;
  readonly alias?: string;
  readonly naturalKeyKind?: string;
  readonly naturalKeyValue?: string;
  readonly birthDate?: string;
}

export interface CreateTeamRequest {
  readonly name: string;
  readonly alias?: string;
  readonly clubId?: string;
}

export interface UpdatePersonIdentityRequest {
  readonly displayName?: string;
  readonly alias?: string;
}

export interface UpdateTeamIdentityRequest {
  readonly name?: string;
  readonly alias?: string;
}

export interface PersonIdentityResponse {
  readonly personId: string;
  readonly displayName: string;
  readonly alias?: string;
}

export interface TeamIdentityResponse {
  readonly teamId: string;
  readonly name: string;
  readonly alias?: string;
}

export interface LinkParticipantIdentityRequest {
  readonly email: string;
}

export interface ParticipantIdentityLinkResponse {
  readonly principalId: string;
  readonly personId: string;
}

export interface BulkReviewRequest {
  readonly entrantIds: readonly string[];
  readonly decision: 'accepted' | 'refused' | 'withdrawn';
  readonly reason?: string;
}

export interface ReviewRegistrationRequest {
  readonly decision: 'accepted' | 'refused' | 'withdrawn';
  readonly reason?: string;
}

export interface SetEntrantAbbreviationRequest {
  readonly abbreviation: string;
}

export interface BulkReviewResponse {
  readonly applied: readonly RegistrationResponse[];
  readonly refused: readonly { readonly entrantId: string; readonly reason: string }[];
}

export interface CreateCsvImportRequest {
  readonly target: 'individual' | 'team';
  readonly sourceCsv: string;
}

export interface CsvImportPreviewResponse {
  readonly importId: string;
  readonly target: 'individual' | 'team';
  readonly status: string;
  readonly sourceHash: string;
  readonly preview?: {
    readonly valid: boolean;
    readonly rows: readonly {
      readonly rowNumber: number;
      readonly errors: readonly { readonly message: string }[];
    }[];
    readonly errors: readonly { readonly message: string }[];
  };
}

export type OrganizationRole =
  'admin' | 'club-admin' | 'tournament-admin' | 'referee' | 'broadcaster' | 'viewer';
export type OrganizationMemberStatus = 'active' | 'inactive';
export type GrantableRole =
  | 'super-admin'
  | 'admin'
  | 'club-admin'
  | 'tournament-admin'
  | 'referee'
  | 'broadcaster'
  | 'viewer';

export interface OrganizationRoleResponse {
  readonly assignmentId: string;
  readonly principalId: string;
  readonly email: string;
  readonly role: OrganizationRole;
  readonly status: OrganizationMemberStatus;
  /** Set only for a club-scoped role (club-admin). */
  readonly clubId?: string;
  /** Set only for a tournament-scoped role (tournament-admin). */
  readonly tournamentId?: string;
}

export interface InviteOrganizationUserRequest {
  readonly email: string;
  readonly role: OrganizationRole;
  readonly status: OrganizationMemberStatus;
  readonly clubId?: string;
  readonly tournamentId?: string;
}

export interface ChangeOrganizationRoleRequest {
  readonly role: OrganizationRole;
  readonly status: OrganizationMemberStatus;
  readonly clubId?: string;
  readonly tournamentId?: string;
}

export interface InvitationResponse {
  readonly invitationId: string;
  readonly expiresAt: string;
}

/** A pending (not yet accepted, not rescinded, not expired) invitation (openspec 0170). */
export interface PendingOrganizationInvitationResponse {
  readonly invitationId: string;
  readonly recipientEmail: string;
  readonly role: OrganizationRole;
  readonly status: OrganizationMemberStatus;
  readonly expiresAt: string;
  readonly clubId?: string;
  readonly tournamentId?: string;
}

/** One organization the authenticated caller belongs to, with their role. */
export interface MyOrganizationResponse {
  readonly organizationId: string;
  readonly organizationAlias: string;
  readonly organizationName: string;
  readonly role: OrganizationRole;
}

export interface AuditRecordResponse {
  readonly auditId: string;
  readonly organizationId?: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly action: string;
  readonly actor: string;
  readonly authorizationContext: string;
  readonly previousState?: Record<string, unknown>;
  readonly resultingState?: Record<string, unknown>;
  readonly reason?: string;
  readonly occurredAt: string;
  readonly outcome: 'applied' | 'refused';
}

export interface AuditTrailResponse {
  readonly records: readonly AuditRecordResponse[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

export interface GrantableRolesResponse {
  readonly roles: readonly GrantableRole[];
}

export interface InstallationSuperAdminResponse {
  readonly assignmentId: string;
  readonly principalId: string;
  readonly status: OrganizationMemberStatus;
}

export interface CreateSuperAdminRequest {
  readonly principalId: string;
}

export interface ChangeInstallationRoleStatusRequest {
  readonly status: OrganizationMemberStatus;
}

export type MatchCapability =
  | 'match.record-event'
  | 'match.control-clock'
  | 'match.resolve-timer'
  | 'match.select-roster'
  | 'match.finalize';

export interface ConsoleSegment {
  readonly segmentId: string;
  readonly type: string;
  readonly number: number;
  readonly state: 'pending' | 'active' | 'completed';
  readonly elapsedSeconds: number;
  readonly durationSeconds?: number;
}

export interface ConsoleTimer {
  readonly timerId: string;
  readonly side?: string;
  readonly personId?: string;
  readonly startedAt: number;
  readonly durationSeconds: number;
  readonly remainingSeconds: number;
}

export interface ConsoleMatchEvent {
  readonly eventId: string;
  readonly definitionCode: string;
  readonly segmentId: string;
  readonly sequence: number;
  readonly occurredAt: string;
  readonly side?: string;
  readonly personId?: string;
  readonly notes?: string;
  /** The active segment's running clock when this event was recorded, if timed. */
  readonly segmentElapsedSeconds?: number;
}

export interface ConsoleEventDefinition {
  readonly code: string;
  readonly label: string | LocalizedLabel;
  readonly category: 'positive' | 'negative' | 'neutral';
  readonly permittedSegmentTypes: readonly string[];
  readonly actorRequirement: 'none' | 'side' | 'person' | 'person-or-staff';
  readonly payloadSchema: Record<string, unknown>;
  readonly display: { readonly icon?: string; readonly color?: string; readonly order?: number };
  readonly workflow?: {
    readonly kind: 'outcome-choice';
    readonly options: readonly {
      readonly definitionCode: string;
      readonly label: string | LocalizedLabel;
    }[];
  };
  /**
   * Payload fields an `awardTo`/`target` effect names (an assist provider, a
   * victim) — declared, not guessed from the payload schema's own property
   * types, since a free-text field like `reason` is a string too but names
   * nobody.
   */
  readonly secondaryActorFields: readonly string[];
}

export interface ConsoleLiveScore {
  readonly entrantId: string;
  readonly score: number;
  readonly statistics: Readonly<Record<string, number>>;
}

export interface ConsoleRosterMember {
  readonly personId: string;
  /** Shirt number; not always numeric (e.g. '00', '7B'). */
  readonly number?: number | string;
  readonly name: string;
  /** ISO 3166-1 alpha-2 country code, snapshotted at roster-selection time. */
  readonly nationality?: string;
  /**
   * Codes naming discipline-declared roster roles (see `rosterRoles` on
   * `MatchConsoleResponse`) this member carries — zero, one, or several,
   * independently combinable. Never a closed set here: which roles exist
   * is entirely the bound discipline's to declare.
   */
  readonly roles?: readonly string[];
  /** Resolved by folding recorded substitution events over the roster's starting state. */
  readonly onField: boolean;
}

export interface ConsoleRoster {
  readonly entrantId: string;
  /** The entrant's team name, when the entrant is a team. */
  readonly teamName?: string;
  /** The resolved tournament-scoped abbreviation for the team entrant. */
  readonly teamAbbreviation?: string;
  /** The team's club id, when the team has one — resolves the emblem serve route. */
  readonly clubId?: string;
  readonly members: readonly ConsoleRosterMember[];
}

/** One registered player eligible to be named to an entrant's match roster. */
export interface RosterCandidate {
  readonly personId: string;
  readonly name: string;
  readonly nationality?: string;
}

export interface ConsoleRosterRole {
  /** Referenced by a `ConsoleRosterMember.roles` entry. */
  readonly code: string;
  readonly label: string | LocalizedLabel;
  /** Short tactile-console badge text, e.g. 'GK', 'C'. Falls back to `code` when absent. */
  readonly badge?: string;
}

export interface MatchConsoleResponse {
  readonly matchId: string;
  readonly status: 'scheduled' | 'in-progress' | 'finalized';
  readonly result: Record<string, unknown> | null;
  readonly liveScores: readonly ConsoleLiveScore[];
  readonly segments: readonly ConsoleSegment[];
  readonly runningTimers: readonly ConsoleTimer[];
  readonly events: readonly ConsoleMatchEvent[];
  readonly eventDefinitions: readonly ConsoleEventDefinition[];
  readonly eligiblePersonIds: readonly string[];
  readonly rosters: readonly ConsoleRoster[];
  readonly rosterRoles: readonly ConsoleRosterRole[];
  readonly eligibleStaffIds: readonly string[];
  readonly entrantIds: readonly string[];
  readonly capabilities: readonly MatchCapability[];
  readonly projectionVersion: number;
}

export interface ClockAdjustmentRequest {
  readonly segmentId: string;
  readonly elapsedSeconds: number;
  readonly activate?: boolean;
}

export interface SetMatchRosterMemberRequest {
  readonly personId: string;
  readonly number?: number | string;
  readonly roles?: readonly string[];
  readonly onField: boolean;
}

/** `name`/`nationality` are never sent — the server snapshots both from `Person`. */
export interface SetMatchRosterRequest {
  readonly members: readonly SetMatchRosterMemberRequest[];
}

export interface RecordMatchEventRequest {
  readonly definitionCode: string;
  readonly segmentId: string;
  readonly occurredAt: number;
  readonly side?: string;
  readonly personId?: string;
  readonly payload?: Record<string, unknown>;
  readonly notes?: string;
}

export interface RecordedMatchEventResponse {
  readonly eventId: string;
  readonly definitionCode: string;
  readonly sequence: number;
  readonly side?: string;
  readonly personId?: string;
  readonly notes?: string;
  readonly notifications: readonly string[];
}

export interface FinalizeMatchRequest {
  readonly sides: readonly {
    readonly entrantId: string;
    readonly statistics: Record<string, number>;
    readonly placement?: number;
  }[];
  readonly winnerEntrantId?: string;
}

export interface MatchStateResponse {
  readonly matchId: string;
  readonly status: 'scheduled' | 'in-progress' | 'finalized';
  readonly clockRunning: boolean;
  readonly runningTimers: readonly ConsoleTimer[];
}

/** `name`/`nationality` are never sent — the server snapshots both from `Person`. */
export interface BulkLoadRosterMemberInput {
  readonly personId: string;
  readonly number?: number | string;
  readonly roles?: readonly string[];
  readonly onField: boolean;
}

export interface BulkLoadRosterInput {
  readonly entrantId: string;
  readonly members: readonly BulkLoadRosterMemberInput[];
}

export interface BulkLoadSegmentInput {
  readonly type: string;
  readonly elapsedSeconds?: number;
}

export interface BulkLoadEventInput {
  readonly definitionCode: string;
  readonly segmentNumber: number;
  readonly occurredAt: number;
  readonly side?: string;
  readonly personId?: string;
  readonly payload?: Record<string, unknown>;
  readonly notes?: string;
}

export interface BulkLoadMatchDataRequest {
  readonly rosters: readonly BulkLoadRosterInput[];
  readonly segments: readonly BulkLoadSegmentInput[];
  readonly events: readonly BulkLoadEventInput[];
  readonly result: FinalizeMatchRequest;
}

export interface BulkLoadMatchDataResponse {
  readonly matchId: string;
  readonly status: 'finalized';
  readonly eventCount: number;
}

export function createControlApiClient(input: {
  readonly fetch: typeof fetch;
  readonly baseUrl?: string;
  readonly accessToken?: () => string | undefined;
}): ControlApiClient & MatchConsoleApiClient {
  const baseUrl = input.baseUrl ?? '';

  return {
    listMyOrganizations: () =>
      requestJson<readonly MyOrganizationResponse[]>(
        input.fetch,
        `${baseUrl}/organizations?mine=true`,
        {
          token: input.accessToken?.(),
        },
      ),

    createOrganization: (body) =>
      requestJson<ContractOrganizationResponse>(input.fetch, `${baseUrl}/organizations`, {
        method: 'POST',
        body,
        token: input.accessToken?.(),
      }),

    listInstalledModules: () =>
      requestJson<readonly InstalledModuleResponse[]>(input.fetch, `${baseUrl}/admin/modules`, {
        token: input.accessToken?.(),
      }),

    listOutdatedModules: () =>
      requestJson<readonly OutdatedModuleResponse[]>(
        input.fetch,
        `${baseUrl}/admin/modules?outdated=true`,
        { token: input.accessToken?.() },
      ),

    installModule: (body) =>
      requestJson<InstallModuleResponse>(input.fetch, `${baseUrl}/admin/modules`, {
        method: 'POST',
        body,
        token: input.accessToken?.(),
      }),

    removeModule: (alias) =>
      requestJson<RemoveModuleResponse>(
        input.fetch,
        `${baseUrl}/admin/modules/${encodeURIComponent(alias)}`,
        { method: 'DELETE', token: input.accessToken?.() },
      ),

    verifyModules: () =>
      requestJson<readonly ModuleVerifyResultResponse[]>(
        input.fetch,
        `${baseUrl}/admin/modules/verify`,
        { method: 'POST', token: input.accessToken?.() },
      ),

    validateAuthoredModule: (body) =>
      requestJson<AuthoredModuleValidationResponse>(
        input.fetch,
        `${baseUrl}/admin/authored-modules/validate`,
        { method: 'POST', body, token: input.accessToken?.() },
      ),

    installAuthoredModule: (body) =>
      requestJson<InstallModuleResponse>(input.fetch, `${baseUrl}/admin/authored-modules`, {
        method: 'POST',
        body,
        token: input.accessToken?.(),
      }),

    submitAuthoredModule: (body) =>
      requestJson<AuthoredModuleSubmitResponse>(
        input.fetch,
        `${baseUrl}/admin/authored-modules/submit`,
        { method: 'POST', body, token: input.accessToken?.() },
      ),

    listDisciplines: () =>
      requestJson<readonly DisciplineOption[]>(input.fetch, `${baseUrl}/disciplines`),

    listCompatibleProfiles: (descriptorId, descriptorVersion, format) => {
      const params = new URLSearchParams({ descriptorId, descriptorVersion });
      if (format !== undefined && format.trim() !== '') params.set('format', format);
      return requestJson<readonly TournamentProfileOption[]>(
        input.fetch,
        `${baseUrl}/tournament-profiles/compatible?${params}`,
      );
    },

    createTournament: (organizationAlias, body) =>
      requestJson<TournamentResponse>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments`,
        {
          method: 'POST',
          body,
          token: input.accessToken?.(),
        },
      ),

    fetchCustomScriptVocabulary: (organizationAlias) =>
      requestJson<HookScriptVocabulary>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/custom-script-vocabulary`,
        { token: input.accessToken?.() },
      ),

    listActiveTournaments: (organizationAlias) =>
      requestJson<readonly TournamentResponse[]>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments`,
        { token: input.accessToken?.() },
      ),

    listRegistrations: (organizationAlias, tournamentAlias, status) => {
      const params = new URLSearchParams();
      if (status !== undefined) params.set('status', status);
      const query = params.size === 0 ? '' : `?${params}`;
      return requestJson<readonly RegistrationResponse[]>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(
          tournamentAlias,
        )}/registrations${query}`,
        { token: input.accessToken?.() },
      );
    },

    bulkReview: (organizationAlias, tournamentAlias, body) =>
      requestJson<BulkReviewResponse>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(
          tournamentAlias,
        )}/registrations/bulk-review`,
        {
          method: 'POST',
          body,
          token: input.accessToken?.(),
        },
      ),

    createPerson: (organizationAlias, tournamentAlias, body) =>
      requestJson<RegistrationResponse>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(
          tournamentAlias,
        )}/registrations/persons`,
        { method: 'POST', body, token: input.accessToken?.() },
      ),

    createTeam: (organizationAlias, tournamentAlias, body) =>
      requestJson<RegistrationResponse>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(
          tournamentAlias,
        )}/registrations/teams`,
        { method: 'POST', body, token: input.accessToken?.() },
      ),

    updatePersonIdentity: (organizationAlias, tournamentAlias, personId, body) =>
      requestJson<PersonIdentityResponse>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(
          tournamentAlias,
        )}/registrations/persons/${encodeURIComponent(personId)}`,
        { method: 'PATCH', body, token: input.accessToken?.() },
      ),

    updateTeamIdentity: (organizationAlias, tournamentAlias, teamId, body) =>
      requestJson<TeamIdentityResponse>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(
          tournamentAlias,
        )}/registrations/teams/${encodeURIComponent(teamId)}`,
        { method: 'PATCH', body, token: input.accessToken?.() },
      ),

    removePerson: (organizationAlias, tournamentAlias, personId) =>
      requestJson<PersonIdentityResponse>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(
          tournamentAlias,
        )}/registrations/persons/${encodeURIComponent(personId)}`,
        { method: 'DELETE', token: input.accessToken?.() },
      ),

    removeTeam: (organizationAlias, tournamentAlias, teamId) =>
      requestJson<TeamIdentityResponse>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(
          tournamentAlias,
        )}/registrations/teams/${encodeURIComponent(teamId)}`,
        { method: 'DELETE', token: input.accessToken?.() },
      ),

    linkParticipantIdentity: (organizationAlias, personId, body) =>
      requestJson<ParticipantIdentityLinkResponse>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/participants/${encodeURIComponent(
          personId,
        )}/identity-link`,
        { method: 'POST', body, token: input.accessToken?.() },
      ),

    unlinkParticipantIdentity: (organizationAlias, personId) =>
      requestJson<ParticipantIdentityLinkResponse>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/participants/${encodeURIComponent(
          personId,
        )}/identity-link`,
        { method: 'DELETE', token: input.accessToken?.() },
      ),

    reviewRegistration: (organizationAlias, tournamentAlias, entrantId, body) =>
      requestJson<RegistrationResponse>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(
          tournamentAlias,
        )}/registrations/${encodeURIComponent(entrantId)}/review`,
        {
          method: 'POST',
          body,
          token: input.accessToken?.(),
        },
      ),

    listEntrantsNeedingAbbreviation: (organizationAlias, tournamentAlias) =>
      requestJson<readonly RegistrationResponse[]>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(
          tournamentAlias,
        )}/entrants/needing-abbreviation`,
        { token: input.accessToken?.() },
      ),

    setEntrantAbbreviation: (organizationAlias, tournamentAlias, entrantId, body) =>
      requestJson<RegistrationResponse>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(
          tournamentAlias,
        )}/entrants/${encodeURIComponent(entrantId)}/abbreviation`,
        {
          method: 'PATCH',
          body,
          token: input.accessToken?.(),
        },
      ),

    editTeamMemberships: (organizationAlias, tournamentAlias, entrantId, body) =>
      requestJson<RegistrationResponse>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(
          tournamentAlias,
        )}/registrations/${encodeURIComponent(entrantId)}/team-memberships`,
        {
          method: 'POST',
          body,
          token: input.accessToken?.(),
        },
      ),

    fetchStandings: (organizationAlias, tournamentAlias, stageNumber) =>
      requestJson<StandingsData>(
        input.fetch,
        `${stagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber)}/standings`,
        {
          token: input.accessToken?.(),
        },
      ),

    fetchMatchesView: (organizationAlias, tournamentAlias, filter = {}) => {
      const params = new URLSearchParams();
      if (filter.stageNumber !== undefined) params.set('stageNumber', String(filter.stageNumber));
      if (filter.groupId !== undefined) params.set('groupId', filter.groupId);
      if (filter.state !== undefined) params.set('state', filter.state);
      const query = params.size > 0 ? `?${params}` : '';
      return requestJson<{ readonly matches: readonly MatchCardData[] }>(
        input.fetch,
        `${tournamentPath(baseUrl, organizationAlias, tournamentAlias)}/internal-matches-view${query}`,
        { token: input.accessToken?.() },
      );
    },

    fetchTiebreakTrace: (organizationAlias, tournamentAlias, stageNumber, entrantId) =>
      requestJson<TiebreakTraceResponse>(
        input.fetch,
        `${stagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber)}/standings/entrants/${encodeURIComponent(
          entrantId,
        )}/trace`,
        { token: input.accessToken?.() },
      ),

    fetchTableLayouts: (organizationAlias, tournamentAlias) =>
      requestJson<{ readonly layouts: readonly TableLayoutSummaryResponse[] }>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(
          tournamentAlias,
        )}/tables`,
        { token: input.accessToken?.() },
      ).then((response) => response.layouts),

    fetchTableProjection: (organizationAlias, tournamentAlias, layoutCode, scope) =>
      requestJson<TableProjectionResponseData>(
        input.fetch,
        tablePath(baseUrl, organizationAlias, tournamentAlias, layoutCode, scope) +
          groupQuery(scope.groupId),
        { token: input.accessToken?.() },
      ),

    downloadTableProjectionCsv: (organizationAlias, tournamentAlias, layoutCode, scope) =>
      requestText(
        input.fetch,
        `${tablePath(baseUrl, organizationAlias, tournamentAlias, layoutCode, scope)}/csv${groupQuery(scope.groupId)}`,
        input.accessToken?.(),
      ),

    fetchSeeding: (organizationAlias, tournamentAlias, stageNumber) =>
      requestJson<SeedingResponse>(
        input.fetch,
        `${stagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber)}/seeding`,
        {
          token: input.accessToken?.(),
        },
      ),

    publishSeeding: (organizationAlias, tournamentAlias, stageNumber, body) =>
      requestJson<SeedingClassificationResponse>(
        input.fetch,
        `${stagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber)}/seeding`,
        { method: 'POST', body, token: input.accessToken?.() },
      ),

    updateStage: (organizationAlias, tournamentAlias, stageNumber, body) =>
      requestJson<StageResponse>(
        input.fetch,
        stagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber),
        { method: 'PATCH', body, token: input.accessToken?.() },
      ),

    deleteStage: (organizationAlias, tournamentAlias, stageNumber) =>
      requestJson<StageResponse>(
        input.fetch,
        stagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber),
        { method: 'DELETE', token: input.accessToken?.() },
      ),

    fetchStageConfiguration: (organizationAlias, tournamentAlias, stageNumber) =>
      requestJson<StageConfigurationResponse>(
        input.fetch,
        `${stagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber)}/configuration`,
        { token: input.accessToken?.() },
      ),

    previewStageConfiguration: (organizationAlias, tournamentAlias, stageNumber, body) =>
      requestJson<MutationPreviewResponse>(
        input.fetch,
        `${stagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber)}/configuration/preview`,
        { method: 'POST', body, token: input.accessToken?.() },
      ),

    updateStageConfiguration: (organizationAlias, tournamentAlias, stageNumber, body) =>
      requestJson<StageConfigurationResponse>(
        input.fetch,
        `${stagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber)}/configuration`,
        { method: 'PUT', body, token: input.accessToken?.() },
      ),

    fetchTournamentSettings: (organizationAlias, tournamentAlias) =>
      requestJson<TournamentSettingsResponse>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(
          tournamentAlias,
        )}/settings`,
        { token: input.accessToken?.() },
      ),

    previewTournamentSettings: (organizationAlias, tournamentAlias, body) =>
      requestJson<MutationPreviewResponse>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(
          tournamentAlias,
        )}/settings/preview`,
        { method: 'POST', body, token: input.accessToken?.() },
      ),

    updateTournamentSettings: (organizationAlias, tournamentAlias, body) =>
      requestJson<TournamentSettingsResponse>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(
          tournamentAlias,
        )}/settings`,
        { method: 'PUT', body, token: input.accessToken?.() },
      ),

    fetchRulesetOverrides: (organizationAlias, tournamentAlias) =>
      requestJson<RulesetOverridesResponse>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(
          tournamentAlias,
        )}/ruleset-overrides`,
        { token: input.accessToken?.() },
      ),

    previewRulesetOverrides: (organizationAlias, tournamentAlias, body) =>
      requestJson<MutationPreviewResponse>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(
          tournamentAlias,
        )}/ruleset-overrides/preview`,
        { method: 'POST', body, token: input.accessToken?.() },
      ),

    updateRulesetOverrides: (organizationAlias, tournamentAlias, body) =>
      requestJson<RulesetOverridesResponse>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(
          tournamentAlias,
        )}/ruleset-overrides`,
        { method: 'PUT', body, token: input.accessToken?.() },
      ),

    listZones: (organizationAlias, tournamentAlias, stageNumber) =>
      requestJson<readonly ZoneResponse[]>(
        input.fetch,
        `${stagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber)}/zones`,
        { token: input.accessToken?.() },
      ),

    createZone: (organizationAlias, tournamentAlias, stageNumber, body) =>
      requestJson<ZoneResponse>(
        input.fetch,
        `${stagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber)}/zones`,
        { method: 'POST', body, token: input.accessToken?.() },
      ),

    listGroups: (organizationAlias, tournamentAlias, stageNumber, zoneNumber) =>
      requestJson<readonly GroupResponse[]>(
        input.fetch,
        `${zoneStagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber, zoneNumber)}/groups`,
        { token: input.accessToken?.() },
      ),

    createGroup: (organizationAlias, tournamentAlias, stageNumber, zoneNumber, body) =>
      requestJson<GroupResponse>(
        input.fetch,
        `${zoneStagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber, zoneNumber)}/groups`,
        { method: 'POST', body, token: input.accessToken?.() },
      ),

    renameZone: (organizationAlias, tournamentAlias, stageNumber, zoneNumber, body) =>
      requestJson<ZoneResponse>(
        input.fetch,
        zoneStagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber, zoneNumber),
        { method: 'PATCH', body, token: input.accessToken?.() },
      ),

    deleteZone: (organizationAlias, tournamentAlias, stageNumber, zoneNumber) =>
      requestJson<ZoneResponse>(
        input.fetch,
        zoneStagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber, zoneNumber),
        { method: 'DELETE', token: input.accessToken?.() },
      ),

    renameGroup: (organizationAlias, tournamentAlias, stageNumber, zoneNumber, groupNumber, body) =>
      requestJson<GroupResponse>(
        input.fetch,
        `${zoneStagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber, zoneNumber)}/groups/${groupNumber}`,
        { method: 'PATCH', body, token: input.accessToken?.() },
      ),

    deleteGroup: (organizationAlias, tournamentAlias, stageNumber, zoneNumber, groupNumber) =>
      requestJson<GroupResponse>(
        input.fetch,
        `${zoneStagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber, zoneNumber)}/groups/${groupNumber}`,
        { method: 'DELETE', token: input.accessToken?.() },
      ),

    previewZoneDraw: (organizationAlias, tournamentAlias, stageNumber, body) =>
      requestJson<DrawPreviewResponse>(
        input.fetch,
        `${stagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber)}/zones/draw/preview`,
        { method: 'POST', body, token: input.accessToken?.() },
      ),

    confirmZoneDraw: (organizationAlias, tournamentAlias, stageNumber, body) =>
      requestJson<ConfirmZoneDrawResponse>(
        input.fetch,
        `${stagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber)}/zones/draw`,
        { method: 'POST', body, token: input.accessToken?.() },
      ),

    assignZonesManually: (organizationAlias, tournamentAlias, stageNumber, body) =>
      requestJson<ManualZoneAssignmentResponse>(
        input.fetch,
        `${stagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber)}/zones/assign`,
        { method: 'POST', body, token: input.accessToken?.() },
      ),

    previewGroupDraw: (organizationAlias, tournamentAlias, stageNumber, zoneNumber, body) =>
      requestJson<DrawPreviewResponse>(
        input.fetch,
        `${zoneStagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber, zoneNumber)}/groups/draw/preview`,
        { method: 'POST', body, token: input.accessToken?.() },
      ),

    confirmGroupDraw: (organizationAlias, tournamentAlias, stageNumber, zoneNumber, body) =>
      requestJson<ConfirmGroupDrawResponse>(
        input.fetch,
        `${zoneStagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber, zoneNumber)}/groups/draw`,
        { method: 'POST', body, token: input.accessToken?.() },
      ),

    assignGroupsManually: (organizationAlias, tournamentAlias, stageNumber, zoneNumber, body) =>
      requestJson<ManualGroupAssignmentResponse>(
        input.fetch,
        `${zoneStagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber, zoneNumber)}/groups/assign`,
        { method: 'POST', body, token: input.accessToken?.() },
      ),

    savePromotionPlan: (organizationAlias, tournamentAlias, stageNumber, zoneNumber, body) =>
      requestJson<PromotionPlanResponse>(
        input.fetch,
        `${zoneStagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber, zoneNumber)}/promotion-plan`,
        { method: 'POST', body, token: input.accessToken?.() },
      ),

    fetchPromotionPreview: (organizationAlias, tournamentAlias, stageNumber, zoneNumber) =>
      requestJson<PromotionPreviewResponse>(
        input.fetch,
        `${zoneStagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber, zoneNumber)}/promotion-preview`,
        { token: input.accessToken?.() },
      ),

    fetchPromotionPlansTargetingStage: (organizationAlias, tournamentAlias, stageNumber) =>
      requestJson<readonly TargetingPromotionPreviewResponse[]>(
        input.fetch,
        `${stagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber)}/promotion-plans`,
        { token: input.accessToken?.() },
      ),

    fetchZoneEntrants: (organizationAlias, tournamentAlias, stageNumber, zoneNumber) =>
      requestJson<readonly string[]>(
        input.fetch,
        `${zoneStagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber, zoneNumber)}/entrants`,
        { token: input.accessToken?.() },
      ),

    listOrganizationRoles: (organizationAlias) =>
      requestJson<readonly OrganizationRoleResponse[]>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/roles`,
        { token: input.accessToken?.() },
      ),

    fetchAuditTrail: (organizationAlias, options) => {
      const params = new URLSearchParams();
      if (options?.actor !== undefined) params.set('actor', options.actor);
      if (options?.limit !== undefined) params.set('limit', String(options.limit));
      if (options?.offset !== undefined) params.set('offset', String(options.offset));
      const query = params.size === 0 ? '' : `?${params}`;
      return requestJson<AuditTrailResponse>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/audit-trail${query}`,
        { token: input.accessToken?.() },
      );
    },

    inviteOrganizationUser: (organizationAlias, body) =>
      requestJson<InvitationResponse>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/invitations`,
        { method: 'POST', body, token: input.accessToken?.() },
      ),

    listPendingInvitations: (organizationAlias) =>
      requestJson<readonly PendingOrganizationInvitationResponse[]>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/invitations`,
        { token: input.accessToken?.() },
      ),

    rescindInvitation: (organizationAlias, invitationId) =>
      requestJson<InvitationResponse>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/invitations/${encodeURIComponent(
          invitationId,
        )}`,
        { method: 'DELETE', token: input.accessToken?.() },
      ),

    changeOrganizationRole: (organizationAlias, assignmentId, body) =>
      requestJson<OrganizationRoleResponse>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/roles/${encodeURIComponent(
          assignmentId,
        )}`,
        { method: 'PATCH', body, token: input.accessToken?.() },
      ),

    deleteOrganizationRole: async (organizationAlias, assignmentId) => {
      await requestJson<OrganizationRoleResponse>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/roles/${encodeURIComponent(
          assignmentId,
        )}`,
        { method: 'DELETE', token: input.accessToken?.() },
      );
    },

    listGrantableRoles: (organizationAlias) =>
      requestJson<GrantableRolesResponse>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/roles/grantable`,
        { token: input.accessToken?.() },
      ),

    listInstallationSuperAdmins: () =>
      requestJson<readonly InstallationSuperAdminResponse[]>(
        input.fetch,
        `${baseUrl}/installation/super-admins`,
        { token: input.accessToken?.() },
      ),

    createInstallationSuperAdmin: (body) =>
      requestJson<InstallationSuperAdminResponse>(
        input.fetch,
        `${baseUrl}/installation/super-admins`,
        { method: 'POST', body, token: input.accessToken?.() },
      ),

    changeInstallationSuperAdminStatus: (assignmentId, body) =>
      requestJson<InstallationSuperAdminResponse>(
        input.fetch,
        `${baseUrl}/installation/super-admins/${encodeURIComponent(assignmentId)}`,
        { method: 'PATCH', body, token: input.accessToken?.() },
      ),

    deleteInstallationSuperAdmin: async (assignmentId) => {
      await requestJson<InstallationSuperAdminResponse>(
        input.fetch,
        `${baseUrl}/installation/super-admins/${encodeURIComponent(assignmentId)}`,
        { method: 'DELETE', token: input.accessToken?.() },
      );
    },

    createCsvImport: (organizationAlias, tournamentAlias, body) =>
      requestJson<CsvImportPreviewResponse>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}/imports`,
        { method: 'POST', body, token: input.accessToken?.() },
      ),

    fetchCsvImport: (organizationAlias, tournamentAlias, importId) =>
      requestJson<CsvImportPreviewResponse>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}/imports/${encodeURIComponent(importId)}`,
        { token: input.accessToken?.() },
      ),

    commitCsvImport: (organizationAlias, tournamentAlias, importId, sourceHash) =>
      requestJson<CsvImportPreviewResponse>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}/imports/${encodeURIComponent(importId)}/commit`,
        { method: 'POST', body: { sourceHash }, token: input.accessToken?.() },
      ),

    downloadCsvExport: (organizationAlias, tournamentAlias, kind) =>
      requestText(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}/exports/${kind}`,
        input.accessToken?.(),
      ),

    downloadTournamentConfiguration: (organizationAlias, tournamentAlias) =>
      requestJson<TournamentConfigurationExportResponse>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}/export`,
        { token: input.accessToken?.() },
      ),

    listDisplayTokens: (organizationAlias, tournamentAlias) =>
      requestJson<readonly DisplayTokenResponse[]>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}/display-tokens`,
        { token: input.accessToken?.() },
      ),

    listPendingReports: (organizationAlias, tournamentAlias) =>
      requestJson<readonly ParticipantReportResponse[]>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}/reports`,
        { token: input.accessToken?.() },
      ),

    reviewReport: (organizationAlias, tournamentAlias, reportId, body) =>
      requestJson<ParticipantReportResponse>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}/reports/${encodeURIComponent(reportId)}/review`,
        { method: 'POST', body, token: input.accessToken?.() },
      ),

    archiveTournament: (organizationAlias, tournamentAlias) =>
      requestJson<{ readonly status: string }>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}/archive`,
        { method: 'POST', token: input.accessToken?.() },
      ),

    fetchMatchConsole: (organizationAlias, tournamentAlias, matchId) =>
      requestJson<MatchConsoleResponse>(
        input.fetch,
        `${matchPath(baseUrl, organizationAlias, tournamentAlias, matchId)}/console`,
        { token: input.accessToken?.() },
      ),

    fetchMatchRosters: (organizationAlias, tournamentAlias, matchId) =>
      requestJson<readonly ConsoleRoster[]>(
        input.fetch,
        `${matchPath(baseUrl, organizationAlias, tournamentAlias, matchId)}/rosters`,
        { token: input.accessToken?.() },
      ),

    fetchRosterCandidates: (organizationAlias, tournamentAlias, matchId, entrantId) =>
      requestJson<readonly RosterCandidate[]>(
        input.fetch,
        `${matchPath(baseUrl, organizationAlias, tournamentAlias, matchId)}/rosters/${encodeURIComponent(entrantId)}/candidates`,
        { token: input.accessToken?.() },
      ),

    setMatchRoster: (
      organizationAlias,
      tournamentAlias,
      matchId,
      entrantId,
      body,
      idempotencyKey,
    ) =>
      requestJson<MatchConsoleResponse>(
        input.fetch,
        `${matchPath(baseUrl, organizationAlias, tournamentAlias, matchId)}/rosters/${encodeURIComponent(entrantId)}`,
        { method: 'PUT', body, token: input.accessToken?.(), idempotencyKey },
      ),

    adjustMatchClock: (organizationAlias, tournamentAlias, matchId, body, idempotencyKey) =>
      requestJson<MatchConsoleResponse>(
        input.fetch,
        `${matchPath(baseUrl, organizationAlias, tournamentAlias, matchId)}/clock`,
        { method: 'POST', body, token: input.accessToken?.(), idempotencyKey },
      ),

    resolveMatchTimer: (organizationAlias, tournamentAlias, matchId, timerId, idempotencyKey) =>
      requestJson<MatchConsoleResponse>(
        input.fetch,
        `${matchPath(baseUrl, organizationAlias, tournamentAlias, matchId)}/timers/${encodeURIComponent(timerId)}/resolve`,
        { method: 'POST', token: input.accessToken?.(), idempotencyKey },
      ),

    recordMatchEvent: (organizationAlias, tournamentAlias, matchId, body, idempotencyKey) =>
      requestJson<RecordedMatchEventResponse>(
        input.fetch,
        `${matchPath(baseUrl, organizationAlias, tournamentAlias, matchId)}/events`,
        { method: 'POST', body, token: input.accessToken?.(), idempotencyKey },
      ),

    finalizeMatch: (organizationAlias, tournamentAlias, matchId, body, idempotencyKey) =>
      requestJson<MatchStateResponse>(
        input.fetch,
        `${matchPath(baseUrl, organizationAlias, tournamentAlias, matchId)}/commands/finalize`,
        { method: 'POST', body, token: input.accessToken?.(), idempotencyKey },
      ),

    bulkLoadMatch: (organizationAlias, tournamentAlias, matchId, body) =>
      requestJson<BulkLoadMatchDataResponse>(
        input.fetch,
        `${matchPath(baseUrl, organizationAlias, tournamentAlias, matchId)}/bulk-load`,
        { method: 'POST', body, token: input.accessToken?.() },
      ),

    matchConsoleStream: (organizationAlias) => ({
      url: `${baseUrl}/events/control/${encodeURIComponent(organizationAlias)}`,
      accessToken: input.accessToken,
    }),

    getPerson: (organizationAlias, personId) =>
      requestJson<PersonResponse>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/persons/${encodeURIComponent(personId)}`,
        { token: input.accessToken?.() },
      ),

    setPersonNationality: (organizationAlias, personId, nationality) =>
      requestJson(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/persons/${encodeURIComponent(personId)}/nationality`,
        { method: 'PATCH', body: { nationality }, token: input.accessToken?.() },
      ),

    uploadPersonPhoto: (organizationAlias, personId, body) =>
      requestJson(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/persons/${encodeURIComponent(personId)}/photo`,
        { method: 'POST', body, token: input.accessToken?.() },
      ),

    getOrganization: (organizationAlias) =>
      requestJson<OrganizationResponse>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}`,
        {},
      ),

    updateOrganizationSettings: (organizationAlias, body) =>
      requestJson<OrganizationResponse>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/settings`,
        { method: 'PATCH', body, token: input.accessToken?.() },
      ),

    uploadOrganizationEmblem: (organizationAlias, body) =>
      requestJson(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/emblem`,
        { method: 'POST', body, token: input.accessToken?.() },
      ),

    getStorageUsage: (organizationAlias) =>
      requestJson<OrganizationStorageUsageResponse>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/storage-usage`,
        { token: input.accessToken?.() },
      ),

    listUnreferencedObjects: (organizationAlias) =>
      requestJson<readonly UnreferencedObjectResponse[]>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/storage-usage/objects`,
        { token: input.accessToken?.() },
      ),

    deleteObject: (organizationAlias, objectId) =>
      requestJson<UnreferencedObjectResponse>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/storage-usage/objects/${encodeURIComponent(objectId)}`,
        { method: 'DELETE', token: input.accessToken?.() },
      ),

    rebuildStatistics: (organizationAlias, tournamentAlias) =>
      requestJson<StatisticsRebuildResponse>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/statistics/rebuild`,
        {
          method: 'POST',
          body: tournamentAlias === undefined ? {} : { tournamentAlias },
          token: input.accessToken?.(),
        },
      ),

    listClubs: (organizationAlias) =>
      requestJson<readonly ClubResponse[]>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/clubs`,
        { token: input.accessToken?.() },
      ),

    createClub: (organizationAlias, body) =>
      requestJson<ClubResponse>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/clubs`,
        { method: 'POST', body, token: input.accessToken?.() },
      ),

    updateClub: (organizationAlias, clubId, body) =>
      requestJson<ClubResponse>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/clubs/${encodeURIComponent(clubId)}`,
        { method: 'PATCH', body, token: input.accessToken?.() },
      ),

    uploadClubEmblem: (organizationAlias, clubId, body) =>
      requestJson(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/clubs/${encodeURIComponent(clubId)}/emblem`,
        { method: 'POST', body, token: input.accessToken?.() },
      ),

    listVenues: (organizationAlias) =>
      requestJson<readonly VenueResponse[]>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/venues`,
        { token: input.accessToken?.() },
      ),

    createVenue: (organizationAlias, body) =>
      requestJson<VenueResponse>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/venues`,
        { method: 'POST', body, token: input.accessToken?.() },
      ),

    updateVenue: (organizationAlias, venueId, body) =>
      requestJson<VenueResponse>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/venues/${encodeURIComponent(venueId)}`,
        { method: 'PATCH', body, token: input.accessToken?.() },
      ),

    listOfficials: (organizationAlias) =>
      requestJson<readonly OfficialResponse[]>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/officials`,
        { token: input.accessToken?.() },
      ),

    createOfficial: (organizationAlias, body) =>
      requestJson<OfficialResponse>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/officials`,
        { method: 'POST', body, token: input.accessToken?.() },
      ),

    updateOfficial: (organizationAlias, officialId, body) =>
      requestJson<OfficialResponse>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/officials/${encodeURIComponent(officialId)}`,
        { method: 'PATCH', body, token: input.accessToken?.() },
      ),

    listSchedules: (organizationAlias) =>
      requestJson<readonly ScheduleDetailResponse[]>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/schedules`,
        { token: input.accessToken?.() },
      ),

    createSchedule: (organizationAlias, body) =>
      requestJson<ScheduleDetailResponse>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/schedules`,
        { method: 'POST', body, token: input.accessToken?.() },
      ),

    updateSchedule: (organizationAlias, scheduleId, body) =>
      requestJson<ScheduleDetailResponse>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/schedules/${encodeURIComponent(scheduleId)}`,
        { method: 'PATCH', body, token: input.accessToken?.() },
      ),

    deleteSchedule: (organizationAlias, scheduleId) =>
      requestJson<{ readonly success: boolean }>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/schedules/${encodeURIComponent(scheduleId)}`,
        { method: 'DELETE', token: input.accessToken?.() },
      ),

    getStageFixtures: (organizationAlias, tournamentAlias, stageNumber) =>
      requestJson<StageFixturesResponse>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}/stages/${stageNumber}/fixtures`,
        { token: input.accessToken?.() },
      ),

    getSchedule: (organizationAlias, tournamentAlias, stageId) =>
      requestJson<ScheduleResponse>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}/stages/${encodeURIComponent(stageId)}/schedule`,
        { token: input.accessToken?.() },
      ),

    previewSchedule: (organizationAlias, tournamentAlias, stageId, body) =>
      requestJson<SchedulePreviewResponse>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}/stages/${encodeURIComponent(stageId)}/schedule/preview`,
        { method: 'POST', body, token: input.accessToken?.() },
      ),

    publishSchedule: (organizationAlias, tournamentAlias, stageId, body) =>
      requestJson<ScheduleResponse>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}/stages/${encodeURIComponent(stageId)}/schedule`,
        { method: 'POST', body, token: input.accessToken?.() },
      ),
  };
}

/** Public, unauthenticated image routes — safe to use directly as an `<img src>`. */
export function personPhotoUrl(organizationAlias: string, personId: string, baseUrl = ''): string {
  return `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/persons/${encodeURIComponent(personId)}/photo`;
}

export function clubEmblemUrl(organizationAlias: string, clubId: string, baseUrl = ''): string {
  return `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/clubs/${encodeURIComponent(clubId)}/emblem`;
}

export function organizationEmblemUrl(organizationAlias: string, baseUrl = ''): string {
  return `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/emblem`;
}

async function requestText(
  fetcher: typeof fetch,
  url: string,
  token: string | undefined,
): Promise<string> {
  const response = await fetcher(url, {
    headers: token === undefined ? undefined : { authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw await controlApiErrorFromResponse(response);
  }
  return response.text();
}

function matchPath(
  baseUrl: string,
  organizationAlias: string,
  tournamentAlias: string,
  matchId: string,
): string {
  return `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(
    tournamentAlias,
  )}/matches/${encodeURIComponent(matchId)}`;
}

function tournamentPath(
  baseUrl: string,
  organizationAlias: string,
  tournamentAlias: string,
): string {
  return `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}`;
}

function stagePath(
  baseUrl: string,
  organizationAlias: string,
  tournamentAlias: string,
  stageNumber: number,
): string {
  return `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(
    tournamentAlias,
  )}/stages/${stageNumber}`;
}

/**
 * `scope.stageNumber` absent reads the tournament-wide table route. Does
 * NOT include `scope.groupId` in the returned path — callers append that
 * query string themselves, after any further path segment (e.g. `/csv`)
 * they add, so the query string always lands last.
 */
function tablePath(
  baseUrl: string,
  organizationAlias: string,
  tournamentAlias: string,
  layoutCode: string,
  scope: { readonly stageNumber?: number },
): string {
  const scoped =
    scope.stageNumber === undefined
      ? `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(
          tournamentAlias,
        )}`
      : stagePath(baseUrl, organizationAlias, tournamentAlias, scope.stageNumber);
  return `${scoped}/tables/${encodeURIComponent(layoutCode)}`;
}

/** Scopes a stage-level table to one group's own matches and entrants only. */
function groupQuery(groupId: string | undefined): string {
  return groupId === undefined ? '' : `?groupId=${encodeURIComponent(groupId)}`;
}

function zoneStagePath(
  baseUrl: string,
  organizationAlias: string,
  tournamentAlias: string,
  stageNumber: number,
  zoneNumber: number,
): string {
  return `${stagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber)}/zones/${zoneNumber}`;
}

async function requestJson<T>(
  fetcher: typeof fetch,
  url: string,
  options: {
    readonly method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    readonly body?: unknown;
    readonly token?: string;
    readonly idempotencyKey?: string;
  } = {},
): Promise<T> {
  const headers = new Headers();
  if (options.body !== undefined) headers.set('content-type', 'application/json');
  if (options.token !== undefined) headers.set('authorization', `Bearer ${options.token}`);
  if (options.idempotencyKey !== undefined) headers.set('idempotency-key', options.idempotencyKey);

  const response = await fetcher(url, {
    method: options.method ?? 'GET',
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });

  if (!response.ok) {
    // The status is the least useful part. A 409 here carries "check-in has
    // closed…" or "this entrant withdrew…", which is exactly what the operator
    // has to be told — discarding it leaves them reading a number.
    throw await controlApiErrorFromResponse(response);
  }
  return (await response.json()) as T;
}

export class ControlApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly errorCode?: string,
  ) {
    super(message);
    this.name = 'ControlApiError';
  }
}

export async function controlApiErrorFromResponse(response: Response): Promise<ControlApiError> {
  const reason = await reasonOf(response);
  return new ControlApiError(response.status, reason.message, reason.errorCode);
}

async function reasonOf(
  response: Response,
): Promise<{ readonly message: string; readonly errorCode?: string }> {
  try {
    const body: unknown = await response.json();
    if (typeof body === 'object' && body !== null && 'message' in body) {
      const candidate = body as { message?: unknown; errorCode?: unknown };
      const errorCode =
        typeof candidate.errorCode === 'string' && candidate.errorCode.length > 0
          ? candidate.errorCode
          : undefined;
      if (typeof candidate.message === 'string' && candidate.message.length > 0) {
        return { message: candidate.message, ...(errorCode ? { errorCode } : {}) };
      }
      if (Array.isArray(candidate.message) && typeof candidate.message[0] === 'string') {
        return { message: candidate.message[0], ...(errorCode ? { errorCode } : {}) };
      }
    }
  } catch {
    // A body that is not JSON tells us nothing; the status still does.
  }
  // Not extracted to the message catalog: react-intl's createIntl/
  // createIntlCache — the only API for formatting outside a component tree —
  // pulled a Node-only `Buffer` reference into this module's bundle, crashing
  // every client:only control route at hydration. This fallback only fires
  // when the server sends a non-JSON error body with no message, a genuinely
  // rare edge case; hardcoding it plainly here is safer than risking that
  // bundling failure again for a string almost nobody sees.
  return { message: `The request failed with ${response.status}` };
}
