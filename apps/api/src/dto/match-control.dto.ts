import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Match-control wire shapes (0014).
 *
 * A side is an entrant id, never a position: the same request body describes a
 * duel and an eight-lane heat. Instants are epoch milliseconds, as everywhere
 * else — rendering one for a person is the console's job.
 */

export class MatchStateResponse {
  @ApiProperty({ format: 'uuid' })
  matchId!: string;

  @ApiProperty({ enum: ['scheduled', 'in-progress', 'finalized'] })
  status!: string;

  @ApiProperty({ description: 'Whether the active segment’s clock is running' })
  clockRunning!: boolean;

  @ApiProperty({ type: [String], description: 'Timers still running, by event id' })
  runningTimers!: RunningTimerDto[];
}

export class RunningTimerDto {
  @ApiProperty({ format: 'uuid', description: 'The event that started it' })
  timerId!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'The entrant serving it' })
  side?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  participantId?: string;

  @ApiProperty({ description: 'Epoch milliseconds of the causing event' })
  startedAt!: number;

  @ApiProperty()
  durationSeconds!: number;

  @ApiProperty({ description: 'Derived at read; never a stored countdown' })
  remainingSeconds!: number;
}

export class RecordEventRequest {
  @ApiProperty({ description: 'Event definition code the discipline declares', example: 'goal' })
  definitionCode!: string;

  @ApiProperty({ format: 'uuid', description: 'Segment the event happened in' })
  segmentId!: string;

  @ApiProperty({ description: 'When it happened, epoch milliseconds' })
  occurredAt!: number;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'The entrant it belongs to — an id, never "home"/"away"',
  })
  side?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'The person, when the discipline needs one' })
  participantId?: string;

  @ApiPropertyOptional({ type: Object, description: 'Payload validated against the definition' })
  payload?: Record<string, unknown>;
}

export class RecordedEventResponse {
  @ApiProperty({ format: 'uuid' })
  eventId!: string;

  @ApiProperty()
  definitionCode!: string;

  @ApiProperty({ description: 'Monotonic per-match ordering assigned by the log' })
  sequence!: number;

  @ApiPropertyOptional({ format: 'uuid' })
  side?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  participantId?: string;

  @ApiProperty({
    type: [String],
    description: 'Identity keys of notifications this event declared, deduplicated on delivery',
  })
  notifications!: string[];
}

export class FinalizeRequest {
  @ApiProperty({
    type: [Object],
    description:
      'One entry per side: entrant id, its declared statistics, and placement for a heat',
  })
  sides!: {
    entrantId: string;
    statistics: Record<string, number>;
    placement?: number;
  }[];

  @ApiPropertyOptional({ format: 'uuid', description: 'Duel matches only' })
  winnerEntrantId?: string;
}

export class CorrectionRequestDto {
  @ApiProperty({ description: 'Why the result is being corrected, in the operator’s words' })
  reason!: string;

  @ApiProperty({ type: [Object], description: 'The replacement result, one entry per side' })
  sides!: {
    entrantId: string;
    statistics: Record<string, number>;
    placement?: number;
  }[];

  @ApiPropertyOptional({ format: 'uuid' })
  winnerEntrantId?: string;
}

export class BlockedPropagationDto {
  @ApiProperty({ format: 'uuid' })
  stageId!: string;

  @ApiProperty({ description: 'Why nothing downstream was rebuilt' })
  reason!: string;
}

export class CorrectionPreviewResponse {
  @ApiProperty({ type: [String], description: 'Entrants whose recorded numbers move' })
  changedEntrantIds!: string[];

  @ApiPropertyOptional({
    type: BlockedPropagationDto,
    description: 'Present when a started downstream stage is deliberately not rebuilt',
  })
  blockedPropagation?: BlockedPropagationDto;
}

export class CorrectionEntryDto {
  @ApiProperty()
  occurredAt!: string;

  @ApiProperty()
  actor!: string;

  @ApiProperty()
  reason!: string;

  @ApiProperty({ type: Object, description: 'What the result was' })
  priorState!: Record<string, unknown>;

  @ApiProperty({ type: Object, description: 'What it became' })
  resultingState!: Record<string, unknown>;
}

export class CorrectionHistoryResponse {
  @ApiProperty({ type: [CorrectionEntryDto], description: 'Oldest first — the chain, in order' })
  corrections!: CorrectionEntryDto[];
}
