import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PublicMatchesViewMatchResponse } from './public-tournament.dto.js';

/**
 * The control-web matches view's card content: everything the public one
 * shows, plus the full internal comparator trace when the viewer is
 * authorized for it — `org.view-internal-standings`, resource-scoped the
 * same way the internal standings/trace endpoints already are. An
 * unauthorized viewer's row carries the same `decidingFactor` summary the
 * public endpoint returns and no trace fields at all.
 */
export class ControlMatchesViewMatchResponse extends PublicMatchesViewMatchResponse {
  @ApiPropertyOptional({
    type: 'string',
    isArray: true,
    description:
      "The home entrant's full internal comparator trace — present only when the requesting " +
      'subject holds org.view-internal-standings for this tournament, and only for a match ' +
      'whose result needed a tiebreak comparator',
  })
  homeTrace?: string[];

  @ApiPropertyOptional({
    type: 'string',
    isArray: true,
    description: "The away entrant's full internal comparator trace, same authorization as homeTrace",
  })
  awayTrace?: string[];
}

export class ControlMatchesViewResponse {
  @ApiProperty({ type: [ControlMatchesViewMatchResponse] })
  matches!: ControlMatchesViewMatchResponse[];
}
