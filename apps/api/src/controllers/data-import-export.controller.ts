import { Body, Controller, Get, HttpCode, Inject, Param, Post, Req } from '@nestjs/common';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '../http/error-contract.js';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { MAX_CSV_IMPORT_BYTES } from '@copalibre/domain';
import {
  CsvImportRepository,
  EnrollmentRepository,
  OrganizationRepository,
  PersonRepository,
  TournamentRepository,
  withTransaction,
  type Database,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import { RequireOrganizationRole } from '../auth/access-requirement.js';
import type { RequestWithSubject } from '../auth/request-context.js';
import { SecurityPlaneTag } from '../auth/security-plane.js';
import { DATABASE } from '../database.token.js';
import {
  CommitCsvImportRequest,
  CsvImportPreviewResponse,
  CreateCsvImportRequest,
} from '../dto/organization.dto.js';
import { enforcePolicy } from '../policy/resource-policy.js';

const CSV_IMPORT_VALIDATION_EVENT = 'csv-import.validation-requested';

@ApiTags('data-import-export')
@Controller('organizations/:organizationAlias/tournaments/:tournamentAlias/imports')
export class DataImportExportController {
  constructor(@Inject(DATABASE) private readonly db: Kysely<Database>) {}

  @Post()
  @HttpCode(202)
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationRole('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Queue a CSV participant import for worker validation' })
  @ApiAcceptedResponse({ type: CsvImportPreviewResponse })
  async create(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Body() body: CreateCsvImportRequest,
    @Req() request: RequestWithSubject,
  ): Promise<CsvImportPreviewResponse> {
    const { organizationId, tournamentId } = await this.resolve(
      organizationAlias,
      tournamentAlias,
      request,
    );
    if (
      body.target !== 'individual' &&
      body.target !== 'team' &&
      body.target !== 'team-membership'
    ) {
      throw new BadRequestException('Import target must be individual, team, or team-membership', {
        errorCode: 'data-import-bad-request',
      });
    }
    if (typeof body.sourceCsv !== 'string') {
      throw new BadRequestException('sourceCsv must be a CSV string', {
        errorCode: 'data-import-bad-request',
      });
    }
    if (Buffer.byteLength(body.sourceCsv, 'utf8') > MAX_CSV_IMPORT_BYTES) {
      throw new BadRequestException('CSV upload exceeds the 4 MiB limit', {
        errorCode: 'data-import-bad-request',
      });
    }

    const session = await withTransaction(this.db, async (uow) => {
      const created = await new CsvImportRepository(this.db).create(uow, {
        organizationId,
        tournamentId,
        target: body.target,
        sourceCsv: body.sourceCsv,
        actor: actorOf(request),
      });
      await uow.publishEvent({
        organizationId,
        stream: `csv-import:${created.importId}`,
        entityId: created.importId,
        eventType: CSV_IMPORT_VALIDATION_EVENT,
        projectionVersion: 1,
        payload: { importId: created.importId },
      });
      return created;
    });
    return toResponse(session);
  }

  @Get(':importId')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationRole('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Read the worker-produced CSV import preview' })
  @ApiOkResponse({ type: CsvImportPreviewResponse })
  async preview(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('importId') importId: string,
    @Req() request: RequestWithSubject,
  ): Promise<CsvImportPreviewResponse> {
    const { organizationId, tournamentId } = await this.resolve(
      organizationAlias,
      tournamentAlias,
      request,
    );
    const session = await new CsvImportRepository(this.db).find(importId);
    if (
      !session ||
      session.organizationId !== organizationId ||
      session.tournamentId !== tournamentId
    ) {
      throw new NotFoundException(`No CSV import ${importId} in this tournament`, {
        errorCode: 'data-import-not-found',
      });
    }
    return toResponse(session);
  }

  @Post(':importId/commit')
  @HttpCode(200)
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationRole('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Commit a reviewed CSV preview atomically' })
  @ApiOkResponse({ type: CsvImportPreviewResponse })
  async commit(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('importId') importId: string,
    @Body() body: CommitCsvImportRequest,
    @Req() request: RequestWithSubject,
  ): Promise<CsvImportPreviewResponse> {
    const { organizationId, tournamentId } = await this.resolve(
      organizationAlias,
      tournamentAlias,
      request,
    );
    if (typeof body.sourceHash !== 'string') {
      throw new BadRequestException('sourceHash must match the reviewed preview', {
        errorCode: 'data-import-bad-request',
      });
    }

    const committed = await withTransaction(this.db, async (uow) => {
      const imports = new CsvImportRepository(this.db);
      const session = await imports.markCommitting(uow, { importId, sourceHash: body.sourceHash });
      if (
        !session ||
        session.organizationId !== organizationId ||
        session.tournamentId !== tournamentId
      ) {
        throw new ConflictException(
          'Import preview is stale, unreviewed, or belongs to another tournament',
          { errorCode: 'data-import-conflict' },
        );
      }
      if (!session.preview?.valid) {
        throw new ConflictException('Import preview contains validation errors', {
          errorCode: 'data-import-conflict',
        });
      }

      const people = new PersonRepository(this.db);
      const enrollment = new EnrollmentRepository(this.db);
      const rowAliases: string[] = [];
      // Populated lazily, the first time a team-membership row references a
      // given team: avoids an N+1 `squadOf` call per row, and lets a repeated
      // teamAlias within one file (or a re-run of the same file) recognise an
      // already-enlisted person without a second `enlist` call (0065's
      // additive-with-idempotent-reimport contract; see design.md).
      const squadCache = new Map<string, Set<string>>();
      for (const row of session.preview.rows) {
        const values = row.values;
        if (session.target === 'individual') {
          const naturalKey = naturalKeyOf(values);
          const replacement = await people.replaceByAlias(uow, {
            organizationId,
            alias: values.alias ?? '',
            displayName: values.displayName ?? '',
            ...(naturalKey === undefined ? {} : { naturalKey }),
            actor: actorOf(request),
            authorizationContext: authorizationContextOf(request),
          });
          const entrantRef = { kind: 'person' as const, personId: replacement.person.personId };
          if (!(await enrollment.findEntrantForRef(tournamentId, entrantRef))) {
            await enrollment.registerEntrant(uow, {
              organizationId,
              tournamentId,
              entrantRef,
              ...(values.abbreviation?.trim() === '' || values.abbreviation === undefined
                ? {}
                : { abbreviation: values.abbreviation.trim() }),
              actor: actorOf(request),
              authorizationContext: authorizationContextOf(request),
            });
          }
          rowAliases.push(values.alias ?? '');
        } else if (session.target === 'team') {
          const replacement = await enrollment.replaceTeamByAlias(uow, {
            organizationId,
            alias: values.alias ?? '',
            name: values.name ?? '',
            actor: actorOf(request),
            authorizationContext: authorizationContextOf(request),
          });
          const entrantRef = { kind: 'team' as const, teamId: replacement.team.teamId };
          if (!(await enrollment.findEntrantForRef(tournamentId, entrantRef))) {
            await enrollment.registerEntrant(uow, {
              organizationId,
              tournamentId,
              entrantRef,
              ...(values.abbreviation?.trim() === '' || values.abbreviation === undefined
                ? {}
                : { abbreviation: values.abbreviation.trim() }),
              actor: actorOf(request),
              authorizationContext: authorizationContextOf(request),
            });
          }
          rowAliases.push(values.alias ?? '');
        } else {
          const teamAlias = values.teamAlias ?? '';
          const team = await enrollment.findTeamByAlias(organizationId, teamAlias);
          const entrant = team
            ? await enrollment.findEntrantForRef(tournamentId, {
                kind: 'team' as const,
                teamId: team.teamId,
              })
            : undefined;
          if (!team || !entrant) {
            // The reviewed preview validated `teamAlias` against this
            // tournament's registered team entrants (worker-side, per
            // design.md); reaching commit without one resolving means the
            // registration this preview relied on no longer holds — the same
            // "what was validated no longer holds" family as a stale
            // sourceHash, not a fresh 404.
            throw new ConflictException(
              `Import preview is stale: "${teamAlias}" is no longer a registered team entrant in this tournament`,
              { errorCode: 'data-import-conflict' },
            );
          }

          const naturalKey = naturalKeyOf(values);
          const replacement = await people.replaceByAlias(uow, {
            organizationId,
            alias: values.alias ?? '',
            displayName: values.displayName ?? '',
            ...(naturalKey === undefined ? {} : { naturalKey }),
            actor: actorOf(request),
            authorizationContext: authorizationContextOf(request),
          });

          let squad = squadCache.get(team.teamId);
          if (!squad) {
            const current = await people.squadOf(team.teamId);
            squad = new Set(current.map((player) => player.personId));
            squadCache.set(team.teamId, squad);
          }
          if (!squad.has(replacement.person.personId)) {
            await people.enlist(uow, {
              personId: replacement.person.personId,
              teamId: team.teamId,
              role: 'player',
              organizationId,
              actor: actorOf(request),
              authorizationContext: authorizationContextOf(request),
            });
            squad.add(replacement.person.personId);
          }
          rowAliases.push(`${teamAlias}/${values.alias ?? ''}`);
        }
      }
      const result = await imports.markCommitted(uow, importId);
      await uow.recordAudit({
        organizationId,
        entityType: 'csv-import',
        entityId: importId,
        action: 'csv-import.committed',
        actor: actorOf(request),
        authorizationContext: authorizationContextOf(request),
        resultingState: { rowCount: rowAliases.length, rowAliases },
      });
      await uow.publishEvent({
        organizationId,
        stream: `csv-import:${importId}`,
        entityId: importId,
        eventType: 'csv-import.committed',
        projectionVersion: 1,
        payload: { importId, rowCount: rowAliases.length },
      });
      return result;
    });
    return toResponse(committed);
  }

  private async resolve(
    organizationAlias: string,
    tournamentAlias: string,
    request: RequestWithSubject,
  ): Promise<{ readonly organizationId: string; readonly tournamentId: string }> {
    const organization = await new OrganizationRepository(this.db).findByAlias(organizationAlias);
    if (!organization)
      throw new NotFoundException(`No organization with alias "${organizationAlias}"`, {
        errorCode: 'data-import-not-found',
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
    if (!tournament) {
      throw new NotFoundException(`No tournament "${tournamentAlias}" in "${organizationAlias}"`, {
        errorCode: 'data-import-not-found',
      });
    }
    return { organizationId: organization.organizationId, tournamentId: tournament.tournamentId };
  }
}

function actorOf(request: RequestWithSubject): string {
  return `user:${request.subject?.principalId ?? request.subject?.subjectId ?? 'unknown'}`;
}

function authorizationContextOf(request: RequestWithSubject): string {
  return (request.subject?.scopes ?? []).join(' ');
}

function naturalKeyOf(values: Readonly<Record<string, string>>) {
  const kind = values.naturalKeyKind?.trim();
  const value = values.naturalKey?.trim();
  return kind && value ? { kind, value } : undefined;
}

function toResponse(session: {
  importId: string;
  target: 'individual' | 'team' | 'team-membership';
  status: string;
  sourceHash: string;
  preview?: { valid: boolean; rows: readonly unknown[]; errors: readonly unknown[] };
}): CsvImportPreviewResponse {
  return {
    importId: session.importId,
    target: session.target,
    status: session.status,
    sourceHash: session.sourceHash,
    ...(session.preview === undefined ? {} : { preview: session.preview }),
  };
}
