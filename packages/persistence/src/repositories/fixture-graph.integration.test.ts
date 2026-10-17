import {
  winConditionScript,
  type DisciplineDescriptor,
  type SeriesDeclaration,
} from '@copalibre/domain';
import { AuditReader } from '../audit.js';
import { InvariantViolationError } from '../errors.js';
import type {
  FixtureGraphSlotSource,
  PersistedFixtureNode,
  PersistedFixtureResolution,
  ResolvedFixtureSide,
  ZoneEntrantResolver,
  ZoneResolutionInput,
} from '../fixture-graph.js';
import { newId } from '../ids.js';
import { OutboxReader } from '../outbox.js';
import { StageReadModel } from '../projections/stage-read-model.js';
import { createMigratedDatabase, type ScratchDatabase } from '../test-support/scratch-database.js';
import { testCapabilities } from '../test-support/test-dialect.js';
import { withTransaction } from '../transaction.js';
import { ZoneEntrantResolution } from '../zone-entrant-resolution.js';
import { CompetitionRepository } from './competition-repository.js';
import { EnrollmentRepository } from './enrollment-repository.js';
import { OrganizationRepository } from './organization-repository.js';
import { ScheduleRepository } from './schedule-repository.js';
import { TournamentRepository } from './tournament-repository.js';

const AUDIT = { actor: 'user:organizer-1', authorizationContext: 'scope:tournament.write' };
const BASE = Date.UTC(2026, 9, 1, 14, 0, 0);

function descriptor(): DisciplineDescriptor {
  const descriptorId = newId();
  return {
    descriptorId,
    alias: `copa-grafo-${descriptorId}`,
    version: '1.0.0',
    name: 'Copa Grafo',
    attribution: { author: 'CopaLibre tests', licence: 'AGPL-3.0-only' },
    participantTypes: ['team'],
    rosterConstraints: { minPlayers: 1, maxPlayers: 11 },
    segmentTypes: [{ name: 'half', label: 'Half', timed: true }],
    eventDefinitions: [],
    statistics: [],
    scoringInputs: [],
    availableFormats: ['single-elimination', 'double-elimination'],
    winCondition: winConditionScript('higher-score-wins', { unit: 'goals' }),
    notificationRuleCapabilities: [],
    defaults: {},
    fieldPolicies: {},
  };
}

const entrant = (entrantId: string, seed: number): FixtureGraphSlotSource => ({
  kind: 'entrant',
  entrantId,
  seed,
});
const winnerOf = (nodeKey: string): FixtureGraphSlotSource => ({
  kind: 'winner-of',
  matchId: nodeKey,
});
const loserOf = (nodeKey: string): FixtureGraphSlotSource => ({
  kind: 'loser-of',
  matchId: nodeKey,
});

/**
 * A deterministic stand-in for the engine: entrants resolve to themselves, `winner-of`/`loser-of`
 * to the first match's recorded result, and a contingent node to whatever the test sets. It is
 * enough to drive persistence's own responsibilities without importing the engine.
 */
function stubResolver(state: { contingency: PersistedFixtureResolution['contingency'] }): {
  readonly resolve: ZoneEntrantResolver;
  readonly calls: ZoneResolutionInput[];
} {
  const calls: ZoneResolutionInput[] = [];
  const resolve: ZoneEntrantResolver = (input) => {
    calls.push(input);
    const sideOf = (source: FixtureGraphSlotSource): ResolvedFixtureSide => {
      if (source.kind === 'entrant') return { state: 'entrant', entrantId: source.entrantId };
      if (source.kind === 'bye') return { state: 'empty' };
      if (source.kind === 'qualifier') {
        const entrantId = input.qualifierEntrants
          ?.get(source.promotionPlanId)
          ?.get(source.position);
        return entrantId === undefined ? { state: 'pending' } : { state: 'entrant', entrantId };
      }
      if (source.kind !== 'winner-of' && source.kind !== 'loser-of') return { state: 'pending' };
      const outcome = input.outcomes.find(
        (entry) => entry.nodeKey === source.matchId && entry.matchNumber === 1,
      )?.outcome;
      const winner = outcome?.winnerEntrantId;
      if (winner === undefined) return { state: 'pending' };
      const entrantId =
        source.kind === 'winner-of'
          ? winner
          : outcome?.sides.find((side) => side.entrantId !== winner)?.entrantId;
      return entrantId === undefined ? { state: 'pending' } : { state: 'entrant', entrantId };
    };
    return input.nodes.map((node) => ({
      nodeKey: node.nodeKey,
      sides: [sideOf(node.sides[0]), sideOf(node.sides[1])],
      ...(node.contingency === undefined || state.contingency === undefined
        ? {}
        : { contingency: state.contingency }),
    }));
  };
  return { resolve, calls };
}

