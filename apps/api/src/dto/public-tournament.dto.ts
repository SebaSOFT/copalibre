import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PublicStandingsRowResponse {
  @ApiProperty()
  rank!: number;

  @ApiProperty({ format: 'uuid' })
  entrantId!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional()
  abbreviation?: string;

  @ApiProperty()
  sharedRank!: boolean;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'number' },
  })
  statistics!: Record<string, number>;
}

export class PublicOverviewMatchResponse {
  @ApiProperty({ format: 'uuid' })
  matchId!: string;

  @ApiProperty()
  stageNumber!: number;

  @ApiProperty()
  round!: number;

  @ApiProperty({ enum: ['upcoming', 'live', 'final'] })
  status!: 'upcoming' | 'live' | 'final';

  @ApiPropertyOptional({ format: 'uuid' })
  homeEntrantId?: string;

  @ApiPropertyOptional()
  homeName?: string;

  @ApiPropertyOptional()
  homeAbbreviation?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  awayEntrantId?: string;

  @ApiPropertyOptional()
  awayName?: string;

  @ApiPropertyOptional()
  awayAbbreviation?: string;

  @ApiPropertyOptional()
  homeScore?: number;

  @ApiPropertyOptional()
  awayScore?: number;

  @ApiPropertyOptional({ format: 'date-time' })
  scheduledAt?: string;
}

export class PublicOverviewResponse {
  @ApiProperty()
  organizationAlias!: string;

  @ApiProperty()
  organizationName!: string;

  @ApiProperty()
  tournamentAlias!: string;

  @ApiProperty()
  tournamentName!: string;

  @ApiProperty()
  seasonName!: string;

  @ApiProperty({ type: [PublicOverviewMatchResponse] })
  matches!: PublicOverviewMatchResponse[];

  @ApiPropertyOptional({ type: [PublicStandingsRowResponse] })
  standingsPreview?: PublicStandingsRowResponse[];

  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' } })
  ruleset!: Record<string, string>;
}

export class PublicLiveMatchSideResponse {
  @ApiProperty({ format: 'uuid' })
  entrantId!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional()
  abbreviation?: string;

  @ApiProperty()
  score!: number;
}

export class PublicLiveMatchResponse {
  @ApiProperty({ format: 'uuid' })
  matchId!: string;

  @ApiProperty()
  matchNumber!: number;

  @ApiProperty()
  state!: string;

  @ApiProperty()
  projectionVersion!: number;

  @ApiProperty({ type: [PublicLiveMatchSideResponse] })
  sides!: PublicLiveMatchSideResponse[];
}

export class PublicLiveResponse {
  @ApiProperty({ type: [PublicLiveMatchResponse] })
  matches!: PublicLiveMatchResponse[];
}

export class PublicBracketSlotResponse {
  @ApiProperty({
    description: 'Where this side comes from',
    enum: ['entrant', 'bye', 'winner-of', 'loser-of'],
  })
  kind!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  entrantId?: string;

  @ApiPropertyOptional()
  name?: string;

  @ApiPropertyOptional()
  abbreviation?: string;

  @ApiPropertyOptional({ description: 'Match this slot sources its participant from' })
  matchId?: string;

  @ApiPropertyOptional({ description: 'Score recorded for this side, when the match is finalized' })
  score?: number;
}

export class PublicBracketMatchResponse {
  @ApiProperty()
  matchId!: string;

  @ApiProperty({ enum: ['winner', 'loser', 'consolation'] })
  bracket!: string;

  @ApiProperty()
  round!: number;

  @ApiProperty()
  position!: number;

  @ApiProperty()
  status!: string;

  @ApiPropertyOptional()
  format?: string;

  @ApiProperty({ type: [PublicBracketSlotResponse] })
  slots!: PublicBracketSlotResponse[];
}

export class PublicBracketResponse {
  @ApiProperty({ type: [PublicBracketMatchResponse] })
  matches!: PublicBracketMatchResponse[];
}
