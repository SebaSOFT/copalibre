import { Body, Controller, Get, HttpCode, Inject, Param, Post, Req } from '@nestjs/common';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '../http/error-contract.js';
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
  TournamentRepository,
  withTransaction,
  type Database,
} from '@copalibre/persistence';
import { SUPPORTED_FORMATS } from '@copalibre/domain';
import type { Kysely } from 'kysely';
import type { RequestWithSubject } from '../auth/request-context.js';
import { SecurityPlaneTag } from '../auth/security-plane.js';
import { RequireOrganizationRole } from '../auth/access-requirement.js';
import {
  CreateTournamentRequest,
  ProblemResponse,
  TournamentResponse,
} from '../dto/organization.dto.js';
import { enforcePolicy } from '../policy/resource-policy.js';
import { DATABASE } from '../database.token.js';

/**
 * Organization-scoped tournament routes. The path shape mirrors the URL contract
 * (`/{organization}/tournaments/{tournament}`) so the public web, control web,
 * and TV surfaces can derive each other's URLs by prefix substitution — the API
 * resolves the alias tuple, never a database identifier from the caller.
 */
@ApiTags('tournaments')
@Controller('organizations/:organizationAlias/tournaments')
export class TournamentsController {
  constructor(@Inject(DATABASE) private readonly db: Kysely<Database>) {}

  @Get(':tournamentAlias')
  @SecurityPlaneTag('public-read')
  @ApiOperation({
    summary: 'Read a tournament by its organization-scoped alias',
    description:
      'A tournament alias is unique only within its organization, so both aliases are required.',
  })
  @ApiOkResponse({ type: TournamentResponse })
  async findByScopedAlias(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
  ): Promise<TournamentResponse> {
    const tournament = await new TournamentRepository(this.db).findByScopedAlias(
      organizationAlias,
      tournamentAlias,
    );
    if (!tournament || tournament.status === 'draft') {
      throw new NotFoundException(
        `No tournament "${tournamentAlias}" in organization "${organizationAlias}"`,
        { errorCode: 'tournament-not-found' },
      );
    }
    enforcePolicy({
      plane: 'public-read',
      resource: { organizationId: tournament.organizationId },
    });
    return tournament;
  }

