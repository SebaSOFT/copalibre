import { ApiProperty } from '@nestjs/swagger';
import type { StageCompletionSummary, TournamentCompletionSummary } from '@copalibre/domain';

export class StageCompletionResponse implements StageCompletionSummary {
  @ApiProperty({ format: 'uuid', description: 'UUIDv7 identifier' })
  stageId!: string;

  @ApiProperty({ description: '1-based stage order in the tournament', example: 1 })
  stageNumber!: number;

  @ApiProperty({ description: 'Stage name', example: 'Group Stage' })
  stageName!: string;

  @ApiProperty({
    description: 'Total matches in the stage, excluding cancelled/not-required',
    example: 12,
  })
  totalMatches!: number;

  @ApiProperty({ description: 'Resolved matches (finalized + forfeited)', example: 8 })
  resolvedMatches!: number;

  @ApiProperty({ description: 'Live / in-progress matches', example: 1 })
  liveMatches!: number;

  @ApiProperty({ description: 'Scheduled matches not yet played', example: 3 })
  scheduledMatches!: number;

  @ApiProperty({ description: 'Finalized matches', example: 7 })
  finalizedMatches!: number;

  @ApiProperty({ description: 'Forfeited matches', example: 1 })
  forfeitedMatches!: number;
}

export class TournamentCompletionResponse implements TournamentCompletionSummary {
  @ApiProperty({
    description: 'Total matches across all stages, excluding cancelled/not-required',
    example: 32,
  })
  totalMatches!: number;

  @ApiProperty({
    description: 'Total resolved matches across all stages (finalized + forfeited)',
    example: 18,
  })
  resolvedMatches!: number;

  @ApiProperty({ description: 'Total live matches across all stages', example: 2 })
  liveMatches!: number;

  @ApiProperty({ description: 'Total scheduled matches across all stages', example: 12 })
  scheduledMatches!: number;

  @ApiProperty({ description: 'Total finalized matches across all stages', example: 17 })
  finalizedMatches!: number;

  @ApiProperty({ description: 'Total forfeited matches across all stages', example: 1 })
  forfeitedMatches!: number;

  @ApiProperty({
    type: [StageCompletionResponse],
    description: 'Per-stage breakdown ordered by stage number',
  })
  stages!: readonly StageCompletionResponse[];
}
