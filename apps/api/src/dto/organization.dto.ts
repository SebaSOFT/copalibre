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

export class BootstrapAdministratorRequest {
  @ApiProperty({ example: 'liga-orbital' })
  organizationAlias!: string;

  @ApiProperty({ example: 'Liga Orbital' })
  organizationName!: string;

  @ApiProperty({ format: 'email', example: 'admin@example.test' })
  email!: string;
}

export class BootstrapAdministratorResponse {
  @ApiProperty({ format: 'uuid' })
  organizationId!: string;

  @ApiProperty({ example: 'liga-orbital' })
  organizationAlias!: string;

  @ApiProperty({ format: 'uuid' })
  invitationId!: string;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;

  @ApiProperty({ format: 'uri', description: 'One-time OIDC invitation setup link.' })
  setupUrl!: string;
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
    enum: ['draft', 'published', 'started', 'finished', 'archived'],
    description:
      "Once started, the tournament's discipline and profile versions are frozen and its results " +
      'are materialised. Archived is legal only from finished (0033) and changes default visibility ' +
      'only — no data is affected.',
  })
  status!: 'draft' | 'published' | 'started' | 'finished' | 'archived';

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'When the first match began, marking the module freeze.',
  })
  startedAt?: string;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'When the tournament was archived (0033); absent until then.',
  })
  archivedAt?: string;

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

  @ApiProperty({ example: 'round-robin' })
  format!: string;

  @ApiProperty({
    description: 'Whether anonymous/public registration intake is open for this tournament.',
  })
  publicRegistration!: boolean;

  @ApiProperty({
    description: 'Whether accepted entrants must check in before eligibility is locked.',
  })
  requiresCheckIn!: boolean;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Optional instant when checked-in team memberships stop being editable.',
  })
  checkInClosesAt?: string;
}

export class ProblemResponse {
  @ApiProperty({ example: 403 })
  statusCode!: number;

  @ApiProperty({ example: 'subject may only act on their own records' })
  message!: string;
}

export class CreateCsvImportRequest {
  @ApiProperty({ enum: ['individual', 'team'] })
  target!: 'individual' | 'team';

  @ApiProperty({
    description: 'UTF-8 CopaLibre participant CSV, limited to 4 MiB.',
    example: 'alias,displayName,naturalKeyKind,naturalKey\\nmaria-perez,Maria Perez,dni,12345678',
  })
  sourceCsv!: string;
}

export class CsvImportPreviewResponse {
  @ApiProperty({ format: 'uuid' })
  importId!: string;
  @ApiProperty({ enum: ['individual', 'team'] })
  target!: 'individual' | 'team';
  @ApiProperty({
    enum: ['queued', 'validating', 'review-ready', 'invalid', 'committing', 'committed'],
  })
  status!: string;
  @ApiProperty({ description: 'SHA-256 source fingerprint used to reject stale confirmation.' })
  sourceHash!: string;
  @ApiPropertyOptional({ type: Object })
  preview?: {
    valid: boolean;
    rows: readonly unknown[];
    errors: readonly unknown[];
  };
}

export class CommitCsvImportRequest {
  @ApiProperty({ description: 'Source hash returned by the reviewed preview.' })
  sourceHash!: string;
}

export class OrganizationRoleResponse {
  @ApiProperty({ format: 'uuid' })
  assignmentId!: string;
  @ApiProperty({ format: 'uuid', description: 'CopaLibre internal principal UUIDv7' })
  principalId!: string;
  @ApiProperty()
  email!: string;
  @ApiProperty({ enum: ['admin', 'referee', 'broadcaster', 'viewer'] })
  role!: string;
  @ApiProperty({ enum: ['active', 'inactive'] })
  status!: string;
}

export class InviteOrganizationUserRequest {
  @ApiProperty({ format: 'email' })
  email!: string;
  @ApiProperty({ enum: ['admin', 'referee', 'broadcaster', 'viewer'] })
  role!: 'admin' | 'referee' | 'broadcaster' | 'viewer';
  @ApiProperty({ enum: ['active', 'inactive'] })
  status!: 'active' | 'inactive';
}

export class OrganizationInvitationResponse {
  @ApiProperty({ format: 'uuid' })
  invitationId!: string;
  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;
}

export class ChangeOrganizationRoleRequest {
  @ApiProperty({ enum: ['admin', 'referee', 'broadcaster', 'viewer'] })
  role!: 'admin' | 'referee' | 'broadcaster' | 'viewer';
  @ApiProperty({ enum: ['active', 'inactive'] })
  status!: 'active' | 'inactive';
}

export class AcceptInvitationRequest {
  @ApiProperty({ minLength: 32 })
  token!: string;
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
