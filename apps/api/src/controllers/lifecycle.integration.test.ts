import { Module, type INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { winConditionScript, type DisciplineDescriptor } from '@copalibre/domain';
import {
  OrganizationRepository,
  TournamentRepository,
  withTransaction,
  type Database,
} from '@copalibre/persistence';
import { createMigratedDatabase } from '../../../../packages/persistence/src/test-support/scratch-database.js';
import type { Kysely } from 'kysely';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthenticatedSubject } from '../auth/request-context.js';
import { TokenVerifier } from '../auth/token-verifier.js';
import { DATABASE } from '../database.token.js';
import { DataExportController } from './data-export.controller.js';
import { TournamentsController } from './tournaments.controller.js';

/**
 * Tournament archival through the real HTTP stack: the
 * active-only listing, the legal-transition guard against a real database,
 * and export continuing to serve an archived tournament identically to a
 * finished one.
 *
 * No repository path exists yet to reach `started`/`finished` in production
 * (confirmed by survey — this change only adds the `archived` transition on
 * top of the existing `draft`/`published` machinery), so this test sets a
 * tournament to `finished` with a direct column update, the same way other
 * integration suites in this repo build fixtures raw SQL cannot yet reach
 * through a repository method.
 */

class FakeTokenVerifier {
  verify(token: string): Promise<AuthenticatedSubject> {
    if (token !== 'organizer-1') return Promise.reject(new Error('unknown token'));
    return Promise.resolve({
      subjectId: 'organizer-1',
      organizationId: ORGANIZATION_PLACEHOLDER(),
      scopes: ['copalibre.control'],
    });
  }
}

let organizationId = '';
function ORGANIZATION_PLACEHOLDER(): string {
  return organizationId;
}

function descriptor(): DisciplineDescriptor {
  const descriptorId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  return {
    descriptorId,
    alias: 'orbital-lifecycle',
    version: '1.0.0',
    name: 'Orbital Lifecycle',
    attribution: { author: 'CopaLibre tests', licence: 'AGPL-3.0-only' },
    participantTypes: ['individual'],
    rosterConstraints: { minPlayers: 1, maxPlayers: 1 },
    segmentTypes: [{ name: 'half', label: 'Half', timed: true }],
    eventDefinitions: [],
    statistics: [],
    scoringInputs: [],
    availableFormats: ['single-elimination'],
    winCondition: winConditionScript('higher-score-wins', { unit: 'score' }),
    notificationRuleCapabilities: [],
    defaults: { scoring: { pointsPerWin: 3 }, tiebreakers: ['points'] },
    fieldPolicies: {},
  };
}

