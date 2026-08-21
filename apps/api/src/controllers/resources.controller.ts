import {
  BadRequestException,
  ConflictException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Body,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Kysely } from 'kysely';
import { ResourceError, type Official } from '@copalibre/domain';
import {
  InvariantViolationError,
  OrganizationRepository,
  ScheduleRepository,
  withTransaction,
  type Database,
} from '@copalibre/persistence';
import { RequireOrganizationRole } from '../auth/access-requirement.js';
import type { RequestWithSubject } from '../auth/request-context.js';
import { SecurityPlaneTag } from '../auth/security-plane.js';
import { DATABASE } from '../database.token.js';
import {
  CreateOfficialRequest,
  CreateVenueRequest,
  OfficialResponse,
  UpdateOfficialRequest,
  UpdateVenueRequest,
  VenueResponse,
} from '../dto/resources.dto.js';
import { enforcePolicy } from '../policy/resource-policy.js';

/**
 * Venue/official management (0124) — mirrors `clubs.controller.ts`'s shape
 * exactly: an organization-scoped, admin-authorized CRUD surface. Not part
 * of `SchedulesController`, whose base path is stage-scoped — a venue or
 * official outlives any one stage.
 */
@ApiTags('resources')
@Controller('organizations/:organizationAlias')
export class ResourcesController {
  constructor(@Inject(DATABASE) private readonly db: Kysely<Database>) {}

  @Get('venues')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationRole('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: "List an organization's venues" })
  @ApiOkResponse({ type: VenueResponse, isArray: true })
  async listVenues(
    @Param('organizationAlias') organizationAlias: string,
    @Req() request: RequestWithSubject,
  ): Promise<readonly VenueResponse[]> {
    const organizationId = await resolveAdminOrganization(this.db, organizationAlias, request);
    return new ScheduleRepository(this.db).listVenues(organizationId);
  }

  @Post('venues')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationRole('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a venue' })
  @ApiCreatedResponse({ type: VenueResponse })
  async createVenue(
    @Param('organizationAlias') organizationAlias: string,
    @Body() body: CreateVenueRequest,
    @Req() request: RequestWithSubject,
  ): Promise<VenueResponse> {
    const organizationId = await resolveAdminOrganization(this.db, organizationAlias, request);
    const subject = request.subject;
    try {
      return await withTransaction(this.db, (uow) =>
        new ScheduleRepository(this.db).createVenue(uow, {
          organizationId,
          alias: body.alias,
          name: body.name,
          concurrentCapacity: body.concurrentCapacity,
          address: body.address,
          details: body.details,
          actor: `user:${subject?.subjectId ?? 'unknown'}`,
          authorizationContext: (subject?.scopes ?? []).join(' '),
        }),
      );
    } catch (error) {
      if (error instanceof InvariantViolationError) throw new ConflictException(error.message);
      if (error instanceof ResourceError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  @Patch('venues/:venueId')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationRole('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: "Edit a venue's name, capacity, address, or details" })
  @ApiOkResponse({ type: VenueResponse })
  async updateVenue(
    @Param('organizationAlias') organizationAlias: string,
    @Param('venueId') venueId: string,
    @Body() body: UpdateVenueRequest,
    @Req() request: RequestWithSubject,
  ): Promise<VenueResponse> {
    const organizationId = await resolveAdminOrganization(this.db, organizationAlias, request);
    const schedules = new ScheduleRepository(this.db);
    const venue = await schedules.findVenue(venueId);
    if (!venue || venue.organizationId !== organizationId) {
      throw new NotFoundException(`No venue "${venueId}" in this organization`);
    }
    const subject = request.subject;
    try {
      return await withTransaction(this.db, (uow) =>
        schedules.updateVenue(uow, {
          venueId,
          organizationId,
          name: body.name,
          concurrentCapacity: body.concurrentCapacity,
          address: body.address,
          details: body.details,
          actor: `user:${subject?.subjectId ?? 'unknown'}`,
          authorizationContext: (subject?.scopes ?? []).join(' '),
        }),
      );
    } catch (error) {
      if (error instanceof InvariantViolationError) throw new ConflictException(error.message);
      if (error instanceof ResourceError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  @Get('officials')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationRole('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: "List an organization's officials" })
  @ApiOkResponse({ type: OfficialResponse, isArray: true })
  async listOfficials(
    @Param('organizationAlias') organizationAlias: string,
    @Req() request: RequestWithSubject,
  ): Promise<readonly OfficialResponse[]> {
    const organizationId = await resolveAdminOrganization(this.db, organizationAlias, request);
    const officials = await new ScheduleRepository(this.db).listOfficials(organizationId);
    return officials.map(toOfficialResponse);
  }

  @Post('officials')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationRole('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create an official' })
  @ApiCreatedResponse({ type: OfficialResponse })
  async createOfficial(
    @Param('organizationAlias') organizationAlias: string,
    @Body() body: CreateOfficialRequest,
    @Req() request: RequestWithSubject,
  ): Promise<OfficialResponse> {
    const organizationId = await resolveAdminOrganization(this.db, organizationAlias, request);
    const subject = request.subject;
    try {
      const official = await withTransaction(this.db, (uow) =>
        new ScheduleRepository(this.db).createOfficial(uow, {
          organizationId,
          displayName: body.displayName,
          roles: body.roles,
          actor: `user:${subject?.subjectId ?? 'unknown'}`,
          authorizationContext: (subject?.scopes ?? []).join(' '),
        }),
      );
      return toOfficialResponse(official);
    } catch (error) {
      if (error instanceof InvariantViolationError) throw new ConflictException(error.message);
      if (error instanceof ResourceError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  @Patch('officials/:officialId')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationRole('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: "Edit an official's name or declared roles" })
  @ApiOkResponse({ type: OfficialResponse })
  async updateOfficial(
    @Param('organizationAlias') organizationAlias: string,
    @Param('officialId') officialId: string,
    @Body() body: UpdateOfficialRequest,
    @Req() request: RequestWithSubject,
  ): Promise<OfficialResponse> {
    const organizationId = await resolveAdminOrganization(this.db, organizationAlias, request);
    const schedules = new ScheduleRepository(this.db);
    const official = await schedules.findOfficial(officialId);
    if (!official || official.organizationId !== organizationId) {
      throw new NotFoundException(`No official "${officialId}" in this organization`);
    }
    const subject = request.subject;
    try {
      const updated = await withTransaction(this.db, (uow) =>
        schedules.updateOfficial(uow, {
          officialId,
          organizationId,
          displayName: body.displayName,
          roles: body.roles,
          actor: `user:${subject?.subjectId ?? 'unknown'}`,
          authorizationContext: (subject?.scopes ?? []).join(' '),
        }),
      );
      return toOfficialResponse(updated);
    } catch (error) {
      if (error instanceof InvariantViolationError) throw new ConflictException(error.message);
      if (error instanceof ResourceError) throw new BadRequestException(error.message);
      throw error;
    }
  }
}

function toOfficialResponse(official: Official): OfficialResponse {
  return { ...official, roles: [...official.roles] };
}

async function resolveAdminOrganization(
  db: Kysely<Database>,
  organizationAlias: string,
  request: RequestWithSubject,
): Promise<string> {
  const organization = await new OrganizationRepository(db).findByAlias(organizationAlias);
  if (!organization) {
    throw new NotFoundException(`No organization with alias "${organizationAlias}"`);
  }
  enforcePolicy({
    plane: 'admin-control',
    subject: request.subject,
    resource: { organizationId: organization.organizationId },
  });
  return organization.organizationId;
}
