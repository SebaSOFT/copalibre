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

export class PublicObjectReferenceResponse {
  @ApiProperty()
  key!: string;
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

  @ApiPropertyOptional({ type: [PublicObjectReferenceResponse] })
  disciplineImages?: PublicObjectReferenceResponse[];

  @ApiProperty({ type: [PublicOverviewMatchResponse] })
  matches!: PublicOverviewMatchResponse[];

  @ApiPropertyOptional({ type: [PublicStandingsRowResponse] })
  standingsPreview?: PublicStandingsRowResponse[];

  @ApiPropertyOptional({
    description:
      'Whether `standingsPreview` rows count one result per series or one per played match. ' +
      'Absent when the previewed stage declares no series at all.',
    enum: ['series', 'match'],
  })
  standingsGrain?: 'series' | 'match';

  @ApiPropertyOptional({ type: [PublicOverviewClubResponse] })
  clubs?: PublicOverviewClubResponse[];

  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' } })
  ruleset!: Record<string, string>;

  @ApiPropertyOptional({ enum: ['upcoming', 'live', 'finished'] })
  status?: 'upcoming' | 'live' | 'finished';

  @ApiPropertyOptional({ type: () => [PublicTournamentWinnerZoneResponse] })
  winners?: PublicTournamentWinnerZoneResponse[];
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

  @ApiPropertyOptional({ type: [PublicObjectReferenceResponse] })
  disciplineImages?: PublicObjectReferenceResponse[];

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

/**
 * One game of a series, as a spectator reads it: which position it holds, whether it was won
 * and by whom, and whether it is still to come or now will not be played at all.
 */
export class PublicSeriesGameResponse {
  @ApiProperty({ description: '1-based play order within the series', example: 4 })
  number!: number;

  @ApiProperty({
    enum: ['scheduled', 'in-progress', 'finalized', 'not-required'],
    description: '`not-required` is a game the series ended before reaching',
  })
  status!: string;

  @ApiPropertyOptional({ description: 'Winner of this game, when it has one' })
  winnerEntrantId?: string;

  @ApiPropertyOptional({
    enum: ['home', 'away'],
    description: 'Which side of the cross won, so a renderer matches no entrant ids itself',
  })
  winner?: string;

  @ApiPropertyOptional({
    type: [Number],
    description: 'Scores in the cross’s own side order — home first, away second',
  })
  scores?: number[];
}

/**
 * A cross's series state.
 *
 * Present only on a cross a series settles; absent everywhere else, so a single-match cross
 * renders exactly as it did before this existed and shows no series indication at all.
 */
export class PublicSeriesStateResponse {
  @ApiProperty({ description: 'Total games in the series, played or not', example: 5 })
  span!: number;

  @ApiPropertyOptional({ enum: ['best-of', 'aggregate', 'points-per-leg'] })
  resolutionClass?: string;

  @ApiProperty({
    type: [PublicSeriesGameResponse],
    description: 'Every game in play order — by game number, not by when it was finalized',
  })
  games!: PublicSeriesGameResponse[];

  @ApiProperty({ description: 'Games won by the home side', example: 2 })
  homeGamesWon!: number;

  @ApiProperty({ description: 'Games won by the away side', example: 1 })
  awayGamesWon!: number;

  @ApiPropertyOptional({
    type: [Number],
    description:
      'Summed score across every played game, home first. What decides an `aggregate` tie, ' +
      'and meaningless for a best-of, where games won is the score.',
  })
  aggregateScores?: number[];

  @ApiProperty({ enum: ['decided', 'undecided', 'finished-unresolved'] })
  status!: string;

  @ApiPropertyOptional({ description: 'The side the series settled on; absent while undecided' })
  winnerEntrantId?: string;

  @ApiPropertyOptional({ enum: ['home', 'away'], description: 'Which side of the cross advanced' })
  winner?: string;

  @ApiProperty({ description: 'Why the series stands where it does, in the engine’s own words' })
  explanation!: string;
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

