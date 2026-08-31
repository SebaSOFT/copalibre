import { Controller, Get, Inject, Param, Patch, Post, Body, Req } from '@nestjs/common';
import { ConflictException, NotFoundException } from '../http/error-contract.js';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Kysely } from 'kysely';
import {
  EnrollmentRepository,
  InvariantViolationError,
  OrganizationRepository,
  withTransaction,
  type Database,
} from '@copalibre/persistence';
import { RequireOrganizationCapability } from '../auth/access-requirement.js';
import type { RequestWithSubject } from '../auth/request-context.js';
import { SecurityPlaneTag } from '../auth/security-plane.js';
import { DATABASE } from '../database.token.js';
import { ClubResponse, CreateClubRequest, UpdateClubRequest } from '../dto/organization.dto.js';
import { enforcePolicy } from '../policy/resource-policy.js';

/**
 * Club identity management — list/create/edit a club's name, alias,
 * and abbreviation. Emblem upload is `ClubMediaController`
 * (`identity-media.controller.ts`), which already exists and needed no
 * change here.
 */
@ApiTags('clubs')
@Controller('organizations/:organizationAlias/clubs')
export class ClubsController {
  constructor(@Inject(DATABASE) private readonly db: Kysely<Database>) {}

  @Get()
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-clubs')
  @ApiBearerAuth()
  @ApiOperation({ summary: "List an organization's clubs" })
  @ApiOkResponse({ type: ClubResponse, isArray: true })
  async list(
    @Param('organizationAlias') organizationAlias: string,
    @Req() request: RequestWithSubject,
  ): Promise<readonly ClubResponse[]> {
    const organizationId = await resolveAdminOrganization(this.db, organizationAlias, request);
    return new EnrollmentRepository(this.db).listClubs(organizationId);
  }

  @Post()
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-clubs')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a club' })
  @ApiCreatedResponse({ type: ClubResponse })
  async create(
    @Param('organizationAlias') organizationAlias: string,
    @Body() body: CreateClubRequest,
    @Req() request: RequestWithSubject,
  ): Promise<ClubResponse> {
    const organizationId = await resolveAdminOrganization(this.db, organizationAlias, request);
    const subject = request.subject;
    try {
      return await withTransaction(this.db, (uow) =>
        new EnrollmentRepository(this.db).createClub(uow, {
          organizationId,
          name: body.name,
          alias: body.alias,
          abbreviation: body.abbreviation,
          actor: `user:${subject?.subjectId ?? 'unknown'}`,
          authorizationContext: (subject?.scopes ?? []).join(' '),
        }),
      );
    } catch (error) {
      if (error instanceof InvariantViolationError)
        throw new ConflictException(error.message, { errorCode: 'club-conflict' });
      throw error;
    }
  }

  @Patch(':clubId')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-clubs')
  @ApiBearerAuth()
  @ApiOperation({ summary: "Edit a club's name, alias, or abbreviation" })
  @ApiOkResponse({ type: ClubResponse })
  async update(
    @Param('organizationAlias') organizationAlias: string,
    @Param('clubId') clubId: string,
    @Body() body: UpdateClubRequest,
    @Req() request: RequestWithSubject,
  ): Promise<ClubResponse> {
    const organizationId = await resolveAdminOrganization(this.db, organizationAlias, request);
    const club = await new EnrollmentRepository(this.db).findClub(clubId);
    if (!club || club.organizationId !== organizationId) {
      throw new NotFoundException(`No club "${clubId}" in this organization`, {
        errorCode: 'club-not-found',
      });
    }
    enforcePolicy({
      plane: 'admin-control',
      subject: request.subject,
      resource: { organizationId, ownerClubId: clubId },
    });
    const subject = request.subject;
    try {
      return await withTransaction(this.db, (uow) =>
        new EnrollmentRepository(this.db).updateClub(uow, {
          clubId,
          organizationId,
          name: body.name,
          alias: body.alias,
          abbreviation: body.abbreviation,
          actor: `user:${subject?.subjectId ?? 'unknown'}`,
          authorizationContext: (subject?.scopes ?? []).join(' '),
        }),
      );
    } catch (error) {
      if (error instanceof InvariantViolationError)
        throw new ConflictException(error.message, { errorCode: 'club-conflict' });
      throw error;
    }
  }
}

async function resolveAdminOrganization(
  db: Kysely<Database>,
  organizationAlias: string,
  request: RequestWithSubject,
): Promise<string> {
  const organization = await new OrganizationRepository(db).findByAlias(organizationAlias);
  if (!organization) {
    throw new NotFoundException(`No organization with alias "${organizationAlias}"`, {
      errorCode: 'club-not-found',
    });
  }
  enforcePolicy({
    plane: 'admin-control',
    subject: request.subject,
    resource: { organizationId: organization.organizationId },
  });
  return organization.organizationId;
}
