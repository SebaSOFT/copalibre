import { API_PATH_PREFIX } from '../../lib/api-path.js';
import type { OrganizationsApi } from './api-client/organizations.js';
import { organizationsEndpoints } from './api-client/organizations.js';
import type { ModulesApi } from './api-client/modules.js';
import { modulesEndpoints } from './api-client/modules.js';
import type { ClubsVenuesOfficialsApi } from './api-client/clubs-venues-officials.js';
import { clubsVenuesOfficialsEndpoints } from './api-client/clubs-venues-officials.js';
import type { TournamentsApi } from './api-client/tournaments.js';
import { tournamentsEndpoints } from './api-client/tournaments.js';
import type { StagesApi } from './api-client/stages.js';
import { stagesEndpoints } from './api-client/stages.js';
import type { SeedingQualificationApi } from './api-client/seeding-qualification.js';
import { seedingQualificationEndpoints } from './api-client/seeding-qualification.js';
import type { RegistrationsApi } from './api-client/registrations.js';
import { registrationsEndpoints } from './api-client/registrations.js';
import type { ScheduleApi } from './api-client/schedule.js';
import { scheduleEndpoints } from './api-client/schedule.js';
import type { TablesApi } from './api-client/tables.js';
import { tablesEndpoints } from './api-client/tables.js';
import type { DisplayTokensApi } from './api-client/display-tokens.js';
import { displayTokensEndpoints } from './api-client/display-tokens.js';
import type { MatchConsoleApiClient } from './api-client/match-console.js';
import { matchConsoleEndpoints } from './api-client/match-console.js';
import type { EndpointDeps } from './api-client/transport.js';

