import {
  BadRequestException,
  Body,
  Controller,
  Get,
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
import type { Kysely } from 'kysely';
import type { RequestWithSubject } from '../auth/request-context';
import { SecurityPlaneTag } from '../auth/security-plane';
import {
  CreateTournamentRequest,
  ProblemResponse,
  TournamentResponse,
} from '../dto/organization.dto';
import { enforcePolicy } from '../policy/resource-policy';
import { DATABASE } from '../database.token';

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

    return withTransaction(this.db, (uow) =>
      tournaments.create(uow, {
        organizationId: organization.organizationId,
        alias: body.alias,
        name: body.name,
        descriptor,
        actor: `user:${subject?.subjectId ?? 'unknown'}`,
        authorizationContext: (subject?.scopes ?? []).join(' '),
      }),
    );
  }

  @Post(':tournamentAlias/publish')
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
