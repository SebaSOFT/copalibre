import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';

/**
 * Scheduling wire shapes.
 *
 * Every instant is epoch milliseconds. A schedule is compared, published and
 * moved; rendering one for a person is the surface's job, and a formatted date
 * varies by viewer while the value a client reasons about must not.
 */

export class TimeWindowDto {
  @ApiProperty({
    description: 'Start of the reserved window, epoch milliseconds',
    example: 1785333600000,
  })
  @IsNumber()
  startsAt!: number;

  @ApiProperty({
    description: 'How long the resource is reserved — not how long the match takes',
    example: 90,
  })
  @IsNumber()
  durationMinutes!: number;
}

export class ScheduleAssignmentDto {
  @ApiProperty({ format: 'uuid' })
  @IsString()
  matchId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsString()
  slotId!: string;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description: 'Officials assigned to the match',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  officialIds?: string[];
}

export class ScheduleAssignmentResponse {
  @ApiProperty({ format: 'uuid' })
  matchId!: string;

  @ApiProperty({ format: 'uuid' })
  fixtureId!: string;

  @ApiProperty({ format: 'uuid' })
  slotId!: string;

  @ApiProperty({ format: 'uuid', description: 'Venue hosting the slot' })
  venueId!: string;

  @ApiProperty({ type: TimeWindowDto })
  window!: TimeWindowDto;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description: 'Officials assigned to the match',
  })
  officialIds?: string[];
}

export class RestRuleDto {
  @ApiProperty({
    description: "Minimum minutes between an entrant's consecutive matches",
    example: 45,
  })
  @IsNumber()
  minimumMinutes!: number;
}

export class ScheduleRequest {
  @ApiProperty({ type: [ScheduleAssignmentDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScheduleAssignmentDto)
  assignments!: ScheduleAssignmentDto[];

  @ApiPropertyOptional({ type: RestRuleDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RestRuleDto)
  restRule?: RestRuleDto;
}

export class ScheduleConflictDto {
  @ApiProperty({
    enum: ['venue-double-booked', 'official-double-booked', 'rest-rule', 'match-finalized'],
    description: 'Which rule the schedule breaks',
  })
  kind!: string;

  @ApiProperty({ format: 'uuid' })
  matchId!: string;

  @ApiProperty({ format: 'uuid', description: 'The match it clashes with' })
  conflictsWithMatchId!: string;

  @ApiProperty({ description: 'Venue, official or entrant the clash is about' })
  resourceId!: string;

  @ApiProperty({ description: 'Human-readable explanation an operator can act on' })
  detail!: string;
}

export class SchedulePreviewResponse {
  @ApiProperty({
    description: 'Whether the batch would publish as it stands',
  })
  committable!: boolean;

  @ApiProperty({ type: [ScheduleConflictDto] })
  conflicts!: ScheduleConflictDto[];

  @ApiProperty({
    type: [String],
    format: 'uuid',
    description: 'Already-published matches this batch would move',
  })
  affectedPublishedMatches!: string[];
}

export class ScheduleResponse {
  @ApiProperty({ type: [ScheduleAssignmentResponse] })
  assignments!: ScheduleAssignmentResponse[];
}

/**
 * One match of a fixture, in play order.
 *
 * A single-match fixture has exactly one of these and a series has one per game, which is
 * what lets a builder place game one and game four in slots at different venues on different
 * days: the placeable thing is the match, never the cross.
 */
export class FixtureMatchResponse {
  @ApiProperty({ format: 'uuid' })
  matchId!: string;

  @ApiProperty({ description: '1-based play order within the fixture', example: 1 })
  number!: number;

  @ApiProperty({
    enum: ['scheduled', 'in-progress', 'finalized', 'not-required'],
    description: '`not-required` is a game a decided series anulled — never played, never deleted',
  })
  status!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'The slot this match had occupied before a decided series freed it. Present only on an ' +
      'anulled match that held one; the slot itself is free and open to anyone.',
  })
  releasedSlotId?: string;
}

/**
 * A fixture's series state, absent entirely on a fixture that declares no series.
 *
 * Read from the engine's own resolver rather than re-derived, so what a builder shows and what
 * the engine decided cannot drift.
 */
export class FixtureSeriesResponse {
  @ApiProperty({ description: 'Total scheduled matches in the series', example: 5 })
  span!: number;

  @ApiPropertyOptional({ enum: ['best-of', 'aggregate', 'points-per-leg'] })
  resolutionClass?: string;

  @ApiProperty({
    description:
      'How many games will certainly be played whatever the results — a best-of-five is ' +
      'three; every game beyond this one is contingent on the series still being alive',
    example: 3,
  })
  guaranteedMatches!: number;

  @ApiPropertyOptional({ enum: ['decided', 'undecided', 'finished-unresolved'] })
  status?: string;

  @ApiPropertyOptional({ description: 'Why the series stands where it does, in words' })
  explanation?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Side the series has settled on, if any' })
  winnerEntrantId?: string;

  @ApiProperty({ description: 'Games of the series finalized so far', example: 3 })
  matchesPlayed!: number;

  @ApiProperty({
    type: [Number],
    description:
      'Play-order numbers a decided series no longer requires. A match still `scheduled` here ' +
      'is one whose slot the decision would free but has not freed yet.',
  })
  anulledMatchNumbers!: number[];
}

/**
 * A generated fixture, real `fixtureId` and materialized `matchId` included — what a schedule builder
 * assigns a time and venue to. Distinct from the bracket graph's own node
 * ids, which are never persisted.
 */
export class FixtureResponse {
  @ApiProperty({ format: 'uuid' })
  fixtureId!: string;

  @ApiProperty({
    format: 'uuid',
    description: 'First match of this fixture — the only one unless it declares a series',
  })
  matchId!: string;

  @ApiProperty({ description: '1-based round within the stage', example: 1 })
  round!: number;

  @ApiPropertyOptional({ format: 'uuid' })
  homeEntrantId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  awayEntrantId?: string;

  @ApiProperty({
    type: [FixtureMatchResponse],
    description: 'Every match of this fixture in play order; exactly one unless it is a series',
  })
  matches!: FixtureMatchResponse[];

  @ApiPropertyOptional({ type: FixtureSeriesResponse })
  series?: FixtureSeriesResponse;
}

export class StageFixturesResponse {
  @ApiProperty({ format: 'uuid', description: 'Resolves this stage’s number to its id' })
  stageId!: string;

  @ApiProperty({ type: [FixtureResponse] })
  fixtures!: FixtureResponse[];
}
