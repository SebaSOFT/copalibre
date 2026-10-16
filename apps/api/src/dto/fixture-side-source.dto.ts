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

export class QualifierFixtureSideSourceDto {
  @ApiProperty({ enum: ['qualifier'] }) kind!: 'qualifier';
  @ApiProperty({ format: 'uuid' }) promotionPlanId!: string;
  @ApiProperty() position!: number;
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
  discriminator: { propertyName: 'kind' },
};

/** Present only on persisted graph nodes; legacy responses retain their previous shape. */
export class FixtureSourcesResponse {
  @ApiPropertyOptional() nodeKey?: string;
  @ApiPropertyOptional() branch?: string;
  @ApiPropertyOptional() label?: string;
  @ApiPropertyOptional(fixtureSideSourceSchema) homeSource?: FixtureSideSourceDto;
  @ApiPropertyOptional(fixtureSideSourceSchema) awaySource?: FixtureSideSourceDto;
}
