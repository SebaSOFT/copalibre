import {
  footballDescriptor,
  tennisDescriptor,
  validateRecordedOutcome,
  type DisciplineDescriptor,
  type RecordedOutcome,
} from '@copalibre/domain';
import {
  asRuleScript,
  evaluateNotificationRule,
  evaluateWinCondition,
  registerCopalibreVocabulary,
  registerWinConditionVocabulary,
  RulesRegistry,
  toRecordedEvents,
  type NotificationRule,
  type TiebreakPipeline,
} from '@copalibre/rules';
import {
  CompetitionRecordRepository,
  CompetitionRepository,
  newId,
  OrganizationRepository,
  TournamentRepository,
  withTransaction,
} from '@copalibre/persistence';
import { createMigratedDatabase } from '../../persistence/src/test-support/scratch-database.js';
import { computeStandings } from './standings/index.js';

/**
 * The 0009 contract end to end: an N-sided result recorded under the codes its
 * discipline declares, materialised into standings inside the finalising
 * transaction, still readable once the module that defined it is gone, and its
 * segment thresholds reaching an ordinary notification rule.
 */

const AUDIT = { actor: 'user:organizer-1', authorizationContext: 'scope:tournament.write' };

/** An eight-lane heat: N sides, placements, no winner. */
function heatDescriptor(): DisciplineDescriptor {
  const descriptorId = newId();
  return footballDescriptor({
    descriptorId,
    alias: `football-${descriptorId}`,
    name: 'Lane Heat',
    statistics: [
      { code: 'placement-points', label: 'Placement points', aggregation: 'sum' },
      { code: 'best-time', label: 'Best time', aggregation: 'min' },
      { code: 'heats', label: 'Heats', aggregation: 'count' },
    ],
  });
}

const placementPipeline: TiebreakPipeline = {
  id: 'heat-standings',
  version: 1,
  parameters: [
    {
      id: 'placement-points',
      label: 'Placement points',
      valueType: 'number',
      direction: 'higher_wins',
      missingValue: 'treat-as-worst',
      source: 'match-derived',
    },
    {
      id: 'best-time',
      label: 'Best time',
      valueType: 'number',
      direction: 'lower_wins',
      missingValue: 'treat-as-worst',
      source: 'match-derived',
    },
  ],
};

