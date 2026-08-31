import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDefined,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class ZoneResponse {
  @ApiProperty({ format: 'uuid' })
  zoneId!: string;

  @ApiProperty({ format: 'uuid' })
  stageId!: string;

  @ApiProperty({ description: '1-based zone number within the stage', example: 1 })
  number!: number;

  @ApiProperty({ example: 'Zona 1' })
  name!: string;
}

export class GroupResponse {
  @ApiProperty({ format: 'uuid' })
  groupId!: string;

  @ApiProperty({ format: 'uuid' })
  zoneId!: string;

  @ApiProperty({ description: '1-based group number within the zone', example: 1 })
  number!: number;

  @ApiProperty({ example: 'Grupo 1' })
  name!: string;
}

/** Shared by a zone's and a group's rename endpoint — the only field either edits. */
export class RenameRequest {
  @ApiProperty({ example: 'Zona Norte (corregida)' })
  @IsString()
  name!: string;
}

export class CreateZoneRequest {
  @ApiPropertyOptional({ description: 'Defaults to the next 1-based zone number', example: 1 })
  @IsOptional()
  @IsNumber()
  number?: number;

  @ApiProperty({ example: 'Zona Norte' })
  @IsString()
  name!: string;
}

export class CreateGroupRequest {
  @ApiPropertyOptional({ description: 'Defaults to the next 1-based group number', example: 1 })
  @IsOptional()
  @IsNumber()
  number?: number;

  @ApiProperty({ example: 'Grupo A' })
  @IsString()
  name!: string;
}

export class DrawConstraintRequest {
  @ApiProperty({ enum: ['separation', 'distribution', 'script'] })
  @IsIn(['separation', 'distribution', 'script'])
  kind!: string;

  @ApiProperty({ description: 'Constraint hook point', example: 'draw.assign-group' })
  @IsString()
  hook!: string;

  @ApiPropertyOptional({ example: 'region' })
  @IsOptional()
  @IsString()
  attribute?: string;

  @ApiPropertyOptional({
    description: 'For separation: "group" or an object with beforeRound',
    oneOf: [
      { type: 'string', enum: ['group'] },
      {
        type: 'object',
        properties: { beforeRound: { type: 'string', example: 'quarter-final' } },
        required: ['beforeRound'],
      },
    ],
  })
  @IsOptional()
  scope?: string | { beforeRound: string };

  @ApiPropertyOptional({ example: 'san-juan' })
  @IsOptional()
  @IsString()
  value?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  min?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  max?: number;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  script?: Record<string, unknown>;
}

export class DrawZonesRequest {
  @ApiProperty({ minimum: 1, example: 4 })
  @IsInt()
  zoneCount!: number;

  @ApiProperty({ description: 'Deterministic draw seed', example: 99 })
  @IsInt()
  seed!: number;

  @ApiPropertyOptional({ type: DrawConstraintRequest, isArray: true })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DrawConstraintRequest)
  constraints?: DrawConstraintRequest[];
}

export class DrawGroupsRequest {
  @ApiProperty({ minimum: 1, example: 4 })
  @IsInt()
  groupCount!: number;

  @ApiProperty({ description: 'Deterministic draw seed', example: 99 })
  @IsInt()
  seed!: number;

  @ApiPropertyOptional({ type: DrawConstraintRequest, isArray: true })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DrawConstraintRequest)
  constraints?: DrawConstraintRequest[];
}

export class DrawAssignmentResponse {
  @ApiProperty({
    description: 'Accepted entrant UUID mapped to its 1-based zone or group number',
    type: 'object',
    additionalProperties: { type: 'number' },
  })
  @IsObject()
  groups!: Record<string, number>;
}

export class DrawPreviewResponse {
  @ApiProperty({ type: DrawAssignmentResponse })
  assignment!: DrawAssignmentResponse;

  @ApiProperty()
  seed!: number;

  @ApiProperty({ description: 'Search steps taken by the deterministic draw' })
  steps!: number;
}

export class ConfirmZoneDrawResponse extends DrawPreviewResponse {
  @ApiProperty({ type: ZoneResponse, isArray: true })
  zones!: ZoneResponse[];
}

export class ConfirmGroupDrawResponse extends DrawPreviewResponse {
  @ApiProperty({ type: GroupResponse, isArray: true })
  groups!: GroupResponse[];
}

/**
 * Manual placement's own request/response shapes — deliberately not
 * `DrawPreviewResponse`'s subtypes: a manually placed assignment has no
 * seed or search-step count, both meaningless for an operator-chosen
 * placement rather than a deterministic draw.
 */
