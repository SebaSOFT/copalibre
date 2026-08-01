import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
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
  OrganizationRepository,
  TournamentRepository,
  withTransaction,
  type Database,
} from '@copalibre/persistence';
import { SUPPORTED_FORMATS } from '@copalibre/domain';
import type { Kysely } from 'kysely';
import type { RequestWithSubject } from '../auth/request-context.js';
import { SecurityPlaneTag } from '../auth/security-plane.js';
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
    if (!tournament) {
      throw new NotFoundException(
        `No tournament "${tournamentAlias}" in organization "${organizationAlias}"`,
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
      throw new NotFoundException(`No organization with alias "${organizationAlias}"`);
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
      );
    }

    const available = new Set<string>(descriptor.availableFormats);
    if (
      !(SUPPORTED_FORMATS as readonly string[]).includes(body.format) ||
      !available.has(body.format)
    ) {
      throw new BadRequestException(
        `Discipline descriptor ${body.descriptorId}@${body.descriptorVersion} does not support ${body.format}`,
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
}
