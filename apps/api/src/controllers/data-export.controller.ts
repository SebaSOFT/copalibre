import { Controller, Get, Header, Inject, Param, Req } from '@nestjs/common';
import { NotFoundException } from '../http/error-contract.js';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { escapeCsvFormulaCell, stringifyCsv } from '@copalibre/domain';
import {
  OrganizationRepository,
  TournamentRepository,
  type Database,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import { RequireOrganizationCapability } from '../auth/access-requirement.js';
import type { RequestWithSubject } from '../auth/request-context.js';
import { SecurityPlaneTag } from '../auth/security-plane.js';
import { DATABASE } from '../database.token.js';
import { enforcePolicy } from '../policy/resource-policy.js';
import { recordSensitiveRead } from '../http/sensitive-read-audit.js';

@ApiTags('data-import-export')
@Controller('organizations/:organizationAlias/tournaments/:tournamentAlias/exports')
export class DataExportController {
  constructor(@Inject(DATABASE) private readonly db: Kysely<Database>) {}

  @Get('participants/:target')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-tournament-data')
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
    const { organizationId, tournamentId } = await this.resolve(
      organizationAlias,
      tournamentAlias,
      request,
    );
    const csv = await this.participantsCsv(tournamentId, target);
    await recordSensitiveRead(this.db, {
      organizationId,
      entityType: 'tournament',
      entityId: tournamentId,
      action: 'export.participants-downloaded',
      subject: request.subject,
    });
    return csv;
  }

  private async participantsCsv(tournamentId: string, target: string): Promise<string> {
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
          alias: escapeCsvFormulaCell(row.alias ?? ''),
          displayName: escapeCsvFormulaCell(row.displayName ?? ''),
          naturalKeyKind: row.naturalKeyKind,
          naturalKey: escapeCsvFormulaCell(row.naturalKey ?? ''),
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
        rows.map((row) => ({
          alias: escapeCsvFormulaCell(row.alias ?? ''),
          name: escapeCsvFormulaCell(row.name),
        })),
      );
    }
    throw new NotFoundException('Participant export target must be individual or team', {
      errorCode: 'data-export-not-found',
    });
  }

  @Get('results')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-tournament-data')
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
    const { organizationId, tournamentId } = await this.resolve(
      organizationAlias,
      tournamentAlias,
      request,
    );
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
    const csv = stringifyCsv(
      ['matchNumber', 'result'],
      rows.map((row) => ({
        matchNumber: row.matchNumber,
        result: JSON.stringify(replaceEntrantIds(row.result ?? {}, aliases)),
      })),
    );
    await recordSensitiveRead(this.db, {
      organizationId,
      entityType: 'tournament',
      entityId: tournamentId,
      action: 'export.results-downloaded',
      subject: request.subject,
    });
    return csv;
  }

  @Get('standings')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-tournament-data')
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
    const { organizationId, tournamentId } = await this.resolve(
      organizationAlias,
      tournamentAlias,
      request,
    );
    const aliases = await aliasesForTournament(this.db, tournamentId);
    const rows = await this.db
      .selectFrom('materialised_standings')
      .select(['stage_id', 'rows', 'created_at'])
      .where('tournament_id', '=', tournamentId)
      .orderBy('created_at', 'desc')
      .execute();
    await recordSensitiveRead(this.db, {
      organizationId,
      entityType: 'tournament',
      entityId: tournamentId,
      action: 'export.standings-downloaded',
      subject: request.subject,
    });
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
  ): Promise<{ readonly organizationId: string; readonly tournamentId: string }> {
    const organization = await new OrganizationRepository(this.db).findByAlias(organizationAlias);
    if (!organization)
      throw new NotFoundException(`No organization with alias "${organizationAlias}"`, {
        errorCode: 'data-export-not-found',
      });
    enforcePolicy({
      plane: 'admin-control',
      subject: request.subject,
      resource: { organizationId: organization.organizationId },
    });
    const tournament = await new TournamentRepository(this.db).findByScopedAlias(
      organizationAlias,
      tournamentAlias,
    );
    if (!tournament)
      throw new NotFoundException(`No tournament "${tournamentAlias}"`, {
        errorCode: 'data-export-not-found',
      });
    enforcePolicy({
      plane: 'admin-control',
      subject: request.subject,
      resource: {
        organizationId: organization.organizationId,
        ownerTournamentId: tournament.tournamentId,
      },
    });
    return { organizationId: organization.organizationId, tournamentId: tournament.tournamentId };
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
