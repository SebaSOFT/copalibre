import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { LocalizedLabel } from '@copalibre/domain';
import { FixtureSourcesResponse } from './fixture-side-source.dto.js';
import { PublicPreviousPlacementResponse } from './public-overview.dto.js';

export class PublicLiveMatchSideResponse {
  @ApiProperty({ format: 'uuid' })
  entrantId!: string;

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

  @ApiProperty()
  score!: number;
}

export class PublicLivePenaltyResponse {
  @ApiProperty({ format: 'uuid' })
  timerId!: string;

  @ApiProperty({ format: 'uuid' })
  entrantId!: string;

  @ApiProperty({ description: 'Seconds remaining at response time' })
  remainingSeconds!: number;
}

/** One side's value for a match counter. */
export class PublicMatchCounterValueResponse {
  @ApiProperty({ format: 'uuid' })
  entrantId!: string;

  @ApiProperty({ description: 'The tally for this side. Never clamped to the allowance.' })
  value!: number;
}

/**
 * A display-only tally of recorded events for one match (team fouls, timeouts, cards). The
 * allowance and warning value are the effective ones after the tournament ruleset. Nothing is
 * refused at either. Values are per side, never per person.
 */
export class PublicMatchCounterResponse {
  @ApiProperty({ description: "The discipline's own counter code" })
  code!: string;

  @ApiProperty({
    oneOf: [{ type: 'string' }, { type: 'object', additionalProperties: true }],
    description: 'The counter label in every language the discipline wrote it in.',
  })
  label!: string | LocalizedLabel;

  @ApiProperty({
    oneOf: [{ type: 'string' }, { type: 'object', additionalProperties: true }],
    description: 'The compact label, at most three characters per language.',
  })
  shortLabel!: string | LocalizedLabel;

  @ApiProperty({
    enum: ['match', 'segment'],
    description: 'Whether the tally covers the whole match or resets each segment.',
  })
  scope!: 'match' | 'segment';

  @ApiPropertyOptional({ description: 'Shown as "value / allowance" when present' })
  allowance?: number;

  @ApiPropertyOptional({ description: 'Highlighted at or above this value' })
  warnAt?: number;

  @ApiProperty({
    type: [String],
    description:
      'The declared event codes this counter tallies, so a live client knows when to refresh.',
  })
  events!: string[];

  @ApiProperty({ type: [PublicMatchCounterValueResponse] })
  values!: PublicMatchCounterValueResponse[];
}

/**
 * One segment of a match (a half, a set, a frame), with what each side scored in it. `timed` tells a
 * segment played against a clock from one played to a target, which is what makes a set a set.
 */
export class PublicSegmentSummaryResponse {
  @ApiProperty({ description: '1-based order within the match' })
  number!: number;

  @ApiProperty({ description: "The discipline's own segment type name" })
  type!: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description: "The segment type's display label in every language the discipline wrote it in.",
  })
  label?: string | LocalizedLabel;

  @ApiPropertyOptional({
    description: 'Whether the segment runs against a clock; false for one played to a target',
  })
  timed?: boolean;

  @ApiProperty({ enum: ['pending', 'active', 'completed'] })
  state!: 'pending' | 'active' | 'completed';

  @ApiPropertyOptional({
    type: [Number],
    description: 'What each side scored in this segment alone, home first',
  })
  scores?: number[];
}

export class PublicMatchClockResponse {
  @ApiProperty({ description: '1-based number of the active segment' })
  segmentNumber!: number;

  @ApiProperty({ description: 'Elapsed seconds in the active segment when read' })
  elapsedSeconds!: number;

  @ApiProperty({ description: 'Whether the active segment clock is currently running' })
  running!: boolean;

  @ApiProperty({
    format: 'date-time',
    description: 'Server timestamp at which `elapsedSeconds` was read',
  })
  asOf!: string;
}

export class PublicLiveMatchResponse extends FixtureSourcesResponse {
  @ApiPropertyOptional({ format: 'date-time' })
  scheduledAt?: string;

  @ApiPropertyOptional()
  venueName?: string;
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

  @ApiPropertyOptional({
    description:
      'The 1-based ordinal of the match within its stage, the one the public match route addresses it by.',
  })
  stageOrdinal?: number;

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

  @ApiProperty()
  state!: string;

  @ApiProperty()
  projectionVersion!: number;

  @ApiProperty({ type: [PublicLiveMatchSideResponse] })
  sides!: PublicLiveMatchSideResponse[];

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Explicitly projected possession side; omitted when unavailable',
  })
  possessionEntrantId?: string;

  @ApiPropertyOptional({ type: [PublicLivePenaltyResponse] })
  activePenalties?: PublicLivePenaltyResponse[];

  @ApiPropertyOptional({
    type: () => [PublicMatchCounterResponse],
    description:
      'Declared match counters, omitted when the discipline shows none and for a match that is neither in progress nor finalized',
  })
  counters?: PublicMatchCounterResponse[];
}

export class PublicLiveResponse {
  @ApiProperty({ type: [PublicLiveMatchResponse] })
  matches!: PublicLiveMatchResponse[];
}
