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

  @ApiPropertyOptional({ description: '1-based sequential number within the stage' })
  matchNumber?: number;

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

export class PublicOverviewClubResponse {
  @ApiProperty({ format: 'uuid' })
  clubId!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional()
  alias?: string;

  @ApiPropertyOptional()
  emblemObjectId?: string;
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

  @ApiPropertyOptional({ type: [PublicOverviewClubResponse] })
  clubs?: PublicOverviewClubResponse[];

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
  stageNumber!: number;

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

export class PublicMatchOfficialResponse {
  @ApiProperty()
  name!: string;

  @ApiProperty({ type: [String] })
  roles!: string[];
}

export class PublicMatchRosterMemberResponse {
  @ApiProperty({ format: 'uuid' })
  personId!: string;

  @ApiPropertyOptional({ oneOf: [{ type: 'number' }, { type: 'string' }] })
  number?: number | string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional()
  nationality?: string;

  @ApiPropertyOptional({ type: [String] })
  roles?: string[];

  @ApiProperty()
  onField!: boolean;
}

export class PublicMatchRostersResponse {
  @ApiProperty({ type: [PublicMatchRosterMemberResponse] })
  home!: PublicMatchRosterMemberResponse[];

  @ApiProperty({ type: [PublicMatchRosterMemberResponse] })
  away!: PublicMatchRosterMemberResponse[];
}

export class PublicMatchEventResponse {
  @ApiProperty({ format: 'uuid' })
  eventId!: string;

  @ApiProperty()
  definitionCode!: string;

  @ApiProperty()
  label!: string;

  @ApiPropertyOptional({ type: [String] })
  workflowOutcomeCodes?: string[];

  @ApiProperty({ format: 'date-time' })
  occurredAt!: string;

  @ApiProperty()
  sequence!: number;

  @ApiPropertyOptional()
  segmentNumber?: number;

  @ApiPropertyOptional({ format: 'uuid' })
  side?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  personId?: string;

  @ApiProperty({ type: 'object', additionalProperties: true })
  payload!: Record<string, unknown>;
}

export class PublicMatchReportResponse {
  @ApiProperty()
  organizationAlias!: string;

  @ApiProperty()
  organizationName!: string;

  @ApiProperty()
  tournamentAlias!: string;

  @ApiProperty()
  tournamentName!: string;

  @ApiProperty()
  stageNumber!: number;

  @ApiProperty()
  matchNumber!: number;

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

  @ApiPropertyOptional()
  venueName?: string;

  @ApiProperty()
  schedulePublished!: boolean;

  @ApiProperty({ type: [PublicMatchOfficialResponse] })
  officials!: PublicMatchOfficialResponse[];

  @ApiProperty({ type: PublicMatchRostersResponse })
  rosters!: PublicMatchRostersResponse;

  @ApiProperty({ type: [PublicMatchEventResponse] })
  timeline!: PublicMatchEventResponse[];
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

  @ApiPropertyOptional({
    description: 'Why this side’s result is what it is; absent means an ordinarily played result',
    enum: [
      'played',
      'administrative-loss',
      'walkover',
      'forfeit-abandonment',
      'disqualified',
      'did-not-finish',
    ],
  })
  resultReason?: string;
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
}

export class PublicPersonCareerStatisticResponse {
  @ApiProperty()
  code!: string;

  @ApiProperty()
  label!: string;

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
