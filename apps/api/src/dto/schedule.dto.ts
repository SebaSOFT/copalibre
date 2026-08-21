import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
  startsAt!: number;

  @ApiProperty({
    description: 'How long the resource is reserved — not how long the match takes',
    example: 90,
  })
  durationMinutes!: number;
}

export class ScheduleAssignmentDto {
  @ApiProperty({ format: 'uuid' })
  fixtureId!: string;

  @ApiProperty({ type: TimeWindowDto })
  window!: TimeWindowDto;

  @ApiPropertyOptional({ format: 'uuid', description: 'Venue hosting the fixture' })
  venueId?: string;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description: 'Officials assigned to the fixture',
  })
  officialIds?: string[];
}

export class RestRuleDto {
  @ApiProperty({
    description: "Minimum minutes between an entrant's consecutive fixtures",
    example: 45,
  })
  minimumMinutes!: number;
}

export class ScheduleRequest {
  @ApiProperty({ type: [ScheduleAssignmentDto] })
  assignments!: ScheduleAssignmentDto[];

  @ApiPropertyOptional({ type: RestRuleDto })
  restRule?: RestRuleDto;
}

export class ScheduleConflictDto {
  @ApiProperty({
    enum: ['venue-double-booked', 'official-double-booked', 'rest-rule'],
    description: 'Which rule the schedule breaks',
  })
  kind!: string;

  @ApiProperty({ format: 'uuid' })
  fixtureId!: string;

  @ApiProperty({ format: 'uuid', description: 'The fixture it clashes with' })
  conflictsWithFixtureId!: string;

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
    description: 'Already-published fixtures this batch would move',
  })
  affectedPublishedFixtures!: string[];
}

export class ScheduleResponse {
  @ApiProperty({ type: [ScheduleAssignmentDto] })
  assignments!: ScheduleAssignmentDto[];
}

/**
 * A generated fixture, real `fixtureId` included — what a schedule builder
 * assigns a time and venue to. Distinct from the bracket graph's own node
 * ids, which are never persisted.
 */
export class FixtureResponse {
  @ApiProperty({ format: 'uuid' })
  fixtureId!: string;

  @ApiProperty({ description: '1-based round within the stage', example: 1 })
  round!: number;

  @ApiPropertyOptional({ format: 'uuid' })
  homeEntrantId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  awayEntrantId?: string;
}

export class StageFixturesResponse {
  @ApiProperty({ format: 'uuid', description: 'Resolves this stage’s number to its id' })
  stageId!: string;

  @ApiProperty({ type: [FixtureResponse] })
  fixtures!: FixtureResponse[];
}
