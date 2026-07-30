import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
}

export class CreateOrganizationRequest {
  @ApiProperty({
    description: 'Lowercase kebab-case alias, unique per installation',
    example: 'liga-orbital',
  })
  alias!: string;

  @ApiProperty({ example: 'Liga Orbital' })
  name!: string;
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

  @ApiProperty({ enum: ['draft', 'published'] })
  status!: 'draft' | 'published';

  @ApiPropertyOptional({ format: 'uuid', description: 'Active ruleset version, when one exists' })
  rulesetId?: string;
}

export class CreateTournamentRequest {
  @ApiProperty({ example: 'copa-verano' })
  alias!: string;

  @ApiProperty({ example: 'Copa Verano' })
  name!: string;

  @ApiProperty({ format: 'uuid', description: 'DisciplineDescriptor identifier' })
  descriptorId!: string;

  @ApiProperty({ description: 'Pinned descriptor version; rulesets never track "latest"' })
  descriptorVersion!: number;
}

export class ProblemResponse {
  @ApiProperty({ example: 403 })
  statusCode!: number;

  @ApiProperty({ example: 'subject may only act on their own records' })
  message!: string;
}
