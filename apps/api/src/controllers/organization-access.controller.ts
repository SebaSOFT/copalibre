import { createHash, randomBytes } from 'node:crypto';
import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  OrganizationAccessRepository,
  OrganizationRepository,
  withTransaction,
  type Database,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import {
  AllowInvitationAcceptance,
  RequireOrganizationBootstrapOrAdmin,
  RequireOrganizationRole,
} from '../auth/access-requirement.js';
import type { RequestWithSubject } from '../auth/request-context.js';
import { RequireScopes } from '../auth/required-scopes.js';
import { SecurityPlaneTag } from '../auth/security-plane.js';
import { DATABASE } from '../database.token.js';
import {
  AcceptInvitationRequest,
  ChangeOrganizationRoleRequest,
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
  @RequireOrganizationRole('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List active organization role assignments' })
  @ApiOkResponse({ type: OrganizationRoleResponse, isArray: true })
  async list(
    @Param('organizationAlias') alias: string,
  ): Promise<readonly OrganizationRoleResponse[]> {
    const organization = await this.organization(alias);
    return new OrganizationAccessRepository(this.db).listAssignments(organization.organizationId);
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
      }),
    );
    return { invitationId: invitation.invitationId, expiresAt: invitation.expiresAt };
  }

  @Patch('roles/:assignmentId')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationRole('admin')
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
      }),
    );
  }

  @Delete('roles/:assignmentId')
  @HttpCode(200)
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationRole('admin')
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
    );
  }

  private async organization(alias: string) {
    const organization = await new OrganizationRepository(this.db).findByAlias(alias);
    if (!organization) throw new NotFoundException(`No organization with alias "${alias}"`);
    return organization;
  }
}

@ApiTags('organization-access')
@Controller('invitations')
export class InvitationAcceptanceController {
  constructor(@Inject(DATABASE) private readonly db: Kysely<Database>) {}

  @Post('accept')
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
      throw new ForbiddenException('Invitation acceptance requires a verified OIDC email');
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

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function actorOf(request: RequestWithSubject): string {
  return `user:${request.subject?.principalId ?? request.subject?.subjectId ?? 'unknown'}`;
}
