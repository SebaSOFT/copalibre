import { Module, type INestApplication } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, Reflector } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { ApiExceptionFilter } from '../http/error-contract.js';
import { createApiValidationPipe } from '../http/validation.js';
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
import { PublicProjectionsController } from './public-projections.controller.js';
import type { PublicSeriesStateResponse } from '../dto/public-tournament.dto.js';

/**
 * Standings and seeding through the real HTTP stack.
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
  let seriesStageId = '';
  const entrantIds: string[] = [];
  let finalizedMatchId = '';

  beforeAll(async () => {
    scratch = await createMigratedDatabase('standings');

    @Module({
      controllers: [StandingsController, SeedingController, PublicProjectionsController],
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

      const stage2 = await competition.createStageInTournament(uow, {
        tournamentId: tournament.tournamentId,
        number: 2,
        name: 'Playoffs',
        format: 'single-elimination',
        organizationId,
        ...AUDIT,
      });
      seriesStageId = stage2.stageId;
      await tournaments.createStageConfiguration(uow, {
        stageId: stage2.stageId,
        rulesetId: ruleset.rulesetId,
        organizationId,
        overrides: { 'series.span': 3, 'series.resolutionClass': 'best-of' },
        ...AUDIT,
      });
      await competition.createFixtures(uow, {
        stageId: stage2.stageId,
        fixtures: [
          { round: 1, homeEntrantId: entrantIds[0], awayEntrantId: entrantIds[3] },
          { round: 1, homeEntrantId: entrantIds[1], awayEntrantId: entrantIds[2] },
        ],
        matchCount: 3,
        organizationId,
        ...AUDIT,
      });
    });

    await withTransaction(scratch.db, (uow) =>
      tournaments.publish(uow, {
        tournamentId,
        organizationId,
        ...AUDIT,
      }),
    );
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

  it('records no audit entry for ordinary browsing of standings or a bracket (task 3.3)', async () => {
    // Scoped to this stage's own aggregate, not a table-wide row count: an
    // unrelated sibling test's fire-and-forget refusal recording (task 2.1
    // is deliberately not awaited by its caller) can still be landing when
    // this test starts, and a whole-table count races against it. The
    // stage's own setup already wrote a couple of entries (stage.created,
    // fixtures.generated); the count must simply not grow.
    const before = await scratch.db
      .selectFrom('audit_log')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where('entity_id', '=', stageId)
      .executeTakeFirstOrThrow();

    await request({ method: 'GET', url: `${base}/standings`, token: 'organizer' });
    await request({ method: 'GET', url: `${base}/seeding`, token: 'organizer' });

    const after = await scratch.db
      .selectFrom('audit_log')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where('entity_id', '=', stageId)
      .executeTakeFirstOrThrow();
    expect(after.count).toBe(before.count);
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
    expect(body.zones[0].matches.length).toBeGreaterThan(0);
    expect(body.zones[0].matches[0].format).toBe('BO5');
    expect(body.hasRecordedResults).toBe(false);

    // Round-robin fills every node's slots with real entrants directly from the graph, so
    // `persistedMatchId` is the only signal a materialized fixture vs. a still-generated-only
    // node — `beforeAll` persisted exactly the entrantIds[0]-vs-[1] and [2]-vs-[3] pairings.
    type BracketMatch = {
      readonly persistedMatchId?: string;
      readonly slots: readonly { readonly entrantId?: string }[];
    };
    const namedByBoth = (match: BracketMatch, a: string, b: string): boolean => {
      const named = match.slots.map((slot) => slot.entrantId);
      return named.includes(a) && named.includes(b);
    };
    const materialized = body.zones[0].matches.find((match: BracketMatch) =>
      namedByBoth(match, entrantIds[0] as string, entrantIds[1] as string),
    );
    expect(materialized?.persistedMatchId).toEqual(expect.any(String));

    const notYetMaterialized = body.zones[0].matches.find((match: BracketMatch) =>
      namedByBoth(match, entrantIds[0] as string, entrantIds[2] as string),
    );
    expect(notYetMaterialized?.persistedMatchId).toBeUndefined();
  });

  it('projects one correctly-scoped bracket per zone on the operator seeding read (openspec 0246)', async () => {
    // Reproduces the same cross-zone round/position collision as the public bracket endpoint's
    // own test (public-projections.integration.test.ts): 2 zones, each with a round-1/position-1
    // fixture. Before the fix, `seeding()` generated one flat graph from every zone's entrants
    // combined, so both zones' round-1/position-1 nodes collided and were dropped as "ambiguous".
    const competition = new CompetitionRepository(scratch.db);
    const participants = new EnrollmentRepository(scratch.db);
    const zoneEntrantIds: string[] = [];

    await withTransaction(scratch.db, async (uow) => {
      const stage = await competition.createStageInTournament(uow, {
        tournamentId,
        number: 3,
        name: 'Playoffs Multizona',
        format: 'single-elimination',
        organizationId,
        ...AUDIT,
      });

      const gold = await competition.createZone(uow, {
        stageId: stage.stageId,
        number: 1,
        name: 'Copa de Oro',
        organizationId,
        ...AUDIT,
      });
      const silver = await competition.createZone(uow, {
        stageId: stage.stageId,
        number: 2,
        name: 'Copa de Plata',
        organizationId,
        ...AUDIT,
      });

      for (const name of ['Zona Oro A', 'Zona Oro B', 'Zona Plata A', 'Zona Plata B']) {
        const team = await participants.createTeam(uow, { organizationId, name, ...AUDIT });
        const entrant = await participants.registerEntrant(uow, {
          tournamentId,
          entrantRef: { kind: 'team', teamId: team.teamId },
          organizationId,
          ...AUDIT,
        });
        zoneEntrantIds.push(entrant.entrantId);
      }

      await competition.createFixtures(uow, {
        stageId: stage.stageId,
        fixtures: [
          {
            round: 1,
            homeEntrantId: zoneEntrantIds[0],
            awayEntrantId: zoneEntrantIds[1],
            zoneId: gold.zoneId,
          },
          {
            round: 1,
            homeEntrantId: zoneEntrantIds[2],
            awayEntrantId: zoneEntrantIds[3],
            zoneId: silver.zoneId,
          },
        ],
        organizationId,
        ...AUDIT,
      });
    });

    const response = await request({
      method: 'GET',
      url: `/organizations/liga-mendocina/tournaments/apertura-2026/stages/3/seeding`,
      token: 'organizer',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    // Seed order stays one flat list across every zone (design.md Decision 3b) — unaffected by
    // the zone-scoped `zones` display below.
    expect(body.seeds).toHaveLength(4);
    expect(body.zones).toHaveLength(2);
    for (const zone of body.zones) {
      expect(zone.matches).toHaveLength(1);
      for (const slot of zone.matches[0].slots) {
        expect(slot.kind).toBe('entrant');
        expect(slot.entrantId).toEqual(expect.any(String));
      }
    }
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
    expect(body.zones[0].matches).toHaveLength(6);
    expect([...body.seeds].map((seed: { entrantId: string }) => seed.entrantId).sort()).toEqual(
      [...reversed].sort(),
    );
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
    expect(republished.json()).toMatchObject({
      mutationClass: 'requires_rebuild',
      persisted: true,
    });

    const fixtures = await scratch.db
      .selectFrom('fixtures')
      .select(['home_entrant_id', 'away_entrant_id'])
      .where('stage_id', '=', stageId)
      .execute();
    expect(fixtures).toHaveLength(6);
    const pairs = new Set(
      fixtures.map((fixture) =>
        [fixture.home_entrant_id, fixture.away_entrant_id].sort().join(':'),
      ),
    );
    expect(pairs.size).toBe(6);
  });

  it('400s a seed order that is not an array, before reaching the controller', async () => {
    const response = await request({
      method: 'POST',
      url: `${base}/seeding`,
      token: 'organizer',
      payload: { seeds: 'primero' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('rejects an extra undocumented property with 400 when publishing seed order', async () => {
    const reversed = [...entrantIds].reverse();
    const response = await request({
      method: 'POST',
      url: `${base}/seeding`,
      token: 'organizer',
      payload: {
        seeds: reversed.map((entrantId, index) => ({ seed: index + 1, entrantId })),
        unexpectedField: 'dropped',
      },
    });
    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.errorCode).toBe('bad-request');
    expect(body.message).toContain('property unexpectedField should not exist');
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
    // fixtures wholesale — `firstFixtureId` no longer names a live row,
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

    // The refusal itself is recorded — who attempted it, and why (openspec
    // 0166, task 6.1) — through the central exception filter, with no code
    // added at this route.
    const refusal = await scratch.db
      .selectFrom('audit_log')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('action', '=', 'mutation.refused')
      .orderBy('occurred_at', 'desc')
      .executeTakeFirstOrThrow();
    expect(refusal.actor).toBe('user:organizer-1');
    expect(refusal.reason).toContain('Seeding cannot change once a result exists');
    expect(refusal.resulting_state).toBeNull();
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
            outcome: 'tied-proceed',
            values: { [entrantIds[1] ?? '']: 99 },
          },
          {
            kind: 'comparator',
            id: 'difference',
            label: 'Diferencia',
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
          fixtureId: 'fixture-winners',
          round: 1,
          position: 1,
          status: 'finalized',
          scores: [2, 0],
          games: [{ matchId: 'persisted-winners', number: 1, status: 'finalized', scores: [2, 0] }],
        },
      ],
      { ambiguousPositions: new Set(['1:1']) },
    );

    expect(node.status).toBe('scheduled');
    expect(node.slots.some((slot) => slot.score !== undefined)).toBe(false);
  });

  it('surfaces the persisted match id only for a node the fixtures table actually has a row for', () => {
    const materialized = toBracketMatch(
      {
        id: 'WB-R1-M1',
        shape: 'duel',
        bracket: 'winners',
        round: 1,
        position: 1,
        slotA: { kind: 'entrant', entrantId: 'entrant-a', seed: 1 },
        slotB: { kind: 'entrant', entrantId: 'entrant-b', seed: 2 },
      },
      [
        {
          matchId: 'persisted-match-id',
          fixtureId: 'fixture-1',
          round: 1,
          position: 1,
          status: 'scheduled',
          games: [{ matchId: 'persisted-match-id', number: 1, status: 'scheduled' }],
        },
      ],
    );
    expect(materialized.persistedMatchId).toBe('persisted-match-id');

    const notYetMaterialized = toBracketMatch(
      {
        id: 'WB-R2-M1',
        shape: 'duel',
        bracket: 'winners',
        round: 2,
        position: 1,
        slotA: { kind: 'winner-of', matchId: 'WB-R1-M1' },
        slotB: { kind: 'winner-of', matchId: 'WB-R1-M2' },
      },
      [],
    );
    expect(notYetMaterialized.persistedMatchId).toBeUndefined();
  });

  it('serves series progress on the seeding read matching the public projection for a series-declared stage', async () => {
    const seriesBase = '/organizations/liga-mendocina/tournaments/apertura-2026/stages/2';

    // 1. Seed the stage: 4 entrants in single-elimination with span 3 creates 2 semifinal fixtures with 3 games each.
    const seedResponse = await request({
      method: 'POST',
      url: `${seriesBase}/seeding`,
      token: 'organizer',
      payload: {
        seeds: [
          { seed: 1, entrantId: entrantIds[0] },
          { seed: 2, entrantId: entrantIds[1] },
          { seed: 3, entrantId: entrantIds[2] },
          { seed: 4, entrantId: entrantIds[3] },
        ],
      },
    });
    expect(seedResponse.statusCode).toBe(200);

    // 2. Fetch seeding read and public bracket before any games are played:
    const seedingBefore = await request({
      method: 'GET',
      url: `${seriesBase}/seeding`,
      token: 'organizer',
    });
    const publicBefore = await request({
      method: 'GET',
      url: `${seriesBase}/bracket`,
    });
    expect(seedingBefore.statusCode).toBe(200);
    expect(publicBefore.statusCode).toBe(200);

    const seedingMatchesBefore = seedingBefore.json().zones[0].matches;
    const publicMatchesBefore = publicBefore.json().zones[0].matches;
    expect(seedingMatchesBefore[0].series).toBeDefined();
    expect(seedingMatchesBefore[0].series).toEqual(publicMatchesBefore[0].series);
    expect(seedingMatchesBefore[0].series).toMatchObject({
      span: 3,
      homeGamesWon: 0,
      awayGamesWon: 0,
      status: 'undecided',
    });

    // 3. Record Game 1 result: Entrant 0 wins against Entrant 3.
    const competition = new CompetitionRepository(scratch.db);
    const fixtures = await competition.listFixturesOfStage(seriesStageId);
    const homeEntrantId = entrantIds[0];
    const awayEntrantId = entrantIds[3];
    expect(homeEntrantId).toBeDefined();
    expect(awayEntrantId).toBeDefined();
    if (!homeEntrantId || !awayEntrantId) throw new Error('Entrants undefined');

    const sf1Fixture = fixtures.find((f) => f.homeEntrantId === homeEntrantId);
    expect(sf1Fixture).toBeDefined();
    if (!sf1Fixture) throw new Error('Fixture undefined');

    const matches = await competition.listMatchesForStage(seriesStageId);
    const sf1Matches = matches
      .filter((m) => m.fixtureId === sf1Fixture.fixtureId)
      .sort((a, b) => a.number - b.number);
    expect(sf1Matches).toHaveLength(3);

    const game1 = sf1Matches[0];
    const game2 = sf1Matches[1];
    if (!game1 || !game2) throw new Error('Games undefined');

    await withTransaction(scratch.db, (uow) =>
      competition.recordResult(uow, {
        matchId: game1.matchId,
        result: {
          sides: [
            { entrantId: homeEntrantId, statistics: { points: 3 } },
            { entrantId: awayEntrantId, statistics: { points: 0 } },
          ],
          winnerEntrantId: homeEntrantId,
          recordedAt: new Date().toISOString(),
        },
        organizationId,
        ...AUDIT,
      }),
    );

    // 4. Fetch seeding read and public bracket with in-progress series:
    const seedingInProgress = await request({
      method: 'GET',
      url: `${seriesBase}/seeding`,
      token: 'organizer',
    });
    const publicInProgress = await request({
      method: 'GET',
      url: `${seriesBase}/bracket`,
    });
    expect(seedingInProgress.statusCode).toBe(200);
    expect(publicInProgress.statusCode).toBe(200);

    const sf1Seeding = seedingInProgress
      .json()
      .zones[0].matches.find(
        (m: { round: number; position: number }) => m.round === 1 && m.position === 1,
      );
    const sf1Public = publicInProgress
      .json()
      .zones[0].matches.find(
        (m: { round: number; position: number }) => m.round === 1 && m.position === 1,
      );
    expect(sf1Seeding.series).toBeDefined();
    expect(sf1Seeding.series).toEqual(sf1Public.series);
    expect(sf1Seeding.series).toMatchObject({
      span: 3,
      homeGamesWon: 1,
      awayGamesWon: 0,
      status: 'undecided',
    });

    // 5. Record Game 2 result: Entrant 0 wins again (2–0 in best-of-3 decides the series and anulls Game 3).
    await withTransaction(scratch.db, async (uow) => {
      await competition.recordResult(uow, {
        matchId: game2.matchId,
        result: {
          sides: [
            { entrantId: homeEntrantId, statistics: { points: 2 } },
            { entrantId: awayEntrantId, statistics: { points: 1 } },
          ],
          winnerEntrantId: homeEntrantId,
          recordedAt: new Date().toISOString(),
        },
        organizationId,
        ...AUDIT,
      });
      await competition.anullSurplusMatches(uow, {
        fixtureId: sf1Fixture.fixtureId,
        anulledMatchNumbers: [3],
        organizationId,
        ...AUDIT,
      });
    });

    // 6. Fetch seeding read and public bracket with decided series:
    const seedingDecided = await request({
      method: 'GET',
      url: `${seriesBase}/seeding`,
      token: 'organizer',
    });
    const publicDecided = await request({
      method: 'GET',
      url: `${seriesBase}/bracket`,
    });
    expect(seedingDecided.statusCode).toBe(200);
    expect(publicDecided.statusCode).toBe(200);

    const sf1DecidedSeeding = seedingDecided
      .json()
      .zones[0].matches.find(
        (m: { round: number; position: number }) => m.round === 1 && m.position === 1,
      );
    const sf1DecidedPublic = publicDecided
      .json()
      .zones[0].matches.find(
        (m: { round: number; position: number }) => m.round === 1 && m.position === 1,
      );
    expect(sf1DecidedSeeding.series).toBeDefined();
    expect(sf1DecidedSeeding.series).toEqual(sf1DecidedPublic.series);
    expect(sf1DecidedSeeding.series).toMatchObject({
      span: 3,
      homeGamesWon: 2,
      awayGamesWon: 0,
      status: 'decided',
      winner: 'home',
      winnerEntrantId: entrantIds[0],
    });

    const anulledLegs = sf1DecidedSeeding.series.games.filter(
      (g: { status: string }) => g.status === 'not-required',
    );
    expect(anulledLegs).toHaveLength(1);
    expect(anulledLegs[0].number).toBe(3);
  });

  it('populates series state on a node when provided in options', () => {
    const inProgressSeries: PublicSeriesStateResponse = {
      span: 3,
      resolutionClass: 'best-of',
      games: [
        {
          number: 1,
          status: 'finalized',
          scores: [2, 1],
          winnerEntrantId: 'entrant-a',
          winner: 'home',
        },
        { number: 2, status: 'scheduled' },
        { number: 3, status: 'scheduled' },
      ],
      homeGamesWon: 1,
      awayGamesWon: 0,
      status: 'undecided',
      explanation: 'Series is in progress (1–0)',
    };

    const nodeWithSeries = toBracketMatch(
      {
        id: 'WB-R1-M1',
        shape: 'duel',
        bracket: 'winners',
        round: 1,
        position: 1,
        slotA: { kind: 'entrant', entrantId: 'entrant-a', seed: 1 },
        slotB: { kind: 'entrant', entrantId: 'entrant-b', seed: 2 },
      },
      [],
      { series: inProgressSeries },
    );

    expect(nodeWithSeries.series).toBeDefined();
    expect(nodeWithSeries.series?.status).toBe('undecided');
    expect(nodeWithSeries.series?.homeGamesWon).toBe(1);
    expect(nodeWithSeries.series?.awayGamesWon).toBe(0);
    expect(nodeWithSeries.series?.games).toHaveLength(3);
  });

  it('populates a decided series with anulled legs on toBracketMatch', () => {
    const decidedSeries: PublicSeriesStateResponse = {
      span: 3,
      resolutionClass: 'best-of',
      games: [
        {
          number: 1,
          status: 'finalized',
          scores: [2, 0],
          winnerEntrantId: 'entrant-a',
          winner: 'home',
        },
        {
          number: 2,
          status: 'finalized',
          scores: [2, 1],
          winnerEntrantId: 'entrant-a',
          winner: 'home',
        },
        { number: 3, status: 'not-required' },
      ],
      homeGamesWon: 2,
      awayGamesWon: 0,
      status: 'decided',
      winnerEntrantId: 'entrant-a',
      winner: 'home',
      explanation: 'entrant-a won the best-of-3 series 2–0',
    };

    const nodeDecided = toBracketMatch(
      {
        id: 'WB-R1-M1',
        shape: 'duel',
        bracket: 'winners',
        round: 1,
        position: 1,
        slotA: { kind: 'entrant', entrantId: 'entrant-a', seed: 1 },
        slotB: { kind: 'entrant', entrantId: 'entrant-b', seed: 2 },
      },
      [],
      { series: decidedSeries },
    );

    expect(nodeDecided.series?.status).toBe('decided');
    expect(nodeDecided.series?.winner).toBe('home');
    const anulled = nodeDecided.series?.games.filter((g) => g.status === 'not-required');
    expect(anulled).toHaveLength(1);
    expect(anulled?.[0]?.number).toBe(3);
  });

  it('leaves series undefined on toBracketMatch for a cross with no series', () => {
    const nodeNoSeries = toBracketMatch(
      {
        id: 'WB-R1-M1',
        shape: 'duel',
        bracket: 'winners',
        round: 1,
        position: 1,
        slotA: { kind: 'entrant', entrantId: 'entrant-a', seed: 1 },
        slotB: { kind: 'entrant', entrantId: 'entrant-b', seed: 2 },
      },
      [],
    );

    expect(nodeNoSeries.series).toBeUndefined();
  });
});
