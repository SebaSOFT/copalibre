import { ApiProperty, ApiPropertyOptional, getSchemaPath } from '@nestjs/swagger';

export class EntrantFixtureSideSourceDto {
  @ApiProperty({ enum: ['entrant'] }) kind!: 'entrant';
  @ApiProperty({ format: 'uuid' }) entrantId!: string;
}

export class WinnerFixtureSideSourceDto {
  @ApiProperty({ enum: ['winner-of'] }) kind!: 'winner-of';
  @ApiProperty() nodeKey!: string;
  @ApiProperty({ format: 'uuid' }) matchId!: string;
  @ApiProperty() round!: number;
  @ApiProperty() position!: number;
  @ApiPropertyOptional() label?: string;
}

export class LoserFixtureSideSourceDto {
  @ApiProperty({ enum: ['loser-of'] }) kind!: 'loser-of';
  @ApiProperty() nodeKey!: string;
  @ApiProperty({ format: 'uuid' }) matchId!: string;
  @ApiProperty() round!: number;
  @ApiProperty() position!: number;
  @ApiPropertyOptional() label?: string;
}

/**
 * How a qualifier position reads before anyone qualifies, from the plan's declaration alone:
 * `group-rank` (rank, group), `cohort` (rank, order within the same-rank cohort) or `number`.
 */
export class QualifierLabelDto {
  @ApiProperty({ enum: ['group-rank', 'cohort', 'number'] })
  kind!: 'group-rank' | 'cohort' | 'number';
  @ApiPropertyOptional({ description: 'Place within the group, for group-rank and cohort' })
  rank?: number;
  @ApiPropertyOptional() groupNumber?: number;
  @ApiPropertyOptional({ description: 'The group as the organizer named it' })
  groupName?: string;
  @ApiPropertyOptional({ description: '1-based order within the same-rank cohort' })
  order?: number;
  @ApiPropertyOptional({ description: 'The position number, for manual combination' })
  number?: number;
}

export class QualifierFixtureSideSourceDto {
  @ApiProperty({ enum: ['qualifier'] }) kind!: 'qualifier';
  @ApiProperty({ format: 'uuid' }) promotionPlanId!: string;
  @ApiProperty({ description: "1-based position in the plan's whole combined list" })
  position!: number;
  @ApiPropertyOptional({ type: QualifierLabelDto }) qualifierLabel?: QualifierLabelDto;
}

export type FixtureSideSourceDto =
  | EntrantFixtureSideSourceDto
  | WinnerFixtureSideSourceDto
  | LoserFixtureSideSourceDto
  | QualifierFixtureSideSourceDto;
export const FIXTURE_SIDE_SOURCE_MODELS = [
  EntrantFixtureSideSourceDto,
  WinnerFixtureSideSourceDto,
  LoserFixtureSideSourceDto,
  QualifierFixtureSideSourceDto,
];
export const fixtureSideSourceSchema = {
  oneOf: FIXTURE_SIDE_SOURCE_MODELS.map((model) => ({ $ref: getSchemaPath(model) })),
  discriminator: {
    propertyName: 'kind',
    mapping: {
      entrant: getSchemaPath(EntrantFixtureSideSourceDto),
      'winner-of': getSchemaPath(WinnerFixtureSideSourceDto),
      'loser-of': getSchemaPath(LoserFixtureSideSourceDto),
      qualifier: getSchemaPath(QualifierFixtureSideSourceDto),
    },
  },
};

/** Present only on persisted graph nodes; legacy responses retain their previous shape. */
export class FixtureSourcesResponse {
  @ApiPropertyOptional() nodeKey?: string;
  @ApiPropertyOptional() branch?: string;
  @ApiPropertyOptional() label?: string;
  @ApiPropertyOptional(fixtureSideSourceSchema) homeSource?: FixtureSideSourceDto;
  @ApiPropertyOptional(fixtureSideSourceSchema) awaySource?: FixtureSideSourceDto;
}
