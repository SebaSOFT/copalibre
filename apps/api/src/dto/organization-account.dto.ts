import { IsOptional, IsString, IsTimeZone } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ORGANIZATION_ROLES,
  SUPPORTED_LANGUAGES,
  type OrganizationRole,
  type SupportedLanguage,
} from '@copalibre/domain';

/** Wire DTOs are camelCase, per the naming-conventions casing rule. */
export class OrganizationResponse {
  @ApiProperty({ format: 'uuid', description: 'UUIDv7 identifier' })
  organizationId!: string;

  @ApiProperty({
    description: 'Human-readable, URL-safe alias; globally unique per installation',
    example: 'liga-orbital',
  })
  alias!: string;

  @ApiProperty({ example: 'Liga Orbital' })
  name!: string;

  @ApiProperty({
    enum: SUPPORTED_LANGUAGES,
    description: 'Presentation-layer default interface language; never reinterprets stored data',
    example: 'es',
  })
  primaryLanguage!: SupportedLanguage;

  @ApiProperty({
    description: 'IANA time zone identifier; presentation-layer default only',
    example: 'America/Argentina/San_Juan',
  })
  timezone!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'object_metadata.object_id of the emblem' })
  emblemObjectId?: string;
}

export class CreateOrganizationRequest {
  @IsString()
  @ApiProperty({
    description: 'Lowercase kebab-case alias, unique per installation',
    example: 'liga-orbital',
  })
  alias!: string;

  @IsString()
  @ApiProperty({ example: 'Liga Orbital' })
  name!: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({
    enum: SUPPORTED_LANGUAGES,
    description:
      'Defaults to "es" (matches this installation\'s current default behavior) when omitted',
    example: 'es',
  })
  primaryLanguage?: string;

  @ApiPropertyOptional({
    description: 'IANA time zone identifier; defaults to "UTC" when omitted',
    example: 'America/Argentina/San_Juan',
  })
  @IsOptional()
  @IsString()
  @IsTimeZone()
  timezone?: string;
}

export class MyOrganizationResponse {
  @ApiProperty({ format: 'uuid' })
  organizationId!: string;

  @ApiProperty({
    description: 'Human-readable, URL-safe alias; globally unique per installation',
    example: 'liga-orbital',
  })
  organizationAlias!: string;

  @ApiProperty({ example: 'Liga Orbital' })
  organizationName!: string;

  @ApiProperty({ example: 'America/Argentina/Buenos_Aires' })
  timezone!: string;

  @ApiProperty({
    enum: ORGANIZATION_ROLES,
    description: "The caller's active role in this organization",
  })
  role!: OrganizationRole;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Object storage ID of the organization emblem',
  })
  emblemObjectId?: string;
}

export class UpdateOrganizationSettingsRequest {
  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ example: 'Liga Orbital' })
  name?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ enum: SUPPORTED_LANGUAGES, example: 'en' })
  primaryLanguage?: string;

  @IsOptional()
  @IsString()
  @IsTimeZone()
  @ApiPropertyOptional({ example: 'America/Argentina/San_Juan' })
  timezone?: string;
}

export class BootstrapAdministratorRequest {
  @IsString()
  @ApiProperty({ example: 'liga-orbital' })
  organizationAlias!: string;

  @IsString()
  @ApiProperty({ example: 'Liga Orbital' })
  organizationName!: string;

  @IsString()
  @ApiProperty({ format: 'email', example: 'admin@example.test' })
  email!: string;
}

export class BootstrapAdministratorResponse {
  @ApiProperty({ format: 'uuid' })
  organizationId!: string;

  @ApiProperty({ example: 'liga-orbital' })
  organizationAlias!: string;

  @ApiProperty({ format: 'uuid' })
  invitationId!: string;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;

  @ApiProperty({ format: 'uri', description: 'One-time OIDC invitation setup link.' })
  setupUrl!: string;
}

export class ProfileRefResponse {
  @ApiProperty({ format: 'uuid' })
  profileId!: string;

  @ApiProperty({ example: '1.0.0' })
  version!: string;
}

export class OrganizationStorageUsageResponse {
  @ApiProperty({
    description: 'Total bytes of stored objects in passed status',
    example: 148897792,
  })
  totalBytes!: number;

  @ApiProperty({ description: 'Total number of stored objects in passed status', example: 38 })
  objectCount!: number;
}

/** One stored object no entity currently references — a storage-usage cleanup candidate. */
export class UnreferencedObjectResponse {
  @ApiProperty({ format: 'uuid' })
  objectId!: string;

  @ApiProperty({ example: 'image/png' })
  contentType!: string;

  @ApiProperty({ example: 148897 })
  sizeBytes!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}
