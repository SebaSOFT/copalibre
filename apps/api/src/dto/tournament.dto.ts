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
import { ProfileRefResponse } from './organization-account.dto.js';

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

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Object storage ID of the tournament emblem, when one has been uploaded.',
  })
  emblemObjectId?: string;
}

/**
 * A tournament's editable settings — name plus the `registration.*` fields
 * every discipline descriptor already classifies. Used as both the current
 * state a settings screen reads and the shape it writes back.
 */
export class TournamentSettingsResponse {
  @ApiProperty({ example: 'Copa Verano' })
  name!: string;

  @ApiPropertyOptional({
    description: 'Geographic or administrative region for tournament registration.',
    example: 'South America',
  })
  region?: string;

  @ApiPropertyOptional({
    description: 'Maximum number of participants/entrants for the tournament.',
    example: 16,
  })
  capacity?: number;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Optional instant when checked-in team memberships stop being editable.',
  })
  checkInClosesAt?: string;

  @ApiPropertyOptional({
    description: 'Object id of the tournament emblem image asset.',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  emblemObjectId?: string;

  @ApiProperty({
    description:
      'Whether the organizer has flagged this tournament as featured on the organization’s public ' +
      'page. Independent of whether it is live.',
  })
  featured!: boolean;

  @ApiPropertyOptional({
    description:
      "Minimum minutes between the end of one of an entrant's matches and the start of their " +
      'next, checked whenever matches are scheduled. Absent declares no rest rule.',
    example: 120,
  })
  minimumRestMinutes?: number;

  @ApiProperty({
    description: 'Whether the organizer has marked this tournament as including minors.',
    default: false,
  })
  includesMinors!: boolean;

  @ApiProperty({
    description: 'Whether player profiles are public when the tournament includes minors.',
    default: false,
  })
  showYouthProfiles!: boolean;
}

/** A partial edit — every field is optional, so only the fields the operator actually changed are sent. */
export class TournamentSettingsRequest {
  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ example: 'Copa Verano (corregida)' })
  name?: string;

  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional({
    description: 'Whether participants in this tournament include minors.',
    default: false,
  })
  includesMinors?: boolean;

  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional({
    description:
      'Allows public profiles for youth participants. Requires includesMinors to be true.',
    default: false,
  })
  showYouthProfiles?: boolean;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({
    description: 'Geographic or administrative region for tournament registration.',
    example: 'South America',
  })
  region?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @ApiPropertyOptional({
    description: 'Maximum number of participants/entrants for the tournament.',
    example: 16,
  })
  capacity?: number;

  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional({
    description:
      'Flags the tournament as featured on the organization’s public page. A record field like ' +
      '`name`, not a ruleset override: it carries no competition meaning and is not ' +
      'mutation-classified against the discipline descriptor.',
  })
  featured?: boolean;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Optional instant when checked-in team memberships stop being editable.',
  })
  checkInClosesAt?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description:
      "Minimum minutes between an entrant's matches, read by every schedule preview and publish. " +
      '`null` clears it. A scheduling rule, not a ruleset override: always `safe`, and it moves ' +
      'no placement.',
    example: 120,
  })
  minimumRestMinutes?: number | null;
}

/**
 * Dot-path → new value for a tournament ruleset's override fields (`scoring.pointsPerWin`,
 * `tiebreakers`, `winCondition`, ...) — every field the installed `DisciplineDescriptor` marks
 * `replaced` or `merged`, classified by `evaluateMutation` before it is applied. `customScripts` and
 * `registration.capacity` are excluded: they keep their own dedicated routes (`PUT .../custom-scripts`,
 * `PUT .../settings`), which already carry field-specific validation this generic route does not.
 */
export class RulesetOverridesRequest {
  @IsObject()
  @ApiProperty({
    type: Object,
    description:
      'Dot-path → new value for each ruleset override field to change. Only the named fields are ' +
      'touched; every other stored override is left unchanged.',
    example: { 'scoring.pointsPerWin': 4 },
  })
  overrides!: Record<string, unknown>;
}

export class RulesetOverridesResponse {
  @ApiProperty({
    type: Object,
    description: 'The full override document after applying the edit, not only the changed fields.',
  })
  overrides!: Record<string, unknown>;

  @ApiProperty({
    type: Object,
    additionalProperties: true,
    description:
      "The installed discipline's field policies for every overridable field (permission, " +
      'mutation class, and optional label/description) — context for explaining what each override ' +
      'field means and how changing it behaves, never a second override-application path.',
  })
  fieldPolicies!: Record<string, unknown>;

  @ApiProperty({
    type: Object,
    additionalProperties: true,
    description: "The installed discipline's own default configuration tree, before any override.",
  })
  disciplineDefaults!: Record<string, unknown>;
}

export class StageGroupConfigurationRequest {
  @IsInt()
  @Min(2)
  @ApiProperty({ minimum: 2, example: 4 })
  groupCount!: number;

  @IsInt()
  @Min(2)
  @ApiProperty({ minimum: 2, example: 5 })
  groupSize!: number;

  @IsIn(['balanced', 'exact-size', 'overflow-last', 'manual'])
  @ApiProperty({ enum: ['balanced', 'exact-size', 'overflow-last', 'manual'] })
  distribution!: 'balanced' | 'exact-size' | 'overflow-last' | 'manual';

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @ApiPropertyOptional({ type: [Number], minItems: 2, example: [4, 5, 5, 4] })
  readonly manualGroupSizes?: readonly number[];
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