describe('tournament archival (integration)', () => {
  let app: INestApplication;
  let scratch: Awaited<ReturnType<typeof createMigratedDatabase>>;
  let db: Kysely<Database>;
  const organizationAlias = 'liga-lifecycle';

  beforeAll(async () => {
    scratch = await createMigratedDatabase('lifecycle-http');
    db = scratch.db;

    const organization = await withTransaction(db, (uow) =>
      new OrganizationRepository(db).create(uow, {
        alias: organizationAlias,
        name: 'Liga Lifecycle',
        actor: 'user:seed',
        authorizationContext: 'seed',
      }),
    );
    organizationId = organization.organizationId;

    @Module({
      controllers: [TournamentsController, DataExportController],
      providers: [
        { provide: DATABASE, useValue: db },
        { provide: TokenVerifier, useClass: FakeTokenVerifier },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
      ],
    })
    class TestModule {}

    const moduleRef = await Test.createTestingModule({ imports: [TestModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
    await scratch?.drop();
  });

  function inject(options: Parameters<NestFastifyApplication['inject']>[0]) {
    return (app as NestFastifyApplication).inject(options);
  }

  async function finishedTournament(alias: string): Promise<string> {
    const tournament = await withTransaction(db, (uow) =>
      new TournamentRepository(db).create(uow, {
        organizationId,
        alias,
        name: `Tournament ${alias}`,
        descriptor: descriptor(),
        actor: 'user:seed',
        authorizationContext: 'seed',
      }),
    );
    // No repository path reaches `finished` yet (see file-level comment).
    await db
      .updateTable('tournaments')
      .set({ status: 'finished' })
      .where('tournament_id', '=', tournament.tournamentId)
      .execute();
    return tournament.tournamentId;
  }

  it('rejects an illegal transition against a real database, leaving state unchanged (5.2)', async () => {
    const tournament = await withTransaction(db, (uow) =>
      new TournamentRepository(db).create(uow, {
        organizationId,
        alias: 'draft-tournament',
        name: 'Draft Tournament',
        descriptor: descriptor(),
        actor: 'user:seed',
        authorizationContext: 'seed',
      }),
    );

    const response = await inject({
      method: 'POST',
      url: `/organizations/${organizationAlias}/tournaments/draft-tournament/archive`,
      headers: { authorization: 'Bearer organizer-1' },
    });

    // A state conflict, not a malformed request — matches the existing
    // InvariantViolationError -> 409 convention elsewhere in this API.
    expect(response.statusCode).toBe(409);
    const stored = await new TournamentRepository(db).findById(tournament.tournamentId);
    expect(stored?.status).toBe('draft');
  });

  it('archives a finished tournament, removing it from the active listing while its detail and export endpoints keep working (5.1)', async () => {
    await finishedTournament('copa-finished');

    const archiveResponse = await inject({
      method: 'POST',
      url: `/organizations/${organizationAlias}/tournaments/copa-finished/archive`,
      headers: { authorization: 'Bearer organizer-1' },
    });
    expect(archiveResponse.statusCode).toBe(200);
    expect((archiveResponse.json() as { status: string }).status).toBe('archived');

    const listResponse = await inject({
      method: 'GET',
      url: `/organizations/${organizationAlias}/tournaments`,
      headers: { authorization: 'Bearer organizer-1' },
    });
    expect(listResponse.statusCode).toBe(200);
    const active = listResponse.json() as { alias: string }[];
    expect(active.some((tournament) => tournament.alias === 'copa-finished')).toBe(false);

    // The tournament's own detail route is not a listing — it still resolves.
    const detailResponse = await inject({
      method: 'GET',
      url: `/organizations/${organizationAlias}/tournaments/copa-finished`,
    });
    expect(detailResponse.statusCode).toBe(200);
    expect((detailResponse.json() as { status: string }).status).toBe('archived');

    // Export is state-agnostic; an archived tournament exports exactly like
    // any other (3.1/5.3) — empty result sets here since none were recorded,
    // proving the request succeeds rather than being refused for its state.
    const exportResponse = await inject({
      method: 'GET',
      url: `/organizations/${organizationAlias}/tournaments/copa-finished/exports/results`,
      headers: { authorization: 'Bearer organizer-1' },
    });
    expect(exportResponse.statusCode).toBe(200);
  });

  it('export returns the identical data set before and after archival (3.2/5.3)', async () => {
    await finishedTournament('copa-export-parity');

    const before = await inject({
      method: 'GET',
      url: `/organizations/${organizationAlias}/tournaments/copa-export-parity/exports/participants/individual`,
      headers: { authorization: 'Bearer organizer-1' },
    });
    expect(before.statusCode).toBe(200);

    await inject({
      method: 'POST',
      url: `/organizations/${organizationAlias}/tournaments/copa-export-parity/archive`,
      headers: { authorization: 'Bearer organizer-1' },
    });

    const after = await inject({
      method: 'GET',
      url: `/organizations/${organizationAlias}/tournaments/copa-export-parity/exports/participants/individual`,
      headers: { authorization: 'Bearer organizer-1' },
    });
    expect(after.statusCode).toBe(200);
    expect(after.body).toBe(before.body);
  });
});
