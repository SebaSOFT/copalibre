import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Wire DTOs are camelCase, per the naming-conventions casing rule. */

export class ProposedResultSideDto {
  @ApiProperty({ format: 'uuid' })
  entrantId!: string;
  @ApiProperty({
    type: Object,
    description: 'Statistic values by code, as the participant saw them',
  })
  statistics!: Record<string, number>;
  @ApiPropertyOptional()
  placement?: number;
}

export class ProposedResultDto {
  @ApiProperty({ type: [ProposedResultSideDto] })
  sides!: ProposedResultSideDto[];
  @ApiPropertyOptional({ format: 'uuid' })
  winnerEntrantId?: string;
}

export class EvidenceUploadDto {
  @ApiProperty()
  filename!: string;
  @ApiProperty()
  contentType!: string;
  @ApiProperty({ description: 'Base64-encoded file content' })
  contentBase64!: string;
}

export class SubmitReportRequest {
  @ApiProperty({ description: 'What the participant believes the result was' })
  proposedResult!: ProposedResultDto;
  @ApiPropertyOptional({ type: [EvidenceUploadDto] })
  evidence?: EvidenceUploadDto[];
}

export class SubmitDisputeRequest {
  @ApiProperty({ description: 'Why the recorded result is being disputed' })
  reason!: string;
  @ApiPropertyOptional({ type: [EvidenceUploadDto] })
  evidence?: EvidenceUploadDto[];
}

export class EvidenceFileResponse {
  @ApiProperty({ format: 'uuid' })
  evidenceId!: string;
  @ApiProperty()
  filename!: string;
  @ApiProperty()
  contentType!: string;
  @ApiProperty()
  sizeBytes!: number;
  @ApiProperty()
  uploadedBy!: string;
  @ApiProperty({ format: 'date-time' })
  uploadedAt!: string;
  @ApiProperty({ description: 'pending, passed, or failed — set by the async validation job' })
  validationStatus!: string;
}

export class ParticipantReportResponse {
  @ApiProperty({ format: 'uuid' })
  reportId!: string;
  @ApiProperty({ format: 'uuid' })
  matchId!: string;
  @ApiProperty({ description: 'report or dispute' })
  kind!: string;
  @ApiProperty({ format: 'uuid' })
  submittedByPersonId!: string;
  @ApiProperty({ format: 'date-time' })
  submittedAt!: string;
  @ApiPropertyOptional()
  reason?: string;
  @ApiPropertyOptional({ type: Object })
  proposedResult?: Record<string, unknown>;
  @ApiProperty({ description: 'pending, reviewed, or dismissed' })
  status!: string;
  @ApiPropertyOptional()
  reviewedBy?: string;
  @ApiPropertyOptional({ format: 'date-time' })
  reviewedAt?: string;
  @ApiPropertyOptional()
  reviewNote?: string;
  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
  @ApiProperty({ type: [EvidenceFileResponse] })
  evidence!: EvidenceFileResponse[];
}

export class ReviewReportRequest {
  @ApiProperty({ description: 'reviewed or dismissed — never applies a correction by itself' })
  status!: 'reviewed' | 'dismissed';
  @ApiPropertyOptional()
  reviewNote?: string;
}
