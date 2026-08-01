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

  @ApiProperty({
    enum: ['draft', 'published', 'started', 'finished'],
    description:
      "Once started, the tournament's discipline and profile versions are frozen and its results are materialised.",
  })
  status!: 'draft' | 'published' | 'started' | 'finished';

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'When the first match began, marking the module freeze.',
  })
  startedAt?: string;

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

  @ApiProperty({
    description:
      'Pinned descriptor version (semver). Rulesets never track "latest": the version a tournament starts on is frozen.',
    example: '1.2.0',
  })
  descriptorVersion!: string;
}

export class ProblemResponse {
  @ApiProperty({ example: 403 })
  statusCode!: number;

  @ApiProperty({ example: 'subject may only act on their own records' })
  message!: string;
}

export class DisciplineSummaryResponse {
  @ApiProperty({ format: 'uuid' })
  descriptorId!: string;

  @ApiProperty({ example: '1.2.0' })
  version!: string;

  @ApiProperty({ example: 'Fútbol 11' })
  name!: string;

  @ApiProperty({
    isArray: true,
    description:
      'Formats this discipline declares it supports. The client filters from this list rather than from its own copy — a hardcoded list is a list that disagrees with the module the day one is added.',
    example: ['single-elimination', 'round-robin'],
  })
  supportedFormats!: string[];
}

export class RegistrationResponse {
  @ApiProperty({ format: 'uuid' })
  entrantId!: string;

  @ApiProperty({ format: 'uuid' })
  tournamentId!: string;

  @ApiProperty({ enum: ['pending', 'accepted', 'refused', 'withdrawn', 'checked-in'] })
  status!: 'pending' | 'accepted' | 'refused' | 'withdrawn' | 'checked-in';

  @ApiPropertyOptional({ format: 'uuid' })
  teamId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  personId?: string;
}

export class ReviewRegistrationRequest {
  @ApiProperty({ enum: ['accepted', 'refused', 'withdrawn'] })
  decision!: 'accepted' | 'refused' | 'withdrawn';

  @ApiPropertyOptional({
    description:
      'Recorded on the audit row. A refusal an entrant cannot be told about is one they will ask about.',
  })
  reason?: string;
}

export class BulkReviewRequest {
  @ApiProperty({ isArray: true, format: 'uuid' })
  entrantIds!: string[];

  @ApiProperty({ enum: ['accepted', 'refused', 'withdrawn'] })
  decision!: 'accepted' | 'refused' | 'withdrawn';

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
