import { Type } from 'class-transformer';
import { IsArray, IsIn, IsOptional, IsString, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PLAYER_ROLES, type PlayerRole } from '@copalibre/domain';

export class TeamMemberResponse {
  @ApiProperty({ format: 'uuid' })
  personId!: string;

  @ApiProperty({ example: 'Elías Salomón' })
  displayName!: string;

  @ApiProperty({ enum: ['player', 'substitute', 'coach', 'staff'] })
  role!: 'player' | 'substitute' | 'coach' | 'staff';

  @ApiPropertyOptional({ description: 'ISO 3166-1 alpha-2 country code', example: 'AR' })
  nationality?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'object_metadata.object_id of the photo' })
  photoObjectId?: string;
}

export class CreatePersonRequest {
  @IsString()
  @ApiProperty({ example: 'Elías Salomón' })
  displayName!: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Suggested from displayName when omitted.' })
  alias?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ example: 'dni' })
  naturalKeyKind?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Recognised across a later CSV import naming the same key.' })
  naturalKeyValue?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ format: 'date', example: '2001-05-14' })
  birthDate?: string;
}

export class CreateTeamRequest {
  @IsString()
  @ApiProperty({ example: 'Talleres' })
  name!: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Suggested from name when omitted.' })
  alias?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ format: 'uuid' })
  clubId?: string;
}

export class UpdatePersonIdentityRequest {
  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  displayName?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  alias?: string;
}

export class UpdateTeamIdentityRequest {
  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  name?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  alias?: string;
}

export class PersonIdentityResponse {
  @ApiProperty({ format: 'uuid' })
  personId!: string;

  @ApiProperty()
  displayName!: string;

  @ApiPropertyOptional()
  alias?: string;
}

export class TeamIdentityResponse {
  @ApiProperty({ format: 'uuid' })
  teamId!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional()
  alias?: string;
}

export class RegistrationResponse {
  @ApiProperty({ format: 'uuid' })
  entrantId!: string;

  @ApiProperty({ format: 'uuid' })
  tournamentId!: string;

  @ApiProperty({ enum: ['pending', 'accepted', 'refused', 'withdrawn', 'checked-in'] })
  status!: 'pending' | 'accepted' | 'refused' | 'withdrawn' | 'checked-in';

  @ApiPropertyOptional({ description: 'Tournament-scoped, distinct entrant short label.' })
  abbreviation?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  teamId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  personId?: string;

  @ApiPropertyOptional({
    description: 'The person or team entrant’s human-readable display name.',
    example: 'Elías Salomón',
  })
  displayName?: string;

  @ApiPropertyOptional({ description: 'ISO 3166-1 alpha-2 country code', example: 'AR' })
  nationality?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'object_metadata.object_id of the photo' })
  photoObjectId?: string;

  @ApiPropertyOptional({
    isArray: true,
    type: TeamMemberResponse,
    description:
      'The team entrant’s resulting membership. Populated only by a team-membership edit response.',
  })
  teamMembers?: TeamMemberResponse[];

  @ApiPropertyOptional({
    description: 'Whether this person entrant already carries a participant identity link.',
  })
  hasIdentityLink?: boolean;
}

export class TeamMembershipMemberInput {
  @IsString()
  @ApiProperty({ format: 'uuid', description: 'Person identifier' })
  personId!: string;

  @IsOptional()
  @IsIn(PLAYER_ROLES)
  @ApiPropertyOptional({
    enum: PLAYER_ROLES,
    default: 'player',
    description: 'Member role within the team',
  })
  role?: PlayerRole;
}

export class EditTeamMembershipsRequest {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ApiPropertyOptional({
    isArray: true,
    format: 'uuid',
    description: 'The team’s full desired membership by person IDs (defaults each to "player").',
  })
  personIds?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TeamMembershipMemberInput)
  @ApiPropertyOptional({
    isArray: true,
    type: TeamMembershipMemberInput,
    description:
      'The team’s full desired membership with optional roles (defaults to "player" when omitted).',
  })
  members?: TeamMembershipMemberInput[];
}

export class ParticipantTeamMembershipResponse {
  @ApiProperty({ format: 'uuid' })
  playerId!: string;
  @ApiProperty({ format: 'uuid' })
  teamId!: string;
  @ApiProperty()
  teamName!: string;
  @ApiProperty()
  role!: string;
}

export class ParticipantReportedResultResponse {
  @ApiProperty({ format: 'uuid' })
  matchId!: string;
  @ApiProperty({ format: 'uuid' })
  entrantId!: string;
  @ApiProperty()
  status!: string;
  @ApiProperty({ nullable: true, type: Object })
  result!: Record<string, unknown> | null;
}

export class LinkParticipantIdentityRequest {
  @IsString()
  @ApiProperty({ format: 'email' })
  email!: string;
}

export class ParticipantIdentityLinkResponse {
  @ApiProperty({ format: 'uuid' })
  principalId!: string;
  @ApiProperty({ format: 'uuid' })
  personId!: string;
}

export class ReviewRegistrationRequest {
  @IsString()
  @ApiProperty({ enum: ['accepted', 'refused', 'withdrawn'] })
  decision!: 'accepted' | 'refused' | 'withdrawn';

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({
    description:
      'Recorded on the audit row. A refusal an entrant cannot be told about is one they will ask about.',
  })
  reason?: string;
}

export class SetEntrantAbbreviationRequest {
  @IsString()
  @ApiProperty({
    example: 'CDI',
    description: 'Uppercase short label, unique within this tournament.',
  })
  abbreviation!: string;
}

export class BulkReviewRequest {
  @IsArray()
  @IsString({ each: true })
  @ApiProperty({ isArray: true, format: 'uuid' })
  entrantIds!: string[];

  @IsString()
  @ApiProperty({ enum: ['accepted', 'refused', 'withdrawn'] })
  decision!: 'accepted' | 'refused' | 'withdrawn';

  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  reason?: string;
}

export class BulkReviewResponse {
  @ApiProperty({ isArray: true, type: RegistrationResponse })
  applied!: RegistrationResponse[];

  @ApiProperty({
    isArray: true,
    description: 'Registrations left untouched, each with the reason — never silently skipped.',
  })
  refused!: { entrantId: string; reason: string }[];
}
