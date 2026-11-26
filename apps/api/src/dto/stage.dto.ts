import { Type } from 'class-transformer';
import { IsInt, IsObject, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SUPPORTED_LANGUAGES, type LocalizedLabel } from '@copalibre/domain';
import {
  StageGroupConfigurationRequest,
  SeriesDeclarationRequest,
  StageAllocationRequest,
} from './tournament.dto.js';

export const localizedLabelOneOf = [
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

/** Same shape as `RulesetOverridesRequest`/`Response`, one layer down: a stage's own overrides. */
export class StageConfigurationRequest {
  @IsObject()
  @ApiProperty({
    type: Object,
    description:
      'Dot-path → new value for each stage-configuration override field to change. Refused once the ' +
      'stage already holds a generated fixture.',
    example: { 'segments.overtimeEnabled': true },
  })
  overrides!: Record<string, unknown>;

  @IsOptional()
  @ValidateNested()
  @Type(() => StageGroupConfigurationRequest)
  @ApiPropertyOptional({ type: () => StageGroupConfigurationRequest, nullable: true })
  groupConfiguration?: StageGroupConfigurationRequest | null;
}

export class StageConfigurationResponse {
  @ApiProperty({
    type: Object,
    description: 'The full stage-configuration override document, not only the changed fields.',
  })
  overrides!: Record<string, unknown>;

  @ApiPropertyOptional({ type: () => StageGroupConfigurationRequest })
  groupConfiguration?: StageGroupConfigurationRequest;
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
  @ApiPropertyOptional({ type: StageGroupConfigurationRequest })
  groupConfiguration?: StageGroupConfigurationRequest;
}

export class NextRoundRequest {
  @IsOptional()
  @IsInt()
  @Min(1)
  @ApiPropertyOptional({
    description:
      'The 1-based number of the zone to generate the next round for. Required when the stage has more than one zone; ' +
      'a stage with a single zone needs no value. Rounds, pairings and results are per zone.',
    example: 2,
  })
  zoneNumber?: number;
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

  @ApiPropertyOptional({
    type: StageAllocationRequest,
    description: 'Absent when this stage declares no allocation.',
  })
  allocation?: StageAllocationRequest;

  @ApiPropertyOptional({
    description:
      'Whether this stage already holds a generated fixture. Present on the list read only — ' +
      '`create`/`update`/`remove` do not compute it.',
  })
  seeded?: boolean;

  @ApiPropertyOptional({
    isArray: true,
    description:
      "The tournament's discipline-declared formats to choose from. Present on the list read " +
      'only — `create`/`update`/`remove` do not compute it.',
    example: ['single-elimination', 'round-robin'],
  })
  availableFormats?: string[];

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { oneOf: localizedLabelOneOf },
    description:
      "The discipline's own explanation of a format it supports, keyed by format. Present on " +
      'the list read only — `create`/`update`/`remove` do not compute it.',
    example: { 'round-robin': 'Every entrant plays every other entrant once' },
  })
  formatDescriptions?: Readonly<Record<string, string | LocalizedLabel>>;
}

export class DeleteStageRequest {
  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Must exactly match the current stage name for deletion.' })
  confirmationName?: string;
}

export class StageDeletionResponse {
  @ApiProperty({ format: 'uuid' })
  stageId!: string;

  @ApiProperty({ example: 'Fase de grupos' })
  stageName!: string;

  @ApiProperty({ description: 'True when this response only previews the deletion.' })
  dryRun!: boolean;

  @ApiProperty({ description: 'True after the stage and its records were removed.' })
  success!: boolean;

  @ApiProperty({ description: 'Fixtures that will be or were removed.' })
  fixtures!: number;

  @ApiProperty({ description: 'Matches and their results that will be or were removed.' })
  matches!: number;

  @ApiProperty({ description: 'Zones that will be or were removed.' })
  zones!: number;

  @ApiProperty({ description: 'Groups that will be or were removed.' })
  groups!: number;

  @ApiProperty({ description: 'Recorded match events that will be or were removed.' })
  matchEvents!: number;

  @ApiProperty({ description: 'Schedule placements that will be or were removed.' })
  schedulePlacements!: number;

  @ApiProperty({ description: 'Match official assignments that will be or were removed.' })
  scheduleOfficials!: number;

  @ApiProperty({ description: 'Participant reports that will be or were removed.' })
  participantReports!: number;

  @ApiProperty({ description: 'Report evidence references that will be or were removed.' })
  reportEvidence!: number;

  @ApiProperty({ description: 'Statistics and standings records that will be or were removed.' })
  statistics!: number;

  @ApiProperty({ description: 'Match-operation permissions that will be or were removed.' })
  matchPermissions!: number;

  @ApiProperty({ description: 'Match-scoped display tokens that will be or were revoked.' })
  displayTokens!: number;

  @ApiProperty({ description: 'Stage configurations that will be or were removed.' })
  stageConfigurations!: number;

  @ApiProperty({ description: 'Compiled rulesets that will be or were removed.' })
  compiledRulesets!: number;

  @ApiProperty({ description: 'Threshold counters that will be or were removed.' })
  thresholdConsumption!: number;

  @ApiProperty({ description: 'Promotion plans that will be or were removed.' })
  promotionPlans!: number;

  @ApiProperty({ description: 'Idempotent command records that will be or were removed.' })
  commandRecords!: number;
}

/** A partial edit — rename is always permitted; a format change is refused once the stage holds a fixture. */
export class UpdateStageRequest {
  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ example: 'Fase de grupos (corregida)' })
  name?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({
    description:
      'Refused once the stage already holds a generated fixture. Validated against the ' +
      "tournament's discipline descriptor.",
    example: 'round-robin',
  })
  format?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => StageAllocationRequest)
  @ApiPropertyOptional({
    type: StageAllocationRequest,
    description:
      'Replaces this stage’s declared allocation. Absent leaves it unchanged; there is no way ' +
      'to clear a declared allocation back to none through this endpoint.',
  })
  allocation?: StageAllocationRequest;
}
