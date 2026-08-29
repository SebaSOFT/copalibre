import { createHash, randomBytes } from 'node:crypto';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '../http/error-contract.js';
import { InvariantViolationError } from '@copalibre/persistence';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  InstallationRoleRepository,
  OrganizationAccessRepository,
  OrganizationRepository,
  withTransaction,
  type Database,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import {
  AllowInvitationAcceptance,
  RequireOrganizationBootstrapOrAdmin,
  RequireOrganizationCapability,
  RequireSuperAdmin,
  SUPER_ADMIN_SCOPE,
} from '../auth/access-requirement.js';
import type { RequestWithSubject } from '../auth/request-context.js';
import { RequireScopes } from '../auth/required-scopes.js';
import { SecurityPlaneTag } from '../auth/security-plane.js';
import { DATABASE } from '../database.token.js';
import {
  AcceptInvitationRequest,
  ChangeInstallationRoleStatusRequest,
  ChangeOrganizationRoleRequest,
  CreateSuperAdminRequest,
  GrantableRolesResponse,
  InstallationSuperAdminResponse,
  InviteOrganizationUserRequest,
  OrganizationInvitationResponse,
  OrganizationRoleResponse,
} from '../dto/organization.dto.js';

const INVITATION_TTL_MS = 24 * 60 * 60 * 1000;

@ApiTags('organization-access')
@Controller('organizations/:organizationAlias')
export class OrganizationAccessController {
  constructor(@Inject(DATABASE) private readonly db: Kysely<Database>) {}

  @Get('roles')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-users')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List active organization role assignments' })
  @ApiOkResponse({ type: OrganizationRoleResponse, isArray: true })
  async list(
    @Param('organizationAlias') alias: string,
  ): Promise<readonly OrganizationRoleResponse[]> {
    const organization = await this.organization(alias);
    return new OrganizationAccessRepository(this.db).listAssignments(organization.organizationId);
  }

  @Get('roles/grantable')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-users')
  @ApiBearerAuth()
  @ApiOperation({
    summary: "The caller's grantable roles in this organization, per the role-granting hierarchy",
  })
  @ApiOkResponse({ type: GrantableRolesResponse })
  grantable(@Req() request: RequestWithSubject): GrantableRolesResponse {
    const grantorContext = request.subject?.grantorContext;
    const isSuperAdmin = grantorContext?.isSuperAdmin ?? false;
    const organizationRoles = ['admin', 'club-admin', 'referee', 'broadcaster', 'viewer'] as const;
    const roles: GrantableRolesResponse['roles'] = isSuperAdmin
      ? ['super-admin', ...organizationRoles]
      : grantorContext?.organizationAdminOf
        ? [...organizationRoles]
        : [];
    return { roles };
  }

  @Post('invitations')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationBootstrapOrAdmin()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Invite an organization user by email' })
  @ApiCreatedResponse({
    type: OrganizationInvitationResponse,
    description: 'Invitation queued for secure delivery',
  })
  async invite(
    @Param('organizationAlias') alias: string,
    @Body() body: InviteOrganizationUserRequest,
    @Req() request: RequestWithSubject,
  ): Promise<OrganizationInvitationResponse> {
    const organization = await this.organization(alias);
    const token = randomBytes(32).toString('base64url');
    const invitation = await withTransaction(this.db, (uow) =>
      new OrganizationAccessRepository(this.db).createInvitation(uow, {
        organizationId: organization.organizationId,
        recipientEmail: body.email,
        role: body.role,
        status: body.status,
        token,
        tokenHash: hash(token),
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS).toISOString(),
        actor: actorOf(request),
        authorizationContext: (request.subject?.scopes ?? []).join(' '),
        grantorContext: request.subject?.grantorContext,
      }),
    ).catch(rethrowAsHttp);
    return { invitationId: invitation.invitationId, expiresAt: invitation.expiresAt };
  }

  @Patch('roles/:assignmentId')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-users')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change an organization role or active status' })
  @ApiOkResponse({ type: OrganizationRoleResponse })
  async change(
    @Param('organizationAlias') alias: string,
    @Param('assignmentId') assignmentId: string,
    @Body() body: ChangeOrganizationRoleRequest,
    @Req() request: RequestWithSubject,
  ): Promise<OrganizationRoleResponse> {
    const organization = await this.organization(alias);
    return withTransaction(this.db, (uow) =>
      new OrganizationAccessRepository(this.db).changeAssignment(uow, {
        organizationId: organization.organizationId,
        assignmentId,
        role: body.role,
        status: body.status,
        actor: actorOf(request),
        authorizationContext: (request.subject?.scopes ?? []).join(' '),
        grantorContext: request.subject?.grantorContext,
      }),
    ).catch(rethrowAsHttp);
  }

  @Delete('roles/:assignmentId')
  @HttpCode(200)
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-users')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Soft-delete an organization role assignment' })
  @ApiOkResponse({ type: OrganizationRoleResponse })
  async remove(
    @Param('organizationAlias') alias: string,
    @Param('assignmentId') assignmentId: string,
    @Req() request: RequestWithSubject,
  ): Promise<OrganizationRoleResponse> {
    const organization = await this.organization(alias);
    return withTransaction(this.db, (uow) =>
      new OrganizationAccessRepository(this.db).deleteAssignment(uow, {
        organizationId: organization.organizationId,
        assignmentId,
        actor: actorOf(request),
        authorizationContext: (request.subject?.scopes ?? []).join(' '),
      }),
    ).catch(rethrowAsHttp);
  }

  private async organization(alias: string) {
    const organization = await new OrganizationRepository(this.db).findByAlias(alias);
    if (!organization)
      throw new NotFoundException(`No organization with alias "${alias}"`, {
        errorCode: 'organization-access-not-found',
      });
    return organization;
  }
}

