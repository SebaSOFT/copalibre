import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Venue/official wire shapes (0124) — organization-scoped resource
 * management, the CRUD `tournament-engine/resource-scheduling` always
 * assumed but never exposed through the API.
 */

const OFFICIAL_ROLES = ['referee', 'assistant', 'table-official', 'observer'] as const;

export class VenueResponse {
  @ApiProperty({ format: 'uuid' })
  venueId!: string;

  @ApiProperty({ format: 'uuid' })
  organizationId!: string;

  @ApiProperty({ description: 'Path identifier, unique within the organization.' })
  alias!: string;

  @ApiProperty({ example: 'Cancha 1' })
  name!: string;

  @ApiProperty({
    description: 'Fixtures this venue can host simultaneously.',
    example: 1,
  })
  concurrentCapacity!: number;

  @ApiPropertyOptional({ description: 'Free-form, for an operator to read; never parsed.' })
  address?: string;

  @ApiPropertyOptional({
    description:
      'Free-form, operator-entered key/value details — an address, a playing surface, a server ' +
      'address, a region, a current map. Never parsed or validated.',
    type: 'object',
    additionalProperties: { type: 'string' },
    example: { surface: 'clay' },
  })
  details?: Record<string, string>;
}

export class CreateVenueRequest {
  @ApiProperty({
    description: 'Lowercase kebab-case alias, unique within the organization.',
    example: 'cancha-1',
  })
  alias!: string;

  @ApiProperty({ example: 'Cancha 1' })
  name!: string;

  @ApiProperty({ example: 1 })
  concurrentCapacity!: number;

  @ApiPropertyOptional()
  address?: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'string' },
    example: { surface: 'clay' },
  })
  details?: Record<string, string>;
}

export class UpdateVenueRequest {
  @ApiPropertyOptional({ example: 'Cancha 1' })
  name?: string;

  @ApiPropertyOptional({ example: 1 })
  concurrentCapacity?: number;

  @ApiPropertyOptional()
  address?: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'string' },
    example: { surface: 'clay' },
  })
  details?: Record<string, string>;
}

export class OfficialResponse {
  @ApiProperty({ format: 'uuid' })
  officialId!: string;

  @ApiProperty({ format: 'uuid' })
  organizationId!: string;

  @ApiProperty({ example: 'Ana Gómez' })
  displayName!: string;

  @ApiProperty({ enum: OFFICIAL_ROLES, isArray: true })
  roles!: (typeof OFFICIAL_ROLES)[number][];
}

export class CreateOfficialRequest {
  @ApiProperty({ example: 'Ana Gómez' })
  displayName!: string;

  @ApiProperty({ enum: OFFICIAL_ROLES, isArray: true })
  roles!: (typeof OFFICIAL_ROLES)[number][];
}

export class UpdateOfficialRequest {
  @ApiPropertyOptional({ example: 'Ana Gómez' })
  displayName?: string;

  @ApiPropertyOptional({ enum: OFFICIAL_ROLES, isArray: true })
  roles?: (typeof OFFICIAL_ROLES)[number][];
}
