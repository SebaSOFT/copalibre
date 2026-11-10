import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsObject, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/** A module alias, as the module manifest defines it. */
export const MODULE_ALIAS_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const GITHUB_REPOSITORY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100}$/;
const BRANCH_PATTERN = /^(?!-)(?!.*\.\.)(?!.*\/\/)(?!.*@\{)[A-Za-z0-9._/-]{1,200}(?<![./])$/;

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

  @ApiProperty({ example: 'orbital-frisbee', pattern: MODULE_ALIAS_PATTERN.source, maxLength: 64 })
  @IsString()
  @MaxLength(64)
  @Matches(MODULE_ALIAS_PATTERN)
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
  @Matches(GITHUB_REPOSITORY_PATTERN, {
    message: 'upstreamRepository must be an owner/name GitHub repository',
  })
  upstreamRepository?: string;

  @ApiPropertyOptional({ example: 'main' })
  @IsOptional()
  @IsString()
  @Matches(BRANCH_PATTERN, { message: 'baseBranch must be a branch name' })
  baseBranch?: string;
}

export class AuthoredModuleSubmitResponse {
  @ApiProperty({ example: 'https://github.com/SebaSOFT/copalibre-modules/pull/42' })
  pullRequestUrl!: string;

  @ApiProperty({ example: 'add-discipline-orbital-frisbee' })
  branch!: string;
}
