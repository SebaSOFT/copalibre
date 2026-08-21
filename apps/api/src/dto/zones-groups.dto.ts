import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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

export class CreateZoneRequest {
  @ApiPropertyOptional({ description: 'Defaults to the next 1-based zone number', example: 1 })
  number?: number;

  @ApiProperty({ example: 'Zona Norte' })
  name!: string;
}

export class CreateGroupRequest {
  @ApiPropertyOptional({ description: 'Defaults to the next 1-based group number', example: 1 })
  number?: number;

  @ApiProperty({ example: 'Grupo A' })
  name!: string;
}

export class DrawConstraintRequest {
  @ApiProperty({ enum: ['separation', 'distribution', 'script'] })
  kind!: string;

  @ApiProperty({ description: 'Constraint hook point', example: 'draw.assign-group' })
  hook!: string;

  @ApiPropertyOptional({ example: 'region' })
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
  scope?: string | { beforeRound: string };

  @ApiPropertyOptional({ example: 'san-juan' })
  value?: string;

  @ApiPropertyOptional({ example: 1 })
  min?: number;

  @ApiPropertyOptional({ example: 1 })
  max?: number;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  script?: Record<string, unknown>;
}

export class DrawZonesRequest {
  @ApiProperty({ minimum: 1, example: 4 })
  zoneCount!: number;

  @ApiProperty({ description: 'Deterministic draw seed', example: 99 })
  seed!: number;

  @ApiPropertyOptional({ type: DrawConstraintRequest, isArray: true })
  constraints?: DrawConstraintRequest[];
}

export class DrawGroupsRequest {
  @ApiProperty({ minimum: 1, example: 4 })
  groupCount!: number;

  @ApiProperty({ description: 'Deterministic draw seed', example: 99 })
  seed!: number;

  @ApiPropertyOptional({ type: DrawConstraintRequest, isArray: true })
  constraints?: DrawConstraintRequest[];
}

export class DrawAssignmentResponse {
  @ApiProperty({
    description: 'Accepted entrant UUID mapped to its 1-based zone or group number',
    type: 'object',
    additionalProperties: { type: 'number' },
  })
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
 * Manual placement's own request/response shapes (0108) — deliberately not
 * `DrawPreviewResponse`'s subtypes: a manually placed assignment has no
 * seed or search-step count, both meaningless for an operator-chosen
 * placement rather than a deterministic draw.
 */
export class ManualZoneAssignmentRequest {
  @ApiProperty({ type: DrawAssignmentResponse })
  assignment!: DrawAssignmentResponse;

  @ApiProperty({ minimum: 1, example: 4 })
  zoneCount!: number;
}

export class ManualGroupAssignmentRequest {
  @ApiProperty({ type: DrawAssignmentResponse })
  assignment!: DrawAssignmentResponse;

  @ApiProperty({ minimum: 1, example: 4 })
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
  zoneRef!: string;

  @ApiProperty({ minimum: 1, example: 4 })
  count!: number;
}

export class SavePromotionPlanRequest {
  @ApiProperty({ description: '1-based number of the stage that receives the promotion' })
  nextStageNumber!: number;

  @ApiProperty({
    oneOf: [
      { type: 'number', minimum: 1 },
      { type: 'object', additionalProperties: { type: 'number', minimum: 1 } },
    ],
  })
  perGroupAdvance!: number | Record<string, number>;

  @ApiProperty({
    description: 'ranked with a tiebreak pipeline, manual with an entrant order, or group-order',
    type: 'object',
    additionalProperties: true,
  })
  combination!: Record<string, unknown>;

  @ApiPropertyOptional({ type: PromotionBandRequest, isArray: true })
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
 * reverse lookup "which zones' promotion plans target this stage" (0121). A
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
