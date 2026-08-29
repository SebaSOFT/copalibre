import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  SUPPORTED_LANGUAGES,
  type LocalizedLabel,
  type SupportedLanguage,
} from '@copalibre/domain';

const localizedLabelOneOf = [
  { type: 'string' as const, minLength: 1 },
  {
    type: 'object' as const,
    required: ['en'],
    additionalProperties: false,
    properties: Object.fromEntries(
      SUPPORTED_LANGUAGES.map((language) => [language, { type: 'string', minLength: 1 }]),
    ),
  },
];

/** Wire DTOs are camelCase, per the naming-conventions casing rule. */
export class OrganizationResponse {
  @ApiProperty({ format: 'uuid', description: 'UUIDv7 identifier' })
  organizationId!: string;

  @ApiProperty({
    description: 'Human-readable, URL-safe alias; globally unique per installation',
    example: 'liga-orbital',
  })
  alias!: string;

  @ApiProperty({ example: 'Liga Orbital' })
  name!: string;

  @ApiProperty({
    enum: SUPPORTED_LANGUAGES,
    description: 'Presentation-layer default interface language; never reinterprets stored data',
    example: 'es',
  })
  primaryLanguage!: SupportedLanguage;

  @ApiProperty({
    description: 'IANA time zone identifier; presentation-layer default only',
    example: 'America/Argentina/San_Juan',
  })
  timezone!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'object_metadata.object_id of the emblem' })
  emblemObjectId?: string;
}

export class CreateOrganizationRequest {
  @IsString()
  @ApiProperty({
    description: 'Lowercase kebab-case alias, unique per installation',
    example: 'liga-orbital',
  })
  alias!: string;

  @IsString()
  @ApiProperty({ example: 'Liga Orbital' })
  name!: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({
    enum: SUPPORTED_LANGUAGES,
    description:
      'Defaults to "es" (matches this installation\'s current default behavior) when omitted',
    example: 'es',
  })
  primaryLanguage?: string;

  @ApiPropertyOptional({
    description: 'IANA time zone identifier; defaults to "UTC" when omitted',
    example: 'America/Argentina/San_Juan',
  })
  @IsOptional()
  @IsString()
  timezone?: string;
}

export class MyOrganizationResponse {
  @ApiProperty({ format: 'uuid' })
  organizationId!: string;

  @ApiProperty({
    description: 'Human-readable, URL-safe alias; globally unique per installation',
    example: 'liga-orbital',
  })
  organizationAlias!: string;

  @ApiProperty({ example: 'Liga Orbital' })
  organizationName!: string;

  @ApiProperty({
    enum: ['admin', 'club-admin', 'referee', 'broadcaster', 'viewer'],
    description: "The caller's active role in this organization",
  })
  role!: 'admin' | 'club-admin' | 'referee' | 'broadcaster' | 'viewer';
}

export class UpdateOrganizationSettingsRequest {
  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ example: 'Liga Orbital' })
  name?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ enum: SUPPORTED_LANGUAGES, example: 'en' })
  primaryLanguage?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ example: 'America/Argentina/San_Juan' })
  timezone?: string;
}

export class ClubResponse {
  @ApiProperty({ format: 'uuid' })
  clubId!: string;

  @ApiProperty({ format: 'uuid' })
  organizationId!: string;

  @ApiPropertyOptional({
    description: 'Path identifier, unique within the organization.',
    example: 'casa-de-italia',
  })
  alias?: string;

  @ApiProperty({ example: 'Casa de Italia' })
  name!: string;

  @ApiPropertyOptional({ example: 'C I' })
  abbreviation?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'object_metadata.object_id of the emblem' })
  emblemObjectId?: string;
}

export class CreateClubRequest {
  @IsString()
  @ApiProperty({ example: 'Casa de Italia' })
  name!: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({
    description: 'Defaults to a suggestion derived from the name when omitted.',
    example: 'casa-de-italia',
  })
  alias?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ example: 'C I' })
  abbreviation?: string;
}

export class UpdateClubRequest {
  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ example: 'Casa de Italia' })
  name?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ example: 'casa-de-italia' })
  alias?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ example: 'C I' })
  abbreviation?: string;
}

export class BootstrapAdministratorRequest {
  @IsString()
  @ApiProperty({ example: 'liga-orbital' })
  organizationAlias!: string;

  @IsString()
  @ApiProperty({ example: 'Liga Orbital' })
  organizationName!: string;

  @IsString()
  @ApiProperty({ format: 'email', example: 'admin@example.test' })
  email!: string;
}

