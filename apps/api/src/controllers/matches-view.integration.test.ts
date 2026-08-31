import { Module, type INestApplication } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { footballDescriptor } from '@copalibre/domain';
import {
  CompetitionRepository,
  EnrollmentRepository,
  OrganizationRepository,
  ScheduleRepository,
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
import { PublicProjectionsController } from './public-projections.controller.js';
import { TournamentsController } from './tournaments.controller.js';

/**
 * The public and control-web matches-view endpoints (openspec 0172): a flat,
 * filterable card list built from `readMatchesView`, exercised through the
 * real HTTP stack — including the control-web route's real
 * `org.view-internal-standings` authorization (org admin, a correctly-scoped
 * tournament-admin, a wrongly-scoped one refused, a referee refused).
 */
describe('matches view (integration)', () => {
  let app: INestApplication;
  let scratch: Awaited<ReturnType<typeof createMigratedDatabase>>;
  let organizationId = '';
  let organizationAlias = '';

  const subjects: Record<string, AuthenticatedSubject> = {
    admin: { subjectId: 'oidc-mv-admin', scopes: ['copalibre.control'] },
    'tournament-admin-in-scope': {
      subjectId: 'oidc-mv-tadmin-in',
      scopes: ['copalibre.control'],
    },
    'tournament-admin-out-of-scope': {
      subjectId: 'oidc-mv-tadmin-out',
      scopes: ['copalibre.control'],
    },
    referee: { subjectId: 'oidc-mv-referee', scopes: ['copalibre.control'] },
  };

  beforeAll(async () => {
    scratch = await createMigratedDatabase('matches-view');
    @Module({
      controllers: [PublicProjectionsController, TournamentsController],
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
    class MatchesViewTestModule {}
    const moduleRef = await Test.createTestingModule({
      imports: [MatchesViewTestModule],
    }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await (app as NestFastifyApplication).getHttpAdapter().getInstance().ready();

    const audit = { actor: 'user:seed', authorizationContext: 'seed' } as const;
    const organization = await withTransaction(scratch.db, (uow) =>
      new OrganizationRepository(scratch.db).create(uow, {
        alias: 'liga-matches-view',
        name: 'Liga Matches View',
        ...audit,
      }),
    );
    organizationId = organization.organizationId;
    organizationAlias = organization.alias;

    const descriptor = footballDescriptor();
    const tournaments = new TournamentRepository(scratch.db);
    const enrollment = new EnrollmentRepository(scratch.db);
    const competition = new CompetitionRepository(scratch.db);

    const { tournament, otherTournamentId, stageId, finalMatchId, liveMatchId } =
      await withTransaction(scratch.db, async (uow) => {
        await tournaments.saveDescriptor(uow, descriptor, { organizationId, ...audit });
        const created = await tournaments.create(uow, {
          organizationId,
          alias: 'apertura-mv',
          name: 'Apertura MV',
          descriptor,
          ...audit,
        });
        const other = await tournaments.create(uow, {
          organizationId,
          alias: 'clausura-mv',
          name: 'Clausura MV',
          descriptor,
          ...audit,
        });
        await tournaments.createRuleset(uow, {
          tournamentId: created.tournamentId,
          organizationId,
          descriptor,
          overrides: { format: 'round-robin' },
          customScripts: [],
          ...audit,
        });
        const norte = await enrollment.createTeam(uow, { organizationId, name: 'Norte', ...audit });
        const sur = await enrollment.createTeam(uow, { organizationId, name: 'Sur', ...audit });
        const [home, away] = await Promise.all([
          enrollment.registerEntrant(uow, {
            organizationId,
            tournamentId: created.tournamentId,
            entrantRef: { kind: 'team', teamId: norte.teamId },
            ...audit,
          }),
          enrollment.registerEntrant(uow, {
            organizationId,
            tournamentId: created.tournamentId,
            entrantRef: { kind: 'team', teamId: sur.teamId },
            ...audit,
          }),
        ]);

        const stage = await competition.createStageInTournament(uow, {
          tournamentId: created.tournamentId,
          number: 1,
          name: 'Liga',
          format: 'round-robin',
          organizationId,
          ...audit,
        });

        const fixtures = await competition.createFixtures(uow, {
          stageId: stage.stageId,
          fixtures: [
            { round: 1, homeEntrantId: home.entrantId, awayEntrantId: away.entrantId },
            { round: 2, homeEntrantId: away.entrantId, awayEntrantId: home.entrantId },
          ],
          organizationId,
          ...audit,
        });
        const [finalFixture, liveFixture] = fixtures;
        if (!finalFixture || !liveFixture) throw new Error('fixtures not created');

        const finalMatch = await competition.createMatch(uow, {
          fixtureId: finalFixture.fixtureId,
          number: 1,
          organizationId,
          ...audit,
        });
        await competition.recordResult(uow, {
          matchId: finalMatch.matchId,
          result: {
            sides: [
              { entrantId: home.entrantId, statistics: { score: 2 } },
              { entrantId: away.entrantId, statistics: { score: 1 } },
            ],
            winnerEntrantId: home.entrantId,
            recordedAt: '2026-08-31T12:00:00.000Z',
          },
          organizationId,
          ...audit,
        });

        const liveMatch = await competition.createMatch(uow, {
          fixtureId: liveFixture.fixtureId,
          number: 1,
          organizationId,
          ...audit,
        });
        const segment = await competition.createSegment(uow, {
          matchId: liveMatch.matchId,
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
          matchId: liveMatch.matchId,
          command: 'start',
          status: 'in-progress',
          grantedBy: 'seed',
          organizationId,
          ...audit,
        });
        await competition.appendEvent(uow, {
          event: {
            eventId: newId(),
            matchId: liveMatch.matchId,
            segmentId: segment.segmentId,
            definitionCode: 'goal',
            occurredAt: '2026-08-31T12:10:00.000Z',
            side: home.entrantId,
            payload: {},
          },
          sequence: 1,
          organizationId,
          ...audit,
        });

        return {
          tournament: created,
          otherTournamentId: other.tournamentId,
          stageId: stage.stageId,
          finalMatchId: finalMatch.matchId,
          liveMatchId: liveMatch.matchId,
        };
      });
    // `publish`'s `findById` reads outside the transaction, so it must run
    // after the creating transaction above has actually committed.
    await withTransaction(scratch.db, (uow) =>
      tournaments.publish(uow, {
        tournamentId: tournament.tournamentId,
        organizationId,
        ...audit,
      }),
    );
    void stageId;
    void finalMatchId;

    // A venue and a published schedule slot for the live match.
    const venue = await withTransaction(scratch.db, (uow) =>
      new ScheduleRepository(scratch.db).createVenue(uow, {
        organizationId,
        alias: 'cancha-1',
        name: 'Cancha 1',
        concurrentCapacity: 1,
        ...audit,
      }),
    );
    const scheduleId = newId();
    await scratch.db
      .insertInto('schedules')
      .values({
        schedule_id: scheduleId,
        organization_id: organizationId,
        name: 'Fecha 1',
        starts_at: String(Date.now()),
        ends_at: String(Date.now() + 3_600_000),
        slot_minutes: 60,
        turnaround_minutes: 15,
        created_at: new Date(),
      })
      .execute();
    const slotId = newId();
    await scratch.db
      .insertInto('schedule_slots')
      .values({
        slot_id: slotId,
        schedule_id: scheduleId,
        venue_id: venue.venueId,
        starts_at: String(Date.now()),
        created_at: new Date(),
      })
      .execute();
    await scratch.db
      .insertInto('match_schedule_assignments')
      .values({ match_id: liveMatchId, slot_id: slotId, published: true, created_at: new Date() })
      .execute();

    async function seedRole(
      oidcSubjectId: string,
      email: string,
      role: 'admin' | 'tournament-admin' | 'referee',
      tournamentId?: string,
    ): Promise<void> {
      const principalId = newId();
      await scratch.db
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
      await scratch.db
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
          club_id: null,
          tournament_id: tournamentId ?? null,
        })
        .execute();
    }

    await seedRole('oidc-mv-admin', 'mv-admin@test', 'admin');
    await seedRole(
      'oidc-mv-tadmin-in',
      'mv-tadmin-in@test',
      'tournament-admin',
      tournament.tournamentId,
    );
    await seedRole(
      'oidc-mv-tadmin-out',
      'mv-tadmin-out@test',
      'tournament-admin',
      otherTournamentId,
    );
    await seedRole('oidc-mv-referee', 'mv-referee@test', 'referee');
  });

  afterAll(async () => {
    await app?.close();
    await scratch?.drop();
  });

  function get(path: string, token?: string) {
    return (app as NestFastifyApplication).inject({
      method: 'GET',
      url: path,
      ...(token ? { headers: { authorization: `Bearer ${token}` } } : {}),
    });
  }

  describe('public matches-view', () => {
    it('lists every match with the expected card fields, leaking no internal field', async () => {
      const response = await get(
        `/organizations/${organizationAlias}/tournaments/apertura-mv/matches-view`,
      );
      expect(response.statusCode).toBe(200);
      const body = response.json() as { matches: readonly Record<string, unknown>[] };
      expect(body.matches).toHaveLength(2);

      const final = body.matches.find((m) => m.status === 'final');
      expect(final).toMatchObject({
        homeName: 'Norte',
        awayName: 'Sur',
        homeScore: 2,
        awayScore: 1,
      });
      expect(final?.clockSeconds).toBeUndefined();
      expect(final).not.toHaveProperty('homeClubId');
      expect(final).not.toHaveProperty('rawTrace');

      const live = body.matches.find((m) => m.status === 'live');
      expect(live?.clockSeconds).toBeGreaterThanOrEqual(0);
      expect(live?.venueName).toBe('Cancha 1');
      expect(live?.latestEvent).toMatchObject({ label: 'Goal' });
    });

    it('filters by state', async () => {
      const response = await get(
        `/organizations/${organizationAlias}/tournaments/apertura-mv/matches-view?state=final`,
      );
      expect(response.statusCode).toBe(200);
      const body = response.json() as { matches: readonly Record<string, unknown>[] };
      expect(body.matches).toHaveLength(1);
      expect(body.matches[0]?.status).toBe('final');
    });

    it('404s a nonexistent stage', async () => {
      const response = await get(
        `/organizations/${organizationAlias}/tournaments/apertura-mv/matches-view?stageNumber=99`,
      );
      expect(response.statusCode).toBe(404);
    });
  });

  describe('control-web matches-view authorization', () => {
    it('admits an organization admin', async () => {
      const response = await get(
        `/organizations/${organizationAlias}/tournaments/apertura-mv/internal-matches-view`,
        'admin',
      );
      expect(response.statusCode).toBe(200);
      const body = response.json() as { matches: readonly Record<string, unknown>[] };
      expect(body.matches).toHaveLength(2);
    });

    it('admits a tournament-admin scoped to this tournament', async () => {
      const response = await get(
        `/organizations/${organizationAlias}/tournaments/apertura-mv/internal-matches-view`,
        'tournament-admin-in-scope',
      );
      expect(response.statusCode).toBe(200);
    });

    it('refuses a tournament-admin scoped to a different tournament', async () => {
      const response = await get(
        `/organizations/${organizationAlias}/tournaments/apertura-mv/internal-matches-view`,
        'tournament-admin-out-of-scope',
      );
      expect(response.statusCode).toBe(403);
    });

    it('refuses a referee', async () => {
      const response = await get(
        `/organizations/${organizationAlias}/tournaments/apertura-mv/internal-matches-view`,
        'referee',
      );
      expect(response.statusCode).toBe(403);
    });

    it('carries no trace fields for a match with no tiebreak involved', async () => {
      const response = await get(
        `/organizations/${organizationAlias}/tournaments/apertura-mv/internal-matches-view`,
        'admin',
      );
      const body = response.json() as { matches: readonly Record<string, unknown>[] };
      for (const match of body.matches) {
        expect(match).not.toHaveProperty('homeTrace');
        expect(match).not.toHaveProperty('awayTrace');
      }
    });
  });
});
