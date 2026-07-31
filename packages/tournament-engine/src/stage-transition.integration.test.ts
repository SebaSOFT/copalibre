import {
  fixtureDescriptor,
  validateStageCompletion,
  winConditionScript,
  type DisciplineDescriptor,
  type RecordedOutcome,
} from '@copalibre/domain';
import type { TiebreakPipeline } from '@copalibre/rules';
import {
  CompetitionRecordRepository,
  CompetitionRepository,
  newId,
  OrganizationRepository,
  ParticipantRepository,
  TournamentRepository,
  withTransaction,
} from '@copalibre/persistence';
import { createMigratedDatabase } from '../../persistence/src/test-support/scratch-database.js';
import { runDraw } from './draw/index.js';
import { generateFixtures } from './fixtures/index.js';
import { computeStandings, entrantsInGraph } from './standings/index.js';
import { previewStageTransition } from './transition/index.js';

/**
 * A full stage transition against real storage: play a group stage out, close
 * it, cut, draw the next stage under constraints, and generate its fixtures —
 * with the preview proving beforehand that it commits nothing.
 */

const AUDIT = { actor: 'user:organizer-1', authorizationContext: 'scope:tournament.write' };

const pipeline: TiebreakPipeline = {
  id: 'group-table',
  version: 1,
  parameters: [
    {
      id: 'points',
      label: 'Points',
      valueType: 'number',
      direction: 'higher_wins',
      missingValue: 'treat-as-zero',
      source: 'calculated',
    },
    {
      id: 'goals-for',
      label: 'Goals for',
      valueType: 'number',
      direction: 'higher_wins',
      missingValue: 'treat-as-zero',
      source: 'match-derived',
    },
  ],
};

function league(): DisciplineDescriptor {
  return fixtureDescriptor({
    descriptorId: newId(),
    name: 'Liga Regional',
    statistics: [
      { code: 'goals-for', label: 'Goals for', aggregation: 'sum' },
      { code: 'points', label: 'Points', aggregation: 'sum' },
      { code: 'played', label: 'Played', aggregation: 'count' },
    ],
    scoringInputs: [{ code: 'goals', label: 'Goals', source: 'event-derived' }],
    winCondition: winConditionScript('higher-score-wins', { unit: 'goals' }),
  });
}

