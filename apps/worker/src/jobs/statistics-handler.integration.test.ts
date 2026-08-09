import {
  CompetitionRepository,
  OutboxRelay,
  ProjectionStore,
  StatisticRepository,
  withTransaction,
  type Refold,
} from '@copalibre/persistence';
import {
  createMigratedDatabase,
  type ScratchDatabase,
} from '../../../../packages/persistence/src/test-support/scratch-database.js';
import { JobDispatcher } from './dispatcher.js';
import { runRelayPass } from './relay-runner.js';
import { statisticsHandler } from './statistics-handler.js';

/**
 * The loop 0016 left open, closed (0017).
 *
 * 0016 built the statistics projection with its fold injected and nothing
 * calling it outside a test. This proves the relay is that caller: publish a
 * finalization, run a pass, and read totals that nobody wrote by hand.
 */

const ORGANIZATION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TOURNAMENT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const AUDIT = { actor: 'user:worker-test', authorizationContext: 'scope:jobs' };

describe('statistics projection through the relay (integration)', () => {
  let scratch: ScratchDatabase;
  let statistics: StatisticRepository;
  let projections: ProjectionStore;
  let matchId = '';
  let folded = 0;

  /** Stands in for the discipline's collectors, which 0029 will resolve. */
  const refold: Refold = async () => {
    folded += 1;
    return [
      {
        collectorCode: 'goals',
        actorGranularity: 'person',
        actorId: 'pe-1',
        competitionGranularity: 'match',
        competitionId: matchId,
        value: 2,
        samples: 2,
      },
    ];
  };

  beforeAll(async () => {
    scratch = await createMigratedDatabase('worker-statistics');
    statistics = new StatisticRepository(scratch.db);
    projections = new ProjectionStore(scratch.db);

    // The figures reference a real match, so the chain that owns one exists.
    await scratch.db
      .insertInto('organizations')
      .values({
        organization_id: ORGANIZATION,
        alias: 'liga',
        name: 'Liga',
        primary_language: 'es',
        timezone: 'UTC',
        created_at: new Date(),
      })
      .execute();
    await withTransaction(scratch.db, async (uow) => {
      await uow.tx
        .insertInto('tournaments')
        .values({
          tournament_id: TOURNAMENT,
          organization_id: ORGANIZATION,
          alias: 'apertura',
          name: 'Apertura',
          descriptor_id: TOURNAMENT,
          descriptor_version: '1.0.0',
          ruleset_id: null,
          status: 'draft',
          started_at: null,
          profile_id: null,
          profile_version: null,
          created_at: new Date(),
        })
        .execute();

      const competition = new CompetitionRepository(scratch.db);
      const stage = await competition.createStageInTournament(uow, {
        tournamentId: TOURNAMENT,
        number: 1,
        name: 'Fecha 1',
        format: 'round-robin',
        organizationId: ORGANIZATION,
        ...AUDIT,
      });
      const [fixture] = await competition.createFixtures(uow, {
        stageId: stage.stageId,
        fixtures: [{ round: 1 }],
        organizationId: ORGANIZATION,
        ...AUDIT,
      });
      const match = await competition.createMatch(uow, {
        fixtureId: fixture?.fixtureId ?? '',
        number: 1,
        organizationId: ORGANIZATION,
        ...AUDIT,
      });
      matchId = match.matchId;
    });
  });

  afterAll(async () => {
    await scratch?.drop();
  });

  async function publish(eventType: string): Promise<string> {
    return withTransaction(scratch.db, (uow) =>
      uow.publishEvent({
        organizationId: ORGANIZATION,
        stream: `match:${matchId}`,
        entityId: matchId,
        eventType,
        projectionVersion: 1,
        payload: { matchId: matchId },
      }),
    );
  }

  function dispatcher(): JobDispatcher {
    const handler = statisticsHandler({ db: scratch.db, refold });
    return new JobDispatcher()
      .register('match.finalized', handler)
      .register('result.superseded', handler);
  }

  it('writes totals from a finalization nobody projected by hand', async () => {
    await publish('match.finalized');

    const pass = await runRelayPass(new OutboxRelay(scratch.db), dispatcher(), {
      consumer: 'statistics-projection',
      worker: 'worker-a',
    });

    const totals = await statistics.readTotals(
      {
        organizationId: ORGANIZATION,
        collectorCode: 'goals',
        actorGranularity: 'person',
        competitionGranularity: 'match',
        competitionId: matchId,
      },
      { kind: 'count' },
    );

    // Creating the stage, fixture and match published their own events, and the
    // pass takes those too — an event with no handler is completed rather than
    // dead-lettered, which is exactly what "the outbox has other readers" means.
    expect(pass.failed).toBe(0);
    expect(pass.processed).toBeGreaterThanOrEqual(1);
    expect(totals[0]?.value).toBe(2);
  });

  it('stamps the projection version it allocated, and advances the cursor with it', async () => {
    const version = await projections.versionOf('statistic-totals', matchId);
    const cursor = await projections.cursorOf('statistics-projection');

    const stored = await scratch.db
      .selectFrom('statistic_totals')
      .select('projection_version')
      .where('source_match_id', '=', matchId)
      .executeTakeFirst();

    expect(version?.version).toBe(1);
    // The stored figure carries the version the rebuild allocated, not the one
    // the producer guessed at write time.
    expect(stored?.projection_version).toBe(1);
    expect(cursor).toBeDefined();
  });

  it('recomputes on a correction and bumps the version again', async () => {
    const before = folded;
    await publish('result.superseded');

    await runRelayPass(new OutboxRelay(scratch.db), dispatcher(), {
      consumer: 'statistics-projection',
      worker: 'worker-a',
    });

    expect(folded).toBe(before + 1);
    expect((await projections.versionOf('statistic-totals', matchId))?.version).toBe(2);
  });
});
