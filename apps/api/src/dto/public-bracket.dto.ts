import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BracketSlotSourceResponse } from './bracket-slot-source.dto.js';
import {
  FixtureSourcesResponse,
  fixtureSideSourceSchema,
  type FixtureSideSourceDto,
} from './fixture-side-source.dto.js';

export class PublicBracketSlotResponse {
  @ApiPropertyOptional(fixtureSideSourceSchema)
  source?: FixtureSideSourceDto;
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
  hiddenAtRequest?: boolean;

  @ApiPropertyOptional()
  publicProfileAvailable?: boolean;

  @ApiPropertyOptional()
  abbreviation?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: "The entrant's club, when it belongs to one",
  })
  clubId?: string;

  @ApiPropertyOptional({ description: "The club's emblem object id, when one is on record" })
  emblemObjectId?: string;

  @ApiPropertyOptional({ description: 'Match this slot sources its participant from' })
  matchId?: string;

  @ApiPropertyOptional({
    type: () => BracketSlotSourceResponse,
    description:
      'Where this side came from, kept once the slot holds the entrant that got here, so the ' +
      'link between the two matches can still be drawn',
  })
  from?: BracketSlotSourceResponse;

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

export class PublicBracketMatchResponse extends FixtureSourcesResponse {
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

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Winning entrant id when the node is finalized and a winner is recorded',
  })
  winnerEntrantId?: string;

  @ApiPropertyOptional()
  format?: string;

  @ApiPropertyOptional({
    description:
      "The match's stage-unique ordinal for the public report page's URL — present only when this " +
      'graph node resolved to a real persisted match; a purely theoretical winner-of/loser-of ' +
      'placeholder has none yet',
  })
  matchNumber?: number;

  @ApiPropertyOptional({
    description: 'A placement game’s part in its zone, such as `place-3` or `places-5-8`',
    example: 'place-3',
  })
  role?: string;

  @ApiProperty({ type: [PublicBracketSlotResponse] })
  slots!: PublicBracketSlotResponse[];

  @ApiPropertyOptional({
    type: PublicSeriesStateResponse,
    description: 'Present only on a cross settled by a series',
  })
  series?: PublicSeriesStateResponse;
}

/**
 * One zone's own independent bracket — or the stage's only bracket, for an un-zoned stage, which
 * always comes back as exactly one zone entry with no `zoneId`/`zoneName`.
 */
export class PublicBracketZoneResponse {
  @ApiPropertyOptional({ format: 'uuid', description: 'Absent for an un-zoned stage' })
  zoneId?: string;

  @ApiPropertyOptional({ description: 'Absent for an un-zoned stage' })
  zoneName?: string;

  @ApiProperty({
    description:
      'The format this zone plays: its own when it declares one, otherwise the stage’s. Decides how the zone is drawn.',
  })
  format!: string;

  @ApiPropertyOptional({
    description:
      '0-based overall place offset for this zone when incoming promotion bands map 1-to-1 onto zones contiguously from 1',
  })
  overallPlaceOffset?: number;

  @ApiProperty({ type: [PublicBracketMatchResponse] })
  matches!: PublicBracketMatchResponse[];
}

export class PublicBracketResponse {
  @ApiPropertyOptional({ description: 'The competition format of the stage' })
  format?: string;

  @ApiProperty({ type: [PublicBracketZoneResponse] })
  zones!: PublicBracketZoneResponse[];
}