export class BootstrapAdministratorResponse {
  @ApiProperty({ format: 'uuid' })
  organizationId!: string;

  @ApiProperty({ example: 'liga-orbital' })
  organizationAlias!: string;

  @ApiProperty({ format: 'uuid' })
  invitationId!: string;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;

  @ApiProperty({ format: 'uri', description: 'One-time OIDC invitation setup link.' })
  setupUrl!: string;
}

export class ProfileRefResponse {
  @ApiProperty({ format: 'uuid' })
  profileId!: string;

  @ApiProperty({ example: '1.0.0' })
  version!: string;
}

export class TournamentResponse {
  @ApiProperty({ format: 'uuid' })
  tournamentId!: string;

  @ApiProperty({ format: 'uuid' })
  organizationId!: string;

  @ApiProperty({ description: 'Alias, unique within its organization', example: 'copa-verano' })
  alias!: string;

  @ApiProperty({ example: 'Copa Verano' })
  name!: string;

  @ApiProperty({
    enum: ['draft', 'published', 'started', 'finished', 'archived'],
    description:
      "Once started, the tournament's discipline and profile versions are frozen and its results " +
      'are materialised. Archived is legal only from finished and changes default visibility ' +
      'only — no data is affected.',
  })
  status!: 'draft' | 'published' | 'started' | 'finished' | 'archived';

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'When the first match began, marking the module freeze.',
  })
  startedAt?: string;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'When the tournament was archived; absent until then.',
  })
  archivedAt?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Active ruleset version, when one exists' })
  rulesetId?: string;

  @ApiPropertyOptional({
    type: ProfileRefResponse,
    description: 'Profile this tournament instantiated, when one was selected at creation.',
  })
  profileRef?: ProfileRefResponse;
}

export class HookScriptAttachmentRequest {
  @IsString()
  @ApiProperty({ enum: ['event.recorded'] })
  hook!: string;

  @IsObject()
  @ApiProperty({ type: Object, description: 'Neuron-JS rule script document' })
  script!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  description?: string;
}

export class TournamentCustomScriptsResponse {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HookScriptAttachmentRequest)
  @ApiProperty({ type: [HookScriptAttachmentRequest] })
  customScripts!: readonly HookScriptAttachmentRequest[];
}

export class RegistryParameterDefinitionResponse {
  @ApiProperty()
  name!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty()
  required!: boolean;

  @ApiProperty({ type: [String] })
  parameterTypes!: readonly string[];

  @ApiProperty()
  allowExpression!: boolean;

  @ApiProperty({ type: Object })
  valueSchema!: Record<string, unknown>;
}

export class RegistryAuthoringDefinitionResponse {
  @ApiPropertyOptional({ type: [RegistryParameterDefinitionResponse] })
  parameters?: readonly RegistryParameterDefinitionResponse[];

  @ApiPropertyOptional({ type: Object })
  optionsSchema?: Record<string, unknown>;

  @ApiPropertyOptional({ type: Object })
  valueSchema?: Record<string, unknown>;

  @ApiPropertyOptional()
  allowExpression?: boolean;
}

export class RegistryEntryResponse {
  @ApiProperty({ enum: ['parameter', 'condition', 'action', 'rule'] })
  kind!: string;

  @ApiProperty()
  type!: string;

  @ApiProperty()
  description!: string;

  @ApiPropertyOptional({ type: RegistryAuthoringDefinitionResponse })
  authoring?: RegistryAuthoringDefinitionResponse;
}

export class HookScriptVocabularyResponse {
  @ApiProperty({ type: [String], enum: ['event.recorded'] })
  hooks!: readonly string[];

  @ApiProperty({ type: [RegistryEntryResponse] })
  entries!: readonly RegistryEntryResponse[];
}

/**
 * A series declaration, as authored. Crosses the wire as this typed shape but is
 * persisted as `series.span` / `series.resolutionClass` / `series.neutralGround`
 * entries in an `OverrideSet` — the tournament's ruleset overrides when declared
 * at creation, a stage's `StageConfiguration.overrides` when declared per stage.
 * That is the same dot-path mechanism every other configurable field already uses,
 * so `evaluateMutation` classifies an edit to one without a second vocabulary.
 */
export class SeriesDeclarationRequest {
  @IsInt()
  @Min(2)
  @ApiProperty({
    description: 'Total number of scheduled matches in the series.',
    example: 5,
  })
  span!: number;