  @Post()
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationRole('admin')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create a tournament in draft status',
    description:
      'Requires the copalibre.control scope and a token scoped to the target organization.',
  })
  @ApiCreatedResponse({ type: TournamentResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  async create(
    @Param('organizationAlias') organizationAlias: string,
    @Body() body: CreateTournamentRequest,
    @Req() request: RequestWithSubject,
  ): Promise<TournamentResponse> {
    const organization = await new OrganizationRepository(this.db).findByAlias(organizationAlias);
    if (!organization) {
      throw new NotFoundException(`No organization with alias "${organizationAlias}"`, {
        errorCode: 'tournament-not-found',
      });
    }

    const subject = request.subject;
    enforcePolicy({
      plane: 'admin-control',
      subject,
      resource: { organizationId: organization.organizationId },
    });

    const tournaments = new TournamentRepository(this.db);
    const descriptor = await tournaments.findDescriptor(body.descriptorId, body.descriptorVersion);
    if (!descriptor) {
      throw new BadRequestException(
        `Unknown discipline descriptor ${body.descriptorId}@${body.descriptorVersion}`,
        { errorCode: 'tournament-bad-request' },
      );
    }

    const available = new Set<string>(descriptor.availableFormats);
    if (
      !(SUPPORTED_FORMATS as readonly string[]).includes(body.format) ||
      !available.has(body.format)
    ) {
      throw new BadRequestException(
        `Discipline descriptor ${body.descriptorId}@${body.descriptorVersion} does not support ${body.format}`,
        { errorCode: 'tournament-bad-request' },
      );
    }

    return withTransaction(this.db, async (uow) => {
      const tournament = await tournaments.create(uow, {
        organizationId: organization.organizationId,
        alias: body.alias,
        name: body.name,
        descriptor,
        actor: `user:${subject?.subjectId ?? 'unknown'}`,
        authorizationContext: (subject?.scopes ?? []).join(' '),
      });
      const { ruleset } = await tournaments.createRuleset(uow, {
        tournamentId: tournament.tournamentId,
        organizationId: organization.organizationId,
        descriptor,
        overrides: {
          format: body.format,
          'registration.publicOpen': body.publicRegistration,
          'registration.requiresCheckIn': body.requiresCheckIn,
          ...(body.checkInClosesAt === undefined
            ? {}
            : { 'registration.checkInClosesAt': body.checkInClosesAt }),
        },
        actor: `user:${subject?.subjectId ?? 'unknown'}`,
        authorizationContext: (subject?.scopes ?? []).join(' '),
      });
      return { ...tournament, rulesetId: ruleset.rulesetId };
    });
  }

  @Post(':tournamentAlias/publish')
  @HttpCode(200)
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationRole('admin')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Publish a tournament',
    description:
      'Transitions draft to published. Audited with previous and resulting state; publishing is not destructive, so no confirmation flag is required.',
  })
  @ApiOkResponse({ type: TournamentResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  async publish(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Req() request: RequestWithSubject,
  ): Promise<TournamentResponse> {
    const tournaments = new TournamentRepository(this.db);
    const tournament = await tournaments.findByScopedAlias(organizationAlias, tournamentAlias);
    if (!tournament) {
      throw new NotFoundException(
        `No tournament "${tournamentAlias}" in organization "${organizationAlias}"`,
        { errorCode: 'tournament-not-found' },
      );
    }

    const subject = request.subject;
    enforcePolicy({
      plane: 'admin-control',
      subject,
      resource: { organizationId: tournament.organizationId },
    });

    return withTransaction(this.db, (uow) =>
      tournaments.publish(uow, {
        tournamentId: tournament.tournamentId,
        organizationId: tournament.organizationId,
        actor: `user:${subject?.subjectId ?? 'unknown'}`,
        authorizationContext: (subject?.scopes ?? []).join(' '),
      }),
    );
  }

  @Post(':tournamentAlias/archive')
  @HttpCode(200)
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationRole('admin')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Archive a finished tournament',
    description:
      'Transitions finished to archived, legal only from finished. Changes default visibility ' +
      "only — no result, standing, registration, or audit data is affected, and the tournament's " +
      'own canonical URL keeps resolving.',
  })
  @ApiOkResponse({ type: TournamentResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  async archive(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Req() request: RequestWithSubject,
  ): Promise<TournamentResponse> {
    const tournaments = new TournamentRepository(this.db);
    const tournament = await tournaments.findByScopedAlias(organizationAlias, tournamentAlias);
    if (!tournament) {
      throw new NotFoundException(
        `No tournament "${tournamentAlias}" in organization "${organizationAlias}"`,
        { errorCode: 'tournament-not-found' },
      );
    }

    const subject = request.subject;
    enforcePolicy({
      plane: 'admin-control',
      subject,
      resource: { organizationId: tournament.organizationId },
    });

    try {
      return await withTransaction(this.db, (uow) =>
        tournaments.archive(uow, {
          tournamentId: tournament.tournamentId,
          organizationId: tournament.organizationId,
          actor: `user:${subject?.subjectId ?? 'unknown'}`,
          authorizationContext: (subject?.scopes ?? []).join(' '),
        }),
      );
    } catch (error) {
      // An illegal transition is a state conflict, not a malformed request —
      // matches the existing InvariantViolationError -> 409 convention
      // (installation-bootstrap.controller.ts, seeding.controller.ts).
      if (error instanceof InvariantViolationError)
        throw new ConflictException(error.message, { errorCode: 'tournament-conflict' });
      throw error;
    }
  }

  @Get()
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationRole('admin')
  @ApiBearerAuth()
  @ApiOperation({
    summary: "List the organization's active (non-archived) tournaments",
    description: 'Excludes archived tournaments — their own detail route still resolves directly.',
  })
  @ApiOkResponse({ type: TournamentResponse, isArray: true })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  async listActive(
    @Param('organizationAlias') organizationAlias: string,
    @Req() request: RequestWithSubject,
  ): Promise<readonly TournamentResponse[]> {
    const organization = await new OrganizationRepository(this.db).findByAlias(organizationAlias);
    if (!organization) {
      throw new NotFoundException(`No organization with alias "${organizationAlias}"`, {
        errorCode: 'tournament-not-found',
      });
    }
    enforcePolicy({
      plane: 'admin-control',
      subject: request.subject,
      resource: { organizationId: organization.organizationId },
    });

    return new TournamentRepository(this.db).listActiveByOrganization(organization.organizationId);
  }
}