describe('discipline-driven results (integration)', () => {
  let scratch: Awaited<ReturnType<typeof createMigratedDatabase>>;
  let organizationId = '';

  beforeAll(async () => {
    scratch = await createMigratedDatabase('discipline-results');
    const organization = await withTransaction(scratch.db, (uow) =>
      new OrganizationRepository(scratch.db).create(uow, {
        alias: 'liga-disciplinas',
        name: 'Liga Disciplinas',
        ...AUDIT,
      }),
    );
    organizationId = organization.organizationId;
  });

  afterAll(async () => {
    await scratch?.drop();
  });

  async function seed(alias: string, descriptor: DisciplineDescriptor) {
    const tournaments = new TournamentRepository(scratch.db);
    const competition = new CompetitionRepository(scratch.db);

    return withTransaction(scratch.db, async (uow) => {
      await tournaments.saveDescriptor(uow, descriptor, { organizationId, ...AUDIT });
      const tournament = await tournaments.create(uow, {
        organizationId,
        alias,
        name: alias,
        descriptor,
        ...AUDIT,
      });
      const stage = await competition.createStageInTournament(uow, {
        tournamentId: tournament.tournamentId,
        number: 1,
        name: 'Heats',
        format: 'round-robin',
        organizationId,
        ...AUDIT,
      });
      const [fixture] = await competition.createFixtures(uow, {
        stageId: stage.stageId,
        fixtures: [{ round: 1 }],
        organizationId,
        ...AUDIT,
      });
      if (!fixture) throw new Error('fixture not created');
      const match = await competition.createMatch(uow, {
        fixtureId: fixture.fixtureId,
        number: 1,
        organizationId,
        ...AUDIT,
      });
      return { tournament, stage, match, descriptor };
    });
  }

  it('records an eight-sided outcome and materialises its standings in one transaction', async () => {
    const descriptor = heatDescriptor();
    const { tournament, stage, match } = await seed('copa-series', descriptor);
    const competition = new CompetitionRepository(scratch.db);
    const records = new CompetitionRecordRepository(scratch.db);

    const lanes = Array.from({ length: 8 }, (_unused, index) => `lane-${index + 1}`);
    const outcome: RecordedOutcome = {
      matchId: match.matchId,
      sides: lanes.map((entrantId, index) => ({
        entrantId,
        statistics: { 'placement-points': 16 - index * 2, 'best-time': 50 + index * 0.5 },
        placement: index + 1,
      })),
    };

    // The submission is checked against the discipline before it is stored.
    expect(validateRecordedOutcome(descriptor, outcome, { shape: 'placement' }).ok).toBe(true);

    const standings = computeStandings(descriptor, lanes, [outcome], placementPipeline);

    await withTransaction(scratch.db, async (uow) => {
      await competition.recordResult(uow, {
        matchId: match.matchId,
        result: {
          sides: outcome.sides,
          recordedAt: '2026-07-30T14:00:00.000Z',
        },
        organizationId,
        ...AUDIT,
      });
      await records.materialiseStandings(uow, {
        tournamentId: tournament.tournamentId,
        stageId: stage.stageId,
        matchId: match.matchId,
        rows: standings.rows.map((row) => ({ ...row })),
        trace: standings.trace.map((node) => ({ ...node })),
        fullyResolved: standings.fullyResolved,
        organizationId,
        ...AUDIT,
      });
    });

    const stored = await competition.findMatch(match.matchId);
    expect(stored?.result?.sides).toHaveLength(8);
    expect(stored?.result?.sides[0]).toMatchObject({ entrantId: 'lane-1', placement: 1 });

    const latest = await records.latestStandings(stage.stageId);
    expect(latest?.rows).toHaveLength(8);
    expect(latest?.rows[0]).toMatchObject({ entrantId: 'lane-1', rank: 1 });
    // Every lane's declared statistics survived the round trip.
    expect(latest?.rows[7]).toMatchObject({
      entrantId: 'lane-8',
      statistics: { 'placement-points': 2, heats: 1 },
    });
  });

  it('renders a finished tournament’s standings after its descriptor version is deleted', async () => {
    const descriptor = heatDescriptor();
    const { tournament, stage, match } = await seed('copa-retirada', descriptor);
    const records = new CompetitionRecordRepository(scratch.db);
    const competition = new CompetitionRepository(scratch.db);

    const lanes = ['lane-1', 'lane-2', 'lane-3'];
    const outcome: RecordedOutcome = {
      matchId: match.matchId,
      sides: lanes.map((entrantId, index) => ({
        entrantId,
        statistics: { 'placement-points': 6 - index * 2, 'best-time': 51 + index },
        placement: index + 1,
      })),
    };
    const standings = computeStandings(descriptor, lanes, [outcome], placementPipeline);

    await withTransaction(scratch.db, async (uow) => {
      await competition.recordResult(uow, {
        matchId: match.matchId,
        result: { sides: outcome.sides, recordedAt: '2026-07-30T15:00:00.000Z' },
        organizationId,
        ...AUDIT,
      });
      await records.materialiseStandings(uow, {
        tournamentId: tournament.tournamentId,
        stageId: stage.stageId,
        matchId: match.matchId,
        rows: standings.rows.map((row) => ({ ...row })),
        trace: standings.trace.map((node) => ({ ...node })),
        fullyResolved: standings.fullyResolved,
        organizationId,
        ...AUDIT,
      });
    });

    // Retire the module version the tournament was played under.
    await scratch.db
      .deleteFrom('discipline_descriptors')
      .where('descriptor_id', '=', descriptor.descriptorId)
      .execute();
    expect(
      await new TournamentRepository(scratch.db).findDescriptor(
        descriptor.descriptorId,
        descriptor.version,
      ),
    ).toBeUndefined();

    const latest = await records.latestStandings(stage.stageId);
    expect(latest?.rows[0]).toMatchObject({
      entrantId: 'lane-1',
      rank: 1,
      // The codes are stored verbatim, so the table still reads without the module.
      statistics: { 'placement-points': 6 },
    });

    const stored = await competition.findMatch(match.matchId);
    expect(stored?.result?.sides[0]?.statistics['placement-points']).toBe(6);
  });

  it('delivers a segment-threshold event to a subscribed notification rule', async () => {
    const descriptorId = newId();
    const tennis = tennisDescriptor({ descriptorId, alias: `tennis-${descriptorId}` });
    const { match } = await seed('copa-tenis', tennis);
    const competition = new CompetitionRepository(scratch.db);

    const registry = registerWinConditionVocabulary(
      registerCopalibreVocabulary(new RulesRegistry()),
    );
    const decision = evaluateWinCondition(registry, {
      script: asRuleScript(tennis.winCondition),
      ruleVersion: { id: 'tennis-best-of-three', version: 1 },
      progress: {
        matchId: match.matchId,
        entrantIds: ['alfa', 'bravo'],
        // One set each way, so a third decides: alfa is a set from the match.
        segments: [
          { type: 'set', unit: 'game', units: { alfa: 6, bravo: 4 } },
          { type: 'set', unit: 'game', units: { alfa: 3, bravo: 6 } },
        ],
      },
    });
    if (!decision.ok) throw decision.error;

    const events = toRecordedEvents(decision.value.events, {
      segmentId: newId(),
      occurredAt: '2026-07-30T16:00:00.000Z',
      eventIdPrefix: `${match.matchId}-threshold`,
    });
    expect(events.some((event) => event.definitionCode === 'match-point')).toBe(true);

    const rule: NotificationRule = {
      id: 'match-point-alert',
      version: 1,
      scope: 'match',
      predicate: { definitionCodes: ['match-point'] },
      aggregation: { kind: 'count' },
      threshold: { comparator: '>=', value: 1 },
      semantics: { kind: 'threshold-crossing' },
      action: {
        severity: 'info',
        titleTemplate: 'Match point',
        messageTemplate: 'Match point in {{scopeKey}}',
        targetRole: 'table-official',
      },
    };

    const evaluation = evaluateNotificationRule(rule, tennis, events);
    expect(evaluation.instances).toHaveLength(1);
    expect(evaluation.instances[0]).toMatchObject({
      scopeKey: `match:${match.matchId}`,
      targetRole: 'table-official',
    });

    // The match itself is untouched: a threshold is an observation, not a result.
    expect((await competition.findMatch(match.matchId))?.result).toBeUndefined();
  });
});