  @IsOptional()
  @IsIn(['best-of', 'aggregate', 'points-per-leg'])
  @ApiPropertyOptional({
    description: 'Closed set of declarative resolution classes.',
    enum: ['best-of', 'aggregate', 'points-per-leg'],
    example: 'best-of',
  })
  resolutionClass?: 'best-of' | 'aggregate' | 'points-per-leg';

  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional({
    description: 'Whether the series is held on neutral ground (no home/away side alternation).',
  })
  neutralGround?: boolean;

  @IsOptional()
  @IsIn(['series', 'match'])
  @ApiPropertyOptional({
    description:
      'Whether standings and statistic accounting count one outcome per resolved series or one ' +
      'per played match. Absent accounts per match — the same default an undeclared grain has ' +
      'always meant — and is reported as such by every surface that reads it back.',
    enum: ['series', 'match'],
    example: 'series',
  })
  standingsAccounting?: 'series' | 'match';
}

export class CreateTournamentRequest {
  @IsString()
  @ApiProperty({ example: 'copa-verano' })
  alias!: string;

  @IsString()
  @ApiProperty({ example: 'Copa Verano' })
  name!: string;

  @IsString()
  @ApiProperty({ format: 'uuid', description: 'DisciplineDescriptor identifier' })
  descriptorId!: string;

  @IsString()
  @ApiProperty({
    description:
      'Pinned descriptor version (semver). Rulesets never track "latest": the version a tournament starts on is frozen.',
    example: '1.2.0',
  })
  descriptorVersion!: string;

  @IsString()
  @ApiProperty({ example: 'round-robin' })
  format!: string;

  @IsBoolean()
  @ApiProperty({
    description: 'Whether anonymous/public registration intake is open for this tournament.',
  })
  publicRegistration!: boolean;

  @IsBoolean()
  @ApiProperty({
    description: 'Whether accepted entrants must check in before eligibility is locked.',
  })
  requiresCheckIn!: boolean;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Optional instant when checked-in team memberships stop being editable.',
  })
  checkInClosesAt?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({
    description: 'Geographic or administrative region for tournament registration.',
    example: 'South America',
  })
  region?: string;

  @IsOptional()
  @IsInt()
  @ApiPropertyOptional({
    description: 'Maximum number of participants/entrants for the tournament.',
    example: 16,
  })
  capacity?: number;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Optional TournamentProfile identifier to instantiate multi-stage preset.',
  })
  profileId?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({
    description: 'Optional TournamentProfile version (semver).',
    example: '1.0.0',
  })
  profileVersion?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HookScriptAttachmentRequest)
  @ApiProperty({
    type: [HookScriptAttachmentRequest],
    default: [],
    description: 'Organizer-authored scripts evaluated at supported tournament hooks.',
  })
  customScripts!: HookScriptAttachmentRequest[];

  @IsOptional()
  @ValidateNested()
  @Type(() => SeriesDeclarationRequest)
  @ApiPropertyOptional({
    type: SeriesDeclarationRequest,
    description:
      'Declares this tournament’s crosses as multi-match series by default. Absent stays the ' +
      'default: no series, a single match per cross, requiring no further action.',
  })
  series?: SeriesDeclarationRequest;
}

export class CreateStageRequest {
  @IsOptional()
  @IsInt()
  @ApiPropertyOptional({
    description:
      'Defaults to the tournament’s next sequential stage number. Refused as a conflict if a stage with this number already exists.',
    example: 1,
  })
  number?: number;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Defaults to "Stage {number}".', example: 'Fase de grupos' })
  name?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({
    description:
      'Defaults to the tournament’s own configured format. Validated against the tournament’s discipline descriptor when supplied.',
    example: 'round-robin',
  })
  format?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => SeriesDeclarationRequest)
  @ApiPropertyOptional({
    type: SeriesDeclarationRequest,
    description:
      'Declares this stage’s crosses as multi-match series. Absent stays the default: no series, ' +
      'a single match per cross, requiring no further action.',
  })
  series?: SeriesDeclarationRequest;
}

export class SeriesMutationFieldPreview {
  @ApiProperty({ example: 'series.span' })
  field!: string;

  @ApiPropertyOptional({
    enum: ['safe', 'requires_rebuild', 'blocked_after_results'],
    description: 'Absent when the field is refused outright — see `blocked`.',
  })
  mutationClass?: 'safe' | 'requires_rebuild' | 'blocked_after_results';

  @ApiPropertyOptional({ description: 'Fixtures a `requires_rebuild` change would invalidate.' })
  invalidatedFixtureCount?: number;

