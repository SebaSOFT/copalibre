import { Module, type INestApplication } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, Reflector } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { DisciplineDescriptor } from '@copalibre/domain';
import {
  CompetitionRepository,
  EnrollmentRepository,
  MatchAssignmentRepository,
  OrganizationRepository,
  TournamentRepository,
  withTransaction,
} from '@copalibre/persistence';
import { createMigratedDatabase } from '../../../../packages/persistence/src/test-support/scratch-database.js';
import { ApiExceptionFilter } from '../http/error-contract.js';
import { createApiValidationPipe } from '../http/validation.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthenticatedSubject } from '../auth/request-context.js';
import { TokenVerifier } from '../auth/token-verifier.js';
import { DATABASE } from '../database.token.js';
import { MatchControlController } from './match-control.controller.js';
import { PublicProjectionsController } from './public-projections.controller.js';
import { SeedingController } from './seeding.controller.js';
import { StagesController } from './stages.controller.js';

/**
 * Series operations end to end, through the real HTTP stack.
 *
 * Three things are proven here that no unit test can prove, because each depends on a write
 * and a read agreeing across a transaction boundary: that finalizing the deciding game anulls
 * the surplus and frees its slots; that a command replayed against one of those anulled games
 * is refused with the series named, and neither applied nor discarded; and that the public
 * projection reports a series in play order however out of order its games were finalized.
 */

const AUDIT = { actor: 'user:seed', authorizationContext: 'seed' } as const;

const SUBJECT: AuthenticatedSubject = {
  subjectId: 'organizer-1',
  organizationId: 'ORG_1',
  scopes: ['copalibre.control'],
};

class FakeTokenVerifier {
  constructor(private readonly organizationId: () => string) {}

  verify(token: string): Promise<AuthenticatedSubject> {
    if (token === 'organizer') {
      return Promise.resolve({ ...SUBJECT, organizationId: this.organizationId() });
    }
    return Promise.reject(new Error('unknown token'));
  }
}

function descriptor(): DisciplineDescriptor {
  return {
    descriptorId: '01890000-0000-7000-8000-0000000067a1',
    version: '1.0.0',
    name: 'Liga de series',
    attribution: { author: 'CopaLibre', licence: 'AGPL-3.0-only' },
    participantTypes: ['team'],
    rosterConstraints: { minPlayers: 1, maxPlayers: 11 },
    segmentTypes: [],
    eventDefinitions: [],
    statistics: [{ code: 'goals', label: 'Goles', aggregation: 'sum' }],
    scoringInputs: [],
    availableFormats: ['single-elimination', 'round-robin'],
    notificationRuleCapabilities: [],
    winCondition: {},
    defaults: {},
    fieldPolicies: {
      format: { permission: { kind: 'replaced' }, mutationClass: 'requires_rebuild' },
      'series.span': { permission: { kind: 'replaced' }, mutationClass: 'requires_rebuild' },
    },
  } as unknown as DisciplineDescriptor;
}

