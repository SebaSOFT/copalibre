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
import { PublicProjectionsController } from './public-projections.controller.js';
import { StandingsController } from './standings.controller.js';
import { TableProjectionsController } from './table-projections.controller.js';

/**
 * Table projections (0091) through the real HTTP stack, against real
 * PostgreSQL data: a `collector`-sourced tournament-wide ranking (live
 * cadence, updated inside the event-recording transaction target-actor
 * -attribution.integration.test.ts already proves), and a `statistics`
 * -sourced stage-scoped standings table (`computeStandings`'s entrant
 * accounting, bridged into synthetic figures — a code path no unit test
 * touches a real database for).
 */
describe('table projections (integration, 0091)', () => {
  let app: INestApplication;
  let scratch: Awaited<ReturnType<typeof createMigratedDatabase>>;
  let organizationId: string;
  let tournamentId: string;
  let matchId: string;
  let segmentId: string;
  let entrantTalleres: string;
  let entrantIndependiente: string;
  let personScorer: string;
  let clubTalleresId: string;
  const AUDIT = { actor: 'user:seed', authorizationContext: 'seed' } as const;

  const GROUP_STANDINGS_LAYOUT = {
    code: 'group-standings-default',
    target: 'group-phase' as const,
    label: { en: 'Group Standings' },
    entityGranularity: 'team' as const,
    defaultSort: [{ columnCode: 'points', direction: 'desc' as const }],
    columns: [
      {
        code: 'rank',
        header: { en: 'Pos' },
        source: { kind: 'rank' as const },
        format: 'number' as const,
      },
      {
        code: 'name',
        header: { en: 'Team' },
        source: { kind: 'entrant-name' as const },
        format: 'text' as const,
      },
      {
        code: 'points',
        header: { en: 'Points' },
        source: { kind: 'collector' as const, code: 'points' },
        format: 'number' as const,
      },
    ],
  };

  const TOP_SCORERS_LAYOUT = {
    code: 'top-scorers',
    target: 'player-ranking' as const,
    label: { en: 'Top Scorers' },
    entityGranularity: 'person' as const,
    defaultSort: [{ columnCode: 'goals', direction: 'desc' as const }],
    columns: [
      {
        code: 'player',
        header: { en: 'Player' },
        source: { kind: 'actor-name' as const },
        format: 'text' as const,
      },
      {
        code: 'goals',
        header: { en: 'Goals' },
        source: { kind: 'collector' as const, code: 'player-goals' },
        format: 'number' as const,
      },
    ],
  };

  function descriptor(overrides?: Partial<DisciplineDescriptor>): DisciplineDescriptor {
    const base = footballDescriptor({
      collectors: [
        {
          code: 'player-goals',
          label: 'Goals',
          source: { kind: 'event', definitionCodes: ['goal'], actorSource: 'primary' },
          measure: { kind: 'count' },
          granularity: { actor: 'person', competition: 'match' },
          cadence: { kind: 'live' },
        },
      ],
      tableLayouts: [GROUP_STANDINGS_LAYOUT, TOP_SCORERS_LAYOUT],
    });
    return {
      ...base,
      fieldPolicies: {
        ...base.fieldPolicies,
        tableLayouts: { permission: { kind: 'replaced' }, mutationClass: 'safe' },
      },
      ...overrides,
    };
  }

  beforeAll(async () => {
    scratch = await createMigratedDatabase('table-projections');
    @Module({
      controllers: [
        MatchControlController,
        StandingsController,
        TableProjectionsController,
        PublicProjectionsController,
      ],
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
        alias: 'liga-tablas',
        name: 'Liga Tablas',
        ...AUDIT,
      }),
    );
    organizationId = organization.organizationId;

    const principalId = newId();
    await scratch.db
      .insertInto('identity_principals')
      .values({
        principal_id: principalId,
        email: 'referee@table-projections-test',
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
        email: 'referee@table-projections-test',
        // 'admin' rather than 'referee': satisfies both `MatchControlController`'s
        // event endpoint (`RequireOrganizationRole('admin', 'referee')`) and
        // `TableProjectionsController`'s (`RequireOrganizationRole('admin')`) with
        // one principal, since `organization_role_assignments` holds one row per
        // (organization, subject).
        role: 'admin',
        status: 'active',
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      })
      .execute();

    const tournaments = new TournamentRepository(scratch.db);
    const enrollment = new EnrollmentRepository(scratch.db);
    const persons = new PersonRepository(scratch.db);
    const competition = new CompetitionRepository(scratch.db);

    await withTransaction(scratch.db, async (uow) => {
      const discipline = descriptor();
      await tournaments.saveDescriptor(uow, discipline, { organizationId, ...AUDIT });
      const tournament = await tournaments.create(uow, {
        organizationId,
        alias: 'apertura-tablas',
        name: 'Apertura Tablas',
        descriptor: discipline,
        ...AUDIT,
      });
      await tournaments.createRuleset(uow, {
        tournamentId: tournament.tournamentId,
        organizationId,
        descriptor: discipline,
        overrides: {},
        ...AUDIT,
      });
      tournamentId = tournament.tournamentId;

      const clubTalleres = await enrollment.createClub(uow, {
        organizationId,
        name: 'Club Atlético Talleres',
        ...AUDIT,
      });
      clubTalleresId = clubTalleres.clubId;

      const talleres = await enrollment.createTeam(uow, {
        organizationId,
        clubId: clubTalleres.clubId,
        name: 'Talleres',
        abbreviation: 'TAL',
        ...AUDIT,
      });
      const independiente = await enrollment.createTeam(uow, {
        organizationId,
        name: 'Independiente',
        ...AUDIT,
      });
      const [homeEntrant, awayEntrant] = await Promise.all([
        enrollment.registerEntrant(uow, {
          organizationId,
          tournamentId: tournament.tournamentId,
          entrantRef: { kind: 'team', teamId: talleres.teamId },
          abbreviation: 'TALR',
          ...AUDIT,
        }),
        enrollment.registerEntrant(uow, {
          organizationId,
          tournamentId: tournament.tournamentId,
          entrantRef: { kind: 'team', teamId: independiente.teamId },
          ...AUDIT,
        }),
      ]);
      entrantTalleres = homeEntrant.entrantId;
      entrantIndependiente = awayEntrant.entrantId;

      const { person: scorer } = await persons.register(uow, {
        organizationId,
        displayName: 'Goleador',
        ...AUDIT,
      });
      personScorer = scorer.personId;
      await persons.enlist(uow, {
        personId: personScorer,
        teamId: talleres.teamId,
        role: 'player',
        organizationId,
        ...AUDIT,
      });

      const stage = await competition.createStageInTournament(uow, {
        tournamentId: tournament.tournamentId,
        number: 1,
        name: 'Fase regular',
        format: 'round-robin',
        organizationId,
        ...AUDIT,
      });
      const [fixture] = await competition.createFixtures(uow, {
        stageId: stage.stageId,
        fixtures: [
          { round: 1, homeEntrantId: entrantTalleres, awayEntrantId: entrantIndependiente },
        ],
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
            entrant_id: entrantTalleres,
            roster_members: JSON.stringify([
              { personId: personScorer, name: 'Goleador', onField: true },
            ]),
            updated_at: new Date(),
          },
          {
            match_id: matchId,
            entrant_id: entrantIndependiente,
            roster_members: JSON.stringify([]),
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

    // A separate transaction: `TournamentRepository.publish`'s own
    // precondition check reads through the repository's plain (non-`uow.tx`)
    // connection, so it cannot see a tournament the still-open transaction
    // above created. Published, not draft — the public routes'
    // `resolvePublishedTournament` 404s a draft exactly as it would for a
    // real un-launched tournament.
    await withTransaction(scratch.db, (uow) =>
      tournaments.publish(uow, { tournamentId, organizationId, ...AUDIT }),
    );

    // A live-cadence collector's total updates inside this one request —
    // exactly the transaction target-actor-attribution.integration.test.ts
    // proves — so `top-scorers` has something to read without a separate
    // finalize/refold step.
    const eventResponse = await (app as NestFastifyApplication).inject({
      method: 'POST',
      url: `/organizations/liga-tablas/tournaments/apertura-tablas/matches/${matchId}/events`,
      headers: {
        authorization: 'Bearer referee',
        'idempotency-key': '01890000-0000-7000-8000-0000000000d1',
      },
      payload: {
        definitionCode: 'goal',
        segmentId,
        occurredAt: Date.now(),
        side: entrantTalleres,
        personId: personScorer,
        payload: {},
      },
    });
    expect(eventResponse.statusCode).toBe(201);

    // `group-standings-default` is sourced from declared `statistics`
    // (`points`), which only `computeStandings`'s entrant accounting
    // produces — from a finalized match result, not from any collector.
    await withTransaction(scratch.db, (uow) =>
      new CompetitionRepository(scratch.db).recordResult(uow, {
        matchId,
        result: {
          sides: [
            { entrantId: entrantTalleres, statistics: { points: 3, wins: 1, played: 1 } },
            { entrantId: entrantIndependiente, statistics: { points: 0, losses: 1, played: 1 } },
          ],
          winnerEntrantId: entrantTalleres,
          recordedAt: new Date().toISOString(),
        },
        organizationId,
        ...AUDIT,
      }),
    );
  });

  afterAll(async () => {
    await app?.close();
    await scratch?.drop();
  });

  function get(url: string) {
    return (app as NestFastifyApplication).inject({
      method: 'GET',
      url,
      headers: { authorization: 'Bearer referee' },
    });
  }

  it('lists every table layout in effect for a tab bar to render', async () => {
    const response = await get('/organizations/liga-tablas/tournaments/apertura-tablas/tables');

    expect(response.statusCode).toBe(200);
    expect(response.json().layouts).toEqual([
      {
        code: 'group-standings-default',
        target: 'group-phase',
        label: { en: 'Group Standings' },
        entityGranularity: 'team',
      },
      {
        code: 'top-scorers',
        target: 'player-ranking',
        label: { en: 'Top Scorers' },
        entityGranularity: 'person',
      },
    ]);
  });

  it('projects a stage-scoped, statistics-sourced group-standings table', async () => {
    const response = await get(
      '/organizations/liga-tablas/tournaments/apertura-tablas/stages/1/tables/group-standings-default',
    );

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.layoutCode).toBe('group-standings-default');
    expect(body.rows).toHaveLength(2);
    const talleresRow = body.rows.find(
      (row: { actorId: string }) => row.actorId === entrantTalleres,
    );
    expect(talleresRow.rank).toBe(1);
    expect(talleresRow.cells.name.formatted).toBe('Talleres');
    expect(talleresRow.cells.points).toEqual({ raw: 3, formatted: '3' });
  });

  it('projects a tournament-wide, collector-sourced top-scorers table', async () => {
    const response = await get(
      '/organizations/liga-tablas/tournaments/apertura-tablas/tables/top-scorers',
    );

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0]).toMatchObject({ actorId: personScorer });
    expect(body.rows[0].cells.player.formatted).toBe('Goleador');
    expect(body.rows[0].cells.goals).toEqual({ raw: 1, formatted: '1' });
  });

  it('serves the same tournament-wide table as CSV', async () => {
    const response = await get(
      '/organizations/liga-tablas/tournaments/apertura-tablas/tables/top-scorers/csv',
    );

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.body).toContain('player,goals');
    expect(response.body).toContain('Goleador,1');
  });

  it('404s an unknown layout code', async () => {
    const response = await get(
      '/organizations/liga-tablas/tournaments/apertura-tablas/tables/nonexistent-layout',
    );

    expect(response.statusCode).toBe(404);
  });

  it('replaces the discipline’s table layouts when a tournament ruleset override permits it', async () => {
    const overrideLayout = {
      ...TOP_SCORERS_LAYOUT,
      code: 'top-scorers-override',
      label: { en: 'Top Scorers (override)' },
    };

    const tournaments = new TournamentRepository(scratch.db);
    await withTransaction(scratch.db, async (uow) => {
      const discipline = descriptor();
      const tournament = await tournaments.create(uow, {
        organizationId,
        alias: 'apertura-override',
        name: 'Apertura Override',
        descriptor: discipline,
        ...AUDIT,
      });
      await tournaments.createRuleset(uow, {
        tournamentId: tournament.tournamentId,
        organizationId,
        descriptor: discipline,
        overrides: { tableLayouts: [overrideLayout] },
        ...AUDIT,
      });
    });

    const overridden = await get(
      '/organizations/liga-tablas/tournaments/apertura-override/tables/top-scorers-override',
    );
    expect(overridden.statusCode).toBe(200);
    expect(overridden.json().layoutCode).toBe('top-scorers-override');

    // The discipline's own default is no longer reachable — a `replaced`
    // override replaces the whole array, it does not merge into it.
    const replaced = await get(
      '/organizations/liga-tablas/tournaments/apertura-override/tables/top-scorers',
    );
    expect(replaced.statusCode).toBe(404);
  });

  it('401s without a token', async () => {
    const response = await (app as NestFastifyApplication).inject({
      method: 'GET',
      url: '/organizations/liga-tablas/tournaments/apertura-tablas/tables/top-scorers',
    });
    expect(response.statusCode).toBe(401);
  });

  describe('public routes', () => {
    function getAnonymous(url: string) {
      return (app as NestFastifyApplication).inject({ method: 'GET', url });
    }

    it('prefers a tournament entrant abbreviation over the team abbreviation in overview data', async () => {
      const response = await getAnonymous(
        '/organizations/liga-tablas/tournaments/apertura-tablas/overview',
      );

      expect(response.statusCode).toBe(200);
      const home = response
        .json()
        .matches.find(
          (match: { homeEntrantId: string }) => match.homeEntrantId === entrantTalleres,
        );
      expect(home).toMatchObject({ homeName: 'Talleres', homeAbbreviation: 'TALR' });
    });

    it('lists table layouts with no token at all', async () => {
      const response = await getAnonymous(
        '/organizations/liga-tablas/tournaments/apertura-tablas/public/tables',
      );

      expect(response.statusCode).toBe(200);
      expect(response.json().layouts.map((layout: { code: string }) => layout.code)).toEqual([
        'group-standings-default',
        'top-scorers',
      ]);
    });

    it('projects a tournament-wide table with no token at all', async () => {
      const response = await getAnonymous(
        '/organizations/liga-tablas/tournaments/apertura-tablas/public/tables/top-scorers',
      );

      expect(response.statusCode).toBe(200);
      expect(response.json().rows[0]).toMatchObject({ actorId: personScorer });
    });

    it('filters a tournament-wide table by clubId without changing computed ranking', async () => {
      const matching = await getAnonymous(
        `/organizations/liga-tablas/tournaments/apertura-tablas/public/tables/top-scorers?clubId=${clubTalleresId}`,
      );
      expect(matching.statusCode).toBe(200);
      expect(matching.json().rows).toHaveLength(1);
      expect(matching.json().rows[0]).toMatchObject({ actorId: personScorer, rank: 1 });

      const nonMatching = await getAnonymous(
        '/organizations/liga-tablas/tournaments/apertura-tablas/public/tables/top-scorers?clubId=00000000-0000-0000-0000-000000000000',
      );
      expect(nonMatching.statusCode).toBe(200);
      expect(nonMatching.json().rows).toHaveLength(0);
    });

    it('projects a stage-scoped table with no token at all', async () => {
      const response = await getAnonymous(
        '/organizations/liga-tablas/tournaments/apertura-tablas/stages/1/public/tables/group-standings-default',
      );

      expect(response.statusCode).toBe(200);
      expect(response.json().rows).toHaveLength(2);
    });

    it('filters a stage-scoped table by clubId without throwing', async () => {
      const matching = await getAnonymous(
        `/organizations/liga-tablas/tournaments/apertura-tablas/stages/1/public/tables/group-standings-default?clubId=${clubTalleresId}`,
      );
      expect(matching.statusCode).toBe(200);
      expect(matching.json().rows).toHaveLength(1);
      expect(matching.json().rows[0]).toMatchObject({ actorId: entrantTalleres });

      const nonMatching = await getAnonymous(
        '/organizations/liga-tablas/tournaments/apertura-tablas/stages/1/public/tables/group-standings-default?clubId=00000000-0000-0000-0000-000000000000',
      );
      expect(nonMatching.statusCode).toBe(200);
      expect(nonMatching.json().rows).toHaveLength(0);
    });

    it('is a genuinely different route from the admin one, not a shared shadowed path', async () => {
      // Confirms the fix for the Fastify route collision this pair of
      // controllers first hit registering `tables` at the same path: the
      // admin route still refuses an anonymous caller...
      const adminSide = await getAnonymous(
        '/organizations/liga-tablas/tournaments/apertura-tablas/tables/top-scorers',
      );
      expect(adminSide.statusCode).toBe(401);

      // ...while the public route serves it, both reachable on the same app.
      const publicSide = await getAnonymous(
        '/organizations/liga-tablas/tournaments/apertura-tablas/public/tables/top-scorers',
      );
      expect(publicSide.statusCode).toBe(200);
    });

    it('404s an unpublished (draft) tournament rather than exposing its tables', async () => {
      const response = await getAnonymous(
        '/organizations/liga-tablas/tournaments/apertura-override/public/tables',
      );
      expect(response.statusCode).toBe(404);
    });
  });
});