  @ApiPropertyOptional({
    description: 'True when this field cannot be changed as proposed; see `reason`.',
  })
  blocked?: boolean;

  @ApiPropertyOptional({
    description: 'Present when `blocked` — names the audited correction workflow.',
  })
  reason?: string;
}

export class SeriesMutationPreviewResponse {
  @ApiProperty({ type: [SeriesMutationFieldPreview] })
  fields!: SeriesMutationFieldPreview[];
}

export class StageResponse {
  @ApiProperty({ format: 'uuid' })
  stageId!: string;

  @ApiProperty({
    format: 'uuid',
    description: 'The tournament edition this stage belongs to',
  })
  seasonId!: string;

  @ApiProperty({ description: '1-based sequential number within the tournament', example: 1 })
  number!: number;

  @ApiProperty({ example: 'Fase de grupos' })
  name!: string;

  @ApiProperty({ example: 'round-robin' })
  format!: string;

  @ApiPropertyOptional({
    type: SeriesDeclarationRequest,
    description: 'Absent when this stage declares no series.',
  })
  series?: SeriesDeclarationRequest;
}

export class ProblemResponse {
  @ApiProperty({ example: 403 })
  statusCode!: number;

  @ApiProperty({ example: 'subject may only act on their own records' })
  message!: string;

  @ApiProperty({ example: 'forbidden' })
  errorCode!: string;
}

export class CreateCsvImportRequest {
  @IsString()
  @ApiProperty({
    enum: ['individual', 'team', 'team-membership'],
    description:
      '"individual"/"team" register a new entrant; "team-membership" attaches each row\'s ' +
      "person onto an already-registered team named by that row's teamAlias — it never " +
      'creates a team.',
  })
  target!: 'individual' | 'team' | 'team-membership';

  @IsString()
  @ApiProperty({
    description: 'UTF-8 CopaLibre participant CSV, limited to 4 MiB.',
    example: 'alias,displayName,naturalKeyKind,naturalKey\\nmaria-perez,Maria Perez,dni,12345678',
  })
  sourceCsv!: string;
}

export class CsvImportPreviewResponse {
  @ApiProperty({ format: 'uuid' })
  importId!: string;
  @ApiProperty({ enum: ['individual', 'team', 'team-membership'] })
  target!: 'individual' | 'team' | 'team-membership';
  @ApiProperty({
    enum: ['queued', 'validating', 'review-ready', 'invalid', 'committing', 'committed'],
  })
  status!: string;
  @ApiProperty({ description: 'SHA-256 source fingerprint used to reject stale confirmation.' })
  sourceHash!: string;
  @ApiPropertyOptional({ type: Object })
  preview?: {
    valid: boolean;
    rows: readonly unknown[];
    errors: readonly unknown[];
  };
}

export class CommitCsvImportRequest {
  @IsString()
  @ApiProperty({ description: 'Source hash returned by the reviewed preview.' })
  sourceHash!: string;
}

export class OrganizationRoleResponse {
  @ApiProperty({ format: 'uuid' })
  assignmentId!: string;
  @ApiProperty({ format: 'uuid', description: 'CopaLibre internal principal UUIDv7' })
  principalId!: string;
  @ApiProperty()
  email!: string;
  @ApiProperty({ enum: ['admin', 'club-admin', 'referee', 'broadcaster', 'viewer'] })
  role!: string;
  @ApiProperty({ enum: ['active', 'inactive'] })
  status!: string;
}

export class InviteOrganizationUserRequest {
  @IsString()
  @ApiProperty({ format: 'email' })
  email!: string;
  @IsString()
  @ApiProperty({ enum: ['admin', 'club-admin', 'referee', 'broadcaster', 'viewer'] })
  role!: 'admin' | 'club-admin' | 'referee' | 'broadcaster' | 'viewer';
  @IsString()
  @ApiProperty({ enum: ['active', 'inactive'] })
  status!: 'active' | 'inactive';
}

export class OrganizationInvitationResponse {
  @ApiProperty({ format: 'uuid' })
  invitationId!: string;
  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;
}

export class ChangeOrganizationRoleRequest {
  @IsString()
  @ApiProperty({ enum: ['admin', 'club-admin', 'referee', 'broadcaster', 'viewer'] })
  role!: 'admin' | 'club-admin' | 'referee' | 'broadcaster' | 'viewer';
  @IsString()
  @ApiProperty({ enum: ['active', 'inactive'] })
  status!: 'active' | 'inactive';
}