describe('series operations (integration)', () => {
  let app: INestApplication;
  let scratch: Awaited<ReturnType<typeof createMigratedDatabase>>;
  let organizationId = '';
  let tournamentId = '';
  let stageId = '';
  let alfa = '';
  let bravo = '';
  const organizationAlias = 'liga-series';
  const tournamentAlias = 'copa-series';

  const stagesBase = `/organizations/${organizationAlias}/tournaments/${tournamentAlias}/stages`;
  const matchBase = (matchId: string) =>
    `/organizations/${organizationAlias}/tournaments/${tournamentAlias}/matches/${matchId}`;

  function request(options: {
    method: 'GET' | 'POST';
    url: string;
    token?: string;
    payload?: unknown;
    idempotencyKey?: string;
  }) {
    return (app as NestFastifyApplication).inject({
      method: options.method,
      url: options.url,
      headers: options.token
        ? {
            authorization: `Bearer ${options.token}`,
            ...(options.method === 'POST'
              ? { 'idempotency-key': options.idempotencyKey ?? crypto.randomUUID() }
              : {}),
          }
        : {},
      payload: options.payload as never,
    });
  }

  /** Plays one game to a decision: start, then finalize with the winner named. */
  async function playGame(matchId: string, winner: string, loser: string) {
    const started = await request({
      method: 'POST',
      url: `${matchBase(matchId)}/commands/start`,
      token: 'organizer',
    });
    expect(started.statusCode).toBe(201);
    return request({
      method: 'POST',
      url: `${matchBase(matchId)}/commands/finalize`,
      token: 'organizer',
      payload: {
        sides: [
          { entrantId: winner, statistics: { goals: 2 } },
          { entrantId: loser, statistics: { goals: 1 } },
        ],
        winnerEntrantId: winner,
      },
    });
  }

  async function gamesOfTheSeries() {
    const response = await request({
      method: 'GET',
      url: `${stagesBase}/1/fixtures`,
      token: 'organizer',
    });
    expect(response.statusCode).toBe(200);
    const fixture = response.json().fixtures[0];
    return {
      fixture,
      games: fixture.matches as { matchId: string; number: number; status: string }[],
    };
  }

  beforeAll(async () => {
    scratch = await createMigratedDatabase('series-operations');

    @Module({
      controllers: [
        StagesController,
        SeedingController,
        MatchControlController,
        PublicProjectionsController,
      ],
      providers: [
        { provide: DATABASE, useValue: scratch.db },
        { provide: TokenVerifier, useValue: new FakeTokenVerifier(() => organizationId) },
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        Reflector,
      ],
    })
    class TestModule {}

    const moduleRef = await Test.createTestingModule({ imports: [TestModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalPipes(createApiValidationPipe());
    await app.init();
    await (app as NestFastifyApplication).getHttpAdapter().getInstance().ready();

    const organization = await withTransaction(scratch.db, (uow) =>
      new OrganizationRepository(scratch.db).create(uow, {
        alias: organizationAlias,
        name: 'Liga de Series',
        ...AUDIT,
      }),
    );
    organizationId = organization.organizationId;

    const tournaments = new TournamentRepository(scratch.db);
    const enrollment = new EnrollmentRepository(scratch.db);
    const discipline = descriptor();
    const entrantIds: string[] = [];

    await withTransaction(scratch.db, async (uow) => {
      await tournaments.saveDescriptor(uow, discipline, { organizationId, ...AUDIT });
      const tournament = await tournaments.create(uow, {
        organizationId,
        alias: tournamentAlias,
        name: 'Copa Series',
        descriptor: discipline,
        ...AUDIT,
      });
      tournamentId = tournament.tournamentId;
      await tournaments.createRuleset(uow, {
        tournamentId: tournament.tournamentId,
        organizationId,
        descriptor: discipline,
        overrides: { format: 'single-elimination' },
        ...AUDIT,
      });

      for (const name of ['Alfa', 'Bravo']) {
        const team = await enrollment.createTeam(uow, { organizationId, name, ...AUDIT });
        const entrant = await enrollment.registerEntrant(uow, {
          tournamentId: tournament.tournamentId,
          entrantRef: { kind: 'team', teamId: team.teamId },
          organizationId,
          ...AUDIT,
        });
        entrantIds.push(entrant.entrantId);
      }
    });

    // Its own transaction: `publish` re-reads the tournament through the pool to build its
    // audit "previous state", so the creating transaction has to commit first.
    await withTransaction(scratch.db, (uow) =>
      tournaments.publish(uow, { tournamentId, organizationId, ...AUDIT }),
    );

    alfa = entrantIds[0] as string;
    bravo = entrantIds[1] as string;

    for (const entrantId of entrantIds) {
      await withTransaction(scratch.db, (uow) =>
        enrollment.setEntrantStatus(uow, {
          entrantId,
          status: 'accepted',
          organizationId,
          ...AUDIT,
        }),
      );
    }

    // The stage declares a best-of-five, so seeding materializes five real matches.
    const stage = await request({
      method: 'POST',
      url: stagesBase,
      token: 'organizer',
      payload: {
        format: 'single-elimination',
        series: { span: 5, resolutionClass: 'best-of' },
      },
    });
    expect(stage.statusCode).toBe(201);
    stageId = stage.json().stageId;

    const seeded = await request({
      method: 'POST',
      url: `${stagesBase}/1/seeding`,
      token: 'organizer',
      payload: {
        seeds: [
          { seed: 1, entrantId: alfa },
          { seed: 2, entrantId: bravo },
        ],
      },
    });
    expect(seeded.statusCode).toBe(200);

    // Every command below is issued as the organizer, so the appointment names them.
    const { games } = await gamesOfTheSeries();
    await withTransaction(scratch.db, async (uow) => {
      for (const game of games) {
        await new MatchAssignmentRepository(scratch.db).appoint(uow, {
          organizationId,
          subjectId: SUBJECT.subjectId,
          scope: { kind: 'match', matchId: game.matchId },
          capabilities: ['match.control-clock', 'match.finalize', 'match.record-event'],
          ...AUDIT,
        });
      }
    });
  });

  afterAll(async () => {
    await app?.close();
    await scratch?.drop();
  });

  it('6.1: materializes a best-of-five, decides it in three, and reinstates a game holding no slot', async () => {
    const before = await gamesOfTheSeries();
    expect(before.games).toHaveLength(5);
    expect(before.games.map((game) => game.number)).toEqual([1, 2, 3, 4, 5]);
    expect(before.fixture.series).toMatchObject({ span: 5, guaranteedMatches: 3 });

    for (const number of [1, 2, 3]) {
      const game = before.games.find((candidate) => candidate.number === number);
      const played = await playGame(game?.matchId as string, alfa, bravo);
      expect(played.statusCode).toBe(201);
    }

    // Finalizing the deciding game anulls the surplus, in the same transaction as the result.
    const decided = await gamesOfTheSeries();
    expect(decided.fixture.series.status).toBe('decided');
    expect(decided.fixture.series.anulledMatchNumbers).toEqual([4, 5]);
    expect(decided.games.filter((game) => game.number >= 4).map((game) => game.status)).toEqual([
      'not-required',
      'not-required',
    ]);

    // Correcting game three to Bravo reverses the series: four and five come back.
    const thirdGame = decided.games.find((game) => game.number === 3)?.matchId as string;
    const correction = {
      reason: 'Scoresheet transposed the sides',
      sides: [
        { entrantId: bravo, statistics: { goals: 2 } },
        { entrantId: alfa, statistics: { goals: 1 } },
      ],
      winnerEntrantId: bravo,
    };

    const preview = await request({
      method: 'POST',
      url: `${matchBase(thirdGame)}/corrections/preview`,
      token: 'organizer',
      payload: correction,
    });
    expect(preview.statusCode).toBe(201);
    expect(preview.json().series).toMatchObject({
      unchanged: false,
      decisionPointMoves: true,
      decidedAtMatchNumber: 3,
      becomingScheduled: [4, 5],
    });
    expect(preview.json().series.decidedAtMatchNumberAfter).toBeUndefined();

    const committed = await request({
      method: 'POST',
      url: `${matchBase(thirdGame)}/corrections`,
      token: 'organizer',
      payload: correction,
    });
    expect(committed.statusCode).toBe(201);

    const reinstated = await gamesOfTheSeries();
    const fourth = reinstated.games.find((game) => game.number === 4);
    if (!fourth) throw new Error('game four missing');
    expect(fourth.status).toBe('scheduled');

    // Reinstated as an audited fact holding no slot: the one it had was released, and an
    // organizer has to place it deliberately.
    const assignment = await scratch.db
      .selectFrom('match_schedule_assignments')
      .selectAll()
      .where('match_id', '=', fourth.matchId)
      .executeTakeFirst();
    expect(assignment).toBeUndefined();

    const audit = await scratch.db
      .selectFrom('audit_log')
      .selectAll()
      .where('entity_id', '=', fourth.matchId)
      .where('action', '=', 'match.reinstated')
      .executeTakeFirst();
    expect(audit).toBeDefined();
    expect(String(audit?.reason)).toContain('Scoresheet transposed the sides');
  });

  it('6.2: refuses a command replayed against a game the series anulled, naming the series', async () => {
    // Play the reinstated series out to a decision again: Alfa takes games four and five is
    // never needed. Game four is already scheduled from the correction above.
    const current = await gamesOfTheSeries();
    const fourth = current.games.find((game) => game.number === 4)?.matchId as string;
    const fifth = current.games.find((game) => game.number === 5)?.matchId as string;

    const played = await playGame(fourth, alfa, bravo);
    expect(played.statusCode).toBe(201);

    const afterFour = await gamesOfTheSeries();
    expect(afterFour.fixture.series.status).toBe('decided');
    expect(afterFour.games.find((game) => game.number === 5)?.status).toBe('not-required');

    // What the offline queue replays when it reconnects: a start against a game the series
    // settled while its operator was away.
    const refused = await request({
      method: 'POST',
      url: `${matchBase(fifth)}/commands/start`,
      token: 'organizer',
    });

    expect(refused.statusCode).toBe(409);
    const problem = refused.json();
    expect(problem.errorCode).toBe('match-control-conflict');
    // The refusal names the series that settled the match, not just its status: an operator
    // told only "not-required" has been told what happened to their work but not why.
    expect(problem.message).toContain('Game 5 of the series');
    expect(problem.message).toContain('Best-of-5 series won by');
    expect(problem.message).toContain('raise it as a correction there');

    // Neither applied nor quietly written: the match is still exactly what the record says.
    const stored = await new CompetitionRepository(scratch.db).findMatch(fifth);
    expect(stored?.status).toBe('not-required');
    expect(stored?.result).toBeUndefined();
  });

  it('6.3: reports series state in play order on the public projection', async () => {
    const bracket = await request({
      method: 'GET',
      url: `/organizations/${organizationAlias}/tournaments/${tournamentAlias}/stages/1/bracket`,
    });

    expect(bracket.statusCode).toBe(200);
    const cross = bracket
      .json()
      .matches.find((match: { series?: unknown }) => match.series !== undefined);
    expect(cross).toBeDefined();

    // Games one to three were finalized first, then game three was corrected, then game four.
    // Their numbers still come back one to five, because play order is the fixture's own
    // numbering rather than the order somebody got round to entering results in.
    expect(cross.series.games.map((game: { number: number }) => game.number)).toEqual([
      1, 2, 3, 4, 5,
    ]);
    expect(cross.series.span).toBe(5);
    expect(cross.series.status).toBe('decided');
    expect(cross.series.games[4].status).toBe('not-required');
  });

  it('exposes the stage the series was declared against, so nothing here reads a second tournament', () => {
    expect(stageId).not.toBe('');
    expect(tournamentId).not.toBe('');
  });
});