export class ManualZoneAssignmentRequest {
  @ApiProperty({ type: DrawAssignmentResponse })
  @IsObject()
  @ValidateNested()
  @Type(() => DrawAssignmentResponse)
  assignment!: DrawAssignmentResponse;

  @ApiProperty({ minimum: 1, example: 4 })
  @IsNumber()
  zoneCount!: number;
}

export class ManualGroupAssignmentRequest {
  @ApiProperty({ type: DrawAssignmentResponse })
  @IsObject()
  @ValidateNested()
  @Type(() => DrawAssignmentResponse)
  assignment!: DrawAssignmentResponse;

  @ApiProperty({ minimum: 1, example: 4 })
  @IsNumber()
  groupCount!: number;
}

export class ManualZoneAssignmentResponse {
  @ApiProperty({ type: DrawAssignmentResponse })
  assignment!: DrawAssignmentResponse;

  @ApiProperty({ type: ZoneResponse, isArray: true })
  zones!: ZoneResponse[];
}

export class ManualGroupAssignmentResponse {
  @ApiProperty({ type: DrawAssignmentResponse })
  assignment!: DrawAssignmentResponse;

  @ApiProperty({ type: GroupResponse, isArray: true })
  groups!: GroupResponse[];
}

export class PromotionBandRequest {
  @ApiProperty({ example: 'Copa Oro' })
  @IsString()
  zoneRef!: string;

  @ApiProperty({ minimum: 1, example: 4 })
  @IsNumber()
  count!: number;
}

export class SavePromotionPlanRequest {
  @ApiProperty({ description: '1-based number of the stage that receives the promotion' })
  @IsNumber()
  nextStageNumber!: number;

  @ApiProperty({
    oneOf: [
      { type: 'number', minimum: 1 },
      { type: 'object', additionalProperties: { type: 'number', minimum: 1 } },
    ],
  })
  // Presence-only check: a number-or-record union has no single
  // type validator, and an undecorated property is stripped by whitelist mode.
  @IsDefined()
  perGroupAdvance!: number | Record<string, number>;

  @ApiProperty({
    description: 'ranked with a tiebreak pipeline, manual with an entrant order, or group-order',
    type: 'object',
    additionalProperties: true,
  })
  @IsObject()
  combination!: Record<string, unknown>;

  @ApiPropertyOptional({ type: PromotionBandRequest, isArray: true })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PromotionBandRequest)
  bands?: PromotionBandRequest[];
}

export class PromotionPlanResponse {
  @ApiProperty({ format: 'uuid' })
  promotionPlanId!: string;

  @ApiProperty({ format: 'uuid' })
  zoneId!: string;

  @ApiProperty({ format: 'uuid' })
  nextStageId!: string;

  @ApiProperty({ type: 'object', additionalProperties: true })
  plan!: Record<string, unknown>;
}

export class QualifiedEntrantResponse {
  @ApiProperty({ format: 'uuid' })
  entrantId!: string;

  @ApiProperty({ format: 'uuid' })
  groupId!: string;

  @ApiProperty({ minimum: 1 })
  rank!: number;
}

export class PromotionPreviewResponse {
  @ApiProperty({ type: QualifiedEntrantResponse, isArray: true })
  combined!: QualifiedEntrantResponse[];

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: {
      type: 'array',
      items: { $ref: '#/components/schemas/QualifiedEntrantResponse' },
    },
  })
  bands?: Record<string, QualifiedEntrantResponse[]>;

  @ApiProperty({ type: 'object', isArray: true, additionalProperties: true })
  trace!: Record<string, unknown>[];
}

/**
 * One prior-stage zone's resolved promotion preview, returned as part of the
 * reverse lookup "which zones' promotion plans target this stage". A
 * zone whose plan cannot currently be resolved into a preview (e.g. its
 * source group standings are not ready yet) is omitted rather than causing
 * the whole lookup to fail — mirrors the pre-fill's own "only when
 * resolvable" scope.
 */
export class TargetingPromotionPreviewResponse {
  @ApiProperty({ description: '1-based zone number within its own (source) stage', example: 1 })
  zoneNumber!: number;

  @ApiProperty({ format: 'uuid' })
  zoneId!: string;

  @ApiProperty({ type: QualifiedEntrantResponse, isArray: true })
  combined!: QualifiedEntrantResponse[];

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: {
      type: 'array',
      items: { $ref: '#/components/schemas/QualifiedEntrantResponse' },
    },
  })
  bands?: Record<string, QualifiedEntrantResponse[]>;
}
