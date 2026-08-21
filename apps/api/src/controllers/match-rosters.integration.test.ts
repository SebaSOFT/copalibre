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
 * Structured rosters and goalkeeper auto-population (0092, tasks 3.2/3.3),
 * proven through the real HTTP path: `consoleProjection` returns structured
 * `rosters`/`rosterRoles` with on-field state resolved from substitution
 * history, and recording a `goal` event auto-populates `payload.goalkeeperId`
 * from the conceding side's active on-field goalkeeper — changing which
 * goalkeeper subsequent goals attribute to once a substitution changes who
 * is on the pitch.
 */
describe('structured rosters and goalkeeper auto-population (integration, 0092)', () => {
  let app: INestApplication;
  let scratch: Awaited<ReturnType<typeof createMigratedDatabase>>;
  let organizationId: string;
  let matchId: string;
  let segmentId: string;
  let entrantHome: string;
  let entrantAway: string;
  let goalkeeperHome: string;
  let benchGoalkeeperHome: string;
  let strikerAway: string;
  const AUDIT = { actor: 'user:seed', authorizationContext: 'seed' } as const;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('match-rosters');
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
        alias: 'liga-rosters',
        name: 'Liga Rosters',
        ...AUDIT,
      }),
    );
    organizationId = organization.organizationId;

    const principalId = newId();
    await scratch.db
      .insertInto('identity_principals')
      .values({
        principal_id: principalId,
        email: 'referee@match-rosters-test',
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
        email: 'referee@match-rosters-test',
        role: 'referee',
        status: 'active',
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      })
      .execute();

    // Real football descriptor, unmodified: `goal`'s `roster-role-snapshot`
    // effect and `rosterRoles: [{goalkeeper}, {captain}]` are already
    // declared on it (0092, tasks 1.1a/1.3c).
    const descriptor = footballDescriptor();

    const tournaments = new TournamentRepository(scratch.db);
    const enrollment = new EnrollmentRepository(scratch.db);
    const persons = new PersonRepository(scratch.db);
    const competition = new CompetitionRepository(scratch.db);

    await withTransaction(scratch.db, async (uow) => {
      await tournaments.saveDescriptor(uow, descriptor, { organizationId, ...AUDIT });
      const tournament = await tournaments.create(uow, {
        organizationId,
        alias: 'apertura-rosters',
        name: 'Apertura Rosters',
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

      const { person: startingGoalkeeper } = await persons.register(uow, {
        organizationId,
        displayName: 'Arquero Titular',
        ...AUDIT,
      });
      goalkeeperHome = startingGoalkeeper.personId;
      const { person: benchGoalkeeper } = await persons.register(uow, {
        organizationId,
        displayName: 'Arquero Suplente',
        ...AUDIT,
      });
      benchGoalkeeperHome = benchGoalkeeper.personId;
      const { person: striker } = await persons.register(uow, {
        organizationId,
        displayName: 'Delantero Visitante',
        ...AUDIT,
      });
      strikerAway = striker.personId;
      await Promise.all(
        [goalkeeperHome, benchGoalkeeperHome].map((personId) =>
          persons.enlist(uow, {
            personId,
            teamId: norte.teamId,
            role: 'player',
            organizationId,
            ...AUDIT,
          }),
        ),
      );
      await persons.enlist(uow, {
        personId: strikerAway,
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
        .values([
          {
            match_id: matchId,
            entrant_id: entrantHome,
            roster_members: JSON.stringify([
              {
                personId: goalkeeperHome,
                number: 1,
                name: 'Arquero Titular',
                roles: ['goalkeeper'],
                onField: true,
              },
              {
                personId: benchGoalkeeperHome,
                number: 12,
                name: 'Arquero Suplente',
                roles: ['goalkeeper'],
                onField: false,
              },
            ]),
            updated_at: new Date(),
          },
          {
            match_id: matchId,
            entrant_id: entrantAway,
            roster_members: JSON.stringify([
              { personId: strikerAway, number: 9, name: 'Delantero Visitante', onField: true },
            ]),
            updated_at: new Date(),
          },
        ])
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

  it('returns structured roster members and the discipline-declared roster roles', async () => {
    const response = await request('GET', `${base()}/console`, 'referee');
    expect(response.statusCode).toBe(200);
    const body = response.json();

    const home = body.rosters.find(
      (roster: { entrantId: string }) => roster.entrantId === entrantHome,
    );
    expect(home.members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          personId: goalkeeperHome,
          number: 1,
          roles: ['goalkeeper'],
          onField: true,
        }),
        expect.objectContaining({
          personId: benchGoalkeeperHome,
          roles: ['goalkeeper'],
          onField: false,
        }),
      ]),
    );
    expect(body.rosterRoles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'goalkeeper', badge: 'GK' }),
        expect.objectContaining({ code: 'captain', badge: 'C' }),
      ]),
    );
  });

  it('auto-populates goalkeeperId on a goal from the conceding side’s active goalkeeper', async () => {
    const response = await request('POST', `${base()}/events`, 'referee', {
      definitionCode: 'goal',
      segmentId,
      occurredAt: Date.now(),
      side: entrantAway,
      personId: strikerAway,
    });
    expect(response.statusCode).toBe(201);

    const persisted = await scratch.db
      .selectFrom('match_events')
      .select('payload')
      .where('event_id', '=', response.json().eventId)
      .executeTakeFirstOrThrow();
    expect(persisted.payload).toMatchObject({ goalkeeperId: goalkeeperHome });
  });

  it('attributes to the new goalkeeper after a substitution changes who is on the pitch', async () => {
    const substitution = await request('POST', `${base()}/events`, 'referee', {
      definitionCode: 'substitution',
      segmentId,
      occurredAt: Date.now(),
      side: entrantHome,
      payload: { playerOutId: goalkeeperHome, playerInId: benchGoalkeeperHome },
    });
    expect(substitution.statusCode).toBe(201);

    const projection = await request('GET', `${base()}/console`, 'referee');
    const home = projection
      .json()
      .rosters.find((roster: { entrantId: string }) => roster.entrantId === entrantHome);
    expect(home.members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ personId: goalkeeperHome, onField: false }),
        expect.objectContaining({ personId: benchGoalkeeperHome, onField: true }),
      ]),
    );

    const secondGoal = await request('POST', `${base()}/events`, 'referee', {
      definitionCode: 'goal',
      segmentId,
      occurredAt: Date.now(),
      side: entrantAway,
      personId: strikerAway,
    });
    expect(secondGoal.statusCode).toBe(201);

    const persisted = await scratch.db
      .selectFrom('match_events')
      .select('payload')
      .where('event_id', '=', secondGoal.json().eventId)
      .executeTakeFirstOrThrow();
    expect(persisted.payload).toMatchObject({ goalkeeperId: benchGoalkeeperHome });
  });

  const base = () => `/organizations/liga-rosters/tournaments/apertura-rosters/matches/${matchId}`;

  // A fresh key per call (0123: recordEvent/setRoster now check one too, not
  // just finalize) — a fixed key would make every subsequent POST here
  // collide against whatever the first one recorded.
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
});