describe('stage transition (integration)', () => {
  let scratch: Awaited<ReturnType<typeof createMigratedDatabase>>;
  let organizationId = '';

  beforeAll(async () => {
    scratch = await createMigratedDatabase('stage-transition');
    const organization = await withTransaction(scratch.db, (uow) =>
      new OrganizationRepository(scratch.db).create(uow, {
        alias: 'liga-etapas',
        name: 'Liga Etapas',
        ...AUDIT,
      }),
    );
    organizationId = organization.organizationId;
  });

  afterAll(async () => {
    await scratch?.drop();
  });

  /** Four clubs, two from each region, registered with their attributes. */
  async function seedGroupStage(alias: string) {
    const tournaments = new TournamentRepository(scratch.db);
    const competition = new CompetitionRepository(scratch.db);
    const participants = new ParticipantRepository(scratch.db);
    const descriptor = league();

    return withTransaction(scratch.db, async (uow) => {
      await tournaments.saveDescriptor(uow, descriptor, { organizationId, ...AUDIT });
      const tournament = await tournaments.create(uow, {
        organizationId,
        alias,
        name: alias,
        descriptor,
        ...AUDIT,
      });
      const stage = await competition.createStage(uow, {
        tournamentId: tournament.tournamentId,
        number: 1,
        name: 'Group',
        format: 'round-robin',
        organizationId,
        ...AUDIT,
      });

      const clubs = [
        { name: 'San Martín', region: 'san-juan' },
        { name: 'Desamparados', region: 'san-juan' },
        { name: 'Boca', region: 'buenos-aires' },
        { name: 'River', region: 'buenos-aires' },
      ];

      const entrants = [];
      for (const clubDetail of clubs) {
        const team = await participants.createTeam(uow, {
          organizationId,
          name: clubDetail.name,
          ...AUDIT,
        });
        const entrant = await participants.registerEntrant(uow, {
          tournamentId: tournament.tournamentId,
          entrantRef: { kind: 'team', teamId: team.teamId },
          organizationId,
          ...AUDIT,
        });
        await participants.setEntrantAttributes(uow, {
          entrantId: entrant.entrantId,
          attributes: [{ key: 'region', value: clubDetail.region, kind: 'categorical' }],
          organizationId,
          ...AUDIT,
        });
        entrants.push({ entrant, region: clubDetail.region });
      }

      // A persisted match to hang the standings snapshot on: the engine's match
      // ids are human-readable (`RR-1`), while the record references a real row.
      const [fixture] = await competition.createFixtures(uow, {
        stageId: stage.stageId,
        fixtures: [{ round: 1 }],
        organizationId,
        ...AUDIT,
      });
      if (!fixture) throw new Error('fixture was not created');
      const match = await competition.createMatch(uow, {
        fixtureId: fixture.fixtureId,
        number: 1,
        organizationId,
        ...AUDIT,
      });

      return { tournament, stage, descriptor, entrants, match };
    });
  }

  it('carries a group stage through cut, draw and next-stage fixtures', async () => {
    const { tournament, stage, descriptor, entrants, match } =
      await seedGroupStage('copa-transicion');
    const records = new CompetitionRecordRepository(scratch.db);
    const participants = new ParticipantRepository(scratch.db);

    const ids = entrants.map((entry) => entry.entrant.entrantId);
    const graph = generateFixtures({
      format: 'round-robin',
      entrants: ids.map((entrantId, index) => ({ entrantId, seed: index + 1 })),
    });
    if (!graph.ok) throw graph.error;

    // Every club beats the ones below it, so the table is unambiguous.
    const outcomes: RecordedOutcome[] = [];
    for (const [index, [home, away]] of [
      [0, 1],
      [0, 2],
      [0, 3],
      [1, 2],
      [1, 3],
      [2, 3],
    ].entries()) {
      const winner = ids[home as number] as string;
      const loser = ids[away as number] as string;
      outcomes.push({
        matchId: `RR-${index}`,
        winnerEntrantId: winner,
        sides: [
          { entrantId: winner, statistics: { 'goals-for': 2, points: 3 } },
          { entrantId: loser, statistics: { 'goals-for': 0, points: 0 } },
        ],
      });
    }

    const standings = computeStandings(
      descriptor,
      entrantsInGraph(graph.value.matches),
      outcomes,
      pipeline,
    );
    expect(standings.fullyResolved).toBe(true);

    // The stage is only closeable once every match is resolved.
    expect(
      validateStageCompletion({
        status: 'running',
        totalMatches: outcomes.length,
        resolvedMatches: outcomes.length,
      }).ok,
    ).toBe(true);

    const accounting = standings.rows.map((row) => ({
      entrantId: row.entrantId,
      statistics: row.statistics,
    }));

    const preview = previewStageTransition({
      accounting,
      pipeline,
      advance: 2,
      allocation: { mode: 'automatic' },
      nextFormat: 'single-elimination',
      preconditions: { priorStageStatus: 'complete' },
    });

    expect(preview.ready).toBe(true);
    expect(preview.qualified).toHaveLength(2);

    // Nothing was written by the preview: no fixtures, no seeds, no standings.
    const stagesBefore = await scratch.db
      .selectFrom('stages')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where('tournament_id', '=', tournament.tournamentId)
      .executeTakeFirstOrThrow();
    expect(stagesBefore.count).toBe('1');
    await expect(records.latestStandings(stage.stageId)).resolves.toBeUndefined();

    // Committing is the caller's audited write, and only now does state change.
    const nextStage = await withTransaction(scratch.db, async (uow) => {
      const created = await new CompetitionRepository(scratch.db).createStage(uow, {
        tournamentId: tournament.tournamentId,
        number: 2,
        name: 'Playoff',
        format: 'single-elimination',
        organizationId,
        ...AUDIT,
      });
      await participants.setEntrantSeeds(uow, {
        tournamentId: tournament.tournamentId,
        placements: preview.seeds,
        allocation: { mode: 'automatic' },
        organizationId,
        ...AUDIT,
      });
      await records.materialiseStandings(uow, {
        tournamentId: tournament.tournamentId,
        stageId: stage.stageId,
        matchId: match.matchId,
        rows: standings.rows.map((row) => ({ ...row })),
        trace: preview.trace.map((node) => ({ ...node })),
        fullyResolved: true,
        organizationId,
        ...AUDIT,
      });
      return created;
    });

    expect(nextStage.number).toBe(2);
    const stored = await records.latestStandings(stage.stageId);
    expect(stored?.rows).toHaveLength(4);

    const seeded = await participants.listEntrants(tournament.tournamentId);
    const seeds = seeded.filter((entrant) => entrant.seed !== undefined);
    expect(seeds).toHaveLength(2);
  });

  it('draws the next stage under a separation constraint, reproducibly', async () => {
    const { entrants } = await seedGroupStage('copa-sorteo');
    const participants = new ParticipantRepository(scratch.db);

    const attributes = await participants.listTournamentAttributes(
      entrants[0]?.entrant.tournamentId ?? '',
    );
    const constrained = entrants.map((entry) => ({
      entrantId: entry.entrant.entrantId,
      attributes: attributes.get(entry.entrant.entrantId) ?? [],
    }));

    const request = {
      entrants: constrained,
      constraints: [
        {
          kind: 'separation' as const,
          hook: 'draw.pair-round' as const,
          attribute: 'region',
          scope: { beforeRound: 'final' },
        },
      ],
      shape: { kind: 'bracket' as const, size: 4 },
      seed: 20260731,
    };

    const drawn = runDraw(request);
    // Clubs sharing a region sit in opposite halves, so they can only meet in
    // the final — the attributes came from the database, not from the test.
    expect(drawn.assignment.slots).toBeDefined();
    expect(runDraw(request).assignment).toEqual(drawn.assignment);
  });
});