@ApiTags('organization-access')
@Controller('invitations')
export class InvitationAcceptanceController {
  constructor(@Inject(DATABASE) private readonly db: Kysely<Database>) {}

  @Post('accept')
  @HttpCode(200)
  @SecurityPlaneTag('authenticated-interaction')
  @RequireScopes('copalibre.invite.accept')
  @AllowInvitationAcceptance()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Accept an organization invitation' })
  @ApiOkResponse({ type: OrganizationRoleResponse })
  async accept(
    @Body() body: AcceptInvitationRequest,
    @Req() request: RequestWithSubject,
  ): Promise<OrganizationRoleResponse> {
    const subject = request.subject;
    if (!subject?.email || subject.emailVerified !== true) {
      throw new ForbiddenException('Invitation acceptance requires a verified OIDC email', {
        errorCode: 'organization-access-forbidden',
      });
    }
    const verifiedEmail = subject.email;
    return withTransaction(this.db, (uow) =>
      new OrganizationAccessRepository(this.db).acceptInvitation(uow, {
        tokenHash: hash(body.token),
        subjectId: subject.subjectId,
        verifiedEmail,
        ...(subject.name === undefined ? {} : { name: subject.name }),
        ...(subject.picture === undefined ? {} : { picture: subject.picture }),
        actor: actorOf(request),
        authorizationContext: subject.scopes.join(' '),
      }),
    );
  }
}

/**
 * Installation-level super-admin management: the console surface for
 * `installation_role_assignments`, gated entirely by pre-existing
 * super-admin authority — never by a role this controller itself grants.
 */
@ApiTags('organization-access')
@Controller('installation/super-admins')
export class InstallationRoleController {
  constructor(@Inject(DATABASE) private readonly db: Kysely<Database>) {}

  @Get()
  @SecurityPlaneTag('admin-control')
  @RequireSuperAdmin()
  @RequireScopes(SUPER_ADMIN_SCOPE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List active installation super-admins' })
  @ApiOkResponse({ type: InstallationSuperAdminResponse, isArray: true })
  async list(): Promise<readonly InstallationSuperAdminResponse[]> {
    return new InstallationRoleRepository(this.db).listActiveSuperAdmins();
  }

  @Post()
  @SecurityPlaneTag('admin-control')
  @RequireSuperAdmin()
  @RequireScopes(SUPER_ADMIN_SCOPE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Grant installation super-admin to a principal' })
  @ApiCreatedResponse({ type: InstallationSuperAdminResponse })
  async create(
    @Body() body: CreateSuperAdminRequest,
    @Req() request: RequestWithSubject,
  ): Promise<InstallationSuperAdminResponse> {
    return withTransaction(this.db, (uow) =>
      new InstallationRoleRepository(this.db).createSuperAdmin(uow, {
        principalId: body.principalId,
        actor: actorOf(request),
        authorizationContext: (request.subject?.scopes ?? []).join(' '),
      }),
    );
  }

  @Patch(':assignmentId')
  @SecurityPlaneTag('admin-control')
  @RequireSuperAdmin()
  @RequireScopes(SUPER_ADMIN_SCOPE)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Change an installation super-admin assignment's active status" })
  @ApiOkResponse({ type: InstallationSuperAdminResponse })
  async changeStatus(
    @Param('assignmentId') assignmentId: string,
    @Body() body: ChangeInstallationRoleStatusRequest,
    @Req() request: RequestWithSubject,
  ): Promise<InstallationSuperAdminResponse> {
    return withTransaction(this.db, (uow) =>
      new InstallationRoleRepository(this.db).changeStatus(uow, {
        assignmentId,
        status: body.status,
        actor: actorOf(request),
        authorizationContext: (request.subject?.scopes ?? []).join(' '),
      }),
    ).catch(rethrowAsHttp);
  }

  @Delete(':assignmentId')
  @HttpCode(200)
  @SecurityPlaneTag('admin-control')
  @RequireSuperAdmin()
  @RequireScopes(SUPER_ADMIN_SCOPE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Soft-delete an installation super-admin assignment' })
  @ApiOkResponse({ type: InstallationSuperAdminResponse })
  async remove(
    @Param('assignmentId') assignmentId: string,
    @Req() request: RequestWithSubject,
  ): Promise<InstallationSuperAdminResponse> {
    return withTransaction(this.db, (uow) =>
      new InstallationRoleRepository(this.db).deleteAssignment(uow, {
        assignmentId,
        actor: actorOf(request),
        authorizationContext: (request.subject?.scopes ?? []).join(' '),
      }),
    ).catch(rethrowAsHttp);
  }
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function actorOf(request: RequestWithSubject): string {
  return `user:${request.subject?.principalId ?? request.subject?.subjectId ?? 'unknown'}`;
}

/**
 * `InvariantViolationError`'s `details.reason` distinguishes a role-grant-
 * hierarchy denial (403 — the caller is never allowed to do this) from a
 * floor-invariant refusal (409 — allowed in general, refused only because it
 * would leave the organization/installation without an admin/super-admin).
 */
function rethrowAsHttp(error: unknown): never {
  if (error instanceof InvariantViolationError) {
    if (error.details?.reason === 'grant-denied') {
      throw new ForbiddenException(error.message, { errorCode: 'organization-access-forbidden' });
    }
    throw new ConflictException(error.message, { errorCode: 'organization-access-conflict' });
  }
  throw error;
}
