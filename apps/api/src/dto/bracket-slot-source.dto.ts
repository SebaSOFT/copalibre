import { ApiProperty } from '@nestjs/swagger';

/** A leaf module: both bracket DTO files import it, so it must import neither. */
export class BracketSlotSourceResponse {
  @ApiProperty({ description: 'The bracket match this side advanced or dropped from' })
  matchId!: string;

  @ApiProperty({
    enum: ['winner', 'loser'],
    description: 'Whether the side won or lost that match, which is what carried it here',
  })
  outcome!: 'winner' | 'loser';
}
