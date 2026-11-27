import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { LocalizedLabel } from '@copalibre/domain';
import { FixtureSourcesResponse } from './fixture-side-source.dto.js';
import { PublicPreviousPlacementResponse } from './public-overview.dto.js';
import { PublicSegmentSummaryResponse, PublicMatchClockResponse } from './public-live.dto.js';
import { PublicSeriesStateResponse } from './public-bracket.dto.js';

/** A card's latest recorded event — deliberately generic, never a specific event code. */
export class PublicMatchesViewEventResponse {
  @ApiProperty({ description: "The event definition's discipline code" })
  definitionCode!: string;

  @ApiProperty({ description: "The event's own discipline-declared label" })
  label!: string;

  @ApiPropertyOptional({
    description: "The event's localized discipline labels",
    type: 'object',
    additionalProperties: { type: 'string' },
  })
  labels?: LocalizedLabel;

  @ApiProperty({ format: 'date-time' })
  occurredAt!: string;
}

export class PublicMatchesViewMatchResponse extends FixtureSourcesResponse {
  @ApiPropertyOptional({ description: 'Independent published schedule replay version' })
  scheduleVersion?: number;

  @ApiPropertyOptional({ type: PublicPreviousPlacementResponse, nullable: true })
  rescheduledFrom?: PublicPreviousPlacementResponse | null;

  @ApiProperty({ format: 'uuid' })
  matchId!: string;

  @ApiProperty()
  stageNumber!: number;

  @ApiPropertyOptional({
    description: 'The stage name as the organizer named it; absent when empty',
  })
  stageName?: string;

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
  homeHiddenAtRequest?: boolean;

  @ApiPropertyOptional()
  homePublicProfileAvailable?: boolean;

  @ApiPropertyOptional()
  homeAbbreviation?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  homeClubId?: string;

  @ApiPropertyOptional({ description: "Home club's alias, when present" })
  homeClubAlias?: string;

  @ApiPropertyOptional()
  homeEmblemObjectId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'The winning entrant of a finished match; absent when no side won',
  })
  winnerEntrantId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  awayEntrantId?: string;

  @ApiPropertyOptional()
  awayName?: string;

  @ApiPropertyOptional()
  awayHiddenAtRequest?: boolean;

  @ApiPropertyOptional()
  awayPublicProfileAvailable?: boolean;

  @ApiPropertyOptional()
  awayAbbreviation?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  awayClubId?: string;

  @ApiPropertyOptional({ description: "Away club's alias, when present" })
  awayClubAlias?: string;

  @ApiPropertyOptional()
  awayEmblemObjectId?: string;

  @ApiPropertyOptional()
  homeScore?: number;

  @ApiPropertyOptional()
  awayScore?: number;

  @ApiPropertyOptional({ description: 'Present only while the match is in progress' })
  clockSeconds?: number;

  @ApiPropertyOptional({
    type: () => PublicMatchClockResponse,
    description: 'Active timed segment clock snapshot, omitted when idle or untimed',
  })
  clock?: PublicMatchClockResponse;

  @ApiPropertyOptional({
    type: () => [PublicSegmentSummaryResponse],
    description: 'The match’s segments and what each side scored in each, present while live',
  })
  segments?: PublicSegmentSummaryResponse[];

  @ApiPropertyOptional()
  venueName?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  scheduledAt?: string;

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
    deprecated: true,
    description:
      'One line naming the tiebreak comparator that decided a finalized, standings-relevant ' +
      'match — never the full internal comparator trace',
  })
  decidingFactor?: string;

  @ApiPropertyOptional({
    description:
      'Tiebreaker code of the comparator that separated this match’s two entrants while tied',
  })
  decidingFactorCode?: string;

  @ApiPropertyOptional({
    description: '1-based position of that comparator in the tiebreak order',
  })
  decidingFactorRule?: number;
}

export class PublicMatchesViewResponse {
  @ApiProperty({ type: [PublicMatchesViewMatchResponse] })
  matches!: PublicMatchesViewMatchResponse[];
}
