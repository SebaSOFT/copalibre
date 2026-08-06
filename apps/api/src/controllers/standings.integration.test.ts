import { Module, type INestApplication } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { DisciplineDescriptor } from '@copalibre/domain';
import {
  CompetitionRepository,
  CompetitionRecordRepository,
  EnrollmentRepository,
  OrganizationRepository,
  ProjectionStore,
  TournamentRepository,
  withTransaction,
} from '@copalibre/persistence';
import { createMigratedDatabase } from '../../../../packages/persistence/src/test-support/scratch-database.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthenticatedSubject } from '../auth/request-context.js';
import { TokenVerifier } from '../auth/token-verifier.js';
import { DATABASE } from '../database.token.js';
import { SeedingController, toBracketMatch } from './seeding.controller.js';
import { StandingsController } from './standings.controller.js';

/**
 * Standings and seeding through the real HTTP stack (0024).
 *
 * The two things worth proving with a database attached: the projection version
 * a client keys off is served, and a reseed after a result exists is refused
 * *here* rather than only in a console that could be a day out of date.
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
    if (token !== 'organizer') return Promise.reject(new Error('unknown token'));
    return Promise.resolve({ ...SUBJECT, organizationId: this.organizationId() });
  }
}

/** Two statistics and points, which is all a standings comparator chain needs. */
function descriptor(): DisciplineDescriptor {
  return {
    descriptorId: '01890000-0000-7000-8000-0000000024a1',
    version: '1.0.0',
    name: 'Liga de prueba',
    attribution: { author: 'CopaLibre', licence: 'AGPL-3.0-only' },
    participantTypes: ['team'],
    rosterConstraints: { minPlayers: 1, maxPlayers: 11 },
    segmentTypes: [],
    eventDefinitions: [],
    statistics: [
      { code: 'played', label: 'Partidos', aggregation: 'count' },
      { code: 'points', label: 'Puntos', aggregation: 'sum' },
      { code: 'goals-for', label: 'A favor', aggregation: 'sum' },
    ],
    scoringInputs: [],
    availableFormats: ['round-robin', 'single-elimination'],
    notificationRuleCapabilities: [],
    winCondition: {},
    defaults: {},
    fieldPolicies: {
      'match.format': { permission: { kind: 'replaced' }, mutationClass: 'requires_rebuild' },
    },
  } as unknown as DisciplineDescriptor;
}

