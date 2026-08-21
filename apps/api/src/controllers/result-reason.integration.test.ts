import { Module, type INestApplication } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { footballDescriptor } from '@copalibre/domain';
import {
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

/**
 * End-to-end coverage of 0076: a per-side `resultReason`, set through the real
 * finalize endpoint, persists and reads back through the match-console
 * projection — the same JSON passthrough the bracket/standings renderers read
 * from (`StageReadModel`, covered separately at the unit/type level; this
 * proves the write side that feeds it).
 */
describe('result reason per competitor (integration, 0076)', () => {
  let app: INestApplication;
  let scratch: Awaited<ReturnType<typeof createMigratedDatabase>>;
  let organizationId = '';
  let matchId = '';
  let segmentId = '';
  const entrantIds: string[] = [];
  const base = () => `/organizations/liga-prueba-rr/tournaments/apertura-rr/matches/${matchId}`;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('result-reason');
    @Module({
      controllers: [MatchControlController],
      providers: [
        { provide: DATABASE, useValue: scratch.db },
        {
          provide: TokenVerifier,
          useValue: {
            verify: async (token: string): Promise<AuthenticatedSubject> => {
              if (token !== 'referee') throw new Error('unknown token');
              return { subjectId: 'referee', scopes: ['copalibre.control'], organizationId };
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
        alias: 'liga-prueba-rr',
        name: 'Liga Prueba RR',
        ...audit,
      }),
    );
    organizationId = organization.organizationId;

    const principalId = newId();
    await scratch.db
      .insertInto('identity_principals')
      .values({
        principal_id: principalId,
        email: 'referee@test',
        oidc_subject_id: 'referee',
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
        email: 'referee@test',
        role: 'referee',
        status: 'active',
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      })
      .execute();

    const tournaments = new TournamentRepository(scratch.db);
    const enrollment = new EnrollmentRepository(scratch.db);
    const competition = new CompetitionRepository(scratch.db);

    await withTransaction(scratch.db, async (uow) => {
      const descriptor = footballDescriptor();
      await tournaments.saveDescriptor(uow, descriptor, { organizationId, ...audit });
      const tournament = await tournaments.create(uow, {
        organizationId,
        alias: 'apertura-rr',
        name: 'Apertura RR',
        descriptor,
        ...audit,
      });
      const stage = await competition.createStageInTournament(uow, {
        tournamentId: tournament.tournamentId,
        number: 1,
        name: 'Regular',
        format: 'round-robin',
        organizationId,
        ...audit,
      });
      const norte = await enrollment.createTeam(uow, { organizationId, name: 'Norte', ...audit });
      const sur = await enrollment.createTeam(uow, { organizationId, name: 'Sur', ...audit });
      const [home, away] = await Promise.all([
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
      entrantIds.push(home.entrantId, away.entrantId);

      const [fixture] = await competition.createFixtures(uow, {
        stageId: stage.stageId,
        fixtures: [{ round: 1, homeEntrantId: home.entrantId, awayEntrantId: away.entrantId }],
        organizationId,
        ...audit,
      });
      const match = await competition.createMatch(uow, {
        fixtureId: fixture?.fixtureId ?? '',
        number: 1,
        organizationId,
        ...audit,
      });
      matchId = match.matchId;
      const segment = await competition.createSegment(uow, {
        matchId,
        type: 'half',
        number: 1,
        organizationId,
        ...audit,
      });
      segmentId = segment.segmentId;
      await competition.setSegmentState(uow, {
        segmentId,
        state: 'active',
        organizationId,
        ...audit,
      });
      await competition.applyCommand(uow, {
        matchId,
        command: 'start',
        status: 'in-progress',
        grantedBy: 'seed',
        organizationId,
        ...audit,
      });
      await new MatchAssignmentRepository(scratch.db).appoint(uow, {
        organizationId,
        subjectId: 'referee',
        scope: { kind: 'match', matchId },
        capabilities: ['match.finalize'],
        ...audit,
      });
    });
  });

  afterAll(async () => {
    await app?.close();
    await scratch?.drop();
  });

  // A fresh key per call (0123: recordEvent now checks one too, not just
  // finalize) — a fixed key would make every subsequent POST here collide
  // against whatever the first one recorded.
  function request(method: 'GET' | 'POST', url: string, token?: string, payload?: unknown) {
    return (app as NestFastifyApplication).inject({
      method,
      url,
      headers: token
        ? {
            authorization: `Bearer ${token}`,
            ...(method === 'POST' ? { 'idempotency-key': crypto.randomUUID() } : {}),
          }
        : {},
      payload: payload as never,
    });
  }

  it('persists a per-side resultReason at finalize and reads it back from the console projection', async () => {
    const response = await request('POST', `${base()}/commands/finalize`, 'referee', {
      sides: [
        { entrantId: entrantIds[0], statistics: {} },
        { entrantId: entrantIds[1], statistics: {}, resultReason: 'walkover' },
      ],
      winnerEntrantId: entrantIds[0],
    });
    expect(response.statusCode).toBe(201);

    const projection = await request('GET', `${base()}/console`, 'referee');
    const result = projection.json().result as {
      readonly sides: readonly { readonly entrantId: string; readonly resultReason?: string }[];
    };
    const winner = result.sides.find((side) => side.entrantId === entrantIds[0]);
    const loser = result.sides.find((side) => side.entrantId === entrantIds[1]);
    // An omitted reason is written explicitly as 'played', never left implicit (0076 follow-up).
    expect(winner?.resultReason).toBe('played');
    expect(loser?.resultReason).toBe('walkover');
  });

  it('rejects segment references once finalized, matching every other post-finalize refusal', async () => {
    const response = await request('POST', `${base()}/events`, 'referee', {
      definitionCode: 'goal',
      segmentId,
      occurredAt: Date.now(),
    });
    expect(response.statusCode).toBe(400);
  });
});
