import { Controller, Get, Header, Inject, Param, Query, Req } from '@nestjs/common';
import { NotFoundException } from '../http/error-contract.js';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { escapeCsvFormulaCell, stringifyCsv } from '@copalibre/domain';
import { CompetitionRepository, type Database } from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import type { RequestWithSubject } from '../auth/request-context.js';
import { SecurityPlaneTag } from '../auth/security-plane.js';
import { RequireOrganizationRole } from '../auth/access-requirement.js';
import { ProblemResponse } from '../dto/organization.dto.js';
import { TableLayoutListResponse, TableProjectionResponse } from '../dto/table-projections.dto.js';
import {
  listEffectiveTableLayouts,
  readTableProjection,
  type TableProjectionResult,
} from '../table-projections/read.js';
import { DATABASE } from '../database.token.js';
import { resolveTournament } from './standings.controller.js';

/**
 * Dynamic table/ranking projections: group standings, top scorers,
 * goalkeeper rankings, and any other `TableLayoutDefinition` a discipline or
 * tournament ruleset declares — read here rather than in a hardcoded
 * frontend column list.
 *
 * Two scopes, not three: `schedule-timeframe` is a stage's own schedule, not
 * an independently addressable resource in this codebase (see
 * `SchedulesController`, itself `stages/:stageId/schedule`) — so it reads
 * through the stage route below, exactly as `group-phase` and
 * `match-roster` do. A tournament-wide ranking (`player-ranking`/
 * `team-ranking` spanning every stage) reads through the tournament route.
 *
 * CSV is a separate `/csv` route per scope rather than a `?format=` toggle
 * on the JSON route — `DataExportController`'s own CSV endpoints are the
 * only proven precedent for a non-JSON body in this app, and they are all
 * dedicated routes with a static `@Header` content type, never a runtime
 * switch on one shared handler.
 */
@ApiTags('table-projections')
@Controller('organizations/:organizationAlias/tournaments/:tournamentAlias')
export class TableProjectionsController {
  constructor(@Inject(DATABASE) private readonly db: Kysely<Database>) {}

