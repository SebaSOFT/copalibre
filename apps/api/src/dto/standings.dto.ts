import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsInt, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/** Wire DTOs are camelCase, per the naming-conventions casing rule. */

export class StandingsRowResponse {
  @ApiProperty({ description: '1-based; rows sharing a rank were not separated', example: 1 })
  rank!: number;

  @ApiProperty({ format: 'uuid' })
  entrantId!: string;

  @ApiProperty({ description: 'True when another row holds the same rank' })
  sharedRank!: boolean;

  @ApiProperty({
    description: 'Exactly the statistics the bound discipline declares, keyed by code',
    type: 'object',
    additionalProperties: { type: 'number' },
    example: { played: 6, won: 4, points: 13 },
  })
  statistics!: Record<string, number>;

  @ApiProperty({
    description:
      'True when a tiebreak comparator had to separate this row; the screen shows the trace expander only for these',
  })
  tieBroken!: boolean;
}

export class StandingsResponse {
  @ApiProperty({ format: 'uuid' })
  stageId!: string;

  @ApiProperty({
    description: 'Generation of the standings projection; 0 before the first rebuild',
    example: 12,
  })
  projectionVersion!: number;

  @ApiProperty({ description: 'False when a tie survived every declared comparator' })
  fullyResolved!: boolean;

  @ApiProperty({ type: StandingsRowResponse, isArray: true })
  rows!: StandingsRowResponse[];

  @ApiProperty({
    description:
      'The rules engine’s explanation trace for the whole calculation, rendered verbatim',
    type: 'string',
    isArray: true,
    example: ['Rule 1 (Puntos): a=13, b=13 → Tie not fully resolved by Puntos'],
  })
  trace!: string[];

  @ApiPropertyOptional({
    description:
      'Whether these rows count one result per series or one per played match. Absent when the ' +
      'stage declares no series at all — there is only one unit a single-match stage can be ' +
      'counted in.',
    enum: ['series', 'match'],
  })
  grain?: 'series' | 'match';
}

export class TiebreakTraceResponse {
  @ApiProperty({ format: 'uuid' })
  entrantId!: string;

  @ApiProperty({
    description: 'Empty when no comparator had to separate this entrant',
    type: 'string',
    isArray: true,
  })
  lines!: string[];
}

export class SeedAssignmentResponse {
  @ApiProperty({ description: '1-based seed', example: 3 })
  // Also reached as a request element via PublishSeedingRequest.seeds, so
  // these rules run under the global pipe; outbound serialization is
  // never validated.
  @IsInt()
  seed!: number;

  @ApiProperty({ format: 'uuid' })
  @IsString()
  entrantId!: string;
}

export class BracketSlotResponse {
  @ApiProperty({
    description: 'Where this side comes from',
    enum: ['entrant', 'bye', 'winner-of', 'loser-of'],
  })
  kind!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  entrantId?: string;

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

export class BracketMatchResponse {
  @ApiProperty({ description: 'Deterministic engine id, e.g. WB-R2-M1', example: 'WB-R2-M1' })
  matchId!: string;

  @ApiProperty({ enum: ['winners', 'losers', 'grand-final', 'round-robin', 'placement'] })
  bracket!: string;

  @ApiProperty({ description: '1-based round within the bracket' })
  round!: number;

  @ApiProperty({ description: '1-based position within the round' })
  position!: number;

  @ApiProperty({ enum: ['scheduled', 'live', 'finalized'] })
  status!: string;

  @ApiPropertyOptional({
    description: 'Declared match format, e.g. BO3 — absent when the stage declares none',
    example: 'BO3',
  })
  format?: string;

  @ApiProperty({ type: BracketSlotResponse, isArray: true })
  slots!: BracketSlotResponse[];
}

export class SeedingResponse {
  @ApiProperty({ format: 'uuid' })
  stageId!: string;

  @ApiProperty({ enum: ['single-elimination', 'double-elimination', 'round-robin', 'league'] })
  format!: string;

  @ApiProperty({ type: SeedAssignmentResponse, isArray: true })
  seeds!: SeedAssignmentResponse[];

  @ApiProperty({ type: BracketMatchResponse, isArray: true })
  matches!: BracketMatchResponse[];

  @ApiProperty({ description: 'True once any match in this stage has a recorded result' })
  hasRecordedResults!: boolean;
}

export class PublishSeedingRequest {
  @ApiProperty({
    type: SeedAssignmentResponse,
    isArray: true,
    description: 'The full seed order, not a delta — a partial order is an ambiguous bracket',
  })
  // Handler folds an omitted list to [] and rejects it semantically, so the
  // field stays runtime-optional here.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SeedAssignmentResponse)
  seeds!: SeedAssignmentResponse[];
}

export class SeedingClassificationResponse {
  @ApiProperty({ enum: ['safe', 'requires_rebuild', 'blocked_after_results'] })
  mutationClass!: string;

  @ApiProperty({ description: 'Why the change was classified this way' })
  reason!: string;

  @ApiProperty({
    description: 'Fixture ids this change invalidates; empty unless it requires a rebuild',
    type: 'string',
    isArray: true,
  })
  invalidates!: string[];

  @ApiProperty({
    description:
      'True once the new seed order and fixture graph are durably persisted. Always true for a 200 response — a publish that could not persist refuses with 409 instead of returning a partial success.',
  })
  persisted!: boolean;
}
