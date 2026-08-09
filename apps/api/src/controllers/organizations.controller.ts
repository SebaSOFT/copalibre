import {
  Body,
  ConflictException,
  Controller,
  Get,
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
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  InvariantViolationError,
  OrganizationRepository,
  withTransaction,
  type Database,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import type { RequestWithSubject } from '../auth/request-context.js';
import { SecurityPlaneTag } from '../auth/security-plane.js';
import {
  RequireOrganizationRole,
  RequireSuperAdmin,
  SUPER_ADMIN_SCOPE,
} from '../auth/access-requirement.js';
import {
  CreateOrganizationRequest,
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
