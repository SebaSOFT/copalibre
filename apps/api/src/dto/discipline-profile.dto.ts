import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { type LocalizedLabel } from '@copalibre/domain';
import { StageAllocationRequest } from './tournament.dto.js';
import { localizedLabelOneOf } from './stage.dto.js';

export class DisciplineSummaryResponse {
  @ApiProperty({ format: 'uuid' })
  descriptorId!: string;

  @ApiProperty({ example: 'orbital-frisbee' })
  alias!: string;

  @ApiProperty({ example: '1.2.0' })
  version!: string;

  @ApiProperty({
    oneOf: localizedLabelOneOf,
    example: 'Fútbol 11',
    description:
      'A plain string, or a locale-keyed object (e.g. { en: "Football", es: "Fútbol" }) for a module authored in more than one language — the client resolves it to the viewer\'s interface language.',
  })
  name!: string | LocalizedLabel;

  @ApiPropertyOptional({
    oneOf: localizedLabelOneOf,
    example: { en: 'Team discipline with timed halves and goal-based scoring' },
    description:
      'Optional plain string or locale-keyed description. The client resolves it with the same fallback as name.',
  })
  description?: string | LocalizedLabel;

  @ApiProperty({
    isArray: true,
    description:
      'Formats this discipline declares it supports. The client filters from this list rather than from its own copy — a hardcoded list is a list that disagrees with the module the day one is added.',
    example: ['single-elimination', 'round-robin'],
  })
  supportedFormats!: string[];

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { oneOf: localizedLabelOneOf },
    description:
      "The discipline's own explanation of a format it supports, keyed by format. Absent for a format the wizard falls back to the platform's own catalogued explanation.",
    example: { 'round-robin': 'Every entrant plays every other entrant once' },
  })
  formatDescriptions?: Readonly<Record<string, string | LocalizedLabel>>;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description:
      "Per-dot-path override permission and mutation class from the discipline's own configuration contract. The wizard reads it to warn an organizer before a hard-to-reverse decision, not to enforce anything client-side.",
    example: {
      format: { permission: { kind: 'replaced' }, mutationClass: 'blocked_after_results' },
    },
  })
  fieldPolicies?: Readonly<Record<string, unknown>>;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description: "The discipline's own default configuration tree, before any override.",
    example: { 'scoring.pointsPerWin': 3 },
  })
  defaults?: Readonly<Record<string, unknown>>;
}

export class ProfileStageSummaryResponse {
  @ApiProperty({ example: 1 })
  number!: number;

  @ApiProperty({ example: 'Groups' })
  name!: string;

  @ApiProperty({ example: 'round-robin' })
  format!: string;

  @ApiPropertyOptional({
    type: StageAllocationRequest,
    description: 'The profile’s declared default seeding for this stage, if any.',
  })
  allocation?: StageAllocationRequest;
}

export class TournamentProfileSummaryResponse {
  @ApiProperty({ format: 'uuid' })
  profileId!: string;

  @ApiProperty({ example: 'grupos-y-playoff' })
  alias!: string;

  @ApiProperty({ example: '1.0.0' })
  version!: string;

  @ApiProperty({
    oneOf: localizedLabelOneOf,
    example: 'Groups and playoff',
    description: 'A plain string or localized label for the profile name.',
  })
  name!: string | LocalizedLabel;

  @ApiPropertyOptional({
    oneOf: localizedLabelOneOf,
    example: { en: 'Round-robin groups followed by single elimination' },
    description: 'Optional plain string or localized label for the profile description.',
  })
  description?: string | LocalizedLabel;

  @ApiProperty({
    type: [ProfileStageSummaryResponse],
    description: 'Declared stages in the profile.',
  })
  stages!: ProfileStageSummaryResponse[];
}
