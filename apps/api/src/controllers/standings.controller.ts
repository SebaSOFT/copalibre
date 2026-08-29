import { Controller, Get, Inject, Param, ParseIntPipe, Query, Req } from '@nestjs/common';
import { NotFoundException } from '../http/error-contract.js';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  OrganizationRepository,
  TournamentRepository,
  type Database,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import type { RequestWithSubject } from '../auth/request-context.js';
import { SecurityPlaneTag } from '../auth/security-plane.js';
import { RequireOrganizationCapability } from '../auth/access-requirement.js';
import { ProblemResponse } from '../dto/organization.dto.js';
import { StandingsResponse, TiebreakTraceResponse } from '../dto/standings.dto.js';
import { enforcePolicy } from '../policy/resource-policy.js';

import { DATABASE } from '../database.token.js';

import { readStandings, storedTraceLinesForEntrant } from '../standings/read.js';

/**
 * Standings, with the trace that justifies them.
 *
 * The trace is passed through exactly as the rules engine produced it. The
 * screen renders these strings and formats nothing of its own — a second
 * formatter is a second version of what the engine decided, and only one of
 * them would be the one that actually ranked anybody.
 *
 * The per-row trace is a separate endpoint because it is a separate question:
 * a table of forty rows should not carry forty comparator chains nobody
 * expanded.
 */
@ApiTags('standings')
@Controller('organizations/:organizationAlias/tournaments/:tournamentAlias/stages/:stageNumber')
export class StandingsController {
  constructor(@Inject(DATABASE) private readonly db: Kysely<Database>) {}

  @Get('standings')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.view-internal-standings')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Ranked standings for one stage, with the calculation’s trace',
    description:
      'Rows come from the published projection; the trace is the rules engine’s own explanation, verbatim.',
  })
  @ApiOkResponse({ type: StandingsResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  @ApiNotFoundResponse({ type: ProblemResponse })
  async standings(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('stageNumber', ParseIntPipe) stageNumber: number,
    @Query('groupId') groupId: string | undefined,
    @Req() request: RequestWithSubject,
  ): Promise<StandingsResponse> {
    const { tournament } = await resolveTournament(this.db, {
      organizationAlias,
      tournamentAlias,
      request,
    });

    const result = await readStandings(this.db, tournament, stageNumber, groupId);
    return {
      stageId: result.stageId,
      projectionVersion: result.projectionVersion,
      fullyResolved: result.fullyResolved,
      rows: result.rows,
      trace: result.trace,
      ...(result.grain === undefined ? {} : { grain: result.grain }),
    };
  }

  @Get('standings/entrants/:entrantId/trace')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.view-internal-standings')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'The comparator chain that placed one entrant',
    description:
      'Empty for a row no tiebreak comparator had to separate — the screen shows no expander for it.',
  })
  @ApiOkResponse({ type: TiebreakTraceResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  @ApiNotFoundResponse({ type: ProblemResponse })
  async trace(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('stageNumber', ParseIntPipe) stageNumber: number,
    @Query('groupId') groupId: string | undefined,
    @Param('entrantId') entrantId: string,
    @Req() request: RequestWithSubject,
  ): Promise<TiebreakTraceResponse> {
    const { tournament } = await resolveTournament(this.db, {
      organizationAlias,
      tournamentAlias,
      request,
    });

    const result = await readStandings(this.db, tournament, stageNumber, groupId);
    const row = result.rows.find((candidate) => candidate.entrantId === entrantId);
    if (!row)
      throw new NotFoundException(`No entrant ${entrantId} in this stage’s standings`, {
        errorCode: 'standings-not-found',
      });

    return {
      entrantId,
      lines: storedTraceLinesForEntrant(
        result.rawTrace as readonly Record<string, unknown>[],
        entrantId,
        row.sharedRank,
      ),
    };
  }
}

/** Alias resolution plus the policy check, shared by the standings controllers. */
export async function resolveTournament(
  db: Kysely<Database>,
  input: {
    readonly organizationAlias: string;
    readonly tournamentAlias: string;
    readonly request: RequestWithSubject;
  },
): Promise<{
  readonly organizationId: string;
  readonly tournament: NonNullable<Awaited<ReturnType<TournamentRepository['findByScopedAlias']>>>;
}> {
  const organization = await new OrganizationRepository(db).findByAlias(input.organizationAlias);
  if (!organization) {
    throw new NotFoundException(`No organization with alias "${input.organizationAlias}"`, {
      errorCode: 'standings-not-found',
    });
  }

  enforcePolicy({
    plane: 'admin-control',
    subject: input.request.subject,
    resource: { organizationId: organization.organizationId },
  });

  const tournament = await new TournamentRepository(db).findByScopedAlias(
    input.organizationAlias,
    input.tournamentAlias,
  );
  if (!tournament) {
    throw new NotFoundException(
      `No tournament "${input.tournamentAlias}" in "${input.organizationAlias}"`,
      { errorCode: 'standings-not-found' },
    );
  }

  return { organizationId: organization.organizationId, tournament };
}