export class GrantableRolesResponse {
  @ApiProperty({
    enum: ['super-admin', 'admin', 'club-admin', 'referee', 'broadcaster', 'viewer'],
    isArray: true,
    description:
      'Roles the caller may grant in this organization, per the 0140 role-granting hierarchy.',
  })
  roles!: readonly (
    'super-admin' | 'admin' | 'club-admin' | 'referee' | 'broadcaster' | 'viewer'
  )[];
}

export class InstallationSuperAdminResponse {
  @ApiProperty({ format: 'uuid' })
  assignmentId!: string;
  @ApiProperty({ format: 'uuid', description: 'CopaLibre internal principal UUIDv7' })
  principalId!: string;
  @ApiProperty({ enum: ['active', 'inactive'] })
  status!: string;
}

export class CreateSuperAdminRequest {
  @IsString()
  @ApiProperty({
    format: 'uuid',
    description: 'CopaLibre internal principal UUIDv7 to grant super-admin',
  })
  principalId!: string;
}

export class ChangeInstallationRoleStatusRequest {
  @IsString()
  @ApiProperty({ enum: ['active', 'inactive'] })
  status!: 'active' | 'inactive';
}

export class AcceptInvitationRequest {
  @IsString()
  @ApiProperty({ minLength: 32 })
  token!: string;
}

export class DisciplineSummaryResponse {
  @ApiProperty({ format: 'uuid' })
  descriptorId!: string;

  @ApiProperty({ example: 'orbital-frisbee' })
  alias!: string;

  @ApiProperty({ example: '1.2.0' })
  version!: string;

  @ApiProperty({
    oneOf: localizedLabelOneOf,
    example: 'Fútbol 11',
    description:
      'A plain string, or a locale-keyed object (e.g. { en: "Football", es: "Fútbol" }) for a module authored in more than one language — the client resolves it to the viewer\'s interface language.',
  })
  name!: string | LocalizedLabel;

  @ApiPropertyOptional({
    oneOf: localizedLabelOneOf,
    example: { en: 'Team discipline with timed halves and goal-based scoring' },
    description:
      'Optional plain string or locale-keyed description. The client resolves it with the same fallback as name.',
  })
  description?: string | LocalizedLabel;

  @ApiProperty({
    isArray: true,
    description:
      'Formats this discipline declares it supports. The client filters from this list rather than from its own copy — a hardcoded list is a list that disagrees with the module the day one is added.',
    example: ['single-elimination', 'round-robin'],
  })
  supportedFormats!: string[];

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { oneOf: localizedLabelOneOf },
    description:
      "The discipline's own explanation of a format it supports, keyed by format. Absent for a format the wizard falls back to the platform's own catalogued explanation.",
    example: { 'round-robin': 'Every entrant plays every other entrant once' },
  })
  formatDescriptions?: Readonly<Record<string, string | LocalizedLabel>>;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description:
      "Per-dot-path override permission and mutation class from the discipline's own configuration contract. The wizard reads it to warn an organizer before a hard-to-reverse decision, not to enforce anything client-side.",
    example: {
      format: { permission: { kind: 'replaced' }, mutationClass: 'blocked_after_results' },
    },
  })
  fieldPolicies?: Readonly<Record<string, unknown>>;
}

export class ProfileStageSummaryResponse {
  @ApiProperty({ example: 1 })
  number!: number;

  @ApiProperty({ example: 'Groups' })
  name!: string;

  @ApiProperty({ example: 'round-robin' })
  format!: string;
}

export class TournamentProfileSummaryResponse {
  @ApiProperty({ format: 'uuid' })
  profileId!: string;

  @ApiProperty({ example: 'grupos-y-playoff' })
  alias!: string;

  @ApiProperty({ example: '1.0.0' })
  version!: string;

  @ApiProperty({
    oneOf: localizedLabelOneOf,
    example: 'Groups and playoff',
    description: 'A plain string or localized label for the profile name.',
  })
  name!: string | LocalizedLabel;

  @ApiPropertyOptional({
    oneOf: localizedLabelOneOf,
    example: { en: 'Round-robin groups followed by single elimination' },
    description: 'Optional plain string or localized label for the profile description.',
  })
  description?: string | LocalizedLabel;

  @ApiProperty({
    type: [ProfileStageSummaryResponse],
    description: 'Declared stages in the profile.',
  })
  stages!: ProfileStageSummaryResponse[];
}

