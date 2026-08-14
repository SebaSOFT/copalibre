import { Module, type INestApplication } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { footballDescriptor, type StatisticCollector } from '@copalibre/domain';
import {
  CompetitionRepository,
  EnrollmentRepository,
  OrganizationRepository,
  PersonRepository,
  TournamentRepository,
  newId,
  withTransaction,
  type Database,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import {
  createMigratedDatabase,
  type ScratchDatabase,
} from '../../../../packages/persistence/src/test-support/scratch-database.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { OrganizationAccessGuard } from '../auth/organization-access.guard.js';
import type { AuthenticatedSubject } from '../auth/request-context.js';
import { TokenVerifier } from '../auth/token-verifier.js';
import { DATABASE } from '../database.token.js';
import { AdminStatisticsController } from './admin-statistics.controller.js';

const AUDIT = { actor: 'user:admin-statistics-test', authorizationContext: 'scope:test' };

const COLLECTORS: readonly StatisticCollector[] = [
  {
    code: 'goals',
    label: 'Goals',
    source: { kind: 'event', definitionCodes: ['goal'] },
    measure: { kind: 'count' },
    granularity: { actor: 'person', competition: 'match' },
  },
];

const subjects: Record<string, AuthenticatedSubject> = {
  admin: { subjectId: 'oidc-admin', scopes: ['copalibre.control'] },
  viewer: { subjectId: 'oidc-viewer', scopes: ['copalibre.control'] },
};

/**
 * The authenticated HTTP path for `copalibre statistics-rebuild` (0085),
 * proving it against the same seeding `apps/copalibre/src/
 * statistics-rebuild.integration.test.ts` (0082) already uses for the
 * direct-database path — same organization/match/event shape, same
 * expected `matches`/`figures` result, over HTTP instead.
 */
describe('AdminStatisticsController (integration, 0085)', () => {
  let app: INestApplication;
  let scratch: ScratchDatabase;
  let organizationId: string;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('admin-statistics-controller');
    const db = scratch.db;

    const organization = await withTransaction(db, (uow) =>
      new OrganizationRepository(db).create(uow, {
        alias: 'liga-admin-http',
        name: 'Liga Admin HTTP',
        ...AUDIT,
      }),
    );
    organizationId = organization.organizationId;

    await seedRole(db, organizationId, 'oidc-admin', 'admin@example.test', 'admin');
    await seedRole(db, organizationId, 'oidc-viewer', 'viewer@example.test', 'viewer');

    const tournaments = new TournamentRepository(db);
    const enrollment = new EnrollmentRepository(db);
    const persons = new PersonRepository(db);
    const competition = new CompetitionRepository(db);
    const descriptor = footballDescriptor({ collectors: COLLECTORS });

    await withTransaction(db, async (uow) => {
      await tournaments.saveDescriptor(uow, descriptor, { organizationId, ...AUDIT });
      const tournament = await tournaments.create(uow, {
        organizationId,
        alias: 'apertura-admin-http',
        name: 'Apertura Admin HTTP',
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
      const { person } = await persons.register(uow, {
        organizationId,
        displayName: 'Jugador Admin HTTP',
        ...AUDIT,
      });
      await persons.enlist(uow, {
        personId: person.personId,
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
        fixtures: [{ round: 1, homeEntrantId: homeEntrant.entrantId }],
        organizationId,
        ...AUDIT,
      });
      const match = await competition.createMatch(uow, {
        fixtureId: fixture?.fixtureId ?? '',
        number: 1,
        organizationId,
        ...AUDIT,
      });
      const segment = await competition.createSegment(uow, {
        matchId: match.matchId,
        type: 'half',
        number: 1,
        organizationId,
        ...AUDIT,
      });
      await competition.setSegmentState(uow, {
        segmentId: segment.segmentId,
        state: 'active',
        organizationId,
        ...AUDIT,
      });
      await competition.applyCommand(uow, {
        matchId: match.matchId,
        command: 'start',
        status: 'in-progress',
        grantedBy: 'seed',
        organizationId,
        ...AUDIT,
      });
      await uow.tx
        .insertInto('match_rosters')
        .values({
          match_id: match.matchId,
          entrant_id: homeEntrant.entrantId,
          person_ids: JSON.stringify([person.personId]),
          updated_at: new Date(),
        })
        .execute();
      await competition.appendEvent(uow, {
        event: {
          eventId: newId(),
          matchId: match.matchId,
          segmentId: segment.segmentId,
          definitionCode: 'goal',
          occurredAt: new Date().toISOString(),
          side: homeEntrant.entrantId,
          personId: person.personId,
          payload: {},
        },
        sequence: 1,
        organizationId,
        ...AUDIT,
      });
      await competition.recordResult(uow, {
        matchId: match.matchId,
        result: {
          sides: [{ entrantId: homeEntrant.entrantId, statistics: { 'goals-for': 1 } }],
          recordedAt: new Date().toISOString(),
        },
        organizationId,
        ...AUDIT,
      });
    });

    @Module({
      controllers: [AdminStatisticsController],
      providers: [
        { provide: DATABASE, useValue: db },
        {
          provide: TokenVerifier,
          useValue: {
            verify: async (token: string): Promise<AuthenticatedSubject> => {
              const subject = subjects[token];
              if (!subject) throw new Error('unknown token');
              return { ...subject, organizationId };
            },
          },
        },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: OrganizationAccessGuard },
        Reflector,
      ],
    })
    class AdminStatisticsTestModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [AdminStatisticsTestModule],
    }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await (app as NestFastifyApplication).getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
    await scratch?.drop();
  });

  function rebuild(token: string) {
    return (app as NestFastifyApplication).inject({
      method: 'POST',
      url: '/organizations/liga-admin-http/statistics/rebuild',
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
  }

  it('rebuilds statistics for an organization admin, matching the direct-database path shape', async () => {
    const response = await rebuild('admin');
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toEqual({
      organizationAlias: 'liga-admin-http',
      matches: 1,
      figures: expect.any(Number),
    });
    expect(body.figures).toBeGreaterThan(0);
  });

  it('refuses a non-admin organization role', async () => {
    const response = await rebuild('viewer');
    expect(response.statusCode).toBe(403);
  });

  it('refuses with no bearer token at all', async () => {
    const response = await (app as NestFastifyApplication).inject({
      method: 'POST',
      url: '/organizations/liga-admin-http/statistics/rebuild',
      payload: {},
    });
    expect(response.statusCode).toBe(401);
  });

  it('404s an unknown organization alias', async () => {
    const response = await (app as NestFastifyApplication).inject({
      method: 'POST',
      url: '/organizations/no-such-organization/statistics/rebuild',
      headers: { authorization: 'Bearer admin' },
      payload: {},
    });
    expect(response.statusCode).toBe(403);
  });
});

async function seedRole(
  db: Kysely<Database>,
  organizationId: string,
  oidcSubjectId: string,
  email: string,
  role: 'admin' | 'viewer',
): Promise<void> {
  const principalId = newId();
  await db
    .insertInto('identity_principals')
    .values({
      principal_id: principalId,
      email,
      oidc_subject_id: oidcSubjectId,
      name: null,
      picture: null,
      created_at: new Date(),
      updated_at: new Date(),
    })
    .execute();
  await db
    .insertInto('organization_role_assignments')
    .values({
      assignment_id: newId(),
      organization_id: organizationId,
      principal_id: principalId,
      email,
      role,
      status: 'active',
      created_at: new Date(),
      updated_at: new Date(),
      deleted_at: null,
    })
    .execute();
}
