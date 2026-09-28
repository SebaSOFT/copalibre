import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class DiagnosticsDatabase {
  @ApiProperty() connected!: boolean;
  @ApiProperty({ description: 'Round-trip time of the database probe in milliseconds' })
  latencyMs!: number;
  @ApiPropertyOptional({ description: 'Active connections in the serving API process pool' })
  poolActive?: number;
  @ApiPropertyOptional() poolIdle?: number;
  @ApiPropertyOptional() poolWaiting?: number;
}
export class DiagnosticsFailure {
  @ApiProperty({ format: 'uuid' }) eventId!: string;
  @ApiProperty() eventType!: string;
  @ApiProperty() attempts!: number;
  @ApiProperty() error!: string;
  @ApiProperty({ format: 'date-time' }) failedAt!: string;
}
export class DiagnosticsOutbox {
  @ApiProperty() available!: boolean;
  @ApiPropertyOptional() pending?: number;
  @ApiPropertyOptional() processed24h?: number;
  @ApiPropertyOptional() failed?: number;
  @ApiPropertyOptional() oldestPendingAgeSeconds?: number;
  @ApiPropertyOptional() inFlight?: number;
  @ApiProperty({ type: [DiagnosticsFailure] }) recentFailures!: DiagnosticsFailure[];
}
export class DiagnosticsStorage {
  @ApiProperty() connected!: boolean;
  @ApiProperty({ enum: ['filesystem', 's3'] }) profile!: 'filesystem' | 's3';
  @ApiPropertyOptional() bucketName?: string;
  @ApiPropertyOptional() totalObjects?: number;
  @ApiPropertyOptional() totalBytes?: number;
}
export class DiagnosticsRealtime {
  @ApiProperty() available!: boolean;
  @ApiPropertyOptional() totalConnections?: number;
  @ApiPropertyOptional() tvKiosks?: number;
  @ApiPropertyOptional() overlays?: number;
  @ApiPropertyOptional() publicSpectators?: number;
  @ApiPropertyOptional() controlConnections?: number;
  @ApiPropertyOptional() unclassified?: number;
  @ApiPropertyOptional() activeReplicas?: number;
  @ApiPropertyOptional() staleReplicas?: number;
  @ApiPropertyOptional({ format: 'date-time' }) reportedAt?: string;
}
export class DiagnosticsSummary {
  @ApiProperty({ enum: ['healthy', 'degraded', 'critical'] }) status!:
    'healthy' | 'degraded' | 'critical';
  @ApiProperty() version!: string;
  @ApiProperty() uptimeSeconds!: number;
  @ApiProperty({ format: 'date-time' }) sampledAt!: string;
  @ApiProperty({ type: DiagnosticsDatabase }) database!: DiagnosticsDatabase;
  @ApiProperty({ type: DiagnosticsOutbox }) outbox!: DiagnosticsOutbox;
  @ApiProperty({ type: DiagnosticsStorage }) storage!: DiagnosticsStorage;
  @ApiProperty({ type: DiagnosticsRealtime }) realtime!: DiagnosticsRealtime;
}
export class RetryOutboxRequest {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID('7', { each: true })
  @ApiProperty({
    type: [String],
    minItems: 1,
    maxItems: 50,
    description: 'Explicitly selected dead-letter event UUIDv7 identifiers',
  })
  eventIds!: string[];
}
export class RetryOutboxResponse {
  @ApiProperty({ type: [String] }) retried!: string[];
  @ApiProperty({
    type: [String],
    description: 'Events no longer eligible, including already retried events',
  })
  skipped!: string[];
}