describe('persisted fixture graph (integration)', () => {
  let scratch: ScratchDatabase;
  let organizationId = '';
  let competition: CompetitionRepository;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('fixture_graph');
    competition = new CompetitionRepository(scratch.db);
    const organization = await withTransaction(scratch.db, (uow) =>
      new OrganizationRepository(scratch.db).create(uow, {
        alias: 'liga-grafo',
        name: 'Liga Grafo',
        ...AUDIT,
      }),
    );
    organizationId = organization.organizationId;
  });

  afterAll(async () => {
    await scratch?.drop();
  });

  /** A tournament with one elimination stage, one zone and four registered entrants. */
  async function seedZone(alias: string) {
    const tournaments = new TournamentRepository(scratch.db);
    const participants = new EnrollmentRepository(scratch.db);
    return withTransaction(scratch.db, async (uow) => {
      const disciplineDescriptor = descriptor();
      await tournaments.saveDescriptor(uow, disciplineDescriptor, { organizationId, ...AUDIT });
      const tournament = await tournaments.create(uow, {
        organizationId,
        alias,
        name: alias,
        descriptor: disciplineDescriptor,
        ...AUDIT,
      });
      const stage = await competition.createStageInTournament(uow, {
        tournamentId: tournament.tournamentId,
        number: 1,
        name: 'Playoffs',
        format: 'single-elimination',
        organizationId,
        ...AUDIT,
      });
      const zone = await competition.createZone(uow, {
        stageId: stage.stageId,
        number: 1,
        name: 'Zona A',
        organizationId,
        ...AUDIT,
      });
      const entrantIds: string[] = [];
      for (const name of ['Alfa', 'Bravo', 'Charlie', 'Delta']) {
        const team = await participants.createTeam(uow, { organizationId, name, ...AUDIT });
        const registered = await participants.registerEntrant(uow, {
          tournamentId: tournament.tournamentId,
          entrantRef: { kind: 'team', teamId: team.teamId },
          organizationId,
          ...AUDIT,
        });
        entrantIds.push(registered.entrantId);
      }
      const [a, b, c, d] = entrantIds as [string, string, string, string];
      return { tournament, stage, zone, a, b, c, d };
    });
  }

  /** Two semi-finals feeding a final. */
  const bracketOf = (
    e: { a: string; b: string; c: string; d: string },
    seriesSpan = 1,
  ): PersistedFixtureNode[] => [
    {
      nodeKey: 'sf-1',
      bracket: 'winners',
      round: 1,
      position: 1,
      sides: [entrant(e.a, 1), entrant(e.d, 4)],
      seriesSpan,
    },
    {
      nodeKey: 'sf-2',
      bracket: 'winners',
      round: 1,
      position: 2,
      sides: [entrant(e.b, 2), entrant(e.c, 3)],
      seriesSpan,
    },
    {
      nodeKey: 'final',
      bracket: 'winners',
      round: 2,
      position: 1,
      label: 'Final',
      sides: [winnerOf('sf-1'), winnerOf('sf-2')],
      seriesSpan: 1,
    },
  ];

  async function createGraph(stageId: string, zoneId: string, nodes: PersistedFixtureNode[]) {
    return withTransaction(scratch.db, (uow) =>
      competition.createFixtureGraph(uow, { stageId, zoneId, nodes, organizationId, ...AUDIT }),
    );
  }

  async function matchesOfNode(zoneId: string, nodeKey: string) {
    return scratch.db
      .selectFrom('matches')
      .innerJoin('fixtures', 'fixtures.fixture_id', 'matches.fixture_id')
      .select(['matches.match_id', 'matches.number', 'matches.status'])
      .where('fixtures.zone_id', '=', zoneId)
      .where('fixtures.node_key', '=', nodeKey)
      .orderBy('matches.number')
      .execute();
  }

  async function fixtureOf(zoneId: string, nodeKey: string) {
    return scratch.db
      .selectFrom('fixtures')
      .select(['fixture_id', 'home_entrant_id', 'away_entrant_id'])
      .where('zone_id', '=', zoneId)
      .where('node_key', '=', nodeKey)
      .executeTakeFirstOrThrow();
  }

  /** Finalizes a stored match as a 1-0 win, inside the caller's transaction when given one. */
  const finalizeIn = (winner: string, loser: string) => ({
    status: 'finalized' as const,
    result: JSON.stringify({
      winnerEntrantId: winner,
      sides: [
        { entrantId: winner, statistics: { score: 1 } },
        { entrantId: loser, statistics: { score: 0 } },
      ],
    }),
  });

  async function finalize(matchId: string, winner: string, loser: string) {
    await scratch.db
      .updateTable('matches')
      .set(finalizeIn(winner, loser))
      .where('match_id', '=', matchId)
      .execute();
  }

  const resolutionWith = (resolve: ZoneEntrantResolver, series?: SeriesDeclaration) =>
    new ZoneEntrantResolution(scratch.db, resolve, async () => series);

  const run = (resolution: ZoneEntrantResolution, zoneId: string) =>
    withTransaction(scratch.db, (uow) => resolution.run(uow, zoneId, { organizationId, ...AUDIT }));

  it('round-trips node identity, stored position and side sources through the read model', async () => {
    const seeded = await seedZone('copa-grafo-ida-vuelta');
    // Inserted out of bracket order: position must come from storage, not insertion order.
    const [sf1, sf2, final] = bracketOf(seeded) as [
      PersistedFixtureNode,
      PersistedFixtureNode,
      PersistedFixtureNode,
    ];
    await createGraph(seeded.stage.stageId, seeded.zone.zoneId, [final, sf2, sf1]);

    const records = await new StageReadModel(scratch.db).matches(
      seeded.stage.stageId,
      undefined,
      seeded.zone.zoneId,
    );
    const byKey = new Map(records.map((record) => [record.node?.nodeKey, record]));
    expect(byKey.get('sf-1')).toMatchObject({ round: 1, position: 1 });
    expect(byKey.get('sf-2')).toMatchObject({ round: 1, position: 2 });
    expect(byKey.get('final')).toMatchObject({
      round: 2,
      position: 1,
      node: { nodeKey: 'final', bracket: 'winners', label: 'Final' },
    });
    expect(byKey.get('final')?.node?.sources).toEqual([winnerOf('sf-1'), winnerOf('sf-2')]);
    expect(byKey.get('final')?.homeEntrantId).toBeUndefined();
  });

  it('creates every match of a node series span', async () => {
    const seeded = await seedZone('copa-grafo-serie');
    await createGraph(seeded.stage.stageId, seeded.zone.zoneId, bracketOf(seeded, 3));
    expect((await matchesOfNode(seeded.zone.zoneId, 'sf-1')).map((m) => m.number)).toEqual([
      1, 2, 3,
    ]);
    expect(await matchesOfNode(seeded.zone.zoneId, 'final')).toHaveLength(1);
  });

  it('refuses an edge to a node the graph does not contain', async () => {
    const seeded = await seedZone('copa-grafo-arista');
    const [sf1, sf2, final] = bracketOf(seeded) as [
      PersistedFixtureNode,
      PersistedFixtureNode,
      PersistedFixtureNode,
    ];
    await expect(
      createGraph(seeded.stage.stageId, seeded.zone.zoneId, [
        sf1,
        sf2,
        { ...final, sides: [winnerOf('sf-1'), winnerOf('sf-3')] },
      ]),
    ).rejects.toBeInstanceOf(InvariantViolationError);
  });

  it('refuses legacy entrant writes once a zone holds a persisted graph', async () => {
    const seeded = await seedZone('copa-grafo-escritura');
    await createGraph(seeded.stage.stageId, seeded.zone.zoneId, bracketOf(seeded));
    const legacy = {
      stageId: seeded.stage.stageId,
      fixtures: [
        { round: 1, zoneId: seeded.zone.zoneId, homeEntrantId: seeded.a, awayEntrantId: seeded.b },
      ],
      organizationId,
      ...AUDIT,
    };
    await expect(
      withTransaction(scratch.db, (uow) => competition.createFixtures(uow, legacy)),
    ).rejects.toBeInstanceOf(InvariantViolationError);
    await expect(
      withTransaction(scratch.db, (uow) => competition.replaceFixtures(uow, legacy)),
    ).rejects.toBeInstanceOf(InvariantViolationError);
  });

  it('replaces a graph only while none of its matches progressed', async () => {
    const seeded = await seedZone('copa-grafo-reemplazo');
    const nodes = bracketOf(seeded);
    await createGraph(seeded.stage.stageId, seeded.zone.zoneId, nodes);
    const replace = () =>
      withTransaction(scratch.db, (uow) =>
        competition.replaceFixtureGraph(uow, {
          stageId: seeded.stage.stageId,
          zoneId: seeded.zone.zoneId,
          nodes,
          organizationId,
          ...AUDIT,
        }),
      );
    await expect(replace()).resolves.toHaveLength(3);

    const [sf1] = await matchesOfNode(seeded.zone.zoneId, 'sf-1');
    await finalize(sf1?.match_id as string, seeded.a, seeded.d);
    await expect(replace()).rejects.toBeInstanceOf(InvariantViolationError);
  });

  it('writes only changed sides, audited and published, and is idempotent', async () => {
    const seeded = await seedZone('copa-grafo-resolucion');
    await createGraph(seeded.stage.stageId, seeded.zone.zoneId, bracketOf(seeded));
    const { resolve } = stubResolver({ contingency: undefined });
    const resolution = resolutionWith(resolve);

    const first = await run(resolution, seeded.zone.zoneId);
    expect(first).toMatchObject({ persisted: true, changedSides: 4 });
    expect(await fixtureOf(seeded.zone.zoneId, 'sf-1')).toMatchObject({
      home_entrant_id: seeded.a,
      away_entrant_id: seeded.d,
    });
    expect(await fixtureOf(seeded.zone.zoneId, 'final')).toMatchObject({
      home_entrant_id: null,
      away_entrant_id: null,
    });

    const [finalMatch] = await matchesOfNode(seeded.zone.zoneId, 'final');
    const auditBefore = await new AuditReader(scratch.db).historyFor(
      'match',
      finalMatch?.match_id as string,
    );
    await expect(run(resolution, seeded.zone.zoneId)).resolves.toMatchObject({ changedSides: 0 });
    expect(
      await new AuditReader(scratch.db).historyFor('match', finalMatch?.match_id as string),
    ).toHaveLength(auditBefore.length);

    const [sf1] = await matchesOfNode(seeded.zone.zoneId, 'sf-1');
    await finalize(sf1?.match_id as string, seeded.a, seeded.d);
    await expect(run(resolution, seeded.zone.zoneId)).resolves.toMatchObject({ changedSides: 1 });
    expect(await fixtureOf(seeded.zone.zoneId, 'final')).toMatchObject({
      home_entrant_id: seeded.a,
      away_entrant_id: null,
    });

    const history = await new AuditReader(scratch.db).historyFor(
      'match',
      finalMatch?.match_id as string,
    );
    const resolved = history.filter((entry) => entry.action === 'fixture.entrant-resolved');
    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.previousState).toMatchObject({
      nodeKey: 'final',
      side: 'home',
      entrantId: null,
    });
    expect(resolved[0]?.resultingState).toMatchObject({ side: 'home', entrantId: seeded.a });
    const events = (await new OutboxReader(scratch.db).pending(10_000)).filter(
      (event) =>
        event.eventType === 'fixture.entrant-resolved' && event.entityId === finalMatch?.match_id,
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toMatchObject({
      side: 'home',
      previousEntrantId: null,
      entrantId: seeded.a,
    });
  });

  it('resolves qualifier sides only from a confirmed plan, and a changed plan clears it', async () => {
    const seeded = await seedZone('copa-grafo-clasificados');
    const plan = await withTransaction(scratch.db, async (uow) => {
      const source = await competition.createZone(uow, {
        stageId: seeded.stage.stageId,
        number: 2,
        name: 'Grupos',
        organizationId,
        ...AUDIT,
      });
      return competition.createPromotionPlan(uow, {
        zoneId: source.zoneId,
        nextStageId: seeded.stage.stageId,
        plan: { perGroupAdvance: 2, combination: { mode: 'group-order' } },
        organizationId,
        ...AUDIT,
      });
    });
    const qualifier = (position: number): FixtureGraphSlotSource => ({
      kind: 'qualifier',
      promotionPlanId: plan.promotionPlanId,
      position,
    });
    await createGraph(seeded.stage.stageId, seeded.zone.zoneId, [
      {
        nodeKey: 'sf-1',
        bracket: 'winners',
        round: 1,
        position: 1,
        sides: [qualifier(1), qualifier(4)],
        seriesSpan: 1,
      },
      {
        nodeKey: 'sf-2',
        bracket: 'winners',
        round: 1,
        position: 2,
        sides: [qualifier(2), qualifier(3)],
        seriesSpan: 1,
      },
    ]);
    const { resolve, calls } = stubResolver({ contingency: undefined });
    const resolution = resolutionWith(resolve);

    await expect(run(resolution, seeded.zone.zoneId)).resolves.toMatchObject({ changedSides: 0 });
    expect(calls.at(-1)?.qualifierEntrants).toBeUndefined();

    await withTransaction(scratch.db, (uow) =>
      competition.confirmPromotionPlan(uow, {
        promotionPlanId: plan.promotionPlanId,
        resolution: { '1': seeded.a, '2': seeded.b, '3': seeded.c, '4': seeded.d },
        organizationId,
        ...AUDIT,
      }),
    );
    await expect(run(resolution, seeded.zone.zoneId)).resolves.toMatchObject({ changedSides: 4 });
    expect(await fixtureOf(seeded.zone.zoneId, 'sf-1')).toMatchObject({
      home_entrant_id: seeded.a,
      away_entrant_id: seeded.d,
    });
    await expect(competition.findPromotionPlan(plan.zoneId)).resolves.toMatchObject({
      confirmedResolution: { '1': seeded.a, '4': seeded.d },
    });
    const history = await new AuditReader(scratch.db).historyFor('zone', plan.zoneId);
    expect(history.map((entry) => entry.action)).toContain('promotion-plan.confirmed');

    await withTransaction(scratch.db, (uow) =>
      competition.createPromotionPlan(uow, {
        zoneId: plan.zoneId,
        nextStageId: seeded.stage.stageId,
        plan: { perGroupAdvance: 1, combination: { mode: 'group-order' } },
        organizationId,
        ...AUDIT,
      }),
    );
    const changed = await competition.findPromotionPlan(plan.zoneId);
    expect(changed?.confirmedResolution).toBeUndefined();
  });

  it('announces a rest conflict a resolution makes real among published placements, once', async () => {
    const seeded = await seedZone('copa-grafo-descanso');
    await createGraph(seeded.stage.stageId, seeded.zone.zoneId, bracketOf(seeded));
    const schedules = new ScheduleRepository(scratch.db);
    const [sf1] = await matchesOfNode(seeded.zone.zoneId, 'sf-1');
    const [final] = await matchesOfNode(seeded.zone.zoneId, 'final');
    await withTransaction(scratch.db, async (uow) => {
      await new TournamentRepository(scratch.db).setMinimumRest(uow, {
        tournamentId: seeded.tournament.tournamentId,
        organizationId,
        minimumRestMinutes: 120,
        ...AUDIT,
      });
      const venue = await schedules.createVenue(uow, {
        organizationId,
        alias: `cancha-${newId()}`,
        name: 'Cancha',
        concurrentCapacity: 2,
        ...AUDIT,
      });
      const schedule = await schedules.createSchedule(uow, {
        organizationId,
        name: 'Llave',
        startsAt: BASE,
        endsAt: BASE + 4 * 60 * 60_000,
        slotMinutes: 60,
        turnaroundMinutes: 0,
        venueIds: [venue.venueId],
        ...AUDIT,
      });
      const [early, later] = await schedules.listScheduleSlots(schedule.scheduleId, uow);
      // The final is undecided, so its rest is not checked yet and the placement publishes.
      await schedules.publishSchedule(uow, {
        organizationId,
        assignments: [
          { matchId: sf1?.match_id as string, slotId: early?.slotId as string },
          { matchId: final?.match_id as string, slotId: later?.slotId as string },
        ],
        ...AUDIT,
      });
    });
    const resolution = resolutionWith(stubResolver({ contingency: undefined }).resolve);
    await run(resolution, seeded.zone.zoneId);

    const arisen = async () =>
      (await new OutboxReader(scratch.db).pending(10_000)).filter(
        (event) =>
          event.eventType === 'schedule.conflict-arose' && event.entityId === final?.match_id,
      );
    expect(await arisen()).toEqual([]);

    await finalize(sf1?.match_id as string, seeded.a, seeded.d);
    await run(resolution, seeded.zone.zoneId);
    const events = await arisen();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      stream: `organization:${organizationId}`,
      payload: {
        kind: 'rest-rule',
        matchId: final?.match_id,
        conflictsWithMatchId: sf1?.match_id,
        resourceId: seeded.a,
      },
    });
    await expect(
      schedules.currentConflictsForStage(organizationId, seeded.stage.stageId),
    ).resolves.toEqual([expect.objectContaining({ kind: 'rest-rule' })]);

    // Resolving again changes nothing, so nothing is announced again.
    await run(resolution, seeded.zone.zoneId);
    expect(await arisen()).toHaveLength(1);
  });

  it('previews a correction through the writer resolver without changing facts or emitting events', async () => {
    const seeded = await seedZone('copa-grafo-preview');
    await createGraph(seeded.stage.stageId, seeded.zone.zoneId, bracketOf(seeded));
    const { resolve } = stubResolver({ contingency: undefined });
    const resolution = resolutionWith(resolve);
    await run(resolution, seeded.zone.zoneId);
    const [semi] = await matchesOfNode(seeded.zone.zoneId, 'sf-1');
    if (!semi) throw new Error('Expected a semi-final');
    await finalize(semi.match_id, seeded.a, seeded.d);
    await run(resolution, seeded.zone.zoneId);
    const before = await fixtureOf(seeded.zone.zoneId, 'final');
    const eventsBefore = (await new OutboxReader(scratch.db).pending(10_000)).length;
    const preview = await withTransaction(scratch.db, (uow) =>
      resolution.run(
        uow,
        seeded.zone.zoneId,
        { organizationId, ...AUDIT },
        {
          dryRun: true,
          replacement: {
            matchId: semi.match_id,
            result: JSON.parse(finalizeIn(seeded.d, seeded.a).result) as unknown,
          },
        },
      ),
    );
    expect(preview.changedSides).toBe(1);
    expect(await fixtureOf(seeded.zone.zoneId, 'final')).toEqual(before);
    expect((await new OutboxReader(scratch.db).pending(10_000)).length).toBe(eventsBefore);
    await finalize(semi.match_id, seeded.d, seeded.a);
    const committed = await run(resolution, seeded.zone.zoneId);
    expect(committed.reResolved).toEqual(preview.reResolved);
    expect(await fixtureOf(seeded.zone.zoneId, 'final')).toMatchObject({
      home_entrant_id: seeded.d,
    });
  });

  it.each(['in-progress', 'finalized', 'forfeited'])(
    'protects all games of a fixture when one is %s',
    async (status) => {
      const seeded = await seedZone(`copa-grafo-protegido-${status}`);
      const nodes = bracketOf(seeded).map((node) =>
        node.nodeKey === 'final' ? { ...node, seriesSpan: 3 } : node,
      );
      await createGraph(seeded.stage.stageId, seeded.zone.zoneId, nodes);
      const { resolve } = stubResolver({ contingency: undefined });
      const resolution = resolutionWith(resolve, { span: 3, resolutionClass: 'best-of' });
      await run(resolution, seeded.zone.zoneId);
      const [semi] = await matchesOfNode(seeded.zone.zoneId, 'sf-1');
      if (!semi) throw new Error('Expected a semi-final match');
      await finalize(semi.match_id, seeded.a, seeded.d);
      await run(resolution, seeded.zone.zoneId);
      const finalGames = await matchesOfNode(seeded.zone.zoneId, 'final');
      const firstFinal = finalGames[0];
      if (!firstFinal) throw new Error('Expected the final series');
      const before = await fixtureOf(seeded.zone.zoneId, 'final');
      const audits = await new AuditReader(scratch.db).historyFor('match', firstFinal.match_id);
      await scratch.db
        .updateTable('matches')
        .set({ status })
        .where('match_id', '=', firstFinal.match_id)
        .execute();
      await finalize(semi.match_id, seeded.d, seeded.a);
      const result = await run(resolution, seeded.zone.zoneId);
      expect(result.changedSides).toBe(0);
      expect(result.blockedPropagation).toEqual([
        {
          fixtureId: before.fixture_id,
          matchIds: finalGames.map((match) => match.match_id),
          side: 'home',
          currentEntrantId: seeded.a,
          resultingEntrantId: seeded.d,
        },
      ]);
      expect(await fixtureOf(seeded.zone.zoneId, 'final')).toEqual(before);
      expect(
        await new AuditReader(scratch.db).historyFor('match', firstFinal.match_id),
      ).toHaveLength(audits.length);
      expect(finalGames).toHaveLength(3);
    },
  );

  it('passes outcomes keyed by node and match number, and the zone series only when a node spans several matches', async () => {
    const seeded = await seedZone('copa-grafo-claves');
    await createGraph(seeded.stage.stageId, seeded.zone.zoneId, bracketOf(seeded, 3));
    const declaration: SeriesDeclaration = { span: 3, resolutionClass: 'best-of' };
    const { resolve, calls } = stubResolver({ contingency: undefined });
    const [, second] = await matchesOfNode(seeded.zone.zoneId, 'sf-1');
    await finalize(second?.match_id as string, seeded.d, seeded.a);

    await run(resolutionWith(resolve, declaration), seeded.zone.zoneId);
    const call = calls.at(-1);
    expect(call?.series).toEqual(declaration);
    expect(call?.outcomes).toEqual([
      {
        nodeKey: 'sf-1',
        matchNumber: 2,
        outcome: expect.objectContaining({
          matchId: second?.match_id,
          winnerEntrantId: seeded.d,
        }),
      },
    ]);
    expect(call?.nodes.find((node) => node.nodeKey === 'sf-1')?.seriesSpan).toBe(3);

    const single = await seedZone('copa-grafo-sin-serie');
    await createGraph(single.stage.stageId, single.zone.zoneId, bracketOf(single));
    const lookups: unknown[] = [];
    await withTransaction(scratch.db, (uow) =>
      new ZoneEntrantResolution(scratch.db, resolve, async (zone) => {
        lookups.push(zone);
        return declaration;
      }).run(uow, single.zone.zoneId, { organizationId, ...AUDIT }),
    );
    expect(lookups).toEqual([]);
    expect(calls.at(-1)?.series).toBeUndefined();
  });

  it('releases an unneeded bracket reset with its slot and revives it when it is needed again', async () => {
    const seeded = await seedZone('copa-grafo-reset');
    await createGraph(seeded.stage.stageId, seeded.zone.zoneId, [
      {
        nodeKey: 'gf',
        bracket: 'grand-final',
        round: 1,
        position: 1,
        sides: [entrant(seeded.a, 1), entrant(seeded.b, 2)],
        seriesSpan: 1,
      },
      {
        nodeKey: 'reset',
        bracket: 'grand-final',
        round: 2,
        position: 1,
        sides: [winnerOf('gf'), loserOf('gf')],
        seriesSpan: 1,
        contingency: 'bracket-reset',
      },
    ]);
    const [resetMatch] = await matchesOfNode(seeded.zone.zoneId, 'reset');
    const schedules = new ScheduleRepository(scratch.db);
    await withTransaction(scratch.db, async (uow) => {
      const venue = await schedules.createVenue(uow, {
        organizationId,
        alias: 'cancha-reset',
        name: 'Cancha Reset',
        concurrentCapacity: 1,
        ...AUDIT,
      });
      const schedule = await schedules.createSchedule(uow, {
        organizationId,
        name: 'Final',
        startsAt: BASE,
        endsAt: BASE + 2 * 60 * 60_000,
        slotMinutes: 60,
        turnaroundMinutes: 0,
        venueIds: [venue.venueId],
        ...AUDIT,
      });
      const [slot] = await schedules.listScheduleSlots(schedule.scheduleId, uow);
      await schedules.publishSchedule(uow, {
        organizationId,
        assignments: [{ matchId: resetMatch?.match_id as string, slotId: slot?.slotId as string }],
        ...AUDIT,
      });
    });
    const assignmentsOf = () =>
      scratch.db
        .selectFrom('match_schedule_assignments')
        .select('match_id')
        .where('match_id', '=', resetMatch?.match_id as string)
        .execute();
    expect(await assignmentsOf()).toHaveLength(1);

    const state: { contingency: PersistedFixtureResolution['contingency'] } = {
      contingency: 'not-required',
    };
    const { resolve } = stubResolver(state);
    const released = await run(resolutionWith(resolve), seeded.zone.zoneId);
    expect(released.anulledMatchIds).toEqual([resetMatch?.match_id]);
    expect((await matchesOfNode(seeded.zone.zoneId, 'reset'))[0]?.status).toBe('not-required');
    expect(await assignmentsOf()).toHaveLength(0);

    state.contingency = 'required';
    const revived = await run(resolutionWith(resolve), seeded.zone.zoneId);
    expect(revived.reinstatedMatchIds).toEqual([resetMatch?.match_id]);
    expect((await matchesOfNode(seeded.zone.zoneId, 'reset'))[0]?.status).toBe('scheduled');
  });

  it('leaves a legacy zone untouched and reads it as before', async () => {
    const seeded = await seedZone('copa-grafo-legado');
    await withTransaction(scratch.db, (uow) =>
      competition.createFixtures(uow, {
        stageId: seeded.stage.stageId,
        fixtures: [
          {
            round: 1,
            zoneId: seeded.zone.zoneId,
            homeEntrantId: seeded.a,
            awayEntrantId: seeded.d,
          },
          {
            round: 1,
            zoneId: seeded.zone.zoneId,
            homeEntrantId: seeded.b,
            awayEntrantId: seeded.c,
          },
        ],
        organizationId,
        ...AUDIT,
      }),
    );
    const { resolve, calls } = stubResolver({ contingency: undefined });
    await expect(run(resolutionWith(resolve), seeded.zone.zoneId)).resolves.toEqual({
      persisted: false,
      changedSides: 0,
      anulledMatchIds: [],
      reinstatedMatchIds: [],
    });
    expect(calls).toHaveLength(0);

    const records = await new StageReadModel(scratch.db).matches(seeded.stage.stageId);
    expect(records.map((record) => [record.round, record.position, record.homeEntrantId])).toEqual([
      [1, 1, seeded.a],
      [1, 2, seeded.b],
    ]);
    expect(records.every((record) => record.node === undefined)).toBe(true);
  });

  it('resolves both sides when the two semi-finals are finalized concurrently', async () => {
    if (!testCapabilities(scratch.db).supportsRowLocks) return;
    const seeded = await seedZone('copa-grafo-concurrente');
    await createGraph(seeded.stage.stageId, seeded.zone.zoneId, bracketOf(seeded));
    const { resolve } = stubResolver({ contingency: undefined });
    const resolution = resolutionWith(resolve);
    await run(resolution, seeded.zone.zoneId);
    const [sf1] = await matchesOfNode(seeded.zone.zoneId, 'sf-1');
    const [sf2] = await matchesOfNode(seeded.zone.zoneId, 'sf-2');

    // Each transaction records its own result and then resolves, as a result path will.
    const finalizeAndResolve = (matchId: string, winner: string, loser: string) =>
      withTransaction(scratch.db, async (uow) => {
        await uow.tx
          .updateTable('matches')
          .set(finalizeIn(winner, loser))
          .where('match_id', '=', matchId)
          .execute();
        return resolution.run(uow, seeded.zone.zoneId, { organizationId, ...AUDIT });
      });
    await Promise.all([
      finalizeAndResolve(sf1?.match_id as string, seeded.a, seeded.d),
      finalizeAndResolve(sf2?.match_id as string, seeded.c, seeded.b),
    ]);

    expect(await fixtureOf(seeded.zone.zoneId, 'final')).toMatchObject({
      home_entrant_id: seeded.a,
      away_entrant_id: seeded.c,
    });
  });
});
