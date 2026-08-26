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
 * `match_rosters` had five production readers
 * and zero production writers before this change — every person-attributed
 * event was refused, unconditionally, because the eligibility set it reads
 * was always empty outside a hand-seeded test. These tests drive the real
 * `PUT .../rosters/:entrantId` route, never `insertInto('match_rosters')`
 * directly, which is exactly what let the defect ship green.
 */
describe('match roster selection (integration)', () => {
  let app: INestApplication;
  let scratch: Awaited<ReturnType<typeof createMigratedDatabase>>;
  let organizationId: string;
  let matchId: string;
  let segmentId: string;
  let entrantHome: string;
  let entrantAway: string;
  let strikerHome: string;
  let goalkeeperHome: string;
  let strikerAway: string;
  let substituteAway: string;
  let outsiderPersonId: string;
  const AUDIT = { actor: 'user:seed', authorizationContext: 'seed' } as const;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('match-roster-selection');
    @Module({
      controllers: [MatchControlController],
      providers: [
        { provide: DATABASE, useValue: scratch.db },
        {
          provide: TokenVerifier,
          useValue: {
            verify: async (token: string): Promise<AuthenticatedSubject> => {
              if (token !== 'referee' && token !== 'unappointed') throw new Error('unknown token');
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
        alias: 'liga-roster-selection',
        name: 'Liga Roster Selection',
        ...AUDIT,
      }),
    );
    organizationId = organization.organizationId;

    // Two organization-role principals: `referee` is appointed to the match
    // (holds `match.select-roster`), `unappointed` shares the same
    // organization role but is never appointed — isolates the match-scoped
    // capability refusal from the organization-role gate.
    for (const token of ['referee', 'unappointed']) {
      const principalId = newId();
      await scratch.db
        .insertInto('identity_principals')
        .values({
          principal_id: principalId,
          email: `${token}@roster-selection-test`,
          oidc_subject_id: token,
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
          email: `${token}@roster-selection-test`,
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
        alias: 'apertura-roster-selection',
        name: 'Apertura Roster Selection',
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

      const { person: striker } = await persons.register(uow, {
        organizationId,
        displayName: 'Delantero Norte',
        ...AUDIT,
      });
      strikerHome = striker.personId;
      const { person: goalkeeper } = await persons.register(uow, {
        organizationId,
        displayName: 'Arquero Norte',
        ...AUDIT,
      });
      goalkeeperHome = goalkeeper.personId;
      const { person: awayStriker } = await persons.register(uow, {
        organizationId,
        displayName: 'Delantero Sur',
        ...AUDIT,
      });
      strikerAway = awayStriker.personId;
      const { person: awaySubstitute } = await persons.register(uow, {
        organizationId,
        displayName: 'Suplente Sur',
        ...AUDIT,
      });
      substituteAway = awaySubstitute.personId;
      const { person: outsider } = await persons.register(uow, {
        organizationId,
        displayName: 'Jugador Sin Equipo',
        ...AUDIT,
      });
      outsiderPersonId = outsider.personId;

      await persons.enlist(uow, {
        personId: strikerHome,
        teamId: norte.teamId,
        role: 'player',
        organizationId,
        ...AUDIT,
      });
      await persons.enlist(uow, {
        personId: goalkeeperHome,
        teamId: norte.teamId,
        role: 'player',
        organizationId,
        ...AUDIT,
      });
      await persons.enlist(uow, {
        personId: strikerAway,
        teamId: sur.teamId,
        role: 'player',
        organizationId,
        ...AUDIT,
      });
      await persons.enlist(uow, {
        personId: substituteAway,
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

      await new MatchAssignmentRepository(scratch.db).appoint(uow, {
        organizationId,
        subjectId: 'referee',
        scope: { kind: 'match', matchId },
        capabilities: ['match.select-roster', 'match.record-event'],
        ...AUDIT,
      });
    });
  });

  afterAll(async () => {
    await app?.close();
    await scratch?.drop();
  });

  const base = () =>
    `/organizations/liga-roster-selection/tournaments/apertura-roster-selection/matches/${matchId}`;

  // A fresh key per call (recordEvent/setRoster now check one too, not
  // just finalize) — a fixed key would make every subsequent POST/PUT here
  // collide against whatever the first one recorded.
  function request(method: 'GET' | 'PUT' | 'POST', url: string, token?: string, payload?: unknown) {
    return (app as NestFastifyApplication).inject({
      method,
      url,
      headers: token
        ? {
            authorization: `Bearer ${token}`,
            ...(method === 'POST' || method === 'PUT'
              ? { 'idempotency-key': crypto.randomUUID() }
              : {}),
          }
        : {},
      payload: payload as never,
    });
  }

  it('lists an entrant’s registered players as roster candidates', async () => {
    const response = await request('GET', `${base()}/rosters/${entrantHome}/candidates`, 'referee');
    expect(response.statusCode).toBe(200);
    const candidates = response.json();
    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ personId: strikerHome, name: 'Delantero Norte' }),
        expect.objectContaining({ personId: goalkeeperHome, name: 'Arquero Norte' }),
      ]),
    );
    expect(candidates.some((c: { personId: string }) => c.personId === strikerAway)).toBe(false);
  });

  it('refuses an unauthorized subject', async () => {
    const response = await request('PUT', `${base()}/rosters/${entrantHome}`, 'unappointed', {
      members: [{ personId: strikerHome, onField: true }],
    });
    expect(response.statusCode).toBe(403);
  });

  it('refuses a person not registered to the entrant’s team', async () => {
    const response = await request('PUT', `${base()}/rosters/${entrantHome}`, 'referee', {
      members: [{ personId: outsiderPersonId, onField: true }],
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain(outsiderPersonId);
  });

  it('refuses an entrant that is not one of this match’s two sides', async () => {
    const response = await request('PUT', `${base()}/rosters/${newId()}`, 'referee', {
      members: [],
    });
    expect(response.statusCode).toBe(400);
  });

  it('refuses a duplicate person within one submission', async () => {
    const response = await request('PUT', `${base()}/rosters/${entrantHome}`, 'referee', {
      members: [
        { personId: strikerHome, number: 9, onField: true },
        { personId: strikerHome, number: 10, onField: false },
      ],
    });
    expect(response.statusCode).toBe(400);
  });

  it('refuses a duplicate shirt number within one submission', async () => {
    const response = await request('PUT', `${base()}/rosters/${entrantHome}`, 'referee', {
      members: [
        { personId: strikerHome, number: 9, onField: true },
        { personId: goalkeeperHome, number: 9, onField: true },
      ],
    });
    expect(response.statusCode).toBe(400);
  });

  it('selects a roster, snapshotting name and returning it via GET', async () => {
    const put = await request('PUT', `${base()}/rosters/${entrantHome}`, 'referee', {
      members: [
        { personId: strikerHome, number: 9, roles: ['captain'], onField: true },
        { personId: goalkeeperHome, number: 1, roles: ['goalkeeper'], onField: true },
      ],
    });
    expect(put.statusCode).toBe(200);
    expect(put.json().rosters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entrantId: entrantHome,
          members: expect.arrayContaining([
            expect.objectContaining({ personId: strikerHome, name: 'Delantero Norte', number: 9 }),
          ]),
        }),
      ]),
    );

    const get = await request('GET', `${base()}/rosters`, 'referee');
    expect(get.statusCode).toBe(200);
    const home = get
      .json()
      .find((roster: { entrantId: string }) => roster.entrantId === entrantHome);
    expect(home.members).toHaveLength(2);
  });

  it('a second submission replaces the prior selection rather than accumulating it', async () => {
    const revised = await request('PUT', `${base()}/rosters/${entrantHome}`, 'referee', {
      members: [{ personId: strikerHome, number: 9, onField: true }],
    });
    expect(revised.statusCode).toBe(200);

    const get = await request('GET', `${base()}/rosters`, 'referee');
    const home = get
      .json()
      .find((roster: { entrantId: string }) => roster.entrantId === entrantHome);
    expect(home.members).toHaveLength(1);
    expect(home.members[0].personId).toBe(strikerHome);
  });

  it('THE REGRESSION THIS CHANGE PREVENTS: a person-attributed event is refused for a person absent from the roster, and accepted once selected through the real write path', async () => {
    // Away side still has no roster row at all at this point in the suite.
    const refused = await request('POST', `${base()}/events`, 'referee', {
      definitionCode: 'goal',
      segmentId,
      occurredAt: Date.now(),
      side: entrantAway,
      personId: strikerAway,
    });
    expect(refused.statusCode).toBe(400);
    expect(refused.json().message).toContain(strikerAway);

    const away = await request('PUT', `${base()}/rosters/${entrantAway}`, 'referee', {
      members: [{ personId: strikerAway, number: 11, onField: true }],
    });
    expect(away.statusCode).toBe(200);

    const accepted = await request('POST', `${base()}/events`, 'referee', {
      definitionCode: 'goal',
      segmentId,
      occurredAt: Date.now(),
      side: entrantAway,
      personId: strikerAway,
    });
    expect(accepted.statusCode).toBe(201);
  });

  it('refuses to remove a person already attributed by a recorded event', async () => {
    // strikerAway now has a recorded goal (previous test) — removing them must be refused.
    const removalRefused = await request('PUT', `${base()}/rosters/${entrantAway}`, 'referee', {
      members: [],
    });
    expect(removalRefused.statusCode).toBe(400);
    expect(removalRefused.json().message).toContain(strikerAway);
  });

  it('permits adding a new member mid-match alongside an already-attributed one', async () => {
    const response = await request('PUT', `${base()}/rosters/${entrantAway}`, 'referee', {
      members: [
        { personId: strikerAway, number: 11, onField: true },
        { personId: substituteAway, number: 16, onField: false },
      ],
    });
    expect(response.statusCode).toBe(200);
    const home = response
      .json()
      .rosters.find((roster: { entrantId: string }) => roster.entrantId === entrantAway);
    expect(home.members.map((m: { personId: string }) => m.personId)).toEqual(
      expect.arrayContaining([strikerAway, substituteAway]),
    );
  });
});
