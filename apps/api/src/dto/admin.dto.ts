import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

/** Wire DTOs are camelCase, per the naming-conventions casing rule. */
export class StatisticsRebuildRequest {
  @ApiPropertyOptional({
    description: 'Narrows the rebuild to one tournament within the organization',
    example: 'apertura-2026',
  })
  @IsOptional()
  @IsString()
  tournamentAlias?: string;
}

export class StatisticsRebuildResponse {
  @ApiProperty({ example: 'liga-orbital' })
  organizationAlias!: string;

  @ApiPropertyOptional({ example: 'apertura-2026' })
  tournamentAlias?: string;

  @ApiProperty({ description: 'Finalized matches the rebuild processed', example: 42 })
  matches!: number;

  @ApiProperty({ description: 'Figure rows written', example: 210 })
  figures!: number;
}

export class InstalledModuleResponse {
  @ApiProperty({ format: 'uuid' })
  moduleId!: string;

  @ApiProperty({ enum: ['discipline', 'tournament-profile'] })
  kind!: 'discipline' | 'tournament-profile';

  @ApiProperty({ example: 'orbital-frisbee' })
  alias!: string;

  @ApiProperty({ example: '1.0.0' })
  version!: string;

  @ApiProperty({ enum: ['curated', 'alternate', 'authored'] })
  sourceKind!: 'curated' | 'alternate' | 'authored';

  @ApiProperty({ example: 'SebaSOFT' })
  attributionAuthor!: string;
}

export class OutdatedModuleResponse {
  @ApiProperty({ example: 'orbital-frisbee' })
  alias!: string;

  @ApiProperty({ example: '1.0.0' })
  currentVersion!: string;

  @ApiProperty({ example: '1.1.0' })
  latestVersion!: string;

  @ApiProperty({ enum: ['major', 'minor', 'patch'], example: 'minor' })
  upgrade!: string;
}

export class InstallModuleRequest {
  @ApiProperty({ example: 'orbital-frisbee' })
  @IsString()
  alias!: string;

  @ApiPropertyOptional({
    description: 'Version range; defaults to the latest published',
    example: '^1.0.0',
  })
  @IsOptional()
  @IsString()
  range?: string;

  @ApiPropertyOptional({
    description:
      'An explicitly allow-listed alternate source (COPALIBRE_MODULE_SOURCE_ALLOWLIST); omit to ' +
      'install from the curated repository',
    example: 'file:///var/lib/copalibre/modules-dev/orbital-frisbee',
  })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional({
    description: 'Installs even when the declared required capabilities are not yet satisfied',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  allowUnsatisfiedCapabilities?: boolean;
}

export class InstallModuleResponse {
  @ApiProperty({ enum: ['discipline', 'tournament-profile'] })
  kind!: 'discipline' | 'tournament-profile';

  @ApiProperty({ example: 'orbital-frisbee' })
  alias!: string;

  @ApiProperty({ example: '1.0.0' })
  version!: string;

  @ApiProperty({ type: [String] })
  unsatisfiedRequiredCapabilities!: readonly string[];
}

export class RemoveModuleResponse {
  @ApiProperty({ example: 'orbital-frisbee' })
  alias!: string;

  @ApiProperty({ description: 'Versions removed', example: 1 })
  removedCount!: number;
}

export class ModuleVerifyFailureResponse {
  @ApiProperty({ example: 'registry-reference' })
  stage!: string;

  @ApiProperty({ example: 'Unregistered event code "goal-x"' })
  message!: string;
}

export class ModuleVerifyResultResponse {
  @ApiProperty({ example: 'orbital-frisbee' })
  alias!: string;

  @ApiProperty({ example: '1.0.0' })
  version!: string;

  @ApiProperty({ example: true })
  ok!: boolean;

  @ApiProperty({ type: [ModuleVerifyFailureResponse] })
  failures!: readonly ModuleVerifyFailureResponse[];
}
