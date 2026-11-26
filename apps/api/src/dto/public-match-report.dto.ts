import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { LocalizedLabel } from '@copalibre/domain';
import { FixtureSourcesResponse } from './fixture-side-source.dto.js';
import {
  PublicPreviousPlacementResponse,
  PublicObjectReferenceResponse,
} from './public-overview.dto.js';
import {
  PublicLivePenaltyResponse,
  PublicMatchCounterResponse,
  PublicSegmentSummaryResponse,
  PublicMatchClockResponse,
} from './public-live.dto.js';

export class PublicMatchOfficialResponse {
  @ApiProperty()
  name!: string;

  @ApiProperty({ type: [String] })
  roles!: string[];
}

export class PublicMatchRosterMemberResponse {
  @ApiPropertyOptional({ format: 'uuid' })
  personId?: string;

  @ApiPropertyOptional({ oneOf: [{ type: 'number' }, { type: 'string' }] })
  number?: number | string;

  @ApiPropertyOptional()
  name?: string;

  @ApiPropertyOptional()
  hiddenAtRequest?: boolean;

  @ApiPropertyOptional()
  publicProfileAvailable?: boolean;

  @ApiPropertyOptional()
  nationality?: string;

  @ApiPropertyOptional({ type: [String] })
  roles?: string[];

  @ApiProperty()
  onField!: boolean;
}

export class PublicRosterRoleResponse {
  @ApiProperty()
  code!: string;

  @ApiPropertyOptional()
  badge?: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'The role label: a plain string, or a localized label with `en` always present.',
  })
  label!: string | LocalizedLabel;
}

export class PublicMatchRostersResponse {
  @ApiProperty({ type: [PublicMatchRosterMemberResponse] })
  home!: PublicMatchRosterMemberResponse[];

  @ApiProperty({ type: [PublicMatchRosterMemberResponse] })
  away!: PublicMatchRosterMemberResponse[];
}

export class PublicRegisteredSquadMemberResponse {
  @ApiPropertyOptional({ format: 'uuid' })
  personId?: string;

  @ApiPropertyOptional()
  name?: string;

  @ApiPropertyOptional()
  hiddenAtRequest?: boolean;

  @ApiProperty()
  publicProfileAvailable!: boolean;

  @ApiPropertyOptional()
  nationality?: string;
}

export class PublicRegisteredSquadsResponse {
  @ApiPropertyOptional({ type: [PublicRegisteredSquadMemberResponse] })
  home?: PublicRegisteredSquadMemberResponse[];

  @ApiPropertyOptional({ type: [PublicRegisteredSquadMemberResponse] })
  away?: PublicRegisteredSquadMemberResponse[];
}

export class PublicMatchGameResponse {
  @ApiProperty({ description: 'The game’s number within its fixture, 1-based play order' })
  number!: number;

  @ApiProperty({ enum: ['upcoming', 'live', 'final', 'not-required'] })
  status!: 'upcoming' | 'live' | 'final' | 'not-required';
}

export class PublicMatchEventResponse {
  @ApiProperty({ format: 'uuid' })
  eventId!: string;

  @ApiProperty()
  definitionCode!: string;

  @ApiProperty({
    description: 'The English label; `labels` carries every language the descriptor ships.',
  })
  label!: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'string' },
    description:
      "The event definition's label in every language the discipline descriptor declares " +
      '(`en` always present); absent when the descriptor declares a plain string.',
  })
  labels?: LocalizedLabel;

  @ApiPropertyOptional({ type: [String] })
  workflowOutcomeCodes?: string[];

  @ApiProperty({ format: 'date-time' })
  occurredAt!: string;

  @ApiProperty()
  sequence!: number;

  @ApiPropertyOptional()
  segmentNumber?: number;

  @ApiPropertyOptional({
    description:
      'Seconds into its segment when recorded; absent for an untimed segment and for events recorded before it was stored',
  })
  segmentElapsedSeconds?: number;

  @ApiPropertyOptional({
    type: [Number],
    minItems: 2,
    maxItems: 2,
    description:
      'The score [home, away] after this event, on every event that changes the score: the last one equals the final score',
  })
  scoreAfter?: [number, number];

  @ApiPropertyOptional({ format: 'uuid' })
  side?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  personId?: string;

  @ApiPropertyOptional()
  hiddenAtRequest?: boolean;

  @ApiProperty({ type: 'object', additionalProperties: true })
  payload!: Record<string, unknown>;
}

export class PublicMatchReportResponse extends FixtureSourcesResponse {
  @ApiProperty({
    format: 'uuid',
    description: 'The match id, so a page can follow its live stream before the match starts',
  })
  matchId!: string;

  @ApiPropertyOptional({
    enum: [true],
    description:
      'Present for every status when the discipline shows a counter or declares a timed penalty: the page then follows the match stream',
  })
  tracksLiveIndicators?: true;

