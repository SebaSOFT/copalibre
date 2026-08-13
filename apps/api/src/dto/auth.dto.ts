import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Wire DTOs are camelCase, per the naming-conventions casing rule. */

export class LoginRequest {
  @ApiProperty({ format: 'email' })
  email!: string;
  @ApiProperty()
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
  email!: string;
}

export class ResetPasswordRequest {
  @ApiProperty({ description: 'The reset token from the email link' })
  token!: string;
  @ApiProperty({ description: 'New password (min 8 characters)' })
  newPassword!: string;
}

export class CreatePatRequest {
  @ApiProperty({ description: 'Human-readable label for this token' })
  label!: string;
  @ApiPropertyOptional({
    description: 'Scopes to grant (defaults to the creating user scopes)',
    type: [String],
  })
  scopes?: string[];
  @ApiProperty({
    description: 'Expiration duration in days (max 365)',
    minimum: 1,
    maximum: 365,
  })
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