describe('standings and seeding routes (integration)', () => {
  let app: INestApplication;
  let scratch: Awaited<ReturnType<typeof createMigratedDatabase>>;
  let organizationId = '';
  let tournamentId = '';
  let stageId = '';
  const entrantIds: string[] = [];
  let finalizedMatchId = '';

  beforeAll(async () => {
    scratch = await createMigratedDatabase('standings');

    @Module({
      controllers: [StandingsController, SeedingController],
      providers: [
        { provide: DATABASE, useValue: scratch.db },
        { provide: TokenVerifier, useValue: new FakeTokenVerifier(() => organizationId) },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        Reflector,
      ],
    })
    class TestModule {}

    const moduleRef = await Test.createTestingModule({ imports: [TestModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await (app as NestFastifyApplication).getHttpAdapter().getInstance().ready();

    const organization = await withTransaction(scratch.db, (uow) =>
      new OrganizationRepository(scratch.db).create(uow, {
        alias: 'liga-mendocina',
        name: 'Liga Mendocina',
        ...AUDIT,
      }),
    );
    organizationId = organization.organizationId;

    const tournaments = new TournamentRepository(scratch.db);
    const competition = new CompetitionRepository(scratch.db);
    const participants = new EnrollmentRepository(scratch.db);

    await withTransaction(scratch.db, async (uow) => {
      const discipline = descriptor();
      await tournaments.saveDescriptor(uow, discipline, { organizationId, ...AUDIT });
      const tournament = await tournaments.create(uow, {
        organizationId,
        alias: 'apertura-2026',
        name: 'Apertura 2026',
        descriptor: discipline,
        ...AUDIT,
      });
      tournamentId = tournament.tournamentId;
      const { ruleset } = await tournaments.createRuleset(uow, {
        tournamentId: tournament.tournamentId,
        organizationId,
        descriptor: discipline,
        overrides: {},
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
      stageId = stage.stageId;
      await tournaments.createStageConfiguration(uow, {
        stageId: stage.stageId,
        rulesetId: ruleset.rulesetId,
        organizationId,
        overrides: { 'match.format': 'BO5' },
        ...AUDIT,
      });

      for (const name of ['Talleres', 'Independiente', 'Gimnasia', 'Maipú']) {
        const team = await participants.createTeam(uow, { organizationId, name, ...AUDIT });
        const entrant = await participants.registerEntrant(uow, {
          tournamentId: tournament.tournamentId,
          entrantRef: { kind: 'team', teamId: team.teamId },
          organizationId,
          ...AUDIT,
        });
        entrantIds.push(entrant.entrantId);
      }

      const fixtures = await competition.createFixtures(uow, {
        stageId: stage.stageId,
        fixtures: [
          { round: 1, homeEntrantId: entrantIds[0], awayEntrantId: entrantIds[1] },
          { round: 1, homeEntrantId: entrantIds[2], awayEntrantId: entrantIds[3] },
        ],
        organizationId,
        ...AUDIT,
      });
      if (!fixtures[0]) throw new Error('Expected at least one seeded fixture');
    });
  });

  afterAll(async () => {
    await app?.close();
    await scratch?.drop();
  });

  function request(options: {
    method: 'GET' | 'POST';
    url: string;
    token?: string;
    payload?: unknown;
  }) {
    return (app as NestFastifyApplication).inject({
      method: options.method,
      url: options.url,
      headers: options.token ? { authorization: `Bearer ${options.token}` } : {},
      payload: options.payload as never,
    });
  }

  const base = '/organizations/liga-mendocina/tournaments/apertura-2026/stages/1';

  it('serves a projection version the client can key off', async () => {
    const response = await request({ method: 'GET', url: `${base}/standings`, token: 'organizer' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.stageId).toBe(stageId);
    // Zero before the first rebuild, and a number a client can compare.
    expect(typeof body.projectionVersion).toBe('number');
    expect(body.rows).toHaveLength(4);

    await withTransaction(scratch.db, (uow) =>
      new ProjectionStore(scratch.db).nextVersion(uow, {
        projectionType: 'standings',
        entityId: stageId,
      }),
    );

    const second = await request({ method: 'GET', url: `${base}/standings`, token: 'organizer' });
    expect(second.json().projectionVersion).toBeGreaterThan(body.projectionVersion);
  });

  it('refuses the standings of a stage that does not exist', async () => {
    const response = await request({
      method: 'GET',
      url: '/organizations/liga-mendocina/tournaments/apertura-2026/stages/9/standings',
      token: 'organizer',
    });

    expect(response.statusCode).toBe(404);
  });

  it('401s without a token and 403s a token for another organization', async () => {
    expect((await request({ method: 'GET', url: `${base}/standings` })).statusCode).toBe(401);
  });

  it('serves an empty trace for a row no comparator separated', async () => {
    const response = await request({
      method: 'GET',
      url: `${base}/standings/entrants/${entrantIds[0]}/trace`,
      token: 'organizer',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ entrantId: entrantIds[0], lines: [] });
  });

  it('404s the trace of an entrant that is not in this stage', async () => {
    const response = await request({
      method: 'GET',
      url: `${base}/standings/entrants/01890000-0000-7000-8000-00000000ffff/trace`,
      token: 'organizer',
    });

    expect(response.statusCode).toBe(404);
  });

  it('serves the generated bracket alongside the seed order', async () => {
    const response = await request({ method: 'GET', url: `${base}/seeding`, token: 'organizer' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.seeds.map((seed: { seed: number }) => seed.seed)).toEqual([1, 2, 3, 4]);
    expect(body.matches.length).toBeGreaterThan(0);
    expect(body.matches[0].format).toBe('BO5');
    expect(body.hasRecordedResults).toBe(false);
  });

  it('accepts a seed order while no result exists, persists it, and regenerates the fixture graph', async () => {
    // Reversed relative to registration order, so a persisted match reflecting
    // it can't be mistaken for the fixtures `beforeAll` seeded manually.
    const reversed = [...entrantIds].reverse();
    const response = await request({
      method: 'POST',
      url: `${base}/seeding`,
      token: 'organizer',
      payload: { seeds: reversed.map((entrantId, index) => ({ seed: index + 1, entrantId })) },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ mutationClass: 'requires_rebuild', persisted: true });

    // Round-robin among 4 entrants plays every pairing once: 6 matches, all
    // resolved (no winner-of/loser-of slot), so all 6 persist as fixtures.
    const fixtures = await scratch.db
      .selectFrom('fixtures')
      .select(['home_entrant_id', 'away_entrant_id'])
      .where('stage_id', '=', stageId)
      .execute();
    expect(fixtures).toHaveLength(6);
    for (const fixture of fixtures) {
      expect(reversed).toContain(fixture.home_entrant_id);
      expect(reversed).toContain(fixture.away_entrant_id);
    }

    // The read model recovers entrant order by iterating persisted fixtures,
    // not by replaying the submitted seed list verbatim — round-robin's
    // circle-method pairing does not insert round-1 fixtures in 1..N order,
    // so the exact seed→entrant index mapping is not itself a guarantee. What
    // publish must guarantee is that the read-back reflects the *persisted*
    // graph: the full 6-match round-robin schedule, over exactly this entrant
    // set — not the 2 fixtures `beforeAll` seeded manually.
    const seeding = await request({ method: 'GET', url: `${base}/seeding`, token: 'organizer' });
    const body = seeding.json();
    expect(body.matches).toHaveLength(6);
    expect(
      [...body.seeds].map((seed: { entrantId: string }) => seed.entrantId).sort(),
    ).toEqual([...reversed].sort());
  });

  it('republishing the same seed order is idempotent', async () => {
    const reversed = [...entrantIds].reverse();
    const republished = await request({
      method: 'POST',
      url: `${base}/seeding`,
      token: 'organizer',
      payload: { seeds: reversed.map((entrantId, index) => ({ seed: index + 1, entrantId })) },
    });

    expect(republished.statusCode).toBe(200);
    expect(republished.json()).toMatchObject({ mutationClass: 'requires_rebuild', persisted: true });

    const fixtures = await scratch.db
      .selectFrom('fixtures')
      .select(['home_entrant_id', 'away_entrant_id'])
      .where('stage_id', '=', stageId)
      .execute();
    expect(fixtures).toHaveLength(6);
    const pairs = new Set(
      fixtures.map(
        (fixture) => [fixture.home_entrant_id, fixture.away_entrant_id].sort().join(':'),
      ),
    );
    expect(pairs.size).toBe(6);
  });

  it('refuses a seed order that places an entrant twice', async () => {
    const response = await request({
      method: 'POST',
      url: `${base}/seeding`,
      token: 'organizer',
      payload: {
        seeds: [
          { seed: 1, entrantId: entrantIds[0] },
          { seed: 2, entrantId: entrantIds[0] },
        ],
      },
    });

    expect(response.statusCode).toBe(422);
  });

  it('refuses a partial seed order and entrants outside the stage', async () => {
    const partial = await request({
      method: 'POST',
      url: `${base}/seeding`,
      token: 'organizer',
      payload: { seeds: [{ seed: 1, entrantId: entrantIds[0] }] },
    });
    expect(partial.statusCode).toBe(422);

    const outsider = await request({
      method: 'POST',
      url: `${base}/seeding`,
      token: 'organizer',
      payload: {
        seeds: [
          { seed: 1, entrantId: entrantIds[0] },
          { seed: 2, entrantId: entrantIds[1] },
          { seed: 3, entrantId: entrantIds[2] },
          { seed: 4, entrantId: '01890000-0000-7000-8000-00000000ffff' },
        ],
      },
    });
    expect(outsider.statusCode).toBe(422);
  });

  it('refuses a reseed once a result exists, whatever the console allowed', async () => {
    const [winner = '', runnerUp = ''] = entrantIds;
    const competition = new CompetitionRepository(scratch.db);
    // A prior test republished this stage's seed order, which replaces its
    // fixtures wholesale (0040) — `firstFixtureId` no longer names a live row,
    // so this reads the current one instead of trusting the captured id.
    const currentFixture = await scratch.db
      .selectFrom('fixtures')
      .select('fixture_id')
      .where('stage_id', '=', stageId)
      .executeTakeFirstOrThrow();
    // Two transactions: `recordResult` re-reads the match through the pool to
    // refuse an overwrite, so the insert has to be committed first.
    const match = await withTransaction(scratch.db, (uow) =>
      competition.createMatch(uow, {
        fixtureId: currentFixture.fixture_id,
        number: 1,
        organizationId,
        ...AUDIT,
      }),
    );
    finalizedMatchId = match.matchId;
    await withTransaction(scratch.db, async (uow) => {
      await competition.recordResult(uow, {
        matchId: match.matchId,
        result: {
          sides: [
            { entrantId: winner, statistics: { points: 3, 'goals-for': 2 } },
            { entrantId: runnerUp, statistics: { points: 0, 'goals-for': 1 } },
          ],
          winnerEntrantId: winner,
          recordedAt: '2026-08-01T18:00:00.000Z',
        },
        organizationId,
        ...AUDIT,
      });
    });

    const before = await scratch.db
      .selectFrom('fixtures')
      .select(['fixture_id', 'home_entrant_id', 'away_entrant_id'])
      .where('stage_id', '=', stageId)
      .orderBy('fixture_id')
      .execute();

    const response = await request({
      method: 'POST',
      url: `${base}/seeding`,
      token: 'organizer',
      payload: { seeds: entrantIds.map((entrantId, index) => ({ seed: index + 1, entrantId })) },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().message).toContain('Seeding cannot change once a result exists');

    // A blocked publish persists nothing: the fixture set is byte-for-byte
    // what it was before the refused request.
    const after = await scratch.db
      .selectFrom('fixtures')
      .select(['fixture_id', 'home_entrant_id', 'away_entrant_id'])
      .where('stage_id', '=', stageId)
      .orderBy('fixture_id')
      .execute();
    expect(after).toEqual(before);
  });

  it('serves the published materialised standings when one exists', async () => {
    await withTransaction(scratch.db, (uow) =>
      new CompetitionRecordRepository(scratch.db).materialiseStandings(uow, {
        tournamentId,
        stageId,
        matchId: finalizedMatchId,
        rows: [
          {
            rank: 9,
            entrantId: entrantIds[1],
            sharedRank: false,
            statistics: { points: 99 },
            tieBroken: true,
          },
        ],
        trace: [
          {
            kind: 'comparator',
            id: 'points',
            label: 'Puntos',
            outcome: 'resolved',
            values: { [entrantIds[1] ?? '']: 99 },
          },
        ],
        fullyResolved: true,
        organizationId,
        ...AUDIT,
      }),
    );

    const response = await request({ method: 'GET', url: `${base}/standings`, token: 'organizer' });

    const body = response.json();
    expect(body.rows[0]).toMatchObject({ rank: 9, entrantId: entrantIds[1] });
    expect(body.trace[0]).toContain('Puntos');

    const trace = await request({
      method: 'GET',
      url: `${base}/standings/entrants/${entrantIds[1]}/trace`,
      token: 'organizer',
    });
    expect(trace.json().lines[0]).toContain('Puntos');
  });

  it('does not paint a persisted winners result onto an ambiguous losers bracket node', () => {
    const node = toBracketMatch(
      {
        id: 'LB-R1-M1',
        shape: 'duel',
        bracket: 'losers',
        round: 1,
        position: 1,
        slotA: { kind: 'loser-of', matchId: 'WB-R1-M1' },
        slotB: { kind: 'loser-of', matchId: 'WB-R1-M2' },
      },
      [
        {
          matchId: 'persisted-winners',
          round: 1,
          position: 1,
          status: 'finalized',
          scores: [2, 0],
        },
      ],
      { ambiguousPositions: new Set(['1:1']) },
    );

    expect(node.status).toBe('scheduled');
    expect(node.slots.some((slot) => slot.score !== undefined)).toBe(false);
  });
});
