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
  Query,
  Req,
} from '@nestjs/common';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '../http/error-contract.js';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  InvariantViolationError,
  NotFoundError,
  ObjectMetadataRepository,
  OrganizationAccessRepository,
  OrganizationRepository,
  withTransaction,
  type Database,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import type { ObjectStorageAdapter } from '@copalibre/object-storage';
import type { RequestWithSubject } from '../auth/request-context.js';
import { SecurityPlaneTag } from '../auth/security-plane.js';
import {
  RequireOrganizationCapability,
  RequireSelf,
  RequireSuperAdmin,
  SUPER_ADMIN_SCOPE,
} from '../auth/access-requirement.js';
import {
  CreateOrganizationRequest,
  MyOrganizationResponse,
  OrganizationResponse,
  OrganizationStorageUsageResponse,
  ProblemResponse,
  UnreferencedObjectResponse,
  UpdateOrganizationSettingsRequest,
} from '../dto/organization.dto.js';
import { RequireScopes } from '../auth/required-scopes.js';
import { enforcePolicy } from '../policy/resource-policy.js';
import { DATABASE } from '../database.token.js';
import { OBJECT_STORAGE } from '../object-storage.token.js';

/**
 * Thin pass-through to persistence repositories — no tournament business logic
 * here; later work adds that behind this same guard/policy layer.
 */
@ApiTags('organizations')
@Controller('organizations')
export class OrganizationsController {
  constructor(
    @Inject(DATABASE) private readonly db: Kysely<Database>,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorageAdapter,
  ) {}

