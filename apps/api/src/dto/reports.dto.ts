import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

/** Wire DTOs are camelCase, per the naming-conventions casing rule. */

export class ProposedResultSideDto {
  @ApiProperty({ format: 'uuid' })
  @IsString()
  entrantId!: string;
  @ApiProperty({
    type: Object,
    description: 'Statistic values by code, as the participant saw them',
  })
  @IsObject()
  statistics!: Record<string, number>;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  placement?: number;
}

export class ProposedResultDto {
  @ApiProperty({ type: [ProposedResultSideDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProposedResultSideDto)
  sides!: ProposedResultSideDto[];
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsString()
  winnerEntrantId?: string;
}

export class EvidenceUploadDto {
  @ApiProperty()
  @IsString()
  filename!: string;
  @ApiProperty()
  @IsString()
  contentType!: string;
  @ApiProperty({ description: 'Base64-encoded file content' })
  @IsString()
  contentBase64!: string;
}

export class SubmitReportRequest {
  @ApiProperty({ description: 'What the participant believes the result was' })
  // IsObject gives the required-field presence check — ValidateNested alone
  // does not fire when the whole property is absent.
  @IsObject()
  @ValidateNested()
  @Type(() => ProposedResultDto)
  proposedResult!: ProposedResultDto;
  @ApiPropertyOptional({ type: [EvidenceUploadDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EvidenceUploadDto)
  evidence?: EvidenceUploadDto[];
}

export class SubmitDisputeRequest {
  @ApiProperty({ description: 'Why the recorded result is being disputed' })
  @IsString()
  reason!: string;
  @ApiPropertyOptional({ type: [EvidenceUploadDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EvidenceUploadDto)
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
  @IsIn(['reviewed', 'dismissed'])
  status!: 'reviewed' | 'dismissed';
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reviewNote?: string;
}
