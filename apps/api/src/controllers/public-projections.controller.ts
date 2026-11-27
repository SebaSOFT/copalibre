import { Controller, Get, Header, Inject, Param, Query, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { ApiOkResponse, ApiOperation, ApiProduces, ApiQuery, ApiTags } from '@nestjs/swagger';
import { SecurityPlaneTag } from '../auth/security-plane.js';
import { Database } from '@copalibre/persistence';
import {
  PlayerStatisticsDrilldownResponse,
  PublicBracketResponse,
  PublicLiveResponse,
  PublicMatchesViewResponse,
  PublicMatchReportResponse,
  PublicOverviewResponse,
  PublicPersonProfileResponse,
} from '../dto/public-tournament.dto.js';
import { TableLayoutListResponse, TableProjectionResponse } from '../dto/table-projections.dto.js';
import { Kysely } from 'kysely';
import { DATABASE } from '../database.token.js';
import { overview } from '../public-projections/overview.js';
import { matchReport } from '../public-projections/match-report.js';
import { live } from '../public-projections/live.js';
import { bracket } from '../public-projections/bracket.js';
import { matchesView } from '../public-projections/matches-view.js';
import {
  stageTable,
  stageTableCsv,
  tableLayouts,
  tournamentTable,
  tournamentTableCsv,
} from '../public-projections/tables.js';
import { playerProfile, playerStatistics } from '../public-projections/players.js';

@ApiTags('Public Projections')
@Controller('organizations/:organizationAlias/tournaments/:tournamentAlias')
export class PublicProjectionsController {
  constructor(@Inject(DATABASE) private readonly db: Kysely<Database>) {}

  @Get('overview')
  @SecurityPlaneTag('public-read')
  @ApiOperation({ summary: 'Overview of a tournament' })
  @ApiOkResponse({ type: PublicOverviewResponse })
  async overview(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
  ): Promise<PublicOverviewResponse> {
    return overview(this.db, organizationAlias, tournamentAlias);
  }

  @Get('stages/:stageNumber/matches/:matchNumber')
  @SecurityPlaneTag('public-read')
  @ApiOperation({
    summary: 'Public report for one match',
    description:
      'A series fixture has one stage number and one page; `game` selects one of its games (1-based, ' +
      'play order), and the report then carries that game’s own status, roster and stream link. ' +
      'Without it the report is the fixture’s first game.',
  })
  @ApiQuery({
    name: 'game',
    required: false,
    type: Number,
    description: 'Game number within the fixture',
  })
  @ApiOkResponse({ type: PublicMatchReportResponse })
  async matchReport(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('stageNumber') stageNumberValue: string,
    @Param('matchNumber') matchNumberValue: string,
    @Query('game') gameValue?: string,
  ): Promise<PublicMatchReportResponse> {
    return matchReport(
      this.db,
      organizationAlias,
      tournamentAlias,
      stageNumberValue,
      matchNumberValue,
      gameValue,
    );
  }

  @Get('live')
  @SecurityPlaneTag('public-read')
  @ApiOperation({ summary: 'Live matches of a tournament' })
  @ApiOkResponse({ type: PublicLiveResponse })
  async live(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
  ): Promise<PublicLiveResponse> {
    return live(this.db, organizationAlias, tournamentAlias);
  }

  @Get('stages/:stageNumber/bracket')
  @SecurityPlaneTag('public-read')
  @ApiOperation({ summary: 'Bracket for a stage' })
  @ApiOkResponse({ type: PublicBracketResponse })
  async bracket(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('stageNumber') stageNumberStr: string,
  ): Promise<PublicBracketResponse> {
    return bracket(this.db, organizationAlias, tournamentAlias, stageNumberStr);
  }

  /**
   * The matches view: a flat, filterable card list — the whole tournament by
   * default, or one stage/group when named — richer than the bracket's own
   * card (venue, clock, latest event, a one-line deciding-factor summary for
   * a finalized tiebreak-decided match) but never the full internal
   * comparator trace; that stays behind `org.view-internal-standings` on the
   * control-web equivalent.
   */
  @Get('matches-view')
  @SecurityPlaneTag('public-read')
  @ApiOperation({ summary: "A tournament's matches, as a flat filterable list" })
  @ApiOkResponse({ type: PublicMatchesViewResponse })
  async matchesView(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Query('stageNumber') stageNumberValue: string | undefined,
    @Query('groupId') groupId: string | undefined,
    @Query('state') state: 'all' | 'live' | 'upcoming' | 'final' | undefined,
  ): Promise<PublicMatchesViewResponse> {
    return matchesView(
      this.db,
      organizationAlias,
      tournamentAlias,
      stageNumberValue,
      groupId,
      state,
    );
  }

  // 'public/tables', not 'tables': the admin `TableProjectionsController`
  // already claims that exact path (same controller-level prefix) behind
  // `RequireOrganizationRole('admin')` — Fastify's router refuses two
  // handlers on one method+path, so the same leaf name cannot be reused
  // unauthenticated here.
  @Get('public/tables')
  @SecurityPlaneTag('public-read')
  @ApiOperation({ summary: 'Every table layout in effect for this tournament' })
  @ApiOkResponse({ type: TableLayoutListResponse })
  async tableLayouts(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
  ): Promise<TableLayoutListResponse> {
    return tableLayouts(this.db, organizationAlias, tournamentAlias);
  }

  @Get('public/tables/:layoutCode')
  @SecurityPlaneTag('public-read')
  @ApiOperation({ summary: 'A tournament-wide table projection (player/team rankings)' })
  @ApiQuery({
    name: 'club',
    required: false,
    type: String,
    description: 'Filter rows to entrants of this club alias',
  })
  @ApiQuery({
    name: 'clubId',
    required: false,
    type: String,
    description: 'Legacy filter: entrants of this club id',
  })
  @ApiOkResponse({ type: TableProjectionResponse })
  async tournamentTable(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('layoutCode') layoutCode: string,
    @Query('club') club?: string,
    @Query('clubId') clubId?: string,
  ): Promise<TableProjectionResponse> {
    return tournamentTable(this.db, organizationAlias, tournamentAlias, layoutCode, club, clubId);
  }

  @Get('public/tables/:layoutCode/csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="standings.csv"')
  @SecurityPlaneTag('public-read')
  @ApiProduces('text/csv')
  @ApiOperation({ summary: 'Download a tournament-wide public table as CSV' })
  @ApiQuery({
    name: 'club',
    required: false,
    type: String,
    description: 'Filter rows to entrants of this club alias',
  })
  @ApiQuery({
    name: 'clubId',
    required: false,
    type: String,
    description: 'Legacy filter: entrants of this club id',
  })
  @ApiOkResponse({ description: 'CSV table export', schema: { type: 'string', format: 'binary' } })
  async tournamentTableCsv(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('layoutCode') layoutCode: string,
    @Query('club') club?: string,
    @Query('clubId') clubId?: string,
  ): Promise<string> {
    return tournamentTableCsv(
      this.db,
      organizationAlias,
      tournamentAlias,
      layoutCode,
      club,
      clubId,
    );
  }

  @Get('stages/:stageNumber/public/tables/:layoutCode')
  @SecurityPlaneTag('public-read')
  @ApiOperation({ summary: 'A stage-scoped table projection (group standings, schedule tables)' })
  @ApiQuery({
    name: 'club',
    required: false,
    type: String,
    description: 'Filter rows to entrants of this club alias',
  })
  @ApiQuery({
    name: 'clubId',
    required: false,
    type: String,
    description: 'Legacy filter: entrants of this club id',
  })
  @ApiOkResponse({ type: TableProjectionResponse })
  async stageTable(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('stageNumber') stageNumberStr: string,
    @Param('layoutCode') layoutCode: string,
    @Query('club') club?: string,
    @Query('clubId') clubId?: string,
  ): Promise<TableProjectionResponse> {
    return stageTable(
      this.db,
      organizationAlias,
      tournamentAlias,
      stageNumberStr,
      layoutCode,
      club,
      clubId,
    );
  }

  @Get('stages/:stageNumber/public/tables/:layoutCode/csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="standings.csv"')
  @SecurityPlaneTag('public-read')
  @ApiProduces('text/csv')
  @ApiOperation({ summary: 'Download a stage-scoped public table as CSV' })
  @ApiQuery({
    name: 'club',
    required: false,
    type: String,
    description: 'Filter rows to entrants of this club alias',
  })
  @ApiQuery({
    name: 'clubId',
    required: false,
    type: String,
    description: 'Legacy filter: entrants of this club id',
  })
  @ApiOkResponse({ description: 'CSV table export', schema: { type: 'string', format: 'binary' } })
  async stageTableCsv(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('stageNumber') stageNumberStr: string,
    @Param('layoutCode') layoutCode: string,
    @Query('club') club?: string,
    @Query('clubId') clubId?: string,
  ): Promise<string> {
    return stageTableCsv(
      this.db,
      organizationAlias,
      tournamentAlias,
      stageNumberStr,
      layoutCode,
      club,
      clubId,
    );
  }

  @Get('persons/:personId/public/profile')
  @SecurityPlaneTag('public-read')
  @ApiOperation({ summary: "A person's public career and competition profile" })
  @ApiOkResponse({ type: PublicPersonProfileResponse })
  async playerProfile(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('personId') personId: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<PublicPersonProfileResponse> {
    return playerProfile(this.db, organizationAlias, tournamentAlias, personId, reply);
  }

  @Get('persons/:personId/public/statistics')
  @SecurityPlaneTag('public-read')
  @ApiOperation({ summary: "A person's tournament-total and match-by-match declared statistics" })
  @ApiOkResponse({ type: PlayerStatisticsDrilldownResponse })
  async playerStatistics(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('personId') personId: string,
    @Query('layout') layoutParam?: string,
  ): Promise<PlayerStatisticsDrilldownResponse> {
    return playerStatistics(this.db, organizationAlias, tournamentAlias, personId, layoutParam);
  }
}

export { PublicTournamentListingController } from './public-tournament-listing.controller.js';
export { resolveTournamentWinners } from '../public-projections/tournament-winners.js';
export { firstQueryString, normalizeClubAliasQuery } from '../public-projections/tables.js';
export { seriesResponseOf } from './stage-series.js';
