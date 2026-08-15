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
  PersonRepository,
  ProjectionStore,
  StatisticProjection,
  StatisticRepository,
  TournamentRepository,
  newId,
  withTransaction,
  type Refold,
} from '@copalibre/persistence';
import { createRefold } from '@copalibre/statistics-refold';
import { createMigratedDatabase } from '../../../../packages/persistence/src/test-support/scratch-database.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { OrganizationAccessGuard } from '../auth/organization-access.guard.js';
import type { AuthenticatedSubject } from '../auth/request-context.js';
import { TokenVerifier } from '../auth/token-verifier.js';
import { DATABASE } from '../database.token.js';
import { MatchControlController } from './match-control.controller.js';

/**
 * A `live`-cadence collector's total is current before a match ends; a
 * default (`on-finalize`) collector's is not (0082, task 7.3 and the delta
 * spec's cadence requirement) — proven through the real HTTP event-recording
 * path `MatchControlController.recordEvent` wires `foldLiveEvent` into.
 */
describe('live-cadence statistics inside the event-recording transaction (integration, 0082)', () => {
  let app: INestApplication;
  let scratch: Awaited<ReturnType<typeof createMigratedDatabase>>;
  let organizationId: string;
  let matchId: string;
  let segmentId: string;
  let personId: string;
  let entrantId: string;
  const AUDIT = { actor: 'user:seed', authorizationContext: 'seed' } as const;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('live-statistics');
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

    const organization = await withTransaction(scratch.db, (uow) =>
      new OrganizationRepository(scratch.db).create(uow, {
        alias: 'liga-live',
        name: 'Liga Live',
        ...AUDIT,
      }),
    );
    organizationId = organization.organizationId;

    const principalId = newId();
    await scratch.db
      .insertInto('identity_principals')
      .values({
        principal_id: principalId,
        email: 'referee@live-test',
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
        email: 'referee@live-test',
        role: 'referee',
        status: 'active',
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      })
      .execute();

    const descriptor = footballDescriptor({
      collectors: [
        {
          code: 'goals-live',
          label: 'Goals (live)',
          source: { kind: 'event', definitionCodes: ['goal'] },
          measure: { kind: 'count' },
          granularity: { actor: 'person', competition: 'match' },
          cadence: { kind: 'live' },
        },
        {
          code: 'goals-final',
          label: 'Goals (on finalize)',
          source: { kind: 'event', definitionCodes: ['goal'] },
          measure: { kind: 'count' },
          granularity: { actor: 'person', competition: 'match' },
        },
      ],
    });

    const tournaments = new TournamentRepository(scratch.db);
    const enrollment = new EnrollmentRepository(scratch.db);
    const persons = new PersonRepository(scratch.db);
    const competition = new CompetitionRepository(scratch.db);

    await withTransaction(scratch.db, async (uow) => {
      await tournaments.saveDescriptor(uow, descriptor, { organizationId, ...AUDIT });
      const tournament = await tournaments.create(uow, {
        organizationId,
        alias: 'apertura-live',
        name: 'Apertura Live',
        descriptor,
        ...AUDIT,
      });

      const norte = await enrollment.createTeam(uow, { organizationId, name: 'Norte', ...AUDIT });
      const homeEntrant = await enrollment.registerEntrant(uow, {
        organizationId,
        tournamentId: tournament.tournamentId,
        entrantRef: { kind: 'team', teamId: norte.teamId },
        ...AUDIT,
      });
      entrantId = homeEntrant.entrantId;

      const { person } = await persons.register(uow, {
        organizationId,
        displayName: 'Jugador Live',
        ...AUDIT,
      });
      personId = person.personId;
      await persons.enlist(uow, {
        personId,
        teamId: norte.teamId,
        role: 'player',
        organizationId,
        ...AUDIT,
      });

      const stage = await competition.createStageInTournament(uow, {
        tournamentId: tournament.tournamentId,
        number: 1,
        name: 'Regular',
        format: 'round-robin',
        organizationId,
        ...AUDIT,
      });
      const [fixture] = await competition.createFixtures(uow, {
        stageId: stage.stageId,
        fixtures: [{ round: 1, homeEntrantId: entrantId }],
        organizationId,
        ...AUDIT,
      });
      const match = await competition.createMatch(uow, {
        fixtureId: fixture?.fixtureId ?? '',
        number: 1,
        organizationId,
        ...AUDIT,
      });
      matchId = match.matchId;

      const segment = await competition.createSegment(uow, {
        matchId,
        type: 'half',
        number: 1,
        organizationId,
        ...AUDIT,
      });
      segmentId = segment.segmentId;
      await competition.setSegmentState(uow, {
        segmentId,
        state: 'active',
        organizationId,
        ...AUDIT,
      });
      await competition.applyCommand(uow, {
        matchId,
        command: 'start',
        status: 'in-progress',
        grantedBy: 'seed',
        organizationId,
        ...AUDIT,
      });
      await uow.tx
        .insertInto('match_rosters')
        .values({
          match_id: matchId,
          entrant_id: entrantId,
          roster_members: JSON.stringify([{ personId, name: 'Player', onField: true }]),
          updated_at: new Date(),
        })
        .execute();
      await new MatchAssignmentRepository(scratch.db).appoint(uow, {
        organizationId,
        subjectId: 'referee',
        scope: { kind: 'match', matchId },
        capabilities: ['match.record-event'],
        ...AUDIT,
      });
    });
  });

  afterAll(async () => {
    await app?.close();
    await scratch?.drop();
  });

  it("updates a live collector's total inside the recording transaction, before the match ends, and leaves a default-cadence collector's total absent until finalize", async () => {
    const response = await (app as NestFastifyApplication).inject({
      method: 'POST',
      url: `/organizations/liga-live/tournaments/apertura-live/matches/${matchId}/events`,
      headers: {
        authorization: 'Bearer referee',
        'idempotency-key': '01890000-0000-7000-8000-0000000000a1',
      },
      payload: {
        definitionCode: 'goal',
        segmentId,
        occurredAt: Date.now(),
        side: entrantId,
        personId,
      },
    });
    expect(response.statusCode).toBe(201);

    const statistics = new StatisticRepository(scratch.db);
    const liveTotalsBeforeFinalize = await statistics.readTotals(
      {
        organizationId,
        collectorCode: 'goals-live',
        actorGranularity: 'person',
        competitionGranularity: 'match',
        competitionId: matchId,
      },
      { kind: 'count' },
    );
    const finalTotalsBeforeFinalize = await statistics.readTotals(
      {
        organizationId,
        collectorCode: 'goals-final',
        actorGranularity: 'person',
        competitionGranularity: 'match',
        competitionId: matchId,
      },
      { kind: 'count' },
    );

    expect(liveTotalsBeforeFinalize).toEqual([
      { actorId: personId, competitionId: matchId, value: 1, samples: 1 },
    ]);
    expect(finalTotalsBeforeFinalize).toEqual([]);

    // Finalize: the on-finalize collector's total appears only now, via the
    // same `refold` the worker would drive off `match.finalized`.
    await withTransaction(scratch.db, (uow) =>
      new CompetitionRepository(scratch.db).recordResult(uow, {
        matchId,
        result: {
          sides: [{ entrantId, statistics: { 'goals-for': 1 } }],
          recordedAt: new Date().toISOString(),
        },
        organizationId,
        ...AUDIT,
      }),
    );
    const refold: Refold = createRefold(scratch.db);
    await withTransaction(scratch.db, async (uow) => {
      const version = await new ProjectionStore(scratch.db).nextVersion(uow, {
        projectionType: 'statistic-totals',
        entityId: matchId,
      });
      return new StatisticProjection(statistics, refold).apply(uow, {
        eventType: 'match.finalized',
        organizationId,
        entityId: matchId,
        projectionVersion: version,
      });
    });

    const finalTotalsAfterFinalize = await statistics.readTotals(
      {
        organizationId,
        collectorCode: 'goals-final',
        actorGranularity: 'person',
        competitionGranularity: 'match',
        competitionId: matchId,
      },
      { kind: 'count' },
    );
    expect(finalTotalsAfterFinalize).toEqual([
      { actorId: personId, competitionId: matchId, value: 1, samples: 1 },
    ]);
  });
});
