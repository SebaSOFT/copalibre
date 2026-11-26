import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TableCellResponse, TableColumnResponse } from './table-projections.dto.js';
import type { LocalizedLabel } from '@copalibre/domain';

export class PublicPersonCompetitionHistoryResponse {
  @ApiProperty({ format: 'uuid' })
  tournamentId!: string;

  @ApiProperty()
  tournamentName!: string;

  @ApiProperty()
  tournamentAlias!: string;

  @ApiProperty({ format: 'uuid' })
  teamId!: string;

  @ApiProperty()
  teamName!: string;

  @ApiPropertyOptional({
    description: 'Public club alias when the team belongs to a club with an alias',
  })
  clubAlias?: string;

  @ApiPropertyOptional({
    oneOf: [{ type: 'number' }, { type: 'string' }],
    description:
      'Shirt number from the player’s most recent finalized match roster in this tournament, when recorded',
  })
  shirtNumber?: number | string;

  @ApiProperty({ enum: ['player', 'substitute', 'coach', 'staff'] })
  role!: 'player' | 'substitute' | 'coach' | 'staff';

  @ApiPropertyOptional({ format: 'uuid' })
  entrantId?: string;

  @ApiPropertyOptional()
  entrantName?: string;

  @ApiPropertyOptional()
  entrantAbbreviation?: string;

  @ApiProperty()
  disciplineDescriptorId!: string;

  @ApiProperty()
  disciplineDescriptorVersion!: string;

  @ApiPropertyOptional()
  disciplineName?: string;

  @ApiPropertyOptional({
    description: 'The discipline name as declared, with its available translations',
    type: 'object',
    additionalProperties: { type: 'string' },
  })
  localizedDisciplineName?: LocalizedLabel;
}

export class PublicPersonCareerStatisticResponse {
  @ApiProperty()
  code!: string;

  @ApiProperty()
  label!: string;

  @ApiPropertyOptional({
    description: 'The statistic collector label as declared, with its available translations',
    type: 'object',
    additionalProperties: { type: 'string' },
  })
  localizedLabel?: LocalizedLabel;

  @ApiProperty()
  value!: number;

  @ApiPropertyOptional()
  samples?: number;
}

export class PublicPersonCareerDisciplineTotalsResponse {
  @ApiProperty()
  disciplineDescriptorId!: string;

  @ApiPropertyOptional()
  disciplineName?: string;

  @ApiPropertyOptional({
    description: 'The discipline name as declared, with its available translations',
    type: 'object',
    additionalProperties: { type: 'string' },
  })
  localizedDisciplineName?: LocalizedLabel;

  @ApiProperty({ type: [PublicPersonCareerStatisticResponse] })
  statistics!: PublicPersonCareerStatisticResponse[];
}

export class PublicPersonProfileResponse {
  @ApiProperty({ format: 'uuid' })
  personId!: string;

  @ApiProperty()
  displayName!: string;

  @ApiPropertyOptional()
  alias?: string;

  @ApiPropertyOptional({ description: 'ISO 3166-1 alpha-2 country code' })
  nationality?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  photoObjectId?: string;

  @ApiPropertyOptional({
    description:
      'Age in completed full years (derived from birth date; raw birth date is never exposed)',
  })
  age?: number;

  @ApiProperty({ type: [PublicPersonCompetitionHistoryResponse] })
  competitionHistory!: PublicPersonCompetitionHistoryResponse[];

  @ApiProperty({ type: [PublicPersonCareerDisciplineTotalsResponse] })
  careerStatistics!: PublicPersonCareerDisciplineTotalsResponse[];
}

export class PlayerStatisticsMatchRowResponse {
  @ApiProperty({ description: 'Public stage number, for linking to this match’s public report' })
  stageNumber!: number;

  @ApiProperty({
    description: 'Public match number within its stage, for linking to this match’s public report',
  })
  matchNumber!: number;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Published kickoff instant in ISO-8601 UTC when scheduled',
  })
  scheduledAt?: string;

  @ApiProperty({ enum: ['home', 'away'], description: 'The player’s side in this match' })
  side!: 'home' | 'away';

  @ApiProperty({ description: 'Opponent entrant display name' })
  opponentName!: string;

  @ApiPropertyOptional({ description: 'Opponent entrant abbreviation, when resolved' })
  opponentAbbreviation?: string;

  @ApiPropertyOptional({
    description: 'Opponent club alias, when the opponent belongs to a club with an alias',
  })
  opponentClubAlias?: string;

  @ApiPropertyOptional({ description: 'Final score of the player’s side' })
  ownScore?: number;

  @ApiPropertyOptional({ description: 'Final score of the opponent’s side' })
  opponentScore?: number;

  @ApiProperty({
    description:
      'One cell per collector-kind declared column, keyed by column code — composite and ' +
      'computed columns are aggregate ratios/expressions that do not apply to a single match, ' +
      'so they never appear here',
    type: TableCellResponse,
  })
  cells!: Record<string, TableCellResponse>;
}

export class PlayerStatisticsDrilldownResponse {
  @ApiProperty()
  layoutCode!: string;

  @ApiProperty()
  label!: string | LocalizedLabel;

  @ApiProperty({
    type: TableColumnResponse,
    isArray: true,
    description: 'Every non-rank declared column — collector, composite, and computed',
  })
  columns!: TableColumnResponse[];

  @ApiPropertyOptional({
    type: TableCellResponse,
    description:
      'One cell per column in `columns`, keyed by column code — the same values as this ' +
      'player’s own leaderboard row. Absent when the player has no recorded roster appearance ' +
      'anywhere in the tournament.',
  })
  tournamentTotal?: Record<string, TableCellResponse>;

  @ApiProperty({
    type: PlayerStatisticsMatchRowResponse,
    isArray: true,
    description:
      'One row per finalized match the player is rostered in, ordered by stage then match number',
  })
  matches!: PlayerStatisticsMatchRowResponse[];
}
