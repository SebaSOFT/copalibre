import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';

/** Wire DTOs are camelCase, per the naming-conventions casing rule. */
export class AuthoredModuleRequest {
  @ApiProperty({ enum: ['discipline', 'tournament-profile'] })
  @IsIn(['discipline', 'tournament-profile'])
  kind!: 'discipline' | 'tournament-profile';

  @ApiProperty({
    type: Object,
    additionalProperties: true,
    description:
      'The authored discipline descriptor or tournament profile document (no descriptorId/profileId — ' +
      'those are assigned on install), validated against the same schema an installed module passes.',
  })
  @IsObject()
  document!: Record<string, unknown>;

  @ApiPropertyOptional({
    description:
      "For a tournament profile only: the installed discipline alias each stage's format is checked " +
      'against. Omitted for a discipline document.',
    example: 'orbital-frisbee',
  })
  @IsOptional()
  @IsString()
  disciplineAlias?: string;
}

export class AuthoredModuleValidationFailureResponse {
  @ApiProperty({ example: 'artifact' })
  stage!: string;

  @ApiPropertyOptional({ example: 'statistics[0].aggregation' })
  field?: string;

  @ApiProperty({ example: 'must have required property "aggregation"' })
  message!: string;
}

export class AuthoredModuleValidationResponse {
  @ApiProperty()
  ok!: boolean;

  @ApiProperty({ type: [AuthoredModuleValidationFailureResponse] })
  failures!: readonly AuthoredModuleValidationFailureResponse[];
}

export class AuthoredModuleSubmitRequest {
  @ApiProperty({ enum: ['discipline', 'tournament-profile'] })
  @IsIn(['discipline', 'tournament-profile'])
  kind!: 'discipline' | 'tournament-profile';

  @ApiProperty({ example: 'orbital-frisbee' })
  @IsString()
  alias!: string;

  @ApiProperty({ example: '1.0.0' })
  @IsString()
  version!: string;

  @ApiPropertyOptional({
    description: 'Allow-listed fork target; omit to fork/submit against the curated repository',
    example: 'someone/copalibre-modules',
  })
  @IsOptional()
  @IsString()
  upstreamRepository?: string;

  @ApiPropertyOptional({ example: 'main' })
  @IsOptional()
  @IsString()
  baseBranch?: string;
}

export class AuthoredModuleSubmitResponse {
  @ApiProperty({ example: 'https://github.com/SebaSOFT/copalibre-modules/pull/42' })
  pullRequestUrl!: string;

  @ApiProperty({ example: 'add-discipline-orbital-frisbee' })
  branch!: string;
}
