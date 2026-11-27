import { IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ORGANIZATION_ROLES, type OrganizationRole } from '@copalibre/domain';

export class OrganizationRoleResponse {
  @ApiProperty({ format: 'uuid' })
  assignmentId!: string;
  @ApiProperty({ format: 'uuid', description: 'CopaLibre internal principal UUIDv7' })
  principalId!: string;
  @ApiProperty()
  email!: string;
  @ApiProperty({ enum: ORGANIZATION_ROLES })
  role!: string;
  @ApiProperty({ enum: ['active', 'inactive'] })
  status!: string;
  @ApiPropertyOptional({ format: 'uuid', description: 'Set only for a club-scoped role.' })
  clubId?: string;
  @ApiPropertyOptional({ format: 'uuid', description: 'Set only for a tournament-scoped role.' })
  tournamentId?: string;
}

export class InviteOrganizationUserRequest {
  @IsString()
  @ApiProperty({ format: 'email' })
  email!: string;
  @IsString()
  @ApiProperty({ enum: ORGANIZATION_ROLES })
  role!: OrganizationRole;
  @IsOptional()
  @IsString()
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Required exactly when `role` is a tournament-scoped role (e.g. tournament-admin).',
  })
  tournamentId?: string;
  @IsOptional()
  @IsString()
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Required exactly when `role` is a club-scoped role (club-admin).',
  })
  clubId?: string;
  @IsString()
  @ApiProperty({ enum: ['active', 'inactive'] })
  status!: 'active' | 'inactive';
}

export class OrganizationInvitationResponse {
  @ApiProperty({ format: 'uuid' })
  invitationId!: string;
  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;
}

/** A pending (not yet accepted, not rescinded, not expired) invitation — what the roles-permissions screen lists. */
export class PendingOrganizationInvitationResponse {
  @ApiProperty({ format: 'uuid' })
  invitationId!: string;
  @ApiProperty({ format: 'email' })
  recipientEmail!: string;
  @ApiProperty({ enum: ORGANIZATION_ROLES })
  role!: OrganizationRole;
  @ApiProperty({ enum: ['active', 'inactive'] })
  status!: 'active' | 'inactive';
  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;
  @ApiPropertyOptional({ format: 'uuid', description: 'Set only for a club-scoped role.' })
  clubId?: string;
  @ApiPropertyOptional({ format: 'uuid', description: 'Set only for a tournament-scoped role.' })
  tournamentId?: string;
}

export class ChangeOrganizationRoleRequest {
  @IsString()
  @ApiProperty({ enum: ORGANIZATION_ROLES })
  role!: OrganizationRole;
  @IsOptional()
  @IsString()
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Required exactly when `role` is a tournament-scoped role (e.g. tournament-admin).',
  })
  tournamentId?: string;
  @IsOptional()
  @IsString()
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Required exactly when `role` is a club-scoped role (club-admin).',
  })
  clubId?: string;
  @IsString()
  @ApiProperty({ enum: ['active', 'inactive'] })
  status!: 'active' | 'inactive';
}

export class GrantableRolesResponse {
  @ApiProperty({
    enum: ['super-admin', ...ORGANIZATION_ROLES],
    isArray: true,
    description:
      'Roles the caller may grant in this organization, per the role-granting hierarchy.',
  })
  roles!: readonly ('super-admin' | OrganizationRole)[];
}

export class InstallationSuperAdminResponse {
  @ApiProperty({ format: 'uuid' })
  assignmentId!: string;
  @ApiProperty({ format: 'uuid', description: 'CopaLibre internal principal UUIDv7' })
  principalId!: string;
  @ApiProperty({ enum: ['active', 'inactive'] })
  status!: string;
}

export class CreateSuperAdminRequest {
  @IsString()
  @ApiProperty({
    format: 'uuid',
    description: 'CopaLibre internal principal UUIDv7 to grant super-admin',
  })
  principalId!: string;
}

export class ChangeInstallationRoleStatusRequest {
  @IsString()
  @ApiProperty({ enum: ['active', 'inactive'] })
  status!: 'active' | 'inactive';
}

export class AcceptInvitationRequest {
  @IsString()
  @ApiProperty({ minLength: 32 })
  token!: string;
}
