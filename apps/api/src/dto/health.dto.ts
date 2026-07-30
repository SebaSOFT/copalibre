import { ApiProperty } from '@nestjs/swagger';

export class HealthResponse {
  @ApiProperty({
    enum: ['api', 'events', 'worker', 'scheduler', 'migrate', 'doctor'],
    description: 'Process role this instance is running as',
  })
  role!: string;

  @ApiProperty({ example: '0.0.0' })
  version!: string;
}

export class ReadinessResponse extends HealthResponse {
  @ApiProperty({
    example: '0001-initial-schema',
    description: 'Applied database schema version this release requires',
  })
  schemaVersion!: string;
}
