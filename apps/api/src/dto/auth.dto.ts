import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

/** Longest password accepted; hashing cost grows with input length. Matches password-hashing.ts. */
const MAX_PASSWORD_LENGTH = 1024;
/** Verification and invitation tokens are 43 characters; this leaves room and no more. */
const MAX_TOKEN_LENGTH = 512;

/** Wire DTOs are camelCase, per the naming-conventions casing rule. */

export class LoginRequest {
  @ApiProperty({ format: 'email' })
  @IsString()
  email!: string;
  @ApiProperty({ maxLength: MAX_PASSWORD_LENGTH })
  @IsString()
  @MaxLength(MAX_PASSWORD_LENGTH)
  password!: string;
}

/**
 * A browser session's metadata. The access token itself travels only in the
 * `HttpOnly` session cookie, never in a response body.
 */
export class SessionResponse {
  @ApiProperty({ description: 'The acting identity (`sub`)' })
  subject!: string;
  @ApiProperty({ description: 'Coarse scopes the session holds', type: [String] })
  scopes!: string[];
  @ApiProperty({ description: 'When the access token expires', format: 'date-time' })
  expiresAt!: string;
  @ApiProperty({ description: 'How the session was established', enum: ['native', 'oidc'] })
  method!: 'native' | 'oidc';
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
  @ApiProperty({ description: 'The reset token from the email link', maxLength: MAX_TOKEN_LENGTH })
  @IsString()
  @MaxLength(MAX_TOKEN_LENGTH)
  token!: string;
  @ApiProperty({ description: 'New password (min 8 characters)', maxLength: MAX_PASSWORD_LENGTH })
  @IsString()
  @MaxLength(MAX_PASSWORD_LENGTH)
  newPassword!: string;
}

export class CreatePatRequest {
  @ApiProperty({ description: 'Human-readable label for this token' })
  // without a validation decorator the whitelist strips the property
  // before the handler ever sees it.
  @IsString()
  label!: string;
  @ApiProperty({
    description: 'At least one explicitly selected scope to grant',
    type: [String],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  scopes!: string[];
  @ApiProperty({
    description: 'Expiration duration in days (max 365)',
    minimum: 1,
    maximum: 365,
  })
  @IsInt()
  expiresInDays!: number;
}

export class PatScopeOptionsResponse {
  @ApiProperty({ type: [String], description: 'Scopes the current user may grant to a token' })
  scopes!: string[];
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

export class PatRevocationResponse {
  @ApiProperty()
  dryRun!: boolean;
  @ApiProperty()
  reversible!: boolean;
  @ApiProperty({ description: 'Number of credentials that will be revoked.' })
  tokens!: number;
  @ApiPropertyOptional({ format: 'date-time' })
  lastUsedAt?: string;
  @ApiPropertyOptional({ format: 'uuid' })
  tokenId?: string;
  @ApiPropertyOptional()
  label?: string;
  @ApiPropertyOptional({ type: [String] })
  scopes?: string[];
  @ApiPropertyOptional()
  revoked?: boolean;
  @ApiPropertyOptional({ format: 'date-time' })
  expiresAt?: string;
  @ApiPropertyOptional({ format: 'date-time' })
  createdAt?: string;
}

export class NativeAcceptInvitationRequest {
  @ApiProperty({ description: 'The invitation token from setupUrl', maxLength: MAX_TOKEN_LENGTH })
  @IsString()
  @MaxLength(MAX_TOKEN_LENGTH)
  token!: string;

  @ApiProperty({
    description: 'New password for the administrator (min 8 characters)',
    maxLength: MAX_PASSWORD_LENGTH,
  })
  @IsString()
  @MaxLength(MAX_PASSWORD_LENGTH)
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