  @Get('tables')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationRole('admin')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Every table layout in effect for this tournament, for building a tab bar',
  })
  @ApiOkResponse({ type: TableLayoutListResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  @ApiNotFoundResponse({ type: ProblemResponse })
  async tableLayouts(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Req() request: RequestWithSubject,
  ): Promise<TableLayoutListResponse> {
    const { tournament } = await resolveTournament(this.db, {
      organizationAlias,
      tournamentAlias,
      request,
    });

    const layouts = await listEffectiveTableLayouts(this.db, {
      tournamentId: tournament.tournamentId,
      disciplineRef: tournament.disciplineRef,
    });

    return { layouts: layouts.map((layout) => ({ ...layout })) };
  }

  @Get('tables/:layoutCode')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationRole('admin')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'A tournament-wide table projection (player/team rankings across every stage)',
  })
  @ApiOkResponse({ type: TableProjectionResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  @ApiNotFoundResponse({ type: ProblemResponse })
  async tournamentTable(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('layoutCode') layoutCode: string,
    @Req() request: RequestWithSubject,
  ): Promise<TableProjectionResponse> {
    return tableResponse(
      await this.projectTournament(organizationAlias, tournamentAlias, layoutCode, request),
    );
  }

  @Get('tables/:layoutCode/csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationRole('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'The same tournament-wide table projection, as a CSV download' })
  @ApiProduces('text/csv')
  @ApiOkResponse({ description: 'CSV table export', schema: { type: 'string', format: 'binary' } })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  @ApiNotFoundResponse({ type: ProblemResponse })
  async tournamentTableCsv(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('layoutCode') layoutCode: string,
    @Req() request: RequestWithSubject,
  ): Promise<string> {
    return tableCsv(
      await this.projectTournament(organizationAlias, tournamentAlias, layoutCode, request),
    );
  }

  @Get('stages/:stageNumber/tables/:layoutCode')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationRole('admin')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'A stage-scoped table projection (group standings, match rosters, schedule tables)',
  })
  @ApiOkResponse({ type: TableProjectionResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  @ApiNotFoundResponse({ type: ProblemResponse })
  async stageTable(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('stageNumber') stageNumberParam: string,
    @Param('layoutCode') layoutCode: string,
    @Query('groupId') groupId: string | undefined,
    @Req() request: RequestWithSubject,
  ): Promise<TableProjectionResponse> {
    return tableResponse(
      await this.projectStage(
        organizationAlias,
        tournamentAlias,
        stageNumberParam,
        layoutCode,
        groupId,
        request,
      ),
    );
  }

  @Get('stages/:stageNumber/tables/:layoutCode/csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationRole('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'The same stage-scoped table projection, as a CSV download' })
  @ApiProduces('text/csv')
  @ApiOkResponse({ description: 'CSV table export', schema: { type: 'string', format: 'binary' } })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  @ApiNotFoundResponse({ type: ProblemResponse })
  async stageTableCsv(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('stageNumber') stageNumberParam: string,
    @Param('layoutCode') layoutCode: string,
    @Query('groupId') groupId: string | undefined,
    @Req() request: RequestWithSubject,
  ): Promise<string> {
    return tableCsv(
      await this.projectStage(
        organizationAlias,
        tournamentAlias,
        stageNumberParam,
        layoutCode,
        groupId,
        request,
      ),
    );
  }

  private async projectTournament(
    organizationAlias: string,
    tournamentAlias: string,
    layoutCode: string,
    request: RequestWithSubject,
  ): Promise<TableProjectionResult> {
    const { organizationId, tournament } = await resolveTournament(this.db, {
      organizationAlias,
      tournamentAlias,
      request,
    });

    return readTableProjection(
      this.db,
      {
        organizationId,
        tournament: {
          tournamentId: tournament.tournamentId,
          disciplineRef: tournament.disciplineRef,
        },
      },
      layoutCode,
    );
  }

  private async projectStage(
    organizationAlias: string,
    tournamentAlias: string,
    stageNumberParam: string,
    layoutCode: string,
    groupId: string | undefined,
    request: RequestWithSubject,
  ): Promise<TableProjectionResult> {
    const stageNumber = Number.parseInt(stageNumberParam, 10);
    const { organizationId, tournament } = await resolveTournament(this.db, {
      organizationAlias,
      tournamentAlias,
      request,
    });

    const stages = await new CompetitionRepository(this.db).listStagesOfTournament(
      tournament.tournamentId,
    );
    const stage = stages.find((candidate) => candidate.number === stageNumber);
    if (!stage)
      throw new NotFoundException(`No stage ${stageNumberParam} in tournament`, {
        errorCode: 'table-projection-not-found',
      });

    return readTableProjection(
      this.db,
      {
        organizationId,
        tournament: {
          tournamentId: tournament.tournamentId,
          disciplineRef: tournament.disciplineRef,
        },
        stageId: stage.stageId,
        groupId,
      },
      layoutCode,
    );
  }
}

/** Shared with `PublicProjectionsController`'s read-only table routes. */
export function tableResponse(result: TableProjectionResult): TableProjectionResponse {
  return {
    layoutCode: result.layout.code,
    target: result.layout.target,
    label: result.layout.label,
    columns: result.layout.columns.map((column) => ({
      code: column.code,
      header: column.header,
      ...(column.shortHeader === undefined ? {} : { shortHeader: column.shortHeader }),
      format: column.format,
    })),
    defaultSort: result.layout.defaultSort.map((rule) => ({ ...rule })),
    rows: result.rows.map((row) => ({
      actorId: row.actorId,
      ...(row.entrantId === undefined ? {} : { entrantId: row.entrantId }),
      rank: row.rank,
      sharedRank: row.sharedRank,
      cells: row.cells,
    })),
    projectionVersion: result.projectionVersion,
  };
}

function tableCsv(result: TableProjectionResult): string {
  const columns = result.layout.columns.map((column) => column.code);
  const rows = result.rows.map((row) =>
    Object.fromEntries(
      columns.map((code) => [code, escapeCsvFormulaCell(row.cells[code]?.formatted ?? '')]),
    ),
  );
  return stringifyCsv(columns, rows);
}
