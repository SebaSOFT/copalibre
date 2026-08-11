import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  InvariantViolationError,
  OrganizationAccessRepository,
  OrganizationRepository,
  withTransaction,
  type Database,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import type { RequestWithSubject } from '../auth/request-context.js';
import { SecurityPlaneTag } from '../auth/security-plane.js';
import {
  RequireOrganizationRole,
  RequireSelf,
  RequireSuperAdmin,
  SUPER_ADMIN_SCOPE,
} from '../auth/access-requirement.js';
import {
  CreateOrganizationRequest,
  MyOrganizationResponse,
  OrganizationResponse,
  ProblemResponse,
  UpdateOrganizationSettingsRequest,
} from '../dto/organization.dto.js';
import { RequireScopes } from '../auth/required-scopes.js';
import { enforcePolicy } from '../policy/resource-policy.js';
import { DATABASE } from '../database.token.js';

/**
 * Thin pass-through to phase 0004's repositories — no tournament business logic
 * here; phases 0006–0008 add that behind this same guard/policy layer.
 */
@ApiTags('organizations')
@Controller('organizations')
export class OrganizationsController {
  constructor(@Inject(DATABASE) private readonly db: Kysely<Database>) {}

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
      throw new BadRequestException('Only "?mine=true" is supported by this endpoint');
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
      throw new NotFoundException(`No organization with alias "${alias}"`);
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
      if (error instanceof InvariantViolationError) throw new ConflictException(error.message);
      throw error;
    }
  }

  @Patch(':organizationAlias/settings')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationRole('admin')
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Update an organization's primary language and/or timezone",
    description:
      'Requires the organization admin role. Presentation-layer defaults only; never reinterprets ' +
      'stored data.',
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
      throw new NotFoundException(`No organization with alias "${organizationAlias}"`);
    }
    try {
      return await withTransaction(this.db, (uow) =>
        repository.updateSettings(uow, organization.organizationId, {
          primaryLanguage: body.primaryLanguage,
          timezone: body.timezone,
          actor: `user:${subject?.subjectId ?? 'unknown'}`,
          authorizationContext: (subject?.scopes ?? []).join(' '),
        }),
      );
    } catch (error) {
      if (error instanceof InvariantViolationError) throw new ConflictException(error.message);
      throw error;
    }
  }
}
