import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AuditRecordResponse {
  @ApiProperty({ format: 'uuid' })
  auditId!: string;

  @ApiProperty()
  entityType!: string;

  @ApiProperty()
  entityId!: string;

  @ApiProperty()
  action!: string;

  @ApiProperty()
  actor!: string;

  @ApiProperty()
  authorizationContext!: string;

  @ApiPropertyOptional({ type: Object, additionalProperties: true })
  previousState?: Record<string, unknown>;

  @ApiPropertyOptional({ type: Object, additionalProperties: true })
  resultingState?: Record<string, unknown>;

  @ApiPropertyOptional()
  reason?: string;

  @ApiProperty({ format: 'date-time' })
  occurredAt!: string;

  @ApiProperty({ enum: ['applied', 'refused'] })
  outcome!: 'applied' | 'refused';
}

export class AuditTrailResponse {
  @ApiProperty({ type: [AuditRecordResponse] })
  records!: readonly AuditRecordResponse[];

  @ApiProperty({ description: 'Total matching rows, independent of limit/offset' })
  total!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  offset!: number;
}
