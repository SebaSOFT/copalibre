import { Module, type INestApplication } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { footballDescriptor, type DisciplineDescriptor } from '@copalibre/domain';
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
import { createApiValidationPipe } from '../http/validation.js';
import { MatchControlController } from './match-control.controller.js';
import { PublicProjectionsController } from './public-projections.controller.js';
import { applyApiPathPrefix } from '../http/api-path-prefix.js';

const audit = { actor: 'user:seed', authorizationContext: 'seed' } as const;
const subjects: Record<string, AuthenticatedSubject> = {
  referee: { subjectId: 'referee', scopes: ['copalibre.control'] },
};

interface CounterValues {
  code: string;
  scope: 'match' | 'segment';
  allowance?: number;
  warnAt?: number;
  values: { entrantId: string; value: number }[];
}

/**
 * Declared match counters, followed end to end: a referee records the discipline's own
 * events through the real console route, and the live projection and the match report
 * tally them per side. Recording past an allowance is accepted, never refused.
 */
describe('public match counters (integration)', () => {
  let app: INestApplication;
  let scratch: Awaited<ReturnType<typeof createMigratedDatabase>>;
  let organizationId = '';
  let matchId = '';
  let segmentId = '';
  const entrantIds: string[] = [];
  const consoleBase = () =>
    `/api/organizations/liga-prueba/tournaments/apertura/matches/${matchId}`;
  const publicLiveUrl = () => `/api/organizations/liga-prueba/tournaments/apertura/live`;
  const publicReportUrl = () =>
    `/api/organizations/liga-prueba/tournaments/apertura/stages/1/matches/1`;

  async function request(method: 'GET' | 'POST', url: string, token?: string, payload?: unknown) {
    return (app as NestFastifyApplication).inject({
      method,
      url,
      headers: token ? { authorization: `Bearer ${token}` } : {},
      payload: payload as never,
    });
  }

  async function countersOfLive(): Promise<CounterValues[] | undefined> {
    const data = (await request('GET', publicLiveUrl())).json() as {
      matches: { matchId: string; counters?: CounterValues[] }[];
    };
    return data.matches.find((m) => m.matchId === matchId)?.counters;
  }

  function valueOf(counters: CounterValues[] | undefined, code: string, entrantId: string) {
    return counters?.find((c) => c.code === code)?.values.find((v) => v.entrantId === entrantId)
      ?.value;
  }

  beforeAll(async () => {
    scratch = await createMigratedDatabase('public-match-counters');

    @Module({
      controllers: [MatchControlController, PublicProjectionsController],
      providers: [
        { provide: DATABASE, useValue: scratch.db },
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
    class IntegrationModule {}
    const module = await Test.createTestingModule({ imports: [IntegrationModule] }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    applyApiPathPrefix(app);
    app.useGlobalPipes(createApiValidationPipe());
    await app.init();
    await (app as NestFastifyApplication).getHttpAdapter().getInstance().ready();

    const organization = await withTransaction(scratch.db, (uow) =>
      new OrganizationRepository(scratch.db).create(uow, {
        alias: 'liga-prueba',
        name: 'Liga Prueba',
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

    // Discipline-agnostic codes: the counters name only what the descriptor declares.
    const sideEvent = (code: string) => ({
      code,
      label: code,
      category: 'negative',
      permittedSegmentTypes: ['half'],
      actorRequirement: 'side',
      payloadSchema: { type: 'object' },
      effects: [],
    });
    const descriptor: DisciplineDescriptor = footballDescriptor({
      eventDefinitions: [
        ...footballDescriptor().eventDefinitions,
        sideEvent('team-foul'),
        sideEvent('timeout'),
      ],
      matchCounters: [
        {
          code: 'team-fouls',
          label: 'Team fouls',
          shortLabel: 'F',
          events: ['team-foul'],
          scope: 'match',
          warnAt: 3,
        },
        {
          code: 'timeouts',
          label: 'Timeouts',
          shortLabel: 'TM',
          events: ['timeout'],
          scope: 'segment',
          allowance: 1,
        },
      ],
    });
    const createdTournament = await withTransaction(scratch.db, async (uow) => {
      await tournaments.saveDescriptor(uow, descriptor, { organizationId, ...audit });
      return tournaments.create(uow, {
        organizationId,
        alias: 'apertura',
        name: 'Apertura',
        descriptor,
        ...audit,
      });
    });
    await withTransaction(scratch.db, (uow) =>
      tournaments.publish(uow, {
        tournamentId: createdTournament.tournamentId,
        organizationId,
        ...audit,
      }),
    );

    await withTransaction(scratch.db, async (uow) => {
      const tournament = createdTournament;
      const stage = await competition.createStageInTournament(uow, {
        tournamentId: tournament.tournamentId,
        number: 1,
        name: 'Regular',
        format: 'round-robin',
        organizationId,
        ...audit,
      });
      const entrants = await Promise.all(
        ['Norte', 'Sur'].map(async (name) => {
          const team = await enrollment.createTeam(uow, { organizationId, name, ...audit });
          return enrollment.registerEntrant(uow, {
            organizationId,
            tournamentId: tournament.tournamentId,
            entrantRef: { kind: 'team', teamId: team.teamId },
            ...audit,
          });
        }),
      );
      entrantIds.push(...entrants.map((entrant) => entrant.entrantId));
      const [fixture] = await competition.createFixtures(uow, {
        stageId: stage.stageId,
        fixtures: [
          {
            round: 1,
            homeEntrantId: entrants[0]?.entrantId,
            awayEntrantId: entrants[1]?.entrantId,
          },
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
        capabilities: ['match.record-event'],
        ...audit,
      });
    });
  });

  afterAll(async () => {
    await app?.close();
    await scratch?.drop();
  });

  it('shows every declared counter at zero before anything is recorded', async () => {
    const counters = await countersOfLive();
    expect(counters?.map((c) => c.code)).toEqual(['team-fouls', 'timeouts']);
    expect(valueOf(counters, 'team-fouls', entrantIds[0] ?? '')).toBe(0);
    expect(counters?.find((c) => c.code === 'timeouts')).toMatchObject({
      scope: 'segment',
      allowance: 1,
    });
    expect(counters?.find((c) => c.code === 'team-fouls')).toMatchObject({ warnAt: 3 });
  });

  it('counts recorded team fouls per side on the live projection and the match report', async () => {
    for (let index = 0; index < 4; index += 1) {
      const recorded = await request('POST', `${consoleBase()}/events`, 'referee', {
        definitionCode: 'team-foul',
        segmentId,
        occurredAt: Date.now(),
        side: entrantIds[0],
      });
      expect(recorded.statusCode).toBe(201);
    }

    const counters = await countersOfLive();
    expect(valueOf(counters, 'team-fouls', entrantIds[0] ?? '')).toBe(4);
    expect(valueOf(counters, 'team-fouls', entrantIds[1] ?? '')).toBe(0);

    const report = (await request('GET', publicReportUrl())).json() as {
      counters?: CounterValues[];
    };
    expect(valueOf(report.counters, 'team-fouls', entrantIds[0] ?? '')).toBe(4);
  });

  it('accepts a timeout past its allowance and reports it as 2 against an allowance of 1', async () => {
    for (let index = 0; index < 2; index += 1) {
      const recorded = await request('POST', `${consoleBase()}/events`, 'referee', {
        definitionCode: 'timeout',
        segmentId,
        occurredAt: Date.now(),
        side: entrantIds[1],
      });
      expect(recorded.statusCode).toBe(201);
    }

    const counters = await countersOfLive();
    expect(valueOf(counters, 'timeouts', entrantIds[1] ?? '')).toBe(2);
    expect(counters?.find((c) => c.code === 'timeouts')?.allowance).toBe(1);
  });
});
