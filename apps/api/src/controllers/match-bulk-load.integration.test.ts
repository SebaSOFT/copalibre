import { Module, type INestApplication } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { CAPABILITY_TEMPLATES, footballDescriptor, type MatchCapability } from '@copalibre/domain';
import {
  CompetitionRepository,
  EnrollmentRepository,
  MatchAssignmentRepository,
  OrganizationRepository,
  PersonRepository,
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

const REFEREE_CAPABILITIES = CAPABILITY_TEMPLATES.referee as readonly MatchCapability[];

/**
 * 0106: a match's roster, event history, and result loaded as one batch, for
 * a match played with no live console session — proven through the real HTTP
 * path, exercising the same `EventLog.record`/`recordResult` validation and
 * finalization the live console already uses.
 */
describe('retroactive match data entry (integration, 0106)', () => {
  let app: INestApplication;
  let scratch: Awaited<ReturnType<typeof createMigratedDatabase>>;
  let organizationId: string;
  let entrantHome: string;
  let entrantAway: string;
  let personHome: string;
  let personAway: string;
  const AUDIT = { actor: 'user:seed', authorizationContext: 'seed' } as const;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('match-bulk-load');
    @Module({
      controllers: [MatchControlController],
      providers: [
        { provide: DATABASE, useValue: scratch.db },
        {
          provide: TokenVerifier,
          useValue: {
            verify: async (token: string): Promise<AuthenticatedSubject> => {
              if (token !== 'referee' && token !== 'bystander') throw new Error('unknown token');
              return { subjectId: token, scopes: ['copalibre.control'], organizationId };
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
        alias: 'liga-bulk-load',
        name: 'Liga Bulk Load',
        ...AUDIT,
      }),
    );
    organizationId = organization.organizationId;

    for (const [subjectId, email] of [
      ['referee', 'referee@bulk-load-test'],
      ['bystander', 'bystander@bulk-load-test'],
    ] as const) {
      const principalId = newId();
      await scratch.db
        .insertInto('identity_principals')
        .values({
          principal_id: principalId,
          email,
          oidc_subject_id: subjectId,
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
          email,
          role: 'referee',
          status: 'active',
          created_at: new Date(),
          updated_at: new Date(),
          deleted_at: null,
        })
        .execute();
    }

    const descriptor = footballDescriptor();
    const tournaments = new TournamentRepository(scratch.db);
    const enrollment = new EnrollmentRepository(scratch.db);
    const persons = new PersonRepository(scratch.db);
    const competition = new CompetitionRepository(scratch.db);

    await withTransaction(scratch.db, async (uow) => {
      await tournaments.saveDescriptor(uow, descriptor, { organizationId, ...AUDIT });
      const tournament = await tournaments.create(uow, {
        organizationId,
        alias: 'apertura-bulk-load',
        name: 'Apertura Bulk Load',
        descriptor,
        ...AUDIT,
      });

      const norte = await enrollment.createTeam(uow, { organizationId, name: 'Norte', ...AUDIT });
      const sur = await enrollment.createTeam(uow, { organizationId, name: 'Sur', ...AUDIT });
      const [homeEntrant, awayEntrant] = await Promise.all([
        enrollment.registerEntrant(uow, {
          organizationId,
          tournamentId: tournament.tournamentId,
          entrantRef: { kind: 'team', teamId: norte.teamId },
          ...AUDIT,
        }),
        enrollment.registerEntrant(uow, {
          organizationId,
          tournamentId: tournament.tournamentId,
          entrantRef: { kind: 'team', teamId: sur.teamId },
          ...AUDIT,
        }),
      ]);
      entrantHome = homeEntrant.entrantId;
      entrantAway = awayEntrant.entrantId;

      const { person: home } = await persons.register(uow, {
        organizationId,
        displayName: 'Jugador Norte',
        ...AUDIT,
      });
      personHome = home.personId;
      const { person: away } = await persons.register(uow, {
        organizationId,
        displayName: 'Jugador Sur',
        ...AUDIT,
      });
      personAway = away.personId;
      await persons.enlist(uow, {
        personId: personHome,
        teamId: norte.teamId,
        role: 'player',
        organizationId,
        ...AUDIT,
      });
      await persons.enlist(uow, {
        personId: personAway,
        teamId: sur.teamId,
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
        fixtures: [{ round: 1, homeEntrantId: entrantHome, awayEntrantId: entrantAway }],
        organizationId,
        ...AUDIT,
      });
      fixtureId = fixture?.fixtureId ?? '';
    });
  });

  afterAll(async () => {
    await app?.close();
    await scratch?.drop();
  });

  let fixtureId: string;
  let matchNumber = 0;

  async function newScheduledMatch(): Promise<string> {
    matchNumber += 1;
    const competition = new CompetitionRepository(scratch.db);
    const match = await withTransaction(scratch.db, (uow) =>
      competition.createMatch(uow, {
        fixtureId,
        number: matchNumber,
        organizationId,
        ...AUDIT,
      }),
    );
    return match.matchId;
  }

  async function appoint(
    matchId: string,
    subjectId: string,
    capabilities: readonly MatchCapability[],
  ) {
    await withTransaction(scratch.db, (uow) =>
      new MatchAssignmentRepository(scratch.db).appoint(uow, {
        organizationId,
        subjectId,
        scope: { kind: 'match', matchId },
        capabilities,
        ...AUDIT,
      }),
    );
  }

  function base(matchId: string): string {
    return `/organizations/liga-bulk-load/tournaments/apertura-bulk-load/matches/${matchId}`;
  }

  function request(url: string, token: string | undefined, payload: unknown) {
    return (app as NestFastifyApplication).inject({
      method: 'POST',
      url,
      headers: token ? { authorization: `Bearer ${token}` } : {},
      payload: payload as never,
    });
  }

  function validBatch(entries: {
    readonly home: string;
    readonly away: string;
    readonly personHome: string;
    readonly personAway: string;
  }) {
    const kickoff = Date.parse('2025-03-15T18:00:00.000Z');
    return {
      rosters: [
        {
          entrantId: entries.home,
          members: [{ personId: entries.personHome, number: 10, name: 'Jugador Norte', onField: true }],
        },
        {
          entrantId: entries.away,
          members: [{ personId: entries.personAway, number: 9, name: 'Jugador Sur', onField: true }],
        },
      ],
      segments: [{ type: 'half' }, { type: 'half' }],
      events: [
        {
          definitionCode: 'goal',
          segmentNumber: 1,
          occurredAt: kickoff + 15 * 60 * 1000,
          side: entries.home,
          personId: entries.personHome,
        },
      ],
      result: {
        sides: [
          { entrantId: entries.home, statistics: {} },
          { entrantId: entries.away, statistics: {} },
        ],
        winnerEntrantId: entries.home,
      },
    };
  }

  it('commits a full, valid batch and reads the match as finalized', async () => {
    const matchId = await newScheduledMatch();
    await appoint(matchId, 'referee', REFEREE_CAPABILITIES);

    const response = await request(
      `${base(matchId)}/bulk-load`,
      'referee',
      validBatch({ home: entrantHome, away: entrantAway, personHome, personAway }),
    );
    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ matchId, status: 'finalized', eventCount: 1 });

    const match = await scratch.db
      .selectFrom('matches')
      .select(['status', 'result'])
      .where('match_id', '=', matchId)
      .executeTakeFirstOrThrow();
    expect(match.status).toBe('finalized');
    expect(match.result).toMatchObject({ winnerEntrantId: entrantHome });

    const rosters = await scratch.db
      .selectFrom('match_rosters')
      .selectAll()
      .where('match_id', '=', matchId)
      .execute();
    expect(rosters).toHaveLength(2);

    const segments = await scratch.db
      .selectFrom('segments')
      .selectAll()
      .where('match_id', '=', matchId)
      .orderBy('number')
      .execute();
    expect(segments).toHaveLength(2);
    expect(segments.every((segment) => segment.state === 'completed')).toBe(true);
    expect(segments[0]?.elapsed_seconds).toBe(2700); // football's declared default half duration

    const events = await scratch.db
      .selectFrom('match_events')
      .selectAll()
      .where('match_id', '=', matchId)
      .execute();
    expect(events).toHaveLength(1);
    expect(events[0]?.occurred_at.toISOString()).toBe(
      new Date(Date.parse('2025-03-15T18:00:00.000Z') + 15 * 60 * 1000).toISOString(),
    );
  });

  it('rolls back the whole submission when one event fails validation', async () => {
    const matchId = await newScheduledMatch();
    await appoint(matchId, 'referee', REFEREE_CAPABILITIES);

    const batch = validBatch({ home: entrantHome, away: entrantAway, personHome, personAway });
    const response = await request(`${base(matchId)}/bulk-load`, 'referee', {
      ...batch,
      events: [...batch.events, { definitionCode: 'not-a-real-event', segmentNumber: 1, occurredAt: Date.now() }],
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain('not-a-real-event');

    const match = await scratch.db
      .selectFrom('matches')
      .select('status')
      .where('match_id', '=', matchId)
      .executeTakeFirstOrThrow();
    expect(match.status).toBe('scheduled');
    const rosters = await scratch.db
      .selectFrom('match_rosters')
      .selectAll()
      .where('match_id', '=', matchId)
      .execute();
    expect(rosters).toHaveLength(0);
    const events = await scratch.db
      .selectFrom('match_events')
      .selectAll()
      .where('match_id', '=', matchId)
      .execute();
    expect(events).toHaveLength(0);
  });

  it('refuses a batch from a subject with no assignment on the match', async () => {
    const matchId = await newScheduledMatch();
    // No appointment for "bystander" on this match.
    const response = await request(
      `${base(matchId)}/bulk-load`,
      'bystander',
      validBatch({ home: entrantHome, away: entrantAway, personHome, personAway }),
    );
    expect(response.statusCode).toBe(403);
  });

  it('refuses a batch targeting a match that already has a result', async () => {
    const matchId = await newScheduledMatch();
    await appoint(matchId, 'referee', REFEREE_CAPABILITIES);
    const first = await request(
      `${base(matchId)}/bulk-load`,
      'referee',
      validBatch({ home: entrantHome, away: entrantAway, personHome, personAway }),
    );
    expect(first.statusCode).toBe(201);

    const second = await request(
      `${base(matchId)}/bulk-load`,
      'referee',
      validBatch({ home: entrantHome, away: entrantAway, personHome, personAway }),
    );
    expect(second.statusCode).toBe(409);
    expect(second.json().message).toContain('audited correction workflow');
  });
});
