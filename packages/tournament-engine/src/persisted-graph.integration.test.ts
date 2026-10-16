import {
  winConditionScript,
  type DisciplineDescriptor,
  type SeriesDeclaration,
} from '@copalibre/domain';
import {
  CompetitionRepository,
  EnrollmentRepository,
  newId,
  OrganizationRepository,
  TournamentRepository,
  withTransaction,
  ZoneEntrantResolution,
  type PersistedFixtureNode,
  type ZoneEntrantResolver,
} from '@copalibre/persistence';
import { createMigratedDatabase } from '../../persistence/src/test-support/scratch-database.js';
import { resolvePersistedNodes } from './advancement/index.js';
import { generateFixtures } from './fixtures/index.js';
import { isDuelMatch, type FixtureGraph } from './types.js';

/**
 * The engine's persisted-graph resolver driving persistence's entrant writer, end to end: a
 * generated bracket stored as a graph, legs recorded as rows, and the next round's sides written
 * by `ZoneEntrantResolution` through the same binding the API composes once.
 */

const AUDIT = { actor: 'user:organizer-1', authorizationContext: 'scope:tournament.write' };

/** The binding `apps/api` makes; repeated here so drift fails this package's typecheck too. */
const resolveZone: ZoneEntrantResolver = resolvePersistedNodes;

function descriptor(): DisciplineDescriptor {
  const descriptorId = newId();
  return {
    descriptorId,
    alias: `copa-llaves-${descriptorId}`,
    version: '1.0.0',
    name: 'Copa Llaves',
    attribution: { author: 'CopaLibre tests', licence: 'AGPL-3.0-only' },
    participantTypes: ['team'],
    rosterConstraints: { minPlayers: 1, maxPlayers: 11 },
    segmentTypes: [{ name: 'half', label: 'Half', timed: true }],
    eventDefinitions: [],
    statistics: [],
    scoringInputs: [],
    availableFormats: ['single-elimination'],
    winCondition: winConditionScript('higher-score-wins', { unit: 'goals' }),
    notificationRuleCapabilities: [],
    defaults: {},
    fieldPolicies: {},
  };
}

/** One node per generated fixture: a series' games share the node, named without their suffix. */
function nodesOf(graph: FixtureGraph): PersistedFixtureNode[] {
  const nodes = new Map<string, PersistedFixtureNode>();
  for (const match of graph.matches.filter(isDuelMatch)) {
    const nodeKey = match.matchNumber ? match.id.replace(/-\d+$/, '') : match.id;
    const strip = (source: typeof match.slotA) =>
      source.kind === 'winner-of' || source.kind === 'loser-of'
        ? { ...source, matchId: source.matchId.replace(/-\d+$/, '') }
        : source;
    if (nodes.has(nodeKey)) continue;
    nodes.set(nodeKey, {
      nodeKey,
      bracket: match.bracket,
      round: match.round,
      position: match.position,
      sides: [strip(match.slotA), strip(match.slotB)] as PersistedFixtureNode['sides'],
      seriesSpan: match.series?.span ?? 1,
    });
  }
  return [...nodes.values()];
}

