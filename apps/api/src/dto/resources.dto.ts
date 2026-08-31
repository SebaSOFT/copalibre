import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsIn, IsNumber, IsObject, IsOptional, IsString } from 'class-validator';

/**
 * Venue/official wire shapes — organization-scoped resource
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
  @IsString()
  alias!: string;

  @ApiProperty({ example: 'Cancha 1' })
  @IsString()
  name!: string;

  @ApiProperty({ example: 1 })
  @IsNumber()
  concurrentCapacity!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'string' },
    example: { surface: 'clay' },
  })
  @IsOptional()
  @IsObject()
  details?: Record<string, string>;
}

export class UpdateVenueRequest {
  @ApiPropertyOptional({ example: 'Cancha 1' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  concurrentCapacity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'string' },
    example: { surface: 'clay' },
  })
  @IsOptional()
  @IsObject()
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
  @IsString()
  displayName!: string;

  @ApiProperty({ enum: OFFICIAL_ROLES, isArray: true })
  @IsArray()
  @IsIn(OFFICIAL_ROLES, { each: true })
  roles!: (typeof OFFICIAL_ROLES)[number][];
}

export class UpdateOfficialRequest {
  @ApiPropertyOptional({ example: 'Ana Gómez' })
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiPropertyOptional({ enum: OFFICIAL_ROLES, isArray: true })
  @IsOptional()
  @IsArray()
  @IsIn(OFFICIAL_ROLES, { each: true })
  roles?: (typeof OFFICIAL_ROLES)[number][];
}

export class ScheduleSlotResponse {
  @ApiProperty({ format: 'uuid' })
  slotId!: string;

  @ApiProperty({ format: 'uuid' })
  scheduleId!: string;

  @ApiProperty({ format: 'uuid' })
  venueId!: string;

  @ApiProperty({ description: 'Start of the slot, epoch milliseconds', example: 1785333600000 })
  startsAt!: number;

  @ApiProperty({ description: 'Number of matches assigned to this slot', example: 0 })
  matchCount!: number;
}

export class ScheduleDetailResponse {
  @ApiProperty({ format: 'uuid' })
  scheduleId!: string;

  @ApiProperty({ format: 'uuid' })
  organizationId!: string;

  @ApiProperty({ example: 'Main Schedule' })
  name!: string;

  @ApiProperty({ description: 'Grid starts at, epoch milliseconds', example: 1785333600000 })
  startsAt!: number;

  @ApiProperty({ description: 'Grid ends at, epoch milliseconds', example: 1785376800000 })
  endsAt!: number;

  @ApiProperty({ description: 'Duration of each match slot in minutes', example: 90 })
  slotMinutes!: number;

  @ApiProperty({ description: 'Turnaround buffer between slots in minutes', example: 15 })
  turnaroundMinutes!: number;

  @ApiProperty({
    type: [String],
    format: 'uuid',
    description: 'Venues covered by this schedule grid',
  })
  venueIds!: string[];

  @ApiProperty({ type: [ScheduleSlotResponse], description: 'Generated grid slots' })
  slots!: ScheduleSlotResponse[];
}

export class CreateScheduleRequest {
  @ApiProperty({ example: 'Main Schedule' })
  @IsString()
  name!: string;

  @ApiProperty({ description: 'Grid start epoch milliseconds', example: 1785333600000 })
  @IsNumber()
  startsAt!: number;

  @ApiProperty({ description: 'Grid end epoch milliseconds', example: 1785376800000 })
  @IsNumber()
  endsAt!: number;

  @ApiProperty({ description: 'Slot duration in minutes', example: 90 })
  @IsNumber()
  slotMinutes!: number;

  @ApiProperty({ description: 'Turnaround buffer in minutes', example: 15 })
  @IsNumber()
  turnaroundMinutes!: number;

  @ApiProperty({ type: [String], format: 'uuid', description: 'Venues to cover' })
  @IsArray()
  @IsString({ each: true })
  venueIds!: string[];
}

export class UpdateScheduleRequest {
  @ApiPropertyOptional({ example: 'Main Schedule' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Grid start epoch milliseconds', example: 1785333600000 })
  @IsOptional()
  @IsNumber()
  startsAt?: number;

  @ApiPropertyOptional({ description: 'Grid end epoch milliseconds', example: 1785376800000 })
  @IsOptional()
  @IsNumber()
  endsAt?: number;

  @ApiPropertyOptional({ description: 'Slot duration in minutes', example: 90 })
  @IsOptional()
  @IsNumber()
  slotMinutes?: number;

  @ApiPropertyOptional({ description: 'Turnaround buffer in minutes', example: 15 })
  @IsOptional()
  @IsNumber()
  turnaroundMinutes?: number;

  @ApiPropertyOptional({ type: [String], format: 'uuid', description: 'Venues to cover' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  venueIds?: string[];
}
