import { Body, Controller, Get, Inject, NotFoundException, Param, Post, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { OrganizationRepository, withTransaction, type Database } from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import type { RequestWithSubject } from '../auth/request-context.js';
import { SecurityPlaneTag } from '../auth/security-plane.js';
import {
  CreateOrganizationRequest,
  OrganizationResponse,
  ProblemResponse,
} from '../dto/organization.dto.js';
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
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create an organization',
    description:
      'Requires the copalibre.control scope. The alias is validated by the domain layer and must be lowercase kebab-case, unique per installation.',
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
    // Creating an organization establishes its own scope, so the policy check
    // is against the org the token is already scoped to.
    enforcePolicy({
      plane: 'admin-control',
      subject,
      resource: { organizationId: subject?.organizationId ?? '' },
    });

    const repository = new OrganizationRepository(this.db);
    return withTransaction(this.db, (uow) =>
      repository.create(uow, {
        alias: body.alias,
        name: body.name,
        actor: `user:${subject?.subjectId ?? 'unknown'}`,
        authorizationContext: (subject?.scopes ?? []).join(' '),
      }),
    );
  }
}
