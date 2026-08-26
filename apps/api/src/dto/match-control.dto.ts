import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  Allow,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
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
  @IsString()
  segmentId!: string;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  elapsedSeconds!: number;

  @ApiPropertyOptional({ description: 'Make the selected segment the active clock segment' })
  @IsOptional()
  @IsBoolean()
  activate?: boolean;
}

export class RecordEventRequest {
  @ApiProperty({ description: 'Event definition code the discipline declares', example: 'goal' })
  @IsString()
  definitionCode!: string;

  @ApiProperty({ format: 'uuid', description: 'Segment the event happened in' })
  @IsString()
  segmentId!: string;

  @ApiProperty({ description: 'When it happened, epoch milliseconds' })
  @IsNumber()
  occurredAt!: number;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'The entrant it belongs to — an id, never "home"/"away"',
  })
  @IsOptional()
  @IsString()
  side?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'The person, when the discipline needs one' })
  @IsOptional()
  @IsString()
  personId?: string;

  @ApiPropertyOptional({ type: Object, description: 'Payload validated against the definition' })
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Free-text operator note, available regardless of discipline',
  })
  @IsOptional()
  @IsString()
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
  @IsString()
  personId!: string;

  // `number` is deliberately left undecorated by type constraints: its type
  // is the union `number | string` (shirt numbers read "00", "7B"), which no
  // single class-validator constraint expresses without inventing strictness.
  // `@Allow()` accepts any value while keeping the whitelist from stripping it.
  @ApiPropertyOptional({ description: 'Shirt number; not always numeric (e.g. "00", "7B")' })
  @Allow()
  number?: number | string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Codes naming discipline-declared roster roles this member carries this match',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roles?: string[];

  @ApiProperty({ description: 'Starter (true) or bench (false) at roster selection' })
  @IsBoolean()
  onField!: boolean;
}

/**
 * `name`/`nationality` are deliberately absent — the handler snapshots both
 * from `Person`, so the stored record cannot disagree with
 * the identity it names.
 */
export class SetMatchRosterRequest {
  @ApiProperty({ type: [SetMatchRosterMemberRequest] })
  // Optional at the pipe, not in the wire contract: the handler folds a
  // missing list to `[]` (`body.members ?? []`), and validation must not be
  // stricter than that.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SetMatchRosterMemberRequest)
  members!: SetMatchRosterMemberRequest[];
}

export class FinalizeRequest {
  @ApiProperty({
    type: [Object],
    description:
      'One entry per side: entrant id, its declared statistics, placement for a heat, and why the ' +
      'result is what it is when not an ordinarily played one',
  })
  // Inline object shape with no named class to transform into, so the pipe
  // validates the array itself; per-side shape stays with the handler. The
  // decorator also keeps the whitelist from stripping the property, and
  // `@IsOptional()` lets start/pause/resume — which share this route and send
  // no body at all — through untouched.
  @IsOptional()
  @IsArray()
  sides!: {
    entrantId: string;
    statistics: Record<string, number>;
    placement?: number;
    resultReason?: ResultReason;
  }[];

  @ApiPropertyOptional({ format: 'uuid', description: 'Duel matches only' })
  // Decorated only so the whitelist keeps it: the altered-retry fingerprint
  // must see it, and per-command policy stays with the handler.
  @IsOptional()
  @IsString()
  winnerEntrantId?: string;
}

/**
 * `name`/`nationality` are deliberately absent — the handler snapshots both
 * from `Person`, the same policy the live roster-selection route
 * enforces, so a bulk-loaded roster can never disagree with the identity
 * it names.
 */
export class BulkRosterMemberInput {
  @ApiProperty({ format: 'uuid' })
  @IsString()
  personId!: string;

  // `number` is deliberately left undecorated by type constraints: its type
  // is the union `number | string` (shirt numbers read "00", "7B"), which no
  // single class-validator constraint expresses without inventing strictness.
  // `@Allow()` accepts any value while keeping the whitelist from stripping it.
  @ApiPropertyOptional({ description: 'Shirt number; not always numeric (e.g. "00", "7B")' })
  @Allow()
  number?: number | string;

