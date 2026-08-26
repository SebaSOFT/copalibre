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
 * `copalibre statistics-rebuild` against real PostgreSQL:
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
  // a payload-field-targeted collector — proves backfilling historical
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

describe('copalibre statistics-rebuild (integration)', () => {
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
      // either match, exactly what a deployment without statistics refolding looks like.
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
            roster_members: JSON.stringify([
              { personId, name: 'Player', onField: true },
              { personId: personAssist, name: 'Assist', onField: true },
            ]),
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

/**
 * The coverage gap the career surface shipped with:
 * nothing asserted that a rebuild recomputes *organization*-granularity
 * totals specifically (every collector above is match-scoped), that scoping
 * to one tournament actually excludes another, or that a match with no
 * recorded roster still contributes team figures while contributing no
 * person figures — the exact "backfill has a real limit" design.md states.
 */
describe('statistics-rebuild — organization granularity, scope, and the no-roster limit', () => {
  let scratch: ScratchDatabase;
  let db: Kysely<Database>;
  const organizationAlias = 'liga-coverage';

  const CAREER_GOALS: StatisticCollector = {
    code: 'career-goals',
    label: 'Career Goals',
    source: { kind: 'event', definitionCodes: ['goal'], actorSource: 'primary' },
    measure: { kind: 'count' },
    granularity: { actor: 'person', competition: 'organization' },
  };
  const TEAM_GOALS: StatisticCollector = {
    code: 'team-goals',
    label: 'Team Goals',
    source: { kind: 'event', definitionCodes: ['goal'], actorSource: 'primary' },
    measure: { kind: 'count' },
    granularity: { actor: 'team', competition: 'organization' },
  };
  const COVERAGE_COLLECTORS: readonly StatisticCollector[] = [CAREER_GOALS, TEAM_GOALS];

  let rosteredPersonId: string;
  let tournamentAAlias: string;
  let tournamentBAlias: string;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('statistics-rebuild-coverage');
    db = scratch.db;

    const organization = await withTransaction(db, (uow) =>
      new OrganizationRepository(db).create(uow, {
        alias: organizationAlias,
        name: 'Liga Coverage',
        actor: 'user:coverage-test',
        authorizationContext: 'scope:test',
      }),
    );
    const organizationId = organization.organizationId;
    const AUDIT_HERE = { actor: 'user:coverage-test', authorizationContext: 'scope:test' };

    const tournaments = new TournamentRepository(db);
    const enrollment = new EnrollmentRepository(db);
    const persons = new PersonRepository(db);
    const competition = new CompetitionRepository(db);
    const descriptor = footballDescriptor({ collectors: COVERAGE_COLLECTORS });

    await withTransaction(db, async (uow) => {
      await tournaments.saveDescriptor(uow, descriptor, { organizationId, ...AUDIT_HERE });

      // Tournament A: one match with a recorded roster, one without — the
      // exact "before vs. after roster selection existed" split within a
      // single tournament.
      const tournamentA = await tournaments.create(uow, {
        organizationId,
        alias: 'apertura-coverage',
        name: 'Apertura Coverage',
        descriptor,
        ...AUDIT_HERE,
      });
      tournamentAAlias = tournamentA.alias;

      const norte = await enrollment.createTeam(uow, {
        organizationId,
        name: 'Norte',
        ...AUDIT_HERE,
      });
      const homeEntrant = await enrollment.registerEntrant(uow, {
        organizationId,
        tournamentId: tournamentA.tournamentId,
        entrantRef: { kind: 'team', teamId: norte.teamId },
        ...AUDIT_HERE,
      });
      const { person } = await persons.register(uow, {
        organizationId,
        displayName: 'Jugador Coverage',
        ...AUDIT_HERE,
      });
      rosteredPersonId = person.personId;
      await persons.enlist(uow, {
        personId: rosteredPersonId,
        teamId: norte.teamId,
        role: 'player',
        organizationId,
        ...AUDIT_HERE,
      });

      const stageA = await competition.createStageInTournament(uow, {
        tournamentId: tournamentA.tournamentId,
        number: 1,
        name: 'Regular',
        format: 'round-robin',
        organizationId,
        ...AUDIT_HERE,
      });

      async function finalizedMatch(round: number, withRoster: boolean): Promise<void> {
        const [fixture] = await competition.createFixtures(uow, {
          stageId: stageA.stageId,
          fixtures: [{ round, homeEntrantId: homeEntrant.entrantId }],
          organizationId,
          ...AUDIT_HERE,
        });
        const match = await competition.createMatch(uow, {
          fixtureId: fixture?.fixtureId ?? '',
          number: round,
          organizationId,
          ...AUDIT_HERE,
        });
        const segment = await competition.createSegment(uow, {
          matchId: match.matchId,
          type: 'half',
          number: 1,
          organizationId,
          ...AUDIT_HERE,
        });
        await competition.setSegmentState(uow, {
          segmentId: segment.segmentId,
          state: 'active',
          organizationId,
          ...AUDIT_HERE,
        });
        await competition.applyCommand(uow, {
          matchId: match.matchId,
          command: 'start',
          status: 'in-progress',
          grantedBy: 'seed',
          organizationId,
          ...AUDIT_HERE,
        });
        if (withRoster) {
          await uow.tx
            .insertInto('match_rosters')
            .values({
              match_id: match.matchId,
              entrant_id: homeEntrant.entrantId,
              roster_members: JSON.stringify([
                { personId: rosteredPersonId, name: 'Player', onField: true },
              ]),
              updated_at: new Date(),
            })
            .execute();
        }
        await competition.appendEvent(uow, {
          event: {
            eventId: newId(),
            matchId: match.matchId,
            segmentId: segment.segmentId,
            definitionCode: 'goal',
            occurredAt: new Date().toISOString(),
            side: homeEntrant.entrantId,
            // The historical reality this backfill limit is about: a match
            // with no recorded roster never had a person-attributed event
            // to begin with — match-control.controller has always refused
            // one — so this is what previous event history actually
            // looks like, not a contrived gap.
            ...(withRoster ? { personId: rosteredPersonId } : {}),
            payload: {},
          },
          sequence: 1,
          organizationId,
          ...AUDIT_HERE,
        });
        await competition.recordResult(uow, {
          matchId: match.matchId,
          result: {
            sides: [{ entrantId: homeEntrant.entrantId, statistics: { 'goals-for': 1 } }],
            recordedAt: new Date().toISOString(),
          },
          organizationId,
          ...AUDIT_HERE,
        });
      }

      await finalizedMatch(1, true);
      await finalizedMatch(2, false);

      // Tournament B: a second, independent tournament in the same
      // organization — untouched by anything scoped to Tournament A.
      const tournamentB = await tournaments.create(uow, {
        organizationId,
        alias: 'clausura-coverage',
        name: 'Clausura Coverage',
        descriptor,
        ...AUDIT_HERE,
      });
      tournamentBAlias = tournamentB.alias;
      const sur = await enrollment.createTeam(uow, { organizationId, name: 'Sur', ...AUDIT_HERE });
      const bEntrant = await enrollment.registerEntrant(uow, {
        organizationId,
        tournamentId: tournamentB.tournamentId,
        entrantRef: { kind: 'team', teamId: sur.teamId },
        ...AUDIT_HERE,
      });
      const stageB = await competition.createStageInTournament(uow, {
        tournamentId: tournamentB.tournamentId,
        number: 1,
        name: 'Regular',
        format: 'round-robin',
        organizationId,
        ...AUDIT_HERE,
      });
      const [fixtureB] = await competition.createFixtures(uow, {
        stageId: stageB.stageId,
        fixtures: [{ round: 1, homeEntrantId: bEntrant.entrantId }],
        organizationId,
        ...AUDIT_HERE,
      });
      const matchB = await competition.createMatch(uow, {
        fixtureId: fixtureB?.fixtureId ?? '',
        number: 1,
        organizationId,
        ...AUDIT_HERE,
      });
      const segmentB = await competition.createSegment(uow, {
        matchId: matchB.matchId,
        type: 'half',
        number: 1,
        organizationId,
        ...AUDIT_HERE,
      });
      await competition.setSegmentState(uow, {
        segmentId: segmentB.segmentId,
        state: 'active',
        organizationId,
        ...AUDIT_HERE,
      });
      await competition.applyCommand(uow, {
        matchId: matchB.matchId,
        command: 'start',
        status: 'in-progress',
        grantedBy: 'seed',
        organizationId,
        ...AUDIT_HERE,
      });
      await competition.appendEvent(uow, {
        event: {
          eventId: newId(),
          matchId: matchB.matchId,
          segmentId: segmentB.segmentId,
          definitionCode: 'goal',
          occurredAt: new Date().toISOString(),
          side: bEntrant.entrantId,
          payload: {},
        },
        sequence: 1,
        organizationId,
        ...AUDIT_HERE,
      });
      await competition.recordResult(uow, {
        matchId: matchB.matchId,
        result: {
          sides: [{ entrantId: bEntrant.entrantId, statistics: { 'goals-for': 1 } }],
          recordedAt: new Date().toISOString(),
        },
        organizationId,
        ...AUDIT_HERE,
      });
    });
  });

  afterAll(async () => {
    await scratch?.drop();
  });

  it('recomputes organization-granularity totals across every tournament in scope (4.1)', async () => {
    await runStatisticsRebuild(db, { organization: organizationAlias });

    const organizationId = await organizationIdOf(db, organizationAlias);
    const teamGoalsRows = await db
      .selectFrom('statistic_totals')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('collector_code', '=', 'team-goals')
      .where('competition_granularity', '=', 'organization')
      .execute();

    expect(teamGoalsRows.length).toBeGreaterThan(0);
    const byTeam = new Map<string, number>();
    for (const row of teamGoalsRows) {
      byTeam.set(row.actor_id, (byTeam.get(row.actor_id) ?? 0) + Number(row.value));
    }
    // Both of Tournament A's matches scored, whether or not either had a
    // roster — team attribution never needed one — plus Tournament B's own
    // goal, at organization granularity for each team.
    expect([...byTeam.values()].sort()).toEqual([1, 2]);
  });

  it('attributes no career figure to any real person for a match with no recorded roster (4.4)', async () => {
    await runStatisticsRebuild(db, { organization: organizationAlias });

    const organizationId = await organizationIdOf(db, organizationAlias);
    const careerGoalsRows = await db
      .selectFrom('statistic_totals')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('collector_code', '=', 'career-goals')
      .execute();

    // Correction, found during implementation: `resolvedActor` (fold.ts)
    // falls back to the *entrant's* actor context — `{ personId: '' }` for
    // a team-kind entrant, per `actor-resolution.ts`'s `TEAM_ACTOR_PERSON_ID`
    // sentinel — when an event carries no `personId` of its own, rather than
    // producing no figure at all. So the un-rostered match's goal *does*
    // write a `career-goals` row, just keyed to the empty-string sentinel,
    // which cannot equal any real UUID `personId` — no real person's career
    // total is ever affected. Changing `resolvedActor` to skip writing that
    // row is a real, worthwhile cleanup, but is a `foldStatistics` change
    // design.md's own "No change to foldStatistics" ruled out of this
    // proposal (tracked as 7.4).
    const realPersonRows = careerGoalsRows.filter((row) => row.actor_id !== '');
    expect(realPersonRows).toEqual([
      expect.objectContaining({
        actor_granularity: 'person',
        actor_id: rosteredPersonId,
        value: 1,
      }),
    ]);
    expect(careerGoalsRows.some((row) => row.actor_id === '')).toBe(true);
  });

  it('leaves the other tournament untouched when scoped to one (4.3)', async () => {
    // Self-contained: rebuilds the whole organization first (idempotent, so
    // this is safe regardless of what earlier tests in this file already
    // ran), records Tournament B's figures, then reruns scoped to Tournament
    // A only and confirms B's figures are byte-identical.
    await runStatisticsRebuild(db, { organization: organizationAlias });

    const matchesOfB = await db
      .selectFrom('matches')
      .innerJoin('fixtures', 'fixtures.fixture_id', 'matches.fixture_id')
      .innerJoin('stages', 'stages.stage_id', 'fixtures.stage_id')
      .innerJoin('seasons', 'seasons.season_id', 'stages.season_id')
      .innerJoin('tournaments', 'tournaments.tournament_id', 'seasons.tournament_id')
      .select('matches.match_id')
      .where('tournaments.alias', '=', tournamentBAlias)
      .execute();
    const matchIdsOfB = matchesOfB.map((row) => row.match_id);
    expect(matchIdsOfB.length).toBeGreaterThan(0);

    const beforeRows = await db
      .selectFrom('statistic_totals')
      .selectAll()
      .where('source_match_id', 'in', matchIdsOfB)
      .orderBy('collector_code')
      .execute();
    expect(beforeRows.length).toBeGreaterThan(0);

    const result = await runStatisticsRebuild(db, {
      organization: organizationAlias,
      tournament: tournamentAAlias,
    });
    expect(result.matches).toBe(2);

    const afterRows = await db
      .selectFrom('statistic_totals')
      .selectAll()
      .where('source_match_id', 'in', matchIdsOfB)
      .orderBy('collector_code')
      .execute();

    const stable = (rows: typeof beforeRows) =>
      rows.map((row) => ({ ...row, updated_at: null, projection_version: null }));
    expect(stable(afterRows)).toEqual(stable(beforeRows));
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
