import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, ValidateNested } from 'class-validator';
import { QualifierLabelDto } from './fixture-side-source.dto.js';

/** Wire DTOs are camelCase, per the naming-conventions casing rule. */

export class QualificationPositionResponse {
  @ApiProperty({ format: 'uuid' }) promotionPlanId!: string;
  @ApiProperty({ description: "1-based position in the plan's whole combined list" })
  position!: number;
  @ApiProperty({ type: QualifierLabelDto }) qualifierLabel!: QualifierLabelDto;
  @ApiPropertyOptional({ format: 'uuid', description: 'The destination zone, when declared' })
  zoneId?: string;
  @ApiPropertyOptional() zoneName?: string;
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'The entrant the current standings put here; absent while the stage is open',
  })
  entrantId?: string;
  @ApiPropertyOptional({ format: 'uuid', description: 'The entrant confirmed here, if any' })
  confirmedEntrantId?: string;
}

export class QualificationIncompleteMatchResponse {
  @ApiProperty({ format: 'uuid' }) matchId!: string;
  @ApiProperty() round!: number;
  @ApiProperty() status!: string;
  @ApiPropertyOptional({ format: 'uuid' }) homeEntrantId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) awayEntrantId?: string;
}

export class QualificationTieResponse {
  @ApiProperty({ format: 'uuid' }) promotionPlanId!: string;
  @ApiProperty({ type: [String], description: 'The tied entrants, in no meaningful order' })
  entrantIds!: string[];
  @ApiProperty({ type: [Number], description: 'Qualifier positions the tie leaves undecided' })
  positions!: number[];
  @ApiPropertyOptional({ description: 'The group whose cut line is tied' })
  groupName?: string;
}

export class QualificationPreviewResponse {
  @ApiProperty({
    enum: ['incomplete', 'tied', 'ready', 'confirmed', 'stale'],
    description:
      '`incomplete`: the prior stage has unresolved matches. `tied`: a cut line is unresolved. ' +
      '`ready`: confirmable. `confirmed`: the stored confirmation matches the standings. ' +
      '`stale`: a stored confirmation no longer matches them and needs re-confirming.',
  })
  state!: 'incomplete' | 'tied' | 'ready' | 'confirmed' | 'stale';

  @ApiProperty({ type: [QualificationPositionResponse] })
  positions!: QualificationPositionResponse[];

  @ApiProperty({ type: [QualificationIncompleteMatchResponse] })
  incomplete!: QualificationIncompleteMatchResponse[];

  @ApiPropertyOptional({ type: QualificationTieResponse })
  tie?: QualificationTieResponse;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    description: 'Display names of every entrant the response names, keyed by entrant id',
  })
  names!: Record<string, string>;
}

export class ExpectedQualificationPositionRequest {
  @ApiProperty({ format: 'uuid' })
  @IsString()
  promotionPlanId!: string;

  @ApiProperty()
  @IsInt()
  position!: number;

  @ApiProperty({ format: 'uuid' })
  @IsString()
  entrantId!: string;
}

export class ConfirmQualificationRequest {
  @ApiPropertyOptional({
    type: [ExpectedQualificationPositionRequest],
    description:
      'The positions the organizer reviewed. When given, confirmation is refused if the ' +
      'standings moved since, so what is confirmed is exactly what was previewed.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExpectedQualificationPositionRequest)
  expected?: ExpectedQualificationPositionRequest[];
}

export class ConfirmQualificationResponse extends QualificationPreviewResponse {
  @ApiProperty({ description: 'Fixture sides that received their entrant' })
  changedSides!: number;
}
