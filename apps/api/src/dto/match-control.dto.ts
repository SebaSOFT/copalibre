import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { LocalizedLabel, ResultReason } from '@copalibre/domain';

/**
 * Match-control wire shapes.
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
  personId?: string;

  @ApiProperty({ description: 'Epoch milliseconds of the causing event' })
  startedAt!: number;

  @ApiProperty()
  durationSeconds!: number;

  @ApiProperty({ description: 'Derived at read; never a stored countdown' })
  remainingSeconds!: number;
}

export class ConsoleSegmentResponse {
  @ApiProperty({ format: 'uuid' })
  segmentId!: string;

  @ApiProperty()
  type!: string;

  @ApiProperty()
  number!: number;

  @ApiProperty({ enum: ['pending', 'active', 'completed'] })
  state!: string;

  @ApiProperty()
  elapsedSeconds!: number;

  @ApiPropertyOptional({ description: 'Descriptor-declared duration for a timed segment' })
  durationSeconds?: number;
}

export class ConsoleEventResponse {
  @ApiProperty({ format: 'uuid' })
  eventId!: string;

  @ApiProperty()
  definitionCode!: string;

  @ApiProperty({ format: 'uuid' })
  segmentId!: string;

  @ApiProperty()
  sequence!: number;

  @ApiProperty({ format: 'date-time' })
  occurredAt!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  side?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  personId?: string;

  @ApiPropertyOptional({ description: 'Free-text operator note, if one was recorded' })
  notes?: string;

  @ApiPropertyOptional({
    description: "The active segment's running clock when this event was recorded, if timed",
  })
  segmentElapsedSeconds?: number;
}

export class ConsoleRosterMemberResponse {
  @ApiProperty({ format: 'uuid' })
  personId!: string;

  @ApiPropertyOptional({ description: 'Shirt number; not always numeric (e.g. "00", "7B")' })
  number?: number | string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional({
    description: 'ISO 3166-1 alpha-2 country code, snapshotted at roster-selection time',
  })
  nationality?: string;

  @ApiPropertyOptional({
    type: [String],
    description:
      'Codes naming discipline-declared roster roles (see `rosterRoles`) this member ' +
      'carries — zero, one, or several, independently combinable',
  })
  roles?: string[];

  @ApiProperty({
    description:
      'Whether currently in play, resolved by folding recorded substitution events over the ' +
      "roster's starting state",
  })
  onField!: boolean;
}

export class ConsoleRosterResponse {
  @ApiProperty({ format: 'uuid' })
  entrantId!: string;

  @ApiPropertyOptional({ description: 'The entrant’s team name, when the entrant is a team' })
  teamName?: string;

  @ApiPropertyOptional({ description: 'Tournament-scoped abbreviation for the team entrant' })
  teamAbbreviation?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: "The team's club id, when it has one — resolves the club emblem serve route",
  })
  clubId?: string;

  @ApiProperty({ type: [ConsoleRosterMemberResponse] })
  members!: ConsoleRosterMemberResponse[];
}

export class ConsoleRosterRoleResponse {
  @ApiProperty({
    description: 'Stable code, referenced by a `ConsoleRosterMemberResponse.roles` entry',
  })
  code!: string;

  @ApiProperty()
  label!: string | LocalizedLabel;

  @ApiPropertyOptional({
    description:
      "Short tactile-console badge text, e.g. 'GK', 'C'. Falls back to `code` when absent",
  })
  badge?: string;
}

export class ConsoleLiveScoreResponse {
  @ApiProperty({ format: 'uuid' })
  entrantId!: string;

  @ApiProperty({ description: 'Score folded from the immutable event log' })
  score!: number;

  @ApiProperty({ type: Object, description: 'Declared statistic deltas folded from the event log' })
  statistics!: Record<string, number>;
}

/** The protected read model a live-match console uses to render and recover. */
export class MatchConsoleResponse {
  @ApiProperty({ format: 'uuid' })
  matchId!: string;

  @ApiProperty({ enum: ['scheduled', 'in-progress', 'finalized'] })
  status!: string;

  @ApiProperty({ type: Object, description: 'Resolved authoritative result when one exists' })
  result!: Record<string, unknown> | null;

  @ApiProperty({ type: [ConsoleLiveScoreResponse] })
  liveScores!: ConsoleLiveScoreResponse[];