  @ApiPropertyOptional({
    description:
      "A `{{paramName}}`-placeholder sentence naming this entry's own authored parameters, for " +
      'rendering a configured rule in plain language. Absent entries render as `type — description`.',
    example: '{{statistic}} crosses {{threshold}}',
  })
  phraseTemplate?: string;
}

export class HookScriptVocabularyResponse {
  @ApiProperty({ type: [String], enum: ['event.recorded'] })
  hooks!: readonly string[];

  @ApiProperty({ type: [RegistryEntryResponse] })
  entries!: readonly RegistryEntryResponse[];
}

/** Backs weighted allocation's attribute picker — see `StageAllocationRequest`. */
export class EntrantAttributeKeysResponse {
  @ApiProperty({
    type: [String],
    description:
      'Distinct entrant-attribute keys recorded anywhere in this tournament, sorted. Empty ' +
      'when no entrant carries any attribute yet.',
    example: ['rating', 'seed-rank'],
  })
  keys!: readonly string[];
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

/** Mirrors the domain's `StageAllocation` union (`automatic` | `manual` | `weighted`). */
export class StageAllocationRequest {
  @IsIn(['automatic', 'manual', 'weighted'])
  @ApiProperty({
    enum: ['automatic', 'manual', 'weighted'],
    description:
      'Where this stage’s seed order comes from: the prior stage’s qualification cut ' +
      '(automatic), an operator’s explicit placement (manual), or a numeric entrant attribute ' +
      '(weighted).',
    example: 'automatic',
  })
  mode!: 'automatic' | 'manual' | 'weighted';

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({
    description: 'Required when mode is "weighted": the entrant attribute key to rank on.',
    example: 'rating',
  })
  attributeKey?: string;

  @IsOptional()
  @IsIn(['higher-first', 'lower-first'])
  @ApiPropertyOptional({
    enum: ['higher-first', 'lower-first'],
    description: 'Required when mode is "weighted": never inferred from the attribute’s values.',
    example: 'higher-first',
  })
  direction?: 'higher-first' | 'lower-first';
}

/** One zone of a stage declared at creation time — see `CreateTournamentStageRequest.zones`. */
export class CreateTournamentZoneRequest {
  @IsString()
  @ApiProperty({ description: 'Unique within its stage.', example: 'Copa Oro' })
  name!: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({
    description:
      'The zone’s own format. Absent: the zone plays its stage’s. Must be a format the ' +
      'tournament’s discipline offers.',
    example: 'round-robin',
  })
  format?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => SeriesDeclarationRequest)
  @ApiPropertyOptional({
    type: SeriesDeclarationRequest,
    description:
      'The zone’s own series. Absent: the zone inherits its stage’s, then the tournament’s.',
  })
  series?: SeriesDeclarationRequest;
}

/** One stage of a tournament declared at creation time — see `CreateTournamentRequest.stages`. */
export class CreateTournamentStageRequest {
  @IsOptional()
  @IsInt()
  @ApiPropertyOptional({
    description: 'Defaults to this stage’s 1-based position within `stages`.',
    example: 1,
  })
  number?: number;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Defaults to "Stage {number}".', example: 'Fase de grupos' })
  name?: string;

  @IsString()
  @ApiProperty({ example: 'round-robin' })
  format!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => SeriesDeclarationRequest)
  @ApiPropertyOptional({
    type: SeriesDeclarationRequest,
    description:
      'Declares this stage’s crosses as multi-match series. Absent stays the default: no ' +
      'series, a single match per cross.',
  })
  series?: SeriesDeclarationRequest;

  @IsOptional()
  @ValidateNested()
  @Type(() => StageAllocationRequest)
  @ApiPropertyOptional({
    type: StageAllocationRequest,
    description:
      'Where this stage’s seed order comes from. Absent leaves the caller to supply seeds ' +
      'explicitly when opening the stage’s seeding view.',
  })
  allocation?: StageAllocationRequest;

  @IsOptional()
  @ValidateNested()
  @Type(() => StageGroupConfigurationRequest)
  @ApiPropertyOptional({ type: () => StageGroupConfigurationRequest })
  groupConfiguration?: StageGroupConfigurationRequest;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTournamentZoneRequest)
  @ApiPropertyOptional({
    type: [CreateTournamentZoneRequest],
    description:
      'The stage’s zones, numbered by list position. Absent creates none. Entrants are assigned ' +
      'to zones afterwards.',
  })
  zones?: CreateTournamentZoneRequest[];
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

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTournamentStageRequest)
  @ApiProperty({
    type: [CreateTournamentStageRequest],
    description:
      'Every stage of the tournament, in order. At least one is required — a tournament with ' +
      'one stage is the common case, declared the same way as a multi-stage one.',
  })
  stages!: CreateTournamentStageRequest[];

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
  @IsBoolean()
  @ApiPropertyOptional({
    description:
      'Whether participants include minors. Public youth profiles remain hidden unless explicitly enabled in tournament settings.',
  })
  includesMinors?: boolean;

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
  @IsObject()
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description:
      'Dot-path → override value for any discipline-declared ruleset field beyond format/' +
      'registration.* (already captured by their own dedicated fields above). Merged into the ' +
      "tournament's initial ruleset alongside those fixed fields; a value rejected by its field " +
      'policy fails the entire creation.',
    example: { 'scoring.pointsPerWin': 4 },
  })
  ruleOverrides?: Readonly<Record<string, unknown>>;
}
