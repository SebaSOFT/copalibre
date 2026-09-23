import {
  generateFixtures,
  isDuelMatch,
  type FixtureGraph,
  type SlotSource,
} from '@copalibre/tournament-engine';
import type { StageMatchRecord } from '@copalibre/persistence';
import { reconstructChampionshipFixture } from './tournament-winner-resolution.js';

describe('reconstructChampionshipFixture', () => {
  it('selects the generated final when a classification fixture shares its round', () => {
    const graph = graphOf('single-elimination');
    const data = finalizedBracket(graph);
    const final = graph.matches.filter(isDuelMatch).find((match) => match.round === 2);
    expect(final).toBeDefined();

    const classification: StageMatchRecord = {
      matchId: 'classification-match',
      fixtureId: 'classification-fixture',
      round: 2,
      position: 2,
      status: 'finalized',
      homeEntrantId: 'entrant-3',
      awayEntrantId: 'entrant-4',
      games: [],
    };
    const result = reconstructChampionshipFixture({
      graph,
      records: [...data.records, classification],
      winnerByFixtureId: data.winners,
    });

    expect(result?.fixture.fixtureId).toBe(final?.id);
    expect(result?.winnerEntrantId).toBe('entrant-1');
    expect(result?.loserEntrantId).toBe('entrant-2');
  });

  it('uses the bracket reset result when losers-bracket champion wins first grand final', () => {
    const graph = graphOf('double-elimination');
    const data = finalizedBracket(graph, true);
    const grandFinals = graph.matches
      .filter(isDuelMatch)
      .filter((match) => match.bracket === 'grand-final')
      .sort((left, right) => left.round - right.round);
    const reset = grandFinals.find((match) => match.conditional === 'bracket-reset');
    const firstFinal = grandFinals.find((match) => match.conditional === undefined);
    const firstFinalWinner = firstFinal && data.winners.get(firstFinal.id);
    const resetWinner = reset && data.winners.get(reset.id);

    const result = reconstructChampionshipFixture({
      graph,
      records: data.records,
      winnerByFixtureId: data.winners,
    });

    expect(firstFinalWinner).toBeDefined();
    expect(resetWinner).toBeDefined();
    expect(result?.fixture.fixtureId).toBe(reset?.id);
    expect(result?.winnerEntrantId).toBe(resetWinner);
  });

  it('leaves a championship unresolved when saved results cannot map uniquely', () => {
    const graph = graphOf('single-elimination');
    const data = finalizedBracket(graph);
    const firstRecord = data.records[0];
    if (!firstRecord) throw new Error('Expected a generated fixture');
    const duplicated = [...data.records, { ...firstRecord, fixtureId: 'duplicate-fixture' }];

    expect(
      reconstructChampionshipFixture({
        graph,
        records: duplicated,
        winnerByFixtureId: data.winners,
      }),
    ).toBeUndefined();
  });

  it('resolves one legacy deepest-round fixture from uniquely winning prior results', () => {
    const graph = graphOf('single-elimination', 8);
    const data = legacyBracket();

    const result = reconstructChampionshipFixture({
      graph,
      records: data.records,
      winnerByFixtureId: data.winners,
    });

    expect(result?.fixture.fixtureId).toBe('legacy-final');
    expect(result?.winnerEntrantId).toBe('entrant-2');
    expect(result?.loserEntrantId).toBe('entrant-3');
  });

  it('leaves legacy deepest-round fixtures unresolved when more than one qualifies', () => {
    const graph = graphOf('single-elimination', 8);
    const data = legacyBracket();
    const finalRecord = data.records.find((record) => record.fixtureId === 'legacy-final');
    if (!finalRecord) throw new Error('Expected legacy final fixture');
    const duplicate = { ...finalRecord };
    duplicate.matchId = 'legacy-final-duplicate-match';
    duplicate.fixtureId = 'legacy-final-duplicate';
    duplicate.position = 5;

    expect(
      reconstructChampionshipFixture({
        graph,
        records: [...data.records, duplicate],
        winnerByFixtureId: new Map([...data.winners, [duplicate.fixtureId, 'entrant-2']]),
      }),
    ).toBeUndefined();
  });

  it('leaves legacy fixture unresolved when prior winner evidence is missing or ambiguous', () => {
    const graph = graphOf('single-elimination', 8);
    const data = legacyBracket();
    const withoutPriorWinner = new Map(data.winners);
    withoutPriorWinner.delete('legacy-r2-1');

    expect(
      reconstructChampionshipFixture({
        graph,
        records: data.records,
        winnerByFixtureId: withoutPriorWinner,
      }),
    ).toBeUndefined();

    const ambiguousPrior: StageMatchRecord = {
      matchId: 'legacy-r2-extra-match',
      fixtureId: 'legacy-r2-extra',
      round: 2,
      position: 7,
      status: 'finalized',
      homeEntrantId: 'entrant-2',
      awayEntrantId: 'entrant-8',
      games: [],
    };
    expect(
      reconstructChampionshipFixture({
        graph,
        records: [...data.records, ambiguousPrior],
        winnerByFixtureId: new Map([...data.winners, [ambiguousPrior.fixtureId, 'entrant-2']]),
      }),
    ).toBeUndefined();
  });
});

