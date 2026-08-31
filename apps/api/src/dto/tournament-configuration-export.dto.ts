import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { HookScriptAttachmentRequest, ProfileRefResponse } from './organization.dto.js';

export class TournamentConfigurationDescriptorRefResponse {
  @ApiProperty({ format: 'uuid' })
  descriptorId!: string;

  @ApiProperty({ example: '1.3.0' })
  version!: string;
}

export class TournamentConfigurationIdentityResponse {
  @ApiProperty({ example: 'copa-verano' })
  alias!: string;

  @ApiProperty({ example: 'Copa Verano' })
  name!: string;

  @ApiProperty({ enum: ['draft', 'published', 'started', 'finished', 'archived'] })
  status!: string;

  @ApiProperty({ type: TournamentConfigurationDescriptorRefResponse })
  disciplineRef!: TournamentConfigurationDescriptorRefResponse;

  @ApiPropertyOptional({ type: ProfileRefResponse })
  profileRef?: ProfileRefResponse;
}

export class TournamentConfigurationRulesetResponse {
  @ApiProperty()
  version!: number;

  @ApiProperty({ type: Object, additionalProperties: true })
  rawOverrides!: Record<string, unknown>;

  @ApiProperty({ type: [HookScriptAttachmentRequest] })
  customScripts!: readonly HookScriptAttachmentRequest[];

  @ApiProperty({ type: Object, additionalProperties: true })
  effective!: Record<string, unknown>;
}

export class TournamentConfigurationStageLayerResponse {
  @ApiPropertyOptional()
  version?: number;

  @ApiProperty({ type: Object, additionalProperties: true })
  rawOverrides!: Record<string, unknown>;

  @ApiProperty({ type: Object, additionalProperties: true })
  effective!: Record<string, unknown>;
}

export class TournamentConfigurationStageResponse {
  @ApiProperty()
  number!: number;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  format!: string;

  @ApiProperty({ type: TournamentConfigurationStageLayerResponse })
  configuration!: TournamentConfigurationStageLayerResponse;
}

export class TournamentConfigurationSeasonResponse {
  @ApiProperty()
  name!: string;

  @ApiProperty()
  ordinal!: number;

  @ApiProperty({ type: [TournamentConfigurationStageResponse] })
  stages!: readonly TournamentConfigurationStageResponse[];
}

export class TournamentConfigurationExportResponse {
  @ApiProperty({ enum: ['copalibre-tournament-configuration'] })
  kind!: 'copalibre-tournament-configuration';

  @ApiProperty({ enum: ['1.0.0'] })
  schemaVersion!: '1.0.0';

  @ApiProperty({ type: TournamentConfigurationIdentityResponse })
  tournament!: TournamentConfigurationIdentityResponse;

  @ApiProperty({ type: TournamentConfigurationRulesetResponse })
  ruleset!: TournamentConfigurationRulesetResponse;

  @ApiProperty({ type: [TournamentConfigurationSeasonResponse] })
  seasons!: readonly TournamentConfigurationSeasonResponse[];
}
