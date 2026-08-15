import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Inject,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { SUPPORTED_FORMATS, type TournamentFormat } from '@copalibre/domain';
import {
  CompetitionRepository,
  InvariantViolationError,
  TournamentRepository,
  withTransaction,
  type Database,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import type { RequestWithSubject } from '../auth/request-context.js';
import { SecurityPlaneTag } from '../auth/security-plane.js';
import { RequireOrganizationRole } from '../auth/access-requirement.js';
import { CreateStageRequest, ProblemResponse, StageResponse } from '../dto/organization.dto.js';
import { resolveTournament } from './standings.controller.js';
import { DATABASE } from '../database.token.js';

/**
 * Stage creation.
 *
 * The step between "accepted registrations exist" and "a stage exists, ready to be seeded" — the
 * gap the 0059 walkthrough found: `CompetitionRepository.createStageInTournament` was real, tested,
 * and had no caller anywhere in `apps/api`. This endpoint only creates the stage; generating its
 * bracket is `POST .../stages/:stageNumber/seeding` (`seeding.controller.ts`), the same fixture-
 * generation path an operator already uses to reseed a later stage (see design.md).
 */
@ApiTags('stages')
@Controller('organizations/:organizationAlias/tournaments/:tournamentAlias/stages')
export class StagesController {
  constructor(@Inject(DATABASE) private readonly db: Kysely<Database>) {}

  @Post()
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationRole('admin')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create a stage from the tournament’s accepted registrations',
    description:
      'Number, name and format all default. Fixtures are not generated here — publish a seed order ' +
      'via POST .../stages/:stageNumber/seeding afterward.',
  })
  @ApiCreatedResponse({ type: StageResponse })
  @ApiConflictResponse({ type: ProblemResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  async create(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Body() body: CreateStageRequest,
    @Req() request: RequestWithSubject,
  ): Promise<StageResponse> {
    const { organizationId, tournament } = await resolveTournament(this.db, {
      organizationAlias,
      tournamentAlias,
      request,
    });

    const tournaments = new TournamentRepository(this.db);
    const descriptor = await tournaments.findDescriptor(
      tournament.disciplineRef.descriptorId,
      tournament.disciplineRef.version,
    );
    if (!descriptor) {
      throw new BadRequestException(
        `Discipline ${tournament.disciplineRef.descriptorId}@${tournament.disciplineRef.version} is not installed`,
      );
    }

    const format = await this.resolveFormat(tournament.tournamentId, descriptor, body.format);

    const competition = new CompetitionRepository(this.db);
    const existingStages = await competition.listStagesOfTournament(tournament.tournamentId);
    const number = body.number ?? existingStages.length + 1;
    if (existingStages.some((stage) => stage.number === number)) {
      throw new ConflictException(`Stage ${number} already exists in "${tournamentAlias}"`);
    }
    const name = body.name ?? `Stage ${number}`;

    try {
      const stage = await withTransaction(this.db, (uow) =>
        competition.createStageInTournament(uow, {
          tournamentId: tournament.tournamentId,
          number,
          name,
          format,
          organizationId,
          actor: actorOf(request),
          authorizationContext: authorizationContextOf(request),
        }),
      );
      return {
        stageId: stage.stageId,
        seasonId: stage.seasonId,
        number: stage.number,
        name: stage.name,
        format: stage.format,
      };
    } catch (error) {
      if (error instanceof InvariantViolationError) throw new ConflictException(error.message);
      throw error;
    }
  }

  /**
   * Defaults to the tournament's own configured format (set at tournament creation,
   * `overrides['format']` on its latest ruleset — `tournaments.controller.ts`'s `create()`) when the
   * request supplies none. An explicit override is validated identically to tournament creation's own
   * check: a stage cannot be created in a format the installed discipline module does not support.
   */
  private async resolveFormat(
    tournamentId: string,
    descriptor: { readonly availableFormats: readonly string[] },
    requested: string | undefined,
  ): Promise<TournamentFormat> {
    const available = new Set<string>(descriptor.availableFormats);

    if (requested !== undefined) {
      if (
        !(SUPPORTED_FORMATS as readonly string[]).includes(requested) ||
        !available.has(requested)
      ) {
        throw new BadRequestException(`This tournament's discipline does not support ${requested}`);
      }
      return requested as TournamentFormat;
    }

    const ruleset = await new TournamentRepository(this.db).findLatestRuleset(tournamentId);
    const configured = ruleset?.overrides['format'];
    if (typeof configured !== 'string' || configured.length === 0) {
      throw new BadRequestException(
        'No format was supplied and this tournament has no configured format to default to',
      );
    }
    return configured as TournamentFormat;
  }
}

function actorOf(request: RequestWithSubject): string {
  return `user:${request.subject?.subjectId ?? 'unknown'}`;
}

function authorizationContextOf(request: RequestWithSubject): string {
  return (request.subject?.scopes ?? []).join(' ');
}
