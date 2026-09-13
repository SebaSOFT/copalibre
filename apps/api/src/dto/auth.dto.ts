import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsInt, IsOptional, IsString } from 'class-validator';

/** Wire DTOs are camelCase, per the naming-conventions casing rule. */

export class LoginRequest {
  @ApiProperty({ format: 'email' })
  @IsString()
  email!: string;
  @ApiProperty()
  @IsString()
  password!: string;
}

export class LoginResponse {
  @ApiProperty({ description: 'JWT access token' })
  accessToken!: string;
  @ApiProperty({ description: 'Token expiration in seconds' })
  expiresIn!: number;
}

export class AuthSuccessResponse {
  @ApiProperty({ description: 'Status message' })
  message!: string;
}

export class ForgotPasswordRequest {
  @ApiProperty({ format: 'email' })
  @IsString()
  email!: string;
}

export class ResetPasswordRequest {
  @ApiProperty({ description: 'The reset token from the email link' })
  @IsString()
  token!: string;
  @ApiProperty({ description: 'New password (min 8 characters)' })
  @IsString()
  newPassword!: string;
}

export class CreatePatRequest {
  @ApiProperty({ description: 'Human-readable label for this token' })
  // without a validation decorator the whitelist strips the property
  // before the handler ever sees it.
  @IsString()
  label!: string;
  @ApiPropertyOptional({
    description: 'Scopes to grant (defaults to the creating user scopes)',
    type: [String],
  })
  // Validation shape mirrors `scopes?: string[]` exactly: omitted or
  // null skips, an array of strings passes.
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopes?: string[];
  @ApiProperty({
    description: 'Expiration duration in days (max 365)',
    minimum: 1,
    maximum: 365,
  })
  @IsInt()
  expiresInDays!: number;
}

export class PatCreatedResponse {
  @ApiProperty({ format: 'uuid' })
  tokenId!: string;
  @ApiProperty({ description: 'Shown once. Copy it now; it is never stored raw.' })
  token!: string;
  @ApiProperty()
  label!: string;
  @ApiProperty({ type: [String] })
  scopes!: string[];
  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;
  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export class PatResponse {
  @ApiProperty({ format: 'uuid' })
  tokenId!: string;
  @ApiProperty()
  label!: string;
  @ApiProperty({ type: [String] })
  scopes!: string[];
  @ApiProperty()
  revoked!: boolean;
  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;
  @ApiPropertyOptional({ format: 'date-time' })
  lastUsedAt?: string;
  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export class NativeAcceptInvitationRequest {
  @ApiProperty({ description: 'The invitation token from setupUrl' })
  @IsString()
  token!: string;

  @ApiProperty({ description: 'New password for the administrator (min 8 characters)' })
  @IsString()
  password!: string;

  @ApiPropertyOptional({ description: 'Display name for the administrator' })
  @IsOptional()
  @IsString()
  name?: string;
}

export class JwksKey {
  @ApiProperty()
  kty!: string;

  @ApiProperty()
  kid!: string;

  @ApiProperty()
  use!: string;

  @ApiProperty()
  alg!: string;

  @ApiProperty()
  n!: string;

  @ApiProperty()
  e!: string;
}

export class JwksResponse {
  @ApiProperty({ type: [JwksKey] })
  keys!: JwksKey[];
}
