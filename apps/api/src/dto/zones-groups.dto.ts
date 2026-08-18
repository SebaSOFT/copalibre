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
