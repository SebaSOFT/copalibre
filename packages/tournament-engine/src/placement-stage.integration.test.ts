import {
  applyPlacementScoring,
  battleRoyaleDescriptor,
  swimmingDescriptor,
  validateRecordedOutcome,
  type DisciplineDescriptor,
  type RecordedOutcome,
} from '@copalibre/domain';
import type { TiebreakPipeline } from '@copalibre/rules';
import {
  CompetitionRepository,
  newId,
  OrganizationRepository,
  ParticipantRepository,
  TournamentRepository,
  withTransaction,
} from '@copalibre/persistence';
import { createMigratedDatabase } from '../../persistence/src/test-support/scratch-database.js';
import { generateFixtures } from './fixtures/index.js';
import { evaluateQualification } from './qualification/index.js';
import { computeStandings, entrantsInGraph } from './standings/index.js';
import { previewStageTransition } from './transition/index.js';
import { isPlacementMatch } from './types.js';

/**
 * Placement stages against real storage, end to end: lobbies drawn, N-sided
 * results recorded, the table built from what the discipline declares, and the
 * cut handing entrants to a duel stage — the hand-off that makes an FFA stage a
 * stage rather than a dead end.
 */

const AUDIT = { actor: 'user:organizer-1', authorizationContext: 'scope:tournament.write' };

const pipelineFor = (parameters: TiebreakPipeline['parameters']): TiebreakPipeline => ({
  id: 'placement-table',
  version: 1,
  parameters,
});

const higher = (id: string, label: string) => ({
  id,
  label,
  valueType: 'number' as const,
  direction: 'higher_wins' as const,
  missingValue: 'treat-as-worst' as const,
  source: 'match-derived' as const,
});

const lower = (id: string, label: string) => ({
  ...higher(id, label),
  direction: 'lower_wins' as const,
});