describe('persisted graph resolution (integration)', () => {
  let scratch: Awaited<ReturnType<typeof createMigratedDatabase>>;
  let organizationId = '';

  beforeAll(async () => {
    scratch = await createMigratedDatabase('persisted_graph');
    const organization = await withTransaction(scratch.db, (uow) =>
      new OrganizationRepository(scratch.db).create(uow, {
        alias: 'liga-llaves',
        name: 'Liga Llaves',
        ...AUDIT,
      }),
    );
    organizationId = organization.organizationId;
  });

  afterAll(async () => {
    await scratch?.drop();
  });

  it('advances the aggregate winner of a two-legged semi-final into the final', async () => {
    const series: SeriesDeclaration = { span: 2, resolutionClass: 'aggregate' };
    const competition = new CompetitionRepository(scratch.db);
    const { zoneId, entrantIds } = await withTransaction(scratch.db, async (uow) => {
      const tournaments = new TournamentRepository(scratch.db);
      const participants = new EnrollmentRepository(scratch.db);
      const disciplineDescriptor = descriptor();
      await tournaments.saveDescriptor(uow, disciplineDescriptor, { organizationId, ...AUDIT });
      const tournament = await tournaments.create(uow, {
        organizationId,
        alias: 'copa-ida-y-vuelta',
        name: 'Copa Ida y Vuelta',
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
        name: 'Llave A',
        organizationId,
        ...AUDIT,
      });
      const ids: string[] = [];
      for (const name of ['Alfa', 'Bravo', 'Charlie', 'Delta']) {
        const team = await participants.createTeam(uow, { organizationId, name, ...AUDIT });
        const registered = await participants.registerEntrant(uow, {
          tournamentId: tournament.tournamentId,
          entrantRef: { kind: 'team', teamId: team.teamId },
          organizationId,
          ...AUDIT,
        });
        ids.push(registered.entrantId);
      }

      const generated = generateFixtures({
        format: 'single-elimination',
        entrants: ids.map((entrantId, index) => ({ entrantId, seed: index + 1 })),
        series,
      });
      if (!generated.ok) throw generated.error;
      await competition.createFixtureGraph(uow, {
        stageId: stage.stageId,
        zoneId: zone.zoneId,
        nodes: nodesOf(generated.value),
        organizationId,
        ...AUDIT,
      });
      return { zoneId: zone.zoneId, entrantIds: ids };
    });

    const resolution = new ZoneEntrantResolution(scratch.db, resolveZone, async () => series);
    const resolveZoneEntrants = () =>
      withTransaction(scratch.db, (uow) =>
        resolution.run(uow, zoneId, { organizationId, ...AUDIT }),
      );
    await resolveZoneEntrants();

    const sides = await scratch.db
      .selectFrom('fixtures')
      .select(['node_key', 'home_entrant_id', 'away_entrant_id'])
      .where('zone_id', '=', zoneId)
      .execute();
    const firstSemi = sides.find((row) => row.node_key === 'SE-R1-M1');
    const [home, away] = [firstSemi?.home_entrant_id, firstSemi?.away_entrant_id] as [
      string,
      string,
    ];
    expect(entrantIds).toEqual(expect.arrayContaining([home, away]));

    const legs = await scratch.db
      .selectFrom('matches')
      .innerJoin('fixtures', 'fixtures.fixture_id', 'matches.fixture_id')
      .select(['matches.match_id', 'matches.number'])
      .where('fixtures.zone_id', '=', zoneId)
      .where('fixtures.node_key', '=', 'SE-R1-M1')
      .orderBy('matches.number')
      .execute();
    const record = async (matchId: string, homeScore: number, awayScore: number) =>
      scratch.db
        .updateTable('matches')
        .set({
          status: 'finalized',
          result: JSON.stringify({
            winnerEntrantId: homeScore > awayScore ? home : away,
            sides: [
              { entrantId: home, statistics: { score: homeScore } },
              { entrantId: away, statistics: { score: awayScore } },
            ],
          }),
        })
        .where('match_id', '=', matchId)
        .execute();

    // First leg 3-0 for home, second leg 0-1: one leg each, 3-1 on aggregate.
    await record(legs[0]?.match_id as string, 3, 0);
    await resolveZoneEntrants();
    const finalAfterFirstLeg = await scratch.db
      .selectFrom('fixtures')
      .select('home_entrant_id')
      .where('zone_id', '=', zoneId)
      .where('node_key', '=', 'SE-R2-M1')
      .executeTakeFirstOrThrow();
    expect(finalAfterFirstLeg.home_entrant_id).toBeNull();

    await record(legs[1]?.match_id as string, 0, 1);
    await resolveZoneEntrants();
    const final = await scratch.db
      .selectFrom('fixtures')
      .select('home_entrant_id')
      .where('zone_id', '=', zoneId)
      .where('node_key', '=', 'SE-R2-M1')
      .executeTakeFirstOrThrow();
    expect(final.home_entrant_id).toBe(home);
  });
});
