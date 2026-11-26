import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PublicStandingsRowResponse {
  @ApiProperty()
  rank!: number;

  @ApiProperty({ format: 'uuid' })
  entrantId!: string;

  @ApiPropertyOptional()
  name?: string;

  @ApiPropertyOptional({ description: 'The entrant is a person hidden at their request' })
  hiddenAtRequest?: boolean;

  @ApiPropertyOptional({ description: 'A public player profile may be linked from this row' })
  publicProfileAvailable?: boolean;

  @ApiPropertyOptional()
  abbreviation?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  clubId?: string;

  @ApiPropertyOptional()
  emblemObjectId?: string;

  @ApiProperty()
  sharedRank!: boolean;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'number' },
  })
  statistics!: Record<string, number>;

  @ApiPropertyOptional({
    description:
      'The zone this row is ranked in. Present only when the stage mixes formats, so each table zone is ranked on its own; absent for a stage with a single table.',
  })
  zoneName?: string;

  @ApiPropertyOptional({
    description:
      'The group this row is ranked in. Present when the stage defines named groups; absent for an ungrouped stage.',
  })
  groupName?: string;
}