  @Get()
  @SecurityPlaneTag('admin-control')
  @RequireSelf()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List organizations the authenticated caller belongs to',
    description:
      'Requires "?mine=true" — the only filter this endpoint supports today. Returns every ' +
      'organization the caller holds a non-deleted, active role assignment in, with that role. ' +
      'Never requires an organization to already be known, so it also answers "does this account ' +
      'belong to any organization at all".',
  })
  @ApiOkResponse({ type: MyOrganizationResponse, isArray: true })
  @ApiUnauthorizedResponse({
    type: ProblemResponse,
    description: 'Missing or invalid bearer token',
  })
  async listMine(
    @Query('mine') mine: string | undefined,
    @Req() request: RequestWithSubject,
  ): Promise<MyOrganizationResponse[]> {
    if (mine !== 'true') {
      throw new BadRequestException('Only "?mine=true" is supported by this endpoint', {
        errorCode: 'organization-bad-request',
      });
    }
    const principalId = request.subject?.principalId;
    // No installation principal yet (never accepted an invitation) is not an
    // error here — it means zero memberships, which this endpoint reports the
    // same way it reports any other caller with zero: an empty list.
    if (!principalId) return [];
    const memberships = await new OrganizationAccessRepository(
      this.db,
    ).listOrganizationsForPrincipal(principalId);
    return memberships.map((membership) => ({
      organizationId: membership.organizationId,
      organizationAlias: membership.organizationAlias,
      organizationName: membership.organizationName,
      role: membership.role,
    }));
  }

  @Get(':alias')
  @SecurityPlaneTag('public-read')
  @ApiOperation({
    summary: 'Read an organization by alias',
    description: 'Public projection; returns only published organization data.',
  })
  @ApiOkResponse({ type: OrganizationResponse })
  async findByAlias(@Param('alias') alias: string): Promise<OrganizationResponse> {
    const organization = await new OrganizationRepository(this.db).findByAlias(alias);
    if (!organization) {
      throw new NotFoundException(`No organization with alias "${alias}"`, {
        errorCode: 'organization-not-found',
      });
    }
    enforcePolicy({
      plane: 'public-read',
      resource: { organizationId: organization.organizationId },
    });
    return organization;
  }

  @Post()
  @SecurityPlaneTag('admin-control')
  @RequireSuperAdmin()
  @RequireScopes(SUPER_ADMIN_SCOPE)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create an organization',
    description:
      'Requires the copalibre.super-admin scope. The alias is validated by the domain layer and must be lowercase kebab-case, unique per installation.',
  })
  @ApiCreatedResponse({ type: OrganizationResponse })
  @ApiUnauthorizedResponse({
    type: ProblemResponse,
    description: 'Missing or invalid bearer token',
  })
  @ApiForbiddenResponse({ type: ProblemResponse, description: 'Token lacks the required scope' })
  async create(
    @Body() body: CreateOrganizationRequest,
    @Req() request: RequestWithSubject,
  ): Promise<OrganizationResponse> {
    const subject = request.subject;
    const repository = new OrganizationRepository(this.db);
    try {
      return await withTransaction(this.db, (uow) =>
        repository.create(uow, {
          alias: body.alias,
          name: body.name,
          primaryLanguage: body.primaryLanguage,
          timezone: body.timezone,
          actor: `user:${subject?.subjectId ?? 'unknown'}`,
          authorizationContext: (subject?.scopes ?? []).join(' '),
        }),
      );
    } catch (error) {
      // Matches the existing InvariantViolationError -> 409 convention
      // (installation-bootstrap.controller.ts, seeding.controller.ts).
      if (error instanceof InvariantViolationError)
        throw new ConflictException(error.message, { errorCode: 'organization-conflict' });
      throw error;
    }
  }

  @Patch(':organizationAlias/settings')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-settings')
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Update an organization's name, primary language and/or timezone",
    description:
      'Requires the organization admin role. Language/timezone are presentation-layer defaults ' +
      'only; never reinterprets stored data.',
  })
  @ApiOkResponse({ type: OrganizationResponse })
  @ApiUnauthorizedResponse({
    type: ProblemResponse,
    description: 'Missing or invalid bearer token',
  })
  @ApiForbiddenResponse({
    type: ProblemResponse,
    description: 'Requester is not an organization admin',
  })
  async updateSettings(
    @Param('organizationAlias') organizationAlias: string,
    @Body() body: UpdateOrganizationSettingsRequest,
    @Req() request: RequestWithSubject,
  ): Promise<OrganizationResponse> {
    const subject = request.subject;
    const repository = new OrganizationRepository(this.db);
    const organization = await repository.findByAlias(organizationAlias);
    if (!organization) {
      throw new NotFoundException(`No organization with alias "${organizationAlias}"`, {
        errorCode: 'organization-not-found',
      });
    }
    try {
      return await withTransaction(this.db, (uow) =>
        repository.updateSettings(uow, organization.organizationId, {
          name: body.name,
          primaryLanguage: body.primaryLanguage,
          timezone: body.timezone,
          actor: `user:${subject?.subjectId ?? 'unknown'}`,
          authorizationContext: (subject?.scopes ?? []).join(' '),
        }),
      );
    } catch (error) {
      if (error instanceof InvariantViolationError)
        throw new ConflictException(error.message, { errorCode: 'organization-conflict' });
      throw error;
    }
  }

  @Get(':organizationAlias/storage-usage')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-settings')
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Get an organization's aggregate storage usage",
    description:
      'Requires the organization admin role. Returns the total bytes and object count ' +
      'for all stored objects in passed status.',
  })
  @ApiOkResponse({ type: OrganizationStorageUsageResponse })
  @ApiUnauthorizedResponse({
    type: ProblemResponse,
    description: 'Missing or invalid bearer token',
  })
  @ApiForbiddenResponse({
    type: ProblemResponse,
    description: 'Requester is not an organization admin',
  })
  async getStorageUsage(
    @Param('organizationAlias') organizationAlias: string,
  ): Promise<OrganizationStorageUsageResponse> {
    const orgRepo = new OrganizationRepository(this.db);
    const organization = await orgRepo.findByAlias(organizationAlias);
    if (!organization) {
      throw new NotFoundException(`No organization with alias "${organizationAlias}"`, {
        errorCode: 'organization-not-found',
      });
    }
    const metadataRepo = new ObjectMetadataRepository(this.db);
    return await metadataRepo.usageByOrganization(organization.organizationId);
  }

  @Get(':organizationAlias/storage-usage/objects')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-settings')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List stored objects no entity currently references',
    description:
      'Cleanup candidates for the storage-usage screen — an object still referenced as an ' +
      "entity's current emblem or photo never appears here.",
  })
  @ApiOkResponse({ type: UnreferencedObjectResponse, isArray: true })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  async listUnreferencedObjects(
    @Param('organizationAlias') organizationAlias: string,
  ): Promise<readonly UnreferencedObjectResponse[]> {
    const orgRepo = new OrganizationRepository(this.db);
    const organization = await orgRepo.findByAlias(organizationAlias);
    if (!organization) {
      throw new NotFoundException(`No organization with alias "${organizationAlias}"`, {
        errorCode: 'organization-not-found',
      });
    }
    const metadataRepo = new ObjectMetadataRepository(this.db);
    return await metadataRepo.listUnreferenced(organization.organizationId);
  }

  @Delete(':organizationAlias/storage-usage/objects/:objectId')
  @HttpCode(200)
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-settings')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Delete a stored object no entity currently references',
    description:
      "Refused, naming what references it, while it is an entity's current emblem or photo.",
  })
  @ApiOkResponse({ type: UnreferencedObjectResponse })
  @ApiConflictResponse({ type: ProblemResponse })
  @ApiNotFoundResponse({ type: ProblemResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  async deleteObject(
    @Param('organizationAlias') organizationAlias: string,
    @Param('objectId') objectId: string,
    @Req() request: RequestWithSubject,
  ): Promise<UnreferencedObjectResponse> {
    const orgRepo = new OrganizationRepository(this.db);
    const organization = await orgRepo.findByAlias(organizationAlias);
    if (!organization) {
      throw new NotFoundException(`No organization with alias "${organizationAlias}"`, {
        errorCode: 'organization-not-found',
      });
    }
    const subject = request.subject;
    const metadataRepo = new ObjectMetadataRepository(this.db);
    try {
      const deleted = await withTransaction(this.db, (uow) =>
        metadataRepo.delete(uow, objectId, {
          organizationId: organization.organizationId,
          actor: `user:${subject?.subjectId ?? 'unknown'}`,
          authorizationContext: (subject?.scopes ?? []).join(' '),
        }),
      );
      await this.storage.delete({ key: deleted.storageKey });
      return deleted;
    } catch (error) {
      if (error instanceof InvariantViolationError) {
        throw new ConflictException(error.message, { errorCode: 'object-storage-conflict' });
      }
      if (error instanceof NotFoundError) {
        throw new NotFoundException(error.message, { errorCode: 'object-storage-not-found' });
      }
      throw error;
    }
  }
}
