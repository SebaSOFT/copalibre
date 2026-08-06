import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Wire DTOs are camelCase, per the naming-conventions casing rule. */

export class IssueDisplayTokenRequest {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Pins the device to one match, not the full tournament rotation',
  })
  matchId?: string;
  @ApiPropertyOptional({
    description: 'Operator-facing device label, e.g. "Cancha 1 - TV entrada"',
  })
  label?: string;
}

export class DisplayTokenIssuedResponse {
  @ApiProperty({ format: 'uuid' })
  displayTokenId!: string;
  @ApiProperty({ description: 'Shown once. Provision the device with it; it is never stored raw.' })
  token!: string;
  @ApiProperty({ description: 'The /tv/** launch URL to configure on the device' })
  url!: string;
  @ApiPropertyOptional()
  label?: string;
}

export class DisplayTokenResponse {
  @ApiProperty({ format: 'uuid' })
  displayTokenId!: string;
  @ApiProperty({ format: 'uuid' })
  tournamentId!: string;
  @ApiPropertyOptional({ format: 'uuid' })
  matchId?: string;
  @ApiPropertyOptional()
  label?: string;
  @ApiProperty()
  revoked!: boolean;
  @ApiPropertyOptional({ format: 'date-time', description: 'Last authorized page/stream request' })
  lastSeenAt?: string;
  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}