  @ApiPropertyOptional({
    type: PublicSeriesStateResponse,
    description: 'Present only on a cross settled by a series',
  })
  series?: PublicSeriesStateResponse;
}

export class PublicBracketResponse {
  @ApiPropertyOptional({ description: 'The competition format of the stage' })
  format?: string;

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

export class PublicTournamentEntrantPodiumResponse {
  @ApiProperty({ format: 'uuid' })
  entrantId!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional()
  abbreviation?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  clubId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  emblemObjectId?: string;
}

export class PublicTournamentWinnerZoneResponse {
  @ApiPropertyOptional({ format: 'uuid' })
  zoneId?: string;

  @ApiPropertyOptional()
  zoneName?: string;

  @ApiProperty({ type: PublicTournamentEntrantPodiumResponse })
  champion!: PublicTournamentEntrantPodiumResponse;

  @ApiPropertyOptional({ type: PublicTournamentEntrantPodiumResponse })
  runnerUp?: PublicTournamentEntrantPodiumResponse;
}

export class PublicTournamentDisciplineSummaryResponse {
  @ApiProperty()
  descriptorId!: string;

  @ApiProperty()
  version!: string;

  @ApiPropertyOptional()
  name?: string;
}

export class PublicTournamentDatesResponse {
  @ApiPropertyOptional({ format: 'date-time' })
  startedAt?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  archivedAt?: string;
}

export class PublicTournamentListingItemResponse {
  @ApiProperty({ format: 'uuid' })
  tournamentId!: string;

  @ApiProperty()
  alias!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: ['upcoming', 'live', 'finished'] })
  status!: 'upcoming' | 'live' | 'finished';

  @ApiProperty({ type: PublicTournamentDisciplineSummaryResponse })
  discipline!: PublicTournamentDisciplineSummaryResponse;

  @ApiPropertyOptional({ type: PublicTournamentDatesResponse })
  dates?: PublicTournamentDatesResponse;

  @ApiPropertyOptional({ type: [PublicTournamentWinnerZoneResponse] })
  winners?: PublicTournamentWinnerZoneResponse[];
}

export class PublicOrganizationTournamentListResponse {
  @ApiProperty()
  organizationAlias!: string;

  @ApiProperty()
  organizationName!: string;

  @ApiPropertyOptional({ description: 'object_metadata.object_id of the organization emblem' })
  organizationEmblemObjectId?: string;

  @ApiProperty({ type: [PublicTournamentListingItemResponse] })
  tournaments!: PublicTournamentListingItemResponse[];

  @ApiProperty({ type: [PublicOverviewClubResponse] })
  clubs!: PublicOverviewClubResponse[];
}

/** A card's latest recorded event — deliberately generic, never a specific event code. */
export class PublicMatchesViewEventResponse {
  @ApiProperty({ description: "The event's own discipline-declared label" })
  label!: string;

  @ApiProperty({ format: 'date-time' })
  occurredAt!: string;
}

export class PublicMatchesViewMatchResponse {
  @ApiProperty({ format: 'uuid' })
  matchId!: string;

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

  @ApiPropertyOptional({ description: 'Present only while the match is in progress' })
  clockSeconds?: number;

  @ApiPropertyOptional()
  venueName?: string;

  @ApiPropertyOptional({ type: PublicMatchesViewEventResponse })
  latestEvent?: PublicMatchesViewEventResponse;

  @ApiPropertyOptional({
    description: 'Absent for the implicit, single zone/group every stage defaults to',
  })
  zoneName?: string;

  @ApiPropertyOptional({
    description: 'Absent for the implicit, single zone/group every stage defaults to',
  })
  groupName?: string;

  @ApiPropertyOptional({ description: "The home entrant's current standings position" })
  homePosition?: number;

  @ApiPropertyOptional({ description: "The away entrant's current standings position" })
  awayPosition?: number;

  @ApiPropertyOptional({
    type: PublicSeriesStateResponse,
    description:
      'Present only on a cross settled by a series; mutually exclusive with zone/position',
  })
  series?: PublicSeriesStateResponse;

  @ApiPropertyOptional({
    description:
      'One line naming the tiebreak comparator that decided a finalized, standings-relevant ' +
      'match — never the full internal comparator trace',
  })
  decidingFactor?: string;
}

export class PublicMatchesViewResponse {
  @ApiProperty({ type: [PublicMatchesViewMatchResponse] })
  matches!: PublicMatchesViewMatchResponse[];
}