  @ApiProperty({ type: [ConsoleSegmentResponse] })
  segments!: ConsoleSegmentResponse[];

  @ApiProperty({ type: [RunningTimerDto] })
  runningTimers!: RunningTimerDto[];

  @ApiProperty({ type: [ConsoleEventResponse] })
  events!: ConsoleEventResponse[];

  @ApiProperty({ type: [Object], description: 'Descriptor-owned palette presentation metadata' })
  eventDefinitions!: Record<string, unknown>[];

  @ApiProperty({
    type: [String],
    description: 'Persons eligible for attribution from active match rosters',
  })
  eligiblePersonIds!: string[];

  @ApiProperty({
    type: [ConsoleRosterResponse],
    description:
      'Structured roster membership per entrant, with on-field state resolved from substitution ' +
      'history. An entrant with no roster row selected yet reads as an empty member list',
  })
  rosters!: ConsoleRosterResponse[];

  @ApiProperty({
    type: [ConsoleRosterRoleResponse],
    description:
      "The bound discipline's declared roster roles — a member's `roles` codes name these",
  })
  rosterRoles!: ConsoleRosterRoleResponse[];

  @ApiProperty({
    type: [String],
    description: 'Coaches and staff attached to an entrant contesting this match',
  })
  eligibleStaffIds!: string[];

  @ApiProperty({ type: [String], description: 'Entrants contesting this match' })
  entrantIds!: string[];

  @ApiProperty({
    type: [String],
    description: 'Capabilities granted to this subject for this match',
  })
  capabilities!: string[];

  @ApiProperty({ description: 'Monotonic server-issued projection version' })
  projectionVersion!: number;
}

export class ClockAdjustmentRequest {
  @ApiProperty({ format: 'uuid' })
  segmentId!: string;

  @ApiProperty({ minimum: 0 })
  elapsedSeconds!: number;

  @ApiPropertyOptional({ description: 'Make the selected segment the active clock segment' })
  activate?: boolean;
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
  personId?: string;

  @ApiPropertyOptional({ type: Object, description: 'Payload validated against the definition' })
  payload?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Free-text operator note, available regardless of discipline',
  })
  notes?: string;
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
  personId?: string;

  @ApiPropertyOptional({ description: 'Free-text operator note, if one was recorded' })
  notes?: string;

  @ApiProperty({
    type: [String],
    description: 'Identity keys of notifications this event declared, deduplicated on delivery',
  })
  notifications!: string[];
}

/** One registered player eligible to be named to an entrant's match roster. */
export class RosterCandidateResponse {
  @ApiProperty({ format: 'uuid' })
  personId!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional({ description: 'ISO 3166-1 alpha-2 country code' })
  nationality?: string;
}

export class SetMatchRosterMemberRequest {
  @ApiProperty({ format: 'uuid', description: 'Must be a registered player of the target entrant' })
  personId!: string;

  @ApiPropertyOptional({ description: 'Shirt number; not always numeric (e.g. "00", "7B")' })
  number?: number | string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Codes naming discipline-declared roster roles this member carries this match',
  })
  roles?: string[];

  @ApiProperty({ description: 'Starter (true) or bench (false) at roster selection' })
  onField!: boolean;
}

/**
 * `name`/`nationality` are deliberately absent — the handler snapshots both
 * from `Person` (0107 design.md), so the stored record cannot disagree with
 * the identity it names.
 */
export class SetMatchRosterRequest {
  @ApiProperty({ type: [SetMatchRosterMemberRequest] })
  members!: SetMatchRosterMemberRequest[];
}

export class FinalizeRequest {
  @ApiProperty({
    type: [Object],
    description:
      'One entry per side: entrant id, its declared statistics, placement for a heat, and why the ' +
      'result is what it is when not an ordinarily played one',
  })
  sides!: {
    entrantId: string;
    statistics: Record<string, number>;
    placement?: number;
    resultReason?: ResultReason;
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
    resultReason?: ResultReason;
  }[];

  @ApiPropertyOptional({ format: 'uuid' })
  winnerEntrantId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'A participant report or dispute this correction cites — retained as supporting ' +
      'evidence in the audit trail. Citing one grants no authority of its own.',
  })
  sourceReportId?: string;
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
