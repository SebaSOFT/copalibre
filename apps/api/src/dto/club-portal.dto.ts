import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { TeamMembershipMemberInput } from './organization.dto.js';

/**
 * A club-scoped member of the person directory (openspec 0301). Mirrors the
 * fields `PersonIdentityResponse`/`TeamMemberResponse` already expose for the
 * organizer-facing registration review screen — this is the same person
 * record, viewed through a club-admin's scoped lens.
 */
export class ClubMemberResponse {
  @ApiProperty({ format: 'uuid' })
  personId!: string;

  @ApiProperty({ example: 'Elías Salomón' })
  displayName!: string;

  @ApiPropertyOptional()
  alias?: string;

  @ApiPropertyOptional({ format: 'date', example: '2001-05-14' })
  birthDate?: string;

  @ApiPropertyOptional({ description: 'ISO 3166-1 alpha-2 country code', example: 'AR' })
  nationality?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'object_metadata.object_id of the photo' })
  photoObjectId?: string;
}

export class CreateClubMemberRequest {
  @IsString()
  @ApiProperty({ example: 'Elías Salomón' })
  displayName!: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Suggested from displayName when omitted.' })
  alias?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ format: 'date', example: '2001-05-14' })
  birthDate?: string;
}

export class UpdateClubMemberRequest {
  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  displayName?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  alias?: string;
}

export class ClubTeamResponse {
  @ApiProperty({ format: 'uuid' })
  teamId!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional()
  alias?: string;
}

export class CreateClubTeamRequest {
  @IsString()
  @ApiProperty({ example: 'Talleres' })
  name!: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Suggested from name when omitted.' })
  alias?: string;
}

export class SubmitClubRegistrationRequest {
  @IsString()
  @ApiProperty({ format: 'uuid' })
  teamId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TeamMembershipMemberInput)
  @ApiProperty({ type: TeamMembershipMemberInput, isArray: true })
  members!: readonly TeamMembershipMemberInput[];
}

export class ClubRegistrationResponse {
  @ApiProperty({ format: 'uuid' })
  entrantId!: string;

  @ApiProperty({ format: 'uuid' })
  tournamentId!: string;

  @ApiProperty({ enum: ['pending', 'accepted', 'refused', 'withdrawn', 'checked-in'] })
  status!: 'pending' | 'accepted' | 'refused' | 'withdrawn' | 'checked-in';

  @ApiProperty({ format: 'uuid' })
  teamId!: string;
}