export class TeamMemberResponse {
  @ApiProperty({ format: 'uuid' })
  personId!: string;

  @ApiProperty({ example: 'Elías Salomón' })
  displayName!: string;

  @ApiProperty({ enum: ['player', 'substitute', 'coach', 'staff'] })
  role!: 'player' | 'substitute' | 'coach' | 'staff';

  @ApiPropertyOptional({ description: 'ISO 3166-1 alpha-2 country code', example: 'AR' })
  nationality?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'object_metadata.object_id of the photo' })
  photoObjectId?: string;
}

export class RegistrationResponse {
  @ApiProperty({ format: 'uuid' })
  entrantId!: string;

  @ApiProperty({ format: 'uuid' })
  tournamentId!: string;

  @ApiProperty({ enum: ['pending', 'accepted', 'refused', 'withdrawn', 'checked-in'] })
  status!: 'pending' | 'accepted' | 'refused' | 'withdrawn' | 'checked-in';

  @ApiPropertyOptional({ description: 'Tournament-scoped, distinct entrant short label.' })
  abbreviation?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  teamId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  personId?: string;

  @ApiPropertyOptional({
    description: 'The person entrant’s display name — absent for a team entrant.',
    example: 'Elías Salomón',
  })
  displayName?: string;

  @ApiPropertyOptional({ description: 'ISO 3166-1 alpha-2 country code', example: 'AR' })
  nationality?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'object_metadata.object_id of the photo' })
  photoObjectId?: string;

  @ApiPropertyOptional({
    isArray: true,
    type: TeamMemberResponse,
    description:
      'The team entrant’s resulting membership. Populated only by a team-membership edit response.',
  })
  teamMembers?: TeamMemberResponse[];
}

export class EditTeamMembershipsRequest {
  @IsArray()
  @IsString({ each: true })
  @ApiProperty({
    isArray: true,
    format: 'uuid',
    description:
      'The team’s full desired membership. Anyone currently a member but not named here is removed.',
  })
  personIds!: string[];
}

export class ParticipantTeamMembershipResponse {
  @ApiProperty({ format: 'uuid' })
  playerId!: string;
  @ApiProperty({ format: 'uuid' })
  teamId!: string;
  @ApiProperty()
  teamName!: string;
  @ApiProperty()
  role!: string;
}

export class ParticipantReportedResultResponse {
  @ApiProperty({ format: 'uuid' })
  matchId!: string;
  @ApiProperty({ format: 'uuid' })
  entrantId!: string;
  @ApiProperty()
  status!: string;
  @ApiProperty({ nullable: true, type: Object })
  result!: Record<string, unknown> | null;
}

export class LinkParticipantIdentityRequest {
  @IsString()
  @ApiProperty({ format: 'email' })
  email!: string;
}

export class ParticipantIdentityLinkResponse {
  @ApiProperty({ format: 'uuid' })
  principalId!: string;
  @ApiProperty({ format: 'uuid' })
  personId!: string;
}

export class ReviewRegistrationRequest {
  @IsString()
  @ApiProperty({ enum: ['accepted', 'refused', 'withdrawn'] })
  decision!: 'accepted' | 'refused' | 'withdrawn';

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({
    description:
      'Recorded on the audit row. A refusal an entrant cannot be told about is one they will ask about.',
  })
  reason?: string;
}

export class SetEntrantAbbreviationRequest {
  @IsString()
  @ApiProperty({
    example: 'CDI',
    description: 'Uppercase short label, unique within this tournament.',
  })
  abbreviation!: string;
}

export class BulkReviewRequest {
  @IsArray()
  @IsString({ each: true })
  @ApiProperty({ isArray: true, format: 'uuid' })
  entrantIds!: string[];

  @IsString()
  @ApiProperty({ enum: ['accepted', 'refused', 'withdrawn'] })
  decision!: 'accepted' | 'refused' | 'withdrawn';

  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  reason?: string;
}

export class BulkReviewResponse {
  @ApiProperty({ isArray: true, type: RegistrationResponse })
  applied!: RegistrationResponse[];

  @ApiProperty({
    isArray: true,
    description: 'Registrations left untouched, each with the reason — never silently skipped.',
  })
  refused!: { entrantId: string; reason: string }[];
}

export class OrganizationStorageUsageResponse {
  @ApiProperty({
    description: 'Total bytes of stored objects in passed status',
    example: 148897792,
  })
  totalBytes!: number;

  @ApiProperty({ description: 'Total number of stored objects in passed status', example: 38 })
  objectCount!: number;
}
