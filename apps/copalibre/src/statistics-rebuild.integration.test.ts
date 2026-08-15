import { footballDescriptor, type StatisticCollector } from '@copalibre/domain';
import {
  CompetitionRepository,
  EnrollmentRepository,
  OrganizationRepository,
  PersonRepository,
  TournamentRepository,
  newId,
  withTransaction,
  type Database,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import {
  createMigratedDatabase,
  type ScratchDatabase,
} from '../../../packages/persistence/src/test-support/scratch-database.js';
import { runStatisticsRebuild } from './statistics-rebuild.js';

/**
 * `copalibre statistics-rebuild` against real PostgreSQL (0082, task 7.4):
 * seeds finalized matches the way pre-engine history would look — no
 * `statistic_totals` rows at all — then proves the rebuild populates them and
 * running it twice changes nothing but `updated_at`/the projection version.
 */

const AUDIT = { actor: 'user:rebuild-test', authorizationContext: 'scope:test' };

const COLLECTORS: readonly StatisticCollector[] = [
  {
    code: 'goals',
    label: 'Goals',
    source: { kind: 'event', definitionCodes: ['goal'] },
    measure: { kind: 'count' },
    granularity: { actor: 'person', competition: 'match' },
  },
  // 0090: a payload-field-targeted collector — proves backfilling historical
  // multi-actor events (recorded before this collector existed) resolves the
  // attribution correctly and reproducibly, not just newly-recorded ones.
  {
    code: 'assists',
    label: 'Assists',
    source: {
      kind: 'event',
      definitionCodes: ['goal'],
      actorSource: { payloadField: 'assistedBy' },
    },
    measure: { kind: 'count' },
    granularity: { actor: 'person', competition: 'match' },
  },
];

describe('copalibre statistics-rebuild (integration, 0082)', () => {
  let scratch: ScratchDatabase;
  let db: Kysely<Database>;
  let organizationAlias: string;
  let personId: string;
  let personAssist: string;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('statistics-rebuild-cli');
    db = scratch.db;
    organizationAlias = 'liga-rebuild';

    const organization = await withTransaction(db, (uow) =>
      new OrganizationRepository(db).create(uow, {
        alias: organizationAlias,
        name: 'Liga Rebuild',
        ...AUDIT,
      }),
    );
    const organizationId = organization.organizationId;

    const tournaments = new TournamentRepository(db);
    const enrollment = new EnrollmentRepository(db);
    const persons = new PersonRepository(db);
    const competition = new CompetitionRepository(db);
    const descriptor = footballDescriptor({ collectors: COLLECTORS });

    await withTransaction(db, async (uow) => {
      await tournaments.saveDescriptor(uow, descriptor, { organizationId, ...AUDIT });
      const tournament = await tournaments.create(uow, {
        organizationId,
        alias: 'apertura-rebuild',
        name: 'Apertura Rebuild',
        descriptor,
        ...AUDIT,
      });

      const norte = await enrollment.createTeam(uow, { organizationId, name: 'Norte', ...AUDIT });
      const homeEntrant = await enrollment.registerEntrant(uow, {
        organizationId,
        tournamentId: tournament.tournamentId,
        entrantRef: { kind: 'team', teamId: norte.teamId },
        ...AUDIT,
      });

      const { person } = await persons.register(uow, {
        organizationId,
        displayName: 'Jugador Rebuild',
        ...AUDIT,
      });
      personId = person.personId;
      await persons.enlist(uow, {
        personId,
        teamId: norte.teamId,
        role: 'player',
        organizationId,
        ...AUDIT,
      });
      const { person: assistPerson } = await persons.register(uow, {
        organizationId,
        displayName: 'Jugador Rebuild (assist)',
        ...AUDIT,
      });
      personAssist = assistPerson.personId;
      await persons.enlist(uow, {
        personId: personAssist,
        teamId: norte.teamId,
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

      // Two finalized matches, pre-engine history: events and a result exist,
      // but nothing ever called `refold` — no `statistic_totals` row for
      // either match, exactly what a deployment predating 0082 looks like.
      for (let round = 1; round <= 2; round += 1) {
        const [fixture] = await competition.createFixtures(uow, {
          stageId: stage.stageId,
          fixtures: [{ round, homeEntrantId: homeEntrant.entrantId }],
          organizationId,
          ...AUDIT,
        });
        const match = await competition.createMatch(uow, {
          fixtureId: fixture?.fixtureId ?? '',
          number: round,
          organizationId,
          ...AUDIT,
        });
        const segment = await competition.createSegment(uow, {
          matchId: match.matchId,
          type: 'half',
          number: 1,
          organizationId,
          ...AUDIT,
        });
        await competition.setSegmentState(uow, {
          segmentId: segment.segmentId,
          state: 'active',
          organizationId,
          ...AUDIT,
        });
        await competition.applyCommand(uow, {
          matchId: match.matchId,
          command: 'start',
          status: 'in-progress',
          grantedBy: 'seed',
          organizationId,
          ...AUDIT,
        });
        await uow.tx
          .insertInto('match_rosters')
          .values({
            match_id: match.matchId,
            entrant_id: homeEntrant.entrantId,
            person_ids: JSON.stringify([personId, personAssist]),
            updated_at: new Date(),
          })
          .execute();
        await competition.appendEvent(uow, {
          event: {
            eventId: newId(),
            matchId: match.matchId,
            segmentId: segment.segmentId,
            definitionCode: 'goal',
            occurredAt: new Date().toISOString(),
            side: homeEntrant.entrantId,
            personId,
            // Round 1's goal carries a historical assist, recorded before any
            // collector ever read `assistedBy` — exactly what "backfilling"
            // means: the data was always there, nothing was there to fold it.
            payload: round === 1 ? { assistedBy: personAssist } : {},
          },
          sequence: 1,
          organizationId,
          ...AUDIT,
        });
        await competition.recordResult(uow, {
          matchId: match.matchId,
          result: {
            sides: [{ entrantId: homeEntrant.entrantId, statistics: { 'goals-for': round } }],
            recordedAt: new Date().toISOString(),
          },
          organizationId,
          ...AUDIT,
        });
      }
    });
  });

  afterAll(async () => {
    await scratch?.drop();
  });

  it('has no statistic_totals rows before the rebuild runs (pre-engine history)', async () => {
    const rows = await db
      .selectFrom('statistic_totals')
      .selectAll()
      .where('organization_id', '=', await organizationIdOf(db, organizationAlias))
      .execute();
    expect(rows).toEqual([]);
  });

  it('populates totals for finalized matches with no prior statistic_totals rows, and reproduces them byte-for-byte on a second run (tasks 7.4/5.2)', async () => {
    const first = await runStatisticsRebuild(db, { organization: organizationAlias });
    expect(first.matches).toBe(2);
    expect(first.figures).toBeGreaterThan(0);

    const organizationId = await organizationIdOf(db, organizationAlias);
    const afterFirst = await db
      .selectFrom('statistic_totals')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .orderBy('source_match_id')
      .execute();

    expect(afterFirst.length).toBeGreaterThan(0);
    expect(
      afterFirst.every((row) => row.collector_code === 'goals' || row.collector_code === 'assists'),
    ).toBe(true);
    expect(
      afterFirst
        .filter((row) => row.collector_code === 'goals')
        .reduce((total, row) => total + Number(row.value), 0),
    ).toBe(2);
    // The historical assist on round 1's goal, backfilled by a rebuild that
    // runs long after the event was recorded — proves the payload-field
    // attribution resolves the same way whether folded live or backfilled.
    const assistRows = afterFirst.filter((row) => row.collector_code === 'assists');
    expect(assistRows).toEqual([expect.objectContaining({ actor_id: personAssist, value: 1 })]);

    const second = await runStatisticsRebuild(db, { organization: organizationAlias });
    expect(second.matches).toBe(2);
    expect(second.figures).toBe(first.figures);

    const afterSecond = await db
      .selectFrom('statistic_totals')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .orderBy('source_match_id')
      .execute();

    // Byte-identical aside from `updated_at`/`projection_version`: strip both
    // before comparing, which is exactly what idempotence promises.
    expect(stableRows(afterSecond)).toEqual(stableRows(afterFirst));
  });

  it('refuses an unknown organization alias', async () => {
    await expect(
      runStatisticsRebuild(db, { organization: 'no-such-organization' }),
    ).rejects.toThrow(/No organization/);
  });

  it('refuses an unknown tournament alias within a known organization', async () => {
    await expect(
      runStatisticsRebuild(db, {
        organization: organizationAlias,
        tournament: 'no-such-tournament',
      }),
    ).rejects.toThrow(/No tournament/);
  });
});

async function organizationIdOf(db: Kysely<Database>, alias: string): Promise<string> {
  const row = await db
    .selectFrom('organizations')
    .select('organization_id')
    .where('alias', '=', alias)
    .executeTakeFirstOrThrow();
  return row.organization_id;
}

/** Every column two rebuild runs must agree on — everything but `updated_at`/`projection_version`. */
function stableRows(
  rows: readonly {
    organization_id: string;
    collector_code: string;
    actor_granularity: string;
    actor_id: string;
    competition_granularity: string;
    competition_id: string;
    source_match_id: string;
    value: number;
    samples: number;
  }[],
) {
  return rows.map((row) => ({
    organizationId: row.organization_id,
    collectorCode: row.collector_code,
    actorGranularity: row.actor_granularity,
    actorId: row.actor_id,
    competitionGranularity: row.competition_granularity,
    competitionId: row.competition_id,
    sourceMatchId: row.source_match_id,
    value: Number(row.value),
    samples: Number(row.samples),
  }));
}
