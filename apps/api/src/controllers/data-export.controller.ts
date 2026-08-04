import { Controller, Get, Header, Inject, NotFoundException, Param, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { stringifyCsv } from '@copalibre/domain';
import {
  OrganizationRepository,
  TournamentRepository,
  type Database,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import { RequireOrganizationRole } from '../auth/access-requirement.js';
import type { RequestWithSubject } from '../auth/request-context.js';
import { SecurityPlaneTag } from '../auth/security-plane.js';
import { DATABASE } from '../database.token.js';
import { enforcePolicy } from '../policy/resource-policy.js';

@ApiTags('data-import-export')
@Controller('organizations/:organizationAlias/tournaments/:tournamentAlias/exports')
export class DataExportController {
  constructor(@Inject(DATABASE) private readonly db: Kysely<Database>) {}

  @Get('participants/:target')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationRole('admin')
  @ApiBearerAuth()
  @ApiProduces('text/csv')
  @ApiOperation({ summary: 'Export re-importable participant CSV by stable alias' })
  @ApiOkResponse({
    description: 'CSV participant export',
    schema: { type: 'string', format: 'binary' },
  })
  async participants(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('target') target: string,
    @Req() request: RequestWithSubject,
  ): Promise<string> {
    const tournamentId = await this.resolve(organizationAlias, tournamentAlias, request);
    if (target === 'individual') {
      const rows = await this.db
        .selectFrom('entrants')
        .innerJoin('persons', 'persons.person_id', 'entrants.person_id')
        .select([
          'persons.alias as alias',
          'persons.display_name as displayName',
          'persons.natural_key_kind as naturalKeyKind',
          'persons.natural_key_value as naturalKey',
        ])
        .where('entrants.tournament_id', '=', tournamentId)
        .where('entrants.entrant_kind', '=', 'person')
        .orderBy('persons.alias')
        .execute();
      return stringifyCsv(
        ['alias', 'displayName', 'naturalKeyKind', 'naturalKey'],
        rows.map((row) => ({
          alias: row.alias ?? '',
          displayName: row.displayName,
          naturalKeyKind: row.naturalKeyKind,
          naturalKey: row.naturalKey,
        })),
      );
    }
    if (target === 'team') {
      const rows = await this.db
        .selectFrom('entrants')
        .innerJoin('teams', 'teams.team_id', 'entrants.team_id')
        .select(['teams.alias as alias', 'teams.name as name'])
        .where('entrants.tournament_id', '=', tournamentId)
        .where('entrants.entrant_kind', '=', 'team')
        .orderBy('teams.alias')
        .execute();
      return stringifyCsv(
        ['alias', 'name'],
        rows.map((row) => ({ alias: row.alias ?? '', name: row.name })),
      );
    }
    throw new NotFoundException('Participant export target must be individual or team');
  }

  @Get('results')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationRole('admin')
  @ApiBearerAuth()
  @ApiProduces('text/csv')
  @ApiOperation({ summary: 'Export calculated match results by participant alias' })
  @ApiOkResponse({
    description: 'CSV result export',
    schema: { type: 'string', format: 'binary' },
  })
  async results(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Req() request: RequestWithSubject,
  ): Promise<string> {
    const tournamentId = await this.resolve(organizationAlias, tournamentAlias, request);
    const aliases = await aliasesForTournament(this.db, tournamentId);
    const rows = await this.db
      .selectFrom('matches')
      .innerJoin('fixtures', 'fixtures.fixture_id', 'matches.fixture_id')
      .innerJoin('stages', 'stages.stage_id', 'fixtures.stage_id')
      .innerJoin('seasons', 'seasons.season_id', 'stages.season_id')
      .select(['matches.number as matchNumber', 'matches.result as result'])
      .where('seasons.tournament_id', '=', tournamentId)
      .where('matches.result', 'is not', null)
      .orderBy('matches.number')
      .execute();
    return stringifyCsv(
      ['matchNumber', 'result'],
      rows.map((row) => ({
        matchNumber: row.matchNumber,
        result: JSON.stringify(replaceEntrantIds(row.result ?? {}, aliases)),
      })),
    );
  }

  @Get('standings')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationRole('admin')
  @ApiBearerAuth()
  @ApiProduces('text/csv')
  @ApiOperation({ summary: 'Export calculated standings by participant alias' })
  @ApiOkResponse({
    description: 'CSV standings export',
    schema: { type: 'string', format: 'binary' },
  })
  async standings(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Req() request: RequestWithSubject,
  ): Promise<string> {
    const tournamentId = await this.resolve(organizationAlias, tournamentAlias, request);
    const aliases = await aliasesForTournament(this.db, tournamentId);
    const rows = await this.db
      .selectFrom('materialised_standings')
      .select(['stage_id', 'rows', 'created_at'])
      .where('tournament_id', '=', tournamentId)
      .orderBy('created_at', 'desc')
      .execute();
    return stringifyCsv(
      ['stageId', 'standings'],
      rows.map((row) => ({
        stageId: row.stage_id,
        standings: JSON.stringify(replaceEntrantIds(row.rows, aliases)),
      })),
    );
  }

  private async resolve(
    organizationAlias: string,
    tournamentAlias: string,
    request: RequestWithSubject,
  ): Promise<string> {
    const organization = await new OrganizationRepository(this.db).findByAlias(organizationAlias);
    if (!organization)
      throw new NotFoundException(`No organization with alias "${organizationAlias}"`);
    enforcePolicy({
      plane: 'admin-control',
      subject: request.subject,
      resource: { organizationId: organization.organizationId },
    });
    const tournament = await new TournamentRepository(this.db).findByScopedAlias(
      organizationAlias,
      tournamentAlias,
    );
    if (!tournament) throw new NotFoundException(`No tournament "${tournamentAlias}"`);
    return tournament.tournamentId;
  }
}

async function aliasesForTournament(db: Kysely<Database>, tournamentId: string) {
  const rows = await db
    .selectFrom('entrants')
    .leftJoin('persons', 'persons.person_id', 'entrants.person_id')
    .leftJoin('teams', 'teams.team_id', 'entrants.team_id')
    .select(['entrants.entrant_id', 'persons.alias as personAlias', 'teams.alias as teamAlias'])
    .where('entrants.tournament_id', '=', tournamentId)
    .execute();
  return new Map(
    rows.map((row) => [row.entrant_id, row.personAlias ?? row.teamAlias ?? 'unknown']),
  );
}

function replaceEntrantIds(value: unknown, aliases: ReadonlyMap<string, string>): unknown {
  if (Array.isArray(value)) return value.map((item) => replaceEntrantIds(item, aliases));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        (key === 'entrantId' || key === 'winnerEntrantId') && typeof item === 'string'
          ? (aliases.get(item) ?? item)
          : replaceEntrantIds(item, aliases),
      ]),
    );
  }
  return value;
}
