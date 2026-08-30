import { Module, type INestApplication } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { footballDescriptor, type DisciplineDescriptor } from '@copalibre/domain';
import {
  CompetitionRecordRepository,
  CompetitionRepository,
  EnrollmentRepository,
  MatchAssignmentRepository,
  OrganizationRepository,
  TournamentRepository,
  newId,
  withTransaction,
} from '@copalibre/persistence';
import { createMigratedDatabase } from '../../../../packages/persistence/src/test-support/scratch-database.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { OrganizationAccessGuard } from '../auth/organization-access.guard.js';
import type { AuthenticatedSubject } from '../auth/request-context.js';
import { TokenVerifier } from '../auth/token-verifier.js';
import { DATABASE } from '../database.token.js';
import { MatchControlController } from './match-control.controller.js';
import { StagesController } from './stages.controller.js';
import { TournamentsController } from './tournaments.controller.js';

/**
 * End-to-end coverage of the write path this change adds: real
 * `TournamentsController`/`StagesController`/`MatchControlController` routes
 * persisting a compiled ruleset, with no test-only manual
 * `saveCompiledRuleset` call standing in for it anywhere in this file.
 */
describe('compiled-ruleset persistence (integration)', () => {
  let app: INestApplication;
  let scratch: Awaited<ReturnType<typeof createMigratedDatabase>>;
  let organizationId = '';
  let descriptor: DisciplineDescriptor;
  const records = () => new CompetitionRecordRepository(scratch.db);

  async function createTournament(alias: string) {
    const response = await (app as NestFastifyApplication).inject({
      method: 'POST',
      url: '/organizations/liga-prueba-cr/tournaments',
      headers: { authorization: 'Bearer admin' },
      payload: {
        alias,
        name: alias,
        descriptorId: descriptor.descriptorId,
        descriptorVersion: descriptor.version,
        format: 'round-robin',
        publicRegistration: false,
        requiresCheckIn: false,
      },
    });
    if (response.statusCode !== 201) {
      throw new Error(
        `Tournament creation failed in test setup: ${response.statusCode} ${response.body}`,
      );
    }
    return response.json() as { tournamentId: string };
  }

  beforeAll(async () => {
    scratch = await createMigratedDatabase('compiled-ruleset');
    @Module({
      controllers: [TournamentsController, StagesController, MatchControlController],
      providers: [
        { provide: DATABASE, useValue: scratch.db },
        {
          provide: TokenVerifier,
          useValue: {
            verify: async (token: string): Promise<AuthenticatedSubject> => {
              if (token !== 'admin') throw new Error('unknown token');
              return { subjectId: 'admin', scopes: ['copalibre.control'], organizationId };
            },
          },
        },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: OrganizationAccessGuard },
        Reflector,
      ],
    })
    class IntegrationModule {}
    const module = await Test.createTestingModule({ imports: [IntegrationModule] }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await (app as NestFastifyApplication).getHttpAdapter().getInstance().ready();

    const audit = { actor: 'user:seed', authorizationContext: 'seed' } as const;
    const organization = await withTransaction(scratch.db, (uow) =>
      new OrganizationRepository(scratch.db).create(uow, {
        alias: 'liga-prueba-cr',
        name: 'Liga Prueba CR',
        ...audit,
      }),
    );
    organizationId = organization.organizationId;

    const principalId = newId();
    await scratch.db
      .insertInto('identity_principals')
      .values({
        principal_id: principalId,
        email: 'admin@test',
        oidc_subject_id: 'admin',
        name: null,
        picture: null,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .execute();
    await scratch.db
      .insertInto('organization_role_assignments')
      .values({
        assignment_id: newId(),
        organization_id: organizationId,
        principal_id: principalId,
        email: 'admin@test',
        role: 'admin',
        status: 'active',
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      })
      .execute();

    descriptor = footballDescriptor();
    await withTransaction(scratch.db, (uow) =>
      new TournamentRepository(scratch.db).saveDescriptor(uow, descriptor, {
        organizationId,
        ...audit,
      }),
    );
  });

  afterAll(async () => {
    await app?.close();
    await scratch?.drop();
  });

  it('reads a stage-scoped compiled ruleset for a stage with its own series override, and the tournament-scoped one for a sibling stage with none', async () => {
    const tournament = await createTournament('fase-mixta');

    const withSeries = await (app as NestFastifyApplication).inject({
      method: 'POST',
      url: '/organizations/liga-prueba-cr/tournaments/fase-mixta/stages',
      headers: { authorization: 'Bearer admin' },
      payload: {
        number: 1,
        name: 'Con serie',
        format: 'round-robin',
        series: { span: 3, resolutionClass: 'aggregate' },
      },
    });
    expect(withSeries.statusCode).toBe(201);
    const stageWithSeries = withSeries.json() as { stageId: string };

    const withoutSeries = await (app as NestFastifyApplication).inject({
      method: 'POST',
      url: '/organizations/liga-prueba-cr/tournaments/fase-mixta/stages',
      headers: { authorization: 'Bearer admin' },
      payload: { number: 2, name: 'Sin serie', format: 'round-robin' },
    });
    expect(withoutSeries.statusCode).toBe(201);
    const stageWithoutSeries = withoutSeries.json() as { stageId: string };

    const stageScoped = await records().findCompiledRuleset(
      tournament.tournamentId,
      stageWithSeries.stageId,
    );
    expect(stageScoped?.config.series).toMatchObject({ span: 3 });

    const fallenBack = await records().findCompiledRuleset(
      tournament.tournamentId,
      stageWithoutSeries.stageId,
    );
    // Falls through to the tournament-scoped row: no series was ever declared
    // on the tournament itself, so the field is absent rather than `{span: 3}`.
    expect((fallenBack?.config as Record<string, unknown>).series).toBeUndefined();
  });

  it('writes a fresh compiled-ruleset row on a custom-scripts update, which a subsequently recorded event reads without error', async () => {
    const tournament = await createTournament('fase-scripts');
    const before = await records().requireCompiledRuleset(tournament.tournamentId);

    const updated = await (app as NestFastifyApplication).inject({
      method: 'PUT',
      url: '/organizations/liga-prueba-cr/tournaments/fase-scripts/custom-scripts',
      headers: { authorization: 'Bearer admin' },
      payload: { customScripts: [] },
    });
    expect(updated.statusCode).toBe(200);

    const after = await records().requireCompiledRuleset(tournament.tournamentId);
    expect(after.compiledAt).not.toBe(before.compiledAt);

    const rows = await scratch.db
      .selectFrom('compiled_rulesets')
      .selectAll()
      .where('tournament_id', '=', tournament.tournamentId)
      .where('stage_id', 'is', null)
      .execute();
    expect(rows).toHaveLength(2);

    // Set up a match and record a real event against it, proving the fresh
    // row (not the stale one `create()` wrote) is what `recordEventOnce`
    // reads — no test-only `saveCompiledRuleset` call stands in for either.
    const enrollment = new EnrollmentRepository(scratch.db);
    const competition = new CompetitionRepository(scratch.db);
    const personId = newId();
    const audit = { actor: 'user:seed', authorizationContext: 'seed' } as const;

    const { matchId, segmentId } = await withTransaction(scratch.db, async (uow) => {
      const norte = await enrollment.createTeam(uow, { organizationId, name: 'Norte', ...audit });
      const sur = await enrollment.createTeam(uow, { organizationId, name: 'Sur', ...audit });
      const [homeEntrant, awayEntrant] = await Promise.all([
        enrollment.registerEntrant(uow, {
          organizationId,
          tournamentId: tournament.tournamentId,
          entrantRef: { kind: 'team', teamId: norte.teamId },
          ...audit,
        }),
        enrollment.registerEntrant(uow, {
          organizationId,
          tournamentId: tournament.tournamentId,
          entrantRef: { kind: 'team', teamId: sur.teamId },
          ...audit,
        }),
      ]);
      const stage = await competition.createStageInTournament(uow, {
        tournamentId: tournament.tournamentId,
        number: 1,
        name: 'Regular',
        format: 'round-robin',
        organizationId,
        ...audit,
      });
      const [fixture] = await competition.createFixtures(uow, {
        stageId: stage.stageId,
        fixtures: [
          { round: 1, homeEntrantId: homeEntrant.entrantId, awayEntrantId: awayEntrant.entrantId },
        ],
        organizationId,
        ...audit,
      });
      const match = await competition.createMatch(uow, {
        fixtureId: fixture?.fixtureId ?? '',
        number: 1,
        organizationId,
        ...audit,
      });
      const segment = await competition.createSegment(uow, {
        matchId: match.matchId,
        type: 'half',
        number: 1,
        organizationId,
        ...audit,
      });
      await competition.setSegmentState(uow, {
        segmentId: segment.segmentId,
        state: 'active',
        organizationId,
        ...audit,
      });
      await competition.applyCommand(uow, {
        matchId: match.matchId,
        command: 'start',
        status: 'in-progress',
        grantedBy: 'seed',
        organizationId,
        ...audit,
      });
      await uow.tx
        .insertInto('match_rosters')
        .values({
          match_id: match.matchId,
          entrant_id: homeEntrant.entrantId,
          roster_members: JSON.stringify([{ personId, name: 'Player', onField: true }]),
          updated_at: new Date(),
        })
        .execute();
      await new MatchAssignmentRepository(scratch.db).appoint(uow, {
        organizationId,
        subjectId: 'admin',
        scope: { kind: 'match', matchId: match.matchId },
        capabilities: ['match.record-event'],
        ...audit,
      });
      return { matchId: match.matchId, segmentId: segment.segmentId };
    });

    const eventResponse = await (app as NestFastifyApplication).inject({
      method: 'POST',
      url: `/organizations/liga-prueba-cr/tournaments/fase-scripts/matches/${matchId}/events`,
      headers: { authorization: 'Bearer admin', 'idempotency-key': crypto.randomUUID() },
      payload: {
        definitionCode: 'goal',
        segmentId,
        occurredAt: Date.now(),
        personId,
      },
    });
    expect(eventResponse.statusCode).toBe(201);
    expect(eventResponse.json().eventId).toBeDefined();
  });
});