function graphOf(
  format: 'single-elimination' | 'double-elimination',
  entrantCount = 4,
): FixtureGraph {
  const generated = generateFixtures({
    format,
    entrants: Array.from({ length: entrantCount }, (_, index) => ({
      entrantId: `entrant-${index + 1}`,
      seed: index + 1,
    })),
  });
  if (!generated.ok) throw new Error('Test bracket generation failed');
  return generated.value;
}

function legacyBracket(): { records: StageMatchRecord[]; winners: Map<string, string> } {
  const fixture = (
    id: string,
    round: number,
    position: number,
    homeEntrantId: string,
    awayEntrantId: string,
  ): StageMatchRecord => ({
    matchId: `${id}-match`,
    fixtureId: id,
    round,
    position,
    status: 'finalized',
    homeEntrantId,
    awayEntrantId,
    games: [],
  });

  const records = [
    fixture('legacy-r1-1', 1, 1, 'entrant-1', 'entrant-2'),
    fixture('legacy-r1-2', 1, 2, 'entrant-3', 'entrant-4'),
    fixture('legacy-r2-1', 2, 1, 'entrant-2', 'entrant-1'),
    fixture('legacy-r2-2', 2, 2, 'entrant-3', 'entrant-4'),
    fixture('legacy-r2-3', 2, 3, 'entrant-5', 'entrant-6'),
    fixture('legacy-r2-4', 2, 4, 'entrant-7', 'entrant-8'),
    fixture('legacy-r2-5', 2, 5, 'entrant-1', 'entrant-4'),
    fixture('legacy-r2-6', 2, 6, 'entrant-5', 'entrant-7'),
    fixture('legacy-final', 3, 1, 'entrant-2', 'entrant-3'),
    fixture('legacy-classification-1', 3, 2, 'entrant-1', 'entrant-4'),
    fixture('legacy-classification-2', 3, 3, 'entrant-5', 'entrant-7'),
    fixture('legacy-classification-3', 3, 4, 'entrant-6', 'entrant-8'),
  ];
  const winners = new Map([
    ['legacy-r1-1', 'entrant-1'],
    ['legacy-r1-2', 'entrant-4'],
    ['legacy-r2-1', 'entrant-2'],
    ['legacy-r2-2', 'entrant-3'],
    ['legacy-r2-3', 'entrant-5'],
    ['legacy-r2-4', 'entrant-8'],
    ['legacy-r2-5', 'entrant-1'],
    ['legacy-r2-6', 'entrant-7'],
    ['legacy-final', 'entrant-2'],
    ['legacy-classification-1', 'entrant-1'],
    ['legacy-classification-2', 'entrant-5'],
    ['legacy-classification-3', 'entrant-8'],
  ]);
  return { records, winners };
}

function finalizedBracket(
  graph: FixtureGraph,
  makeResetNecessary = false,
): { records: StageMatchRecord[]; winners: Map<string, string> } {
  const records: StageMatchRecord[] = [];
  const winners = new Map<string, string>();
  const remaining = graph.matches.filter(isDuelMatch);
  const resolved = new Map<string, { winner: string; loser: string }>();

  let changed = true;
  while (remaining.length > 0 && changed) {
    changed = false;
    for (let index = remaining.length - 1; index >= 0; index -= 1) {
      const match = remaining[index];
      if (!match) continue;
      const sideA = entrantFromSlot(match.slotA, resolved);
      const sideB = entrantFromSlot(match.slotB, resolved);
      if (!sideA || !sideB) continue;

      const winner =
        makeResetNecessary && match.bracket === 'grand-final' && match.conditional === undefined
          ? sideB
          : sideA;
      const loser = winner === sideA ? sideB : sideA;
      resolved.set(match.id, { winner, loser });
      records.push({
        matchId: match.id,
        fixtureId: match.id,
        round: match.round,
        position: match.position,
        status: 'finalized',
        homeEntrantId: sideA,
        awayEntrantId: sideB,
        games: [],
      });
      winners.set(match.id, winner);
      remaining.splice(index, 1);
      changed = true;
    }
  }

  const graphOrder = new Map(graph.matches.map((match, index) => [match.id, index]));
  const positionsByRound = new Map<number, number>();
  const orderedRecords = records
    .sort(
      (left, right) =>
        (graphOrder.get(left.fixtureId) ?? 0) - (graphOrder.get(right.fixtureId) ?? 0),
    )
    .map((record) => {
      const position = (positionsByRound.get(record.round) ?? 0) + 1;
      positionsByRound.set(record.round, position);
      return { ...record, position };
    });

  return { records: orderedRecords, winners };
}

function entrantFromSlot(
  slot: SlotSource,
  resolved: ReadonlyMap<string, { winner: string; loser: string }>,
): string | undefined {
  if (slot.kind === 'entrant') return slot.entrantId;
  if (slot.kind === 'winner-of') return resolved.get(slot.matchId)?.winner;
  if (slot.kind === 'loser-of') return resolved.get(slot.matchId)?.loser;
  return undefined;
}