  @ApiPropertyOptional({ type: [String], description: 'Discipline-declared roster role codes' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roles?: string[];

  @ApiProperty({ description: 'Whether this member was on the field, as opposed to bench' })
  @IsBoolean()
  onField!: boolean;
}

export class BulkRosterInput {
  @ApiProperty({ format: 'uuid' })
  @IsString()
  entrantId!: string;

  @ApiProperty({ type: [BulkRosterMemberInput] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkRosterMemberInput)
  members!: BulkRosterMemberInput[];
}

export class BulkSegmentInput {
  @ApiProperty({ description: 'A segment type the bound discipline declares, e.g. "first-half"' })
  @IsString()
  type!: string;

  @ApiPropertyOptional({
    description: 'Elapsed seconds when the segment ended; discipline default when omitted',
  })
  @IsOptional()
  @IsInt()
  elapsedSeconds?: number;
}

export class BulkEventInput {
  @ApiProperty({ description: 'Event definition code the discipline declares' })
  @IsString()
  definitionCode!: string;

  @ApiProperty({
    description: 'Which submitted segment this event belongs to, 1-based, in submission order',
  })
  @IsInt()
  segmentNumber!: number;

  @ApiProperty({ description: 'When it actually happened, epoch milliseconds — may be historical' })
  @IsNumber()
  occurredAt!: number;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'The entrant it belongs to — an id, never "home"/"away"',
  })
  @IsOptional()
  @IsString()
  side?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'The person, when the discipline needs one' })
  @IsOptional()
  @IsString()
  personId?: string;

  @ApiPropertyOptional({ type: Object, description: 'Payload validated against the definition' })
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Free-text operator note, available regardless of discipline',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class BulkLoadMatchDataRequest {
  @ApiProperty({
    type: [BulkRosterInput],
    description: 'One entry per side; each entrant’s full roster as selected for this match',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkRosterInput)
  rosters!: BulkRosterInput[];

  @ApiProperty({
    type: [BulkSegmentInput],
    description: 'Every segment this match had, in play order — created and marked completed',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkSegmentInput)
  segments!: BulkSegmentInput[];

  @ApiProperty({
    type: [BulkEventInput],
    description: 'The match’s full event history, in the order it actually happened',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkEventInput)
  events!: BulkEventInput[];

  @ApiProperty({
    type: [Object],
    description: 'One entry per side, matching FinalizeRequest’s existing shape',
  })
  // Inline object shape with no named class to transform into, so the pipe
  // validates it as an opaque object only.
  @IsObject()
  result!: {
    sides: {
      entrantId: string;
      statistics: Record<string, number>;
      placement?: number;
      resultReason?: ResultReason;
    }[];
    winnerEntrantId?: string;
  };
}

export class BulkLoadMatchDataResponse {
  @ApiProperty({ format: 'uuid' })
  matchId!: string;

  @ApiProperty({ enum: ['finalized'] })
  status!: string;

  @ApiProperty({ description: 'How many events were recorded from the submitted batch' })
  eventCount!: number;
}

export class CorrectionRequestDto {
  @ApiProperty({ description: 'Why the result is being corrected, in the operator’s words' })
  @IsString()
  reason!: string;

  @ApiProperty({ type: [Object], description: 'The replacement result, one entry per side' })
  // Inline object shape with no named class to transform into, so the pipe
  // validates it as an opaque array only.
  @IsArray()
  sides!: {
    entrantId: string;
    statistics: Record<string, number>;
    placement?: number;
    resultReason?: ResultReason;
  }[];

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsString()
  winnerEntrantId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'A participant report or dispute this correction cites — retained as supporting ' +
      'evidence in the audit trail. Citing one grants no authority of its own.',
  })
  @IsOptional()
  @IsString()
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