describe('placement stages (integration)', () => {
  let scratch: Awaited<ReturnType<typeof createMigratedDatabase>>;
  let organizationId = '';

  beforeAll(async () => {
    scratch = await createMigratedDatabase('placement');
    const organization = await withTransaction(scratch.db, (uow) =>
      new OrganizationRepository(scratch.db).create(uow, {
        alias: 'liga-placement',
        name: 'Liga Placement',
        ...AUDIT,
      }),
    );
    organizationId = organization.organizationId;
  });

  afterAll(async () => {
    await scratch?.drop();
  });

  async function seedStage(alias: string, descriptor: DisciplineDescriptor, entrantCount: number) {
    const tournaments = new TournamentRepository(scratch.db);
    const competition = new CompetitionRepository(scratch.db);
    const participants = new ParticipantRepository(scratch.db);

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
        name: 'Qualifiers',
        format: 'heats',
        organizationId,
        ...AUDIT,
      });

      const entrants = [];
      for (let index = 0; index < entrantCount; index += 1) {
        const team = await participants.createTeam(uow, {
          organizationId,
          name: `Squad ${index + 1}`,
          ...AUDIT,
        });
        entrants.push(
          await participants.registerEntrant(uow, {
            tournamentId: tournament.tournamentId,
            entrantRef: { kind: 'team', teamId: team.teamId },
            seed: index + 1,
            organizationId,
            ...AUDIT,
          }),
        );
      }

      return { tournament, stage, entrants };
    });
  }

  it('carries a heats stage into a double-elimination stage through the cut', async () => {
    const descriptor = battleRoyaleDescriptor({ descriptorId: newId() });
    const { entrants } = await seedStage('copa-series', descriptor, 16);

    const graph = generateFixtures({
      format: 'heats',
      entrants: entrants.map((entrant, index) => ({
        entrantId: entrant.entrantId,
        seed: index + 1,
      })),
      placement: { lobbySize: 8, rounds: 2, drawSeed: 20260731 },
    });
    if (!graph.ok) throw graph.error;
    expect(graph.value.matches).toHaveLength(4);
    expect(graph.value.matches.every(isPlacementMatch)).toBe(true);

    // Each lobby is recorded N-sided with placements; the engine turns those
    // into points the table can add. Frags vary per entrant so the field is
    // genuinely separable — two symmetric lobbies would tie by construction,
    // and 0010 refuses to break a tie that spans the cut line.
    const fragsOf = new Map(entrants.map((entrant, index) => [entrant.entrantId, 40 - index]));
    const outcomes: RecordedOutcome[] = [];
    for (const match of graph.value.matches) {
      if (!isPlacementMatch(match)) continue;
      const raw: RecordedOutcome = {
        matchId: match.id,
        sides: match.slots.map((slot, index) => ({
          entrantId: (slot as { entrantId: string }).entrantId,
          statistics: { frags: fragsOf.get((slot as { entrantId: string }).entrantId) ?? 0 },
          placement: index + 1,
        })),
      };
      expect(validateRecordedOutcome(descriptor, raw, { shape: 'placement' }).ok).toBe(true);

      const scored = applyPlacementScoring(descriptor, raw);
      if (!scored.ok) throw scored.error;
      outcomes.push(scored.value);
    }

    const ids = entrantsInGraph(graph.value.matches);
    const standings = computeStandings(
      descriptor,
      ids,
      outcomes,
      pipelineFor([higher('placement-points', 'Placement points'), higher('frags', 'Frags')]),
    );

    expect(standings.rows).toHaveLength(16);
    // Every entrant swam both rounds, and the points came from the table.
    expect(standings.rows[0]?.statistics.lobbies).toBe(2);
    expect(standings.rows[0]?.statistics['placement-points']).toBeGreaterThan(0);

    const preview = previewStageTransition({
      accounting: standings.rows.map((row) => ({
        entrantId: row.entrantId,
        statistics: row.statistics,
      })),
      pipeline: pipelineFor([
        higher('placement-points', 'Placement points'),
        higher('frags', 'Frags'),
      ]),
      advance: 8,
      allocation: { mode: 'automatic' },
      nextFormat: 'double-elimination',
      preconditions: { priorStageStatus: 'complete' },
    });

    expect(preview.ready).toBe(true);
    expect(preview.qualified).toHaveLength(8);
    expect(preview.fixtures?.matches.some(isPlacementMatch)).toBe(false);
  });

  it('qualifies a battle royale on placement points plus frags', async () => {
    const descriptor = battleRoyaleDescriptor({ descriptorId: newId() });
    const { entrants } = await seedStage('copa-royale', descriptor, 20);

    const graph = generateFixtures({
      format: 'heats',
      entrants: entrants.map((entrant, index) => ({
        entrantId: entrant.entrantId,
        seed: index + 1,
      })),
      placement: { lobbySize: 10, rounds: 3, drawSeed: 5 },
    });
    if (!graph.ok) throw graph.error;

    const fragsOf = new Map(entrants.map((entrant, index) => [entrant.entrantId, 60 - index]));
    const outcomes: RecordedOutcome[] = [];
    for (const match of graph.value.matches) {
      if (!isPlacementMatch(match)) continue;
      const scored = applyPlacementScoring(descriptor, {
        matchId: match.id,
        sides: match.slots.map((slot, index) => ({
          entrantId: (slot as { entrantId: string }).entrantId,
          statistics: { frags: fragsOf.get((slot as { entrantId: string }).entrantId) ?? 0 },
          placement: index + 1,
        })),
      });
      if (!scored.ok) throw scored.error;
      outcomes.push(scored.value);
    }

    const ids = entrantsInGraph(graph.value.matches);
    const standings = computeStandings(
      descriptor,
      ids,
      outcomes,
      pipelineFor([higher('placement-points', 'Placement points'), higher('frags', 'Frags')]),
    );

    const cut = evaluateQualification({
      accounting: standings.rows.map((row) => ({
        entrantId: row.entrantId,
        statistics: row.statistics,
      })),
      pipeline: pipelineFor([
        higher('placement-points', 'Placement points'),
        higher('frags', 'Frags'),
      ]),
      advance: 16,
    });

    expect(cut.resolved).toBe(true);
    expect(cut.qualified).toHaveLength(16);
    expect(cut.eliminated).toHaveLength(4);
    // Placement points and frags are both ordinary statistics by the time the
    // cut reads them; nothing knows one came from a table.
    expect(standings.rows[0]?.statistics).toEqual(
      expect.objectContaining({
        'placement-points': expect.any(Number),
        frags: expect.any(Number),
      }),
    );
  });

  it('qualifies swimmers on time across all heats, not on position within one', async () => {
    const descriptor = swimmingDescriptor({ descriptorId: newId() });
    const { entrants } = await seedStage('copa-natacion', descriptor, 8);

    const graph = generateFixtures({
      format: 'heats',
      entrants: entrants.map((entrant, index) => ({
        entrantId: entrant.entrantId,
        seed: index + 1,
      })),
      placement: { lobbySize: 4, drawSeed: 13 },
    });
    if (!graph.ok) throw graph.error;
    expect(graph.value.matches).toHaveLength(2);

    // The first heat is slow and the second fast. Whoever wins the slow heat
    // still swam slower than everyone in the fast one.
    const [slow, fast] = graph.value.matches;
    if (!slow || !fast || !isPlacementMatch(slow) || !isPlacementMatch(fast)) {
      throw new Error('expected two placement matches');
    }

    const timed = (match: typeof slow, base: number): RecordedOutcome => ({
      matchId: match.id,
      sides: match.slots.map((slot, index) => ({
        entrantId: (slot as { entrantId: string }).entrantId,
        statistics: { 'best-time': base + index * 100 },
        placement: index + 1,
      })),
    });

    const outcomes = [timed(slow, 6_000), timed(fast, 5_000)];
    const ids = entrantsInGraph(graph.value.matches);
    const standings = computeStandings(
      descriptor,
      ids,
      outcomes,
      pipelineFor([lower('best-time', 'Best time')]),
    );

    const slowHeatWinner = (slow.slots[0] as { entrantId: string }).entrantId;
    const fastHeatLast = (fast.slots[3] as { entrantId: string }).entrantId;

    const rank = (entrantId: string) =>
      standings.rows.findIndex((row) => row.entrantId === entrantId);

    // The whole reason a placement match feeds the table and never a bracket.
    expect(rank(fastHeatLast)).toBeLessThan(rank(slowHeatWinner));

    const cut = evaluateQualification({
      accounting: standings.rows.map((row) => ({
        entrantId: row.entrantId,
        statistics: row.statistics,
      })),
      pipeline: pipelineFor([lower('best-time', 'Best time')]),
      advance: 4,
    });

    expect(cut.resolved).toBe(true);
    // Every qualifier came from the fast heat; winning the slow one qualified
    // nobody.
    expect([...cut.qualified].sort()).toEqual(
      fast.slots.map((slot) => (slot as { entrantId: string }).entrantId).sort(),
    );
  });
});