  @ApiPropertyOptional({ description: 'Independent published schedule replay version' })
  scheduleVersion?: number;

  @ApiPropertyOptional({ type: PublicPreviousPlacementResponse, nullable: true })
  rescheduledFrom?: PublicPreviousPlacementResponse | null;

  @ApiProperty()
  organizationAlias!: string;

  @ApiProperty()
  organizationName!: string;

  @ApiPropertyOptional({ description: "Organization's IANA time zone for public schedule labels" })
  organizationTimeZone?: string;

  @ApiProperty()
  tournamentAlias!: string;

  @ApiProperty()
  tournamentName!: string;

  @ApiPropertyOptional({ type: [PublicObjectReferenceResponse] })
  disciplineImages?: PublicObjectReferenceResponse[];

  @ApiProperty()
  stageNumber!: number;

  @ApiPropertyOptional({
    description: 'The stage name as the organizer named it; absent when empty',
  })
  stageName?: string;

  @ApiPropertyOptional({
    description:
      'The zone the match belongs to as the organizer named it; absent for an implicit zone',
  })
  zoneName?: string;

  @ApiPropertyOptional({
    description: 'The match group as the organizer named it; absent for an implicit group',
  })
  groupName?: string;

  @ApiProperty({
    description:
      "The stage's competition format — identifies which stage this match belongs to, so a " +
      'client can decide whether a bracket-context panel applies without a second request.',
  })
  stageFormat!: string;

  @ApiProperty()
  matchNumber!: number;

  @ApiProperty()
  round!: number;

  @ApiProperty({ enum: ['upcoming', 'live', 'final'] })
  status!: 'upcoming' | 'live' | 'final';

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Winning entrant id when the match is finalized and a winner is recorded',
  })
  winnerEntrantId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  homeEntrantId?: string;

  @ApiPropertyOptional()
  homeName?: string;

  @ApiPropertyOptional()
  homeHiddenAtRequest?: boolean;

  @ApiPropertyOptional()
  homeAbbreviation?: string;

  @ApiPropertyOptional({ description: "Home club's alias, when present" })
  homeClubAlias?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  awayEntrantId?: string;

  @ApiPropertyOptional()
  awayName?: string;

  @ApiPropertyOptional()
  awayHiddenAtRequest?: boolean;

  @ApiPropertyOptional()
  awayAbbreviation?: string;

  @ApiPropertyOptional({ description: "Away club's alias, when present" })
  awayClubAlias?: string;

  @ApiPropertyOptional({ format: 'uuid', description: "Home club's id, for its crest" })
  homeClubId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: "Home club's emblem object, for its crest" })
  homeEmblemObjectId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: "Away club's id, for its crest" })
  awayClubId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: "Away club's emblem object, for its crest" })
  awayEmblemObjectId?: string;

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

  @ApiPropertyOptional({
    type: () => PublicRegisteredSquadsResponse,
    description:
      'Each team side’s registered players, present only for a scheduled match whose side has no match-day roster recorded yet',
  })
  registeredSquads?: PublicRegisteredSquadsResponse;

  @ApiPropertyOptional({
    description: 'The link the match is watched through, when the organizer attached one',
  })
  streamUrl?: string;

  @ApiPropertyOptional({
    description:
      'The game this report is for, when its fixture has more than one game (a series); absent otherwise',
  })
  gameNumber?: number;

  @ApiPropertyOptional({
    type: [PublicMatchGameResponse],
    description:
      'Every game of the fixture in play order, with its status, so a page can switch between them; present only for a series',
  })
  games?: PublicMatchGameResponse[];

  @ApiPropertyOptional({
    type: [PublicRosterRoleResponse],
    description:
      "The discipline's declared roster roles, so a client can label each member's role codes.",
  })
  rosterRoles?: PublicRosterRoleResponse[];

  @ApiProperty({ type: [PublicMatchEventResponse] })
  timeline!: PublicMatchEventResponse[];

  @ApiPropertyOptional({
    type: () => [PublicSegmentSummaryResponse],
    description: 'The match’s segments and what each side scored in each',
  })
  segments?: PublicSegmentSummaryResponse[];

  @ApiPropertyOptional({
    type: () => PublicMatchClockResponse,
    description: 'Active timed segment clock snapshot, omitted when idle or untimed',
  })
  clock?: PublicMatchClockResponse;

  @ApiPropertyOptional({
    type: () => [PublicMatchCounterResponse],
    description:
      'Declared match counters, omitted when the discipline shows none and for a match that is neither in progress nor finalized',
  })
  counters?: PublicMatchCounterResponse[];

  @ApiPropertyOptional({
    type: () => [PublicLivePenaltyResponse],
    description: 'Timed penalties in force, with the seconds left; present while the match is live',
  })
  activePenalties?: PublicLivePenaltyResponse[];
}
