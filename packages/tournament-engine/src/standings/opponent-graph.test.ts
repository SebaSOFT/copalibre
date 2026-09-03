import type { RecordedOutcome } from '@copalibre/domain';
import { buildOpponentAdjacencyGraph } from './opponent-graph.js';

describe('buildOpponentAdjacencyGraph', () => {
  it('maps entrants to their match opponents and outcomes', () => {
    const outcomes: RecordedOutcome[] = [
      {
        matchId: 'm1',
        winnerEntrantId: 'alfa',
        sides: [
          { entrantId: 'alfa', statistics: {} },
          { entrantId: 'bravo', statistics: {} },
        ],
      },
      {
        matchId: 'm2',
        winnerEntrantId: undefined, // draw
        sides: [
          { entrantId: 'bravo', statistics: {} },
          { entrantId: 'charlie', statistics: {} },
        ],
      },
      {
        matchId: 'm3',
        winnerEntrantId: 'delta',
        sides: [
          { entrantId: 'alfa', statistics: {} },
          { entrantId: 'delta', statistics: {} },
        ],
      },
    ];

    const graph = buildOpponentAdjacencyGraph(['alfa', 'bravo', 'charlie', 'delta'], outcomes);

    const alfaOpponents = graph.get('alfa') ?? [];
    expect(alfaOpponents).toEqual([
      { opponentId: 'bravo', outcome: 'win', matchId: 'm1' },
      { opponentId: 'delta', outcome: 'loss', matchId: 'm3' },
    ]);

    const bravoOpponents = graph.get('bravo') ?? [];
    expect(bravoOpponents).toEqual([
      { opponentId: 'alfa', outcome: 'loss', matchId: 'm1' },
      { opponentId: 'charlie', outcome: 'draw', matchId: 'm2' },
    ]);

    const charlieOpponents = graph.get('charlie') ?? [];
    expect(charlieOpponents).toEqual([{ opponentId: 'bravo', outcome: 'draw', matchId: 'm2' }]);

    const deltaOpponents = graph.get('delta') ?? [];
    expect(deltaOpponents).toEqual([{ opponentId: 'alfa', outcome: 'win', matchId: 'm3' }]);
  });

  it('skips matches with fewer than 2 sides and ignores untracked entrants', () => {
    const outcomes: RecordedOutcome[] = [
      {
        matchId: 'm_bye',
        winnerEntrantId: 'alfa',
        sides: [{ entrantId: 'alfa', statistics: {} }],
      },
      {
        matchId: 'm_other',
        winnerEntrantId: 'unknown',
        sides: [
          { entrantId: 'unknown', statistics: {} },
          { entrantId: 'alfa', statistics: {} },
        ],
      },
    ];

    const graph = buildOpponentAdjacencyGraph(['alfa'], outcomes);
    expect(graph.get('alfa')).toEqual([
      { opponentId: 'unknown', outcome: 'loss', matchId: 'm_other' },
    ]);
    expect(graph.has('unknown')).toBe(false);
  });
});
