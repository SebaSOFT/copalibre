import { IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCsvImportRequest {
  @IsString()
  @ApiProperty({
    enum: ['individual', 'team', 'team-membership'],
    description:
      '"individual"/"team" register a new entrant; "team-membership" attaches each row\'s ' +
      "person onto an already-registered team named by that row's teamAlias — it never " +
      'creates a team.',
  })
  target!: 'individual' | 'team' | 'team-membership';

  @IsString()
  @ApiProperty({
    description: 'UTF-8 CopaLibre participant CSV, limited to 4 MiB.',
    example: 'alias,displayName,naturalKeyKind,naturalKey\\nmaria-perez,Maria Perez,dni,12345678',
  })
  sourceCsv!: string;
}

export class CsvImportPreviewResponse {
  @ApiProperty({ format: 'uuid' })
  importId!: string;
  @ApiProperty({ enum: ['individual', 'team', 'team-membership'] })
  target!: 'individual' | 'team' | 'team-membership';
  @ApiProperty({
    enum: ['queued', 'validating', 'review-ready', 'invalid', 'committing', 'committed'],
  })
  status!: string;
  @ApiProperty({ description: 'SHA-256 source fingerprint used to reject stale confirmation.' })
  sourceHash!: string;
  @ApiPropertyOptional({ type: Object })
  preview?: {
    valid: boolean;
    rows: readonly unknown[];
    errors: readonly unknown[];
  };
}

export class CommitCsvImportRequest {
  @IsString()
  @ApiProperty({ description: 'Source hash returned by the reviewed preview.' })
  sourceHash!: string;
}
