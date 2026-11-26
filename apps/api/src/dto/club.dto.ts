import { IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ClubResponse {
  @ApiProperty({ format: 'uuid' })
  clubId!: string;

  @ApiProperty({ format: 'uuid' })
  organizationId!: string;

  @ApiProperty({
    description:
      'Path identifier, unique within the organization. Always present: a club is given one when created.',
    example: 'casa-de-italia',
  })
  alias!: string;

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