export type {
  InstalledModuleResponse,
  OutdatedModuleResponse,
  InstallModuleRequest,
  InstallModuleResponse,
  RemoveModuleResponse,
  ModuleVerifyResultResponse,
  InstalledDisciplineDocumentResponse,
  AuthoredModuleRequest,
  AuthoredModuleValidationResponse,
  AuthoredModuleValidationFailureResponse,
  AuthoredModuleSubmitRequest,
  AuthoredModuleSubmitResponse,
} from './api-client/modules.js';
export type {
  OrganizationResponse,
  UpdateOrganizationSettingsRequest,
  OrganizationStorageUsageResponse,
  UnreferencedObjectResponse,
  StatisticsRebuildResponse,
  OrganizationRole,
  OrganizationMemberStatus,
  GrantableRole,
  OrganizationRoleResponse,
  InviteOrganizationUserRequest,
  ChangeOrganizationRoleRequest,
  InvitationResponse,
  PendingOrganizationInvitationResponse,
  MyOrganizationResponse,
  AuditRecordResponse,
  AuditTrailResponse,
  GrantableRolesResponse,
  InstallationSuperAdminResponse,
  CreateSuperAdminRequest,
  ChangeInstallationRoleStatusRequest,
} from './api-client/organizations.js';
export type {
  ClubResponse,
  CreateClubRequest,
  UpdateClubRequest,
  ClubMemberResponse,
  CreateClubMemberRequest,
  UpdateClubMemberRequest,
  ClubTeamResponse,
  CreateClubTeamRequest,
  SubmitClubRegistrationRequest,
  ClubRegistrationResponse,
  UploadImageRequest,
  VenueResponse,
  CreateVenueRequest,
  UpdateVenueRequest,
  OfficialRole,
  OfficialResponse,
  CreateOfficialRequest,
  UpdateOfficialRequest,
} from './api-client/clubs-venues-officials.js';
export type {
  ScheduleSlotResponse,
  ScheduleDetailResponse,
  ScheduleDeletionResponse,
  CreateScheduleRequest,
  UpdateScheduleRequest,
  TimeWindowDto,
  ScheduleReasonDto,
  ScheduleReasonPreset,
  ScheduleAssignmentDto,
  ScheduleAssignmentResponse,
  RestRuleDto,
  ScheduleRequest,
  ScheduleConflictDto,
  SchedulePreviewResponse,
  RecentScheduleReasonsResponse,
  ScheduleResponse,
  MatchStreamUrlResponse,
} from './api-client/schedule.js';
export type {
  FixtureMatchResponse,
  FixtureSeriesResponse,
  FixtureResponse,
  StageFixturesResponse,
  TiebreakTraceResponse,
  ZoneResponse,
  NextRoundRequest,
  ZoneConfigurationRequest,
  GroupResponse,
  RenameRequest,
  StageResponse,
  StageDeletionResponse,
  UpdateStageRequest,
  StageConfigurationResponse,
  StageConfigurationRequest,
  MutationFieldPreview,
  MutationPreviewResponse,
  CreateZoneOrGroupRequest,
  DrawConstraintRequest,
  DrawZonesRequest,
  DrawGroupsRequest,
  DrawAssignmentResponse,
  DrawPreviewResponse,
  ConfirmZoneDrawResponse,
  ConfirmGroupDrawResponse,
  ManualZoneAssignmentRequest,
  ManualGroupAssignmentRequest,
  ManualZoneAssignmentResponse,
  ManualGroupAssignmentResponse,
  PromotionBandRequest,
  SavePromotionPlanRequest,
  PromotionPlanResponse,
  QualifiedEntrantResponse,
  PromotionPreviewResponse,
  TargetingPromotionPreviewResponse,
} from './api-client/stages.js';
export type {
  DisplayTokenResponse,
  IssueDisplayTokenRequest,
  DisplayTokenIssuedResponse,
} from './api-client/display-tokens.js';
export type {
  ParticipantReportResponse,
  ReviewReportRequest,
  TeamMemberResponse,
  RegistrationResponse,
  PersonResponse,
  CreatePersonRequest,
  CreateTeamRequest,
  UpdatePersonIdentityRequest,
  UpdateTeamIdentityRequest,
  PersonIdentityResponse,
  TeamIdentityResponse,
  LinkParticipantIdentityRequest,
  ParticipantIdentityLinkResponse,
  BulkReviewRequest,
  ReviewRegistrationRequest,
  SetEntrantAbbreviationRequest,
  BulkReviewResponse,
  CreateCsvImportRequest,
  CsvImportPreviewResponse,
} from './api-client/registrations.js';
export type {
  MatchConsoleApiClient,
  MatchConsoleStream,
  MatchCapability,
  ConsoleSegment,
  ConsoleTimer,
  ConsoleMatchEvent,
  ConsoleEventDefinition,
  ConsoleSecondaryActorField,
  ConsoleLiveScore,
  ConsoleRosterMember,
  ConsoleEntrant,
  ConsoleRoster,
  RosterCandidate,
  ConsoleRosterRole,
  ConsoleAddableSegment,
  ConsoleSegmentPlan,
  MatchConsoleResponse,
  SegmentClockCommand,
  ClockAdjustmentRequest,
  SetMatchRosterMemberRequest,
  SetMatchRosterRequest,
  RecordMatchEventRequest,
  RecordedMatchEventResponse,
  FinalizeMatchRequest,
  MatchStateResponse,
  BulkLoadRosterMemberInput,
  BulkLoadRosterInput,
  BulkLoadSegmentInput,
  BulkLoadEventInput,
  BulkLoadMatchDataRequest,
  BulkLoadMatchDataResponse,
} from './api-client/match-console.js';
export type {
  TableLayoutSummaryResponse,
  TableCellResponse,
  TableRowResponseData,
  TableColumnResponseData,
  TableSortRuleResponse,
  TableProjectionResponseData,
} from './api-client/tables.js';
export type {
  SeedingZoneResponse,
  SeedingResponse,
  QualifierSeedResponse,
  SeedingQualifierZoneResponse,
  PublishSeedingRequest,
  QualificationPositionResponse,
  QualificationIncompleteMatchResponse,
  QualificationTieResponse,
  QualificationPreviewResponse,
  ConfirmQualificationRequest,
  ConfirmQualificationResponse,
  SeedingClassificationResponse,
} from './api-client/seeding-qualification.js';
export type {
  TournamentSettingsResponse,
  TournamentSettingsRequest,
  RulesetOverridesResponse,
  RulesetOverridesRequest,
  CreateTournamentRequest,
  CreateTournamentStageRequest,
  CreateTournamentZoneRequest,
  StageGroupConfigurationDeclaration,
  SeriesResolutionClass,
  SeriesDeclaration,
  SeriesAccountingGrain,
  StageAllocationDeclaration,
  EntrantAttributeKeysResponse,
  HookScriptAttachment,
  RegistryParameterDefinition,
  HookVocabularyEntry,
  HookScriptVocabulary,
  TournamentResponse,
  TournamentConfigurationExportResponse,
} from './api-client/tournaments.js';
export {
  personPhotoUrl,
  clubEmblemUrl,
  organizationEmblemUrl,
  tournamentEmblemUrl,
} from './api-client/media-urls.js';
export { ControlApiError, controlApiErrorFromResponse } from './api-client/transport.js';

export interface ControlApiClient
  extends
    OrganizationsApi,
    ModulesApi,
    ClubsVenuesOfficialsApi,
    TournamentsApi,
    StagesApi,
    SeedingQualificationApi,
    RegistrationsApi,
    ScheduleApi,
    TablesApi,
    DisplayTokensApi {}

export function createControlApiClient(input: {
  readonly fetch: typeof fetch;
  readonly baseUrl?: string;
}): ControlApiClient & MatchConsoleApiClient {
  const origin = input.baseUrl ?? '';
  const baseUrl = `${origin}${API_PATH_PREFIX}`;
  const deps: EndpointDeps = { fetch: input.fetch, baseUrl, origin };

  return {
    ...organizationsEndpoints(deps),
    ...modulesEndpoints(deps),
    ...clubsVenuesOfficialsEndpoints(deps),
    ...tournamentsEndpoints(deps),
    ...stagesEndpoints(deps),
    ...seedingQualificationEndpoints(deps),
    ...registrationsEndpoints(deps),
    ...scheduleEndpoints(deps),
    ...tablesEndpoints(deps),
    ...displayTokensEndpoints(deps),
    ...matchConsoleEndpoints(deps),
  };
}
