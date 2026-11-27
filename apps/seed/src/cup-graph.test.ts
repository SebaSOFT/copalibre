import { readDataset, type DemoGame } from '@copalibre/demo-datasets';
import { CupGraphError, inferCupGraph } from './cup-graph.js';

const games = async (cup: string): Promise<readonly DemoGame[]> =>
  (await readDataset('panamericano-clubes-2025')).games.filter((game) => game.phaseAlias === cup);

describe('inferCupGraph', () => {
  it('keys the Copa Bronce like the engine and reproduces its real pairings', async () => {
    const cup = inferCupGraph(await games('copa-bronce'));
    const keyOf = (key: string) => cup.nodeKeyByGame.get(key);
    // The first semi-final by key is SE-R2-M1; its home side's quarter-final is SE-R1-M1.
    expect(keyOf('game-2764')).toBe('SE-R2-M1');
    expect(keyOf('game-2758')).toBe('SE-R1-M1');
    expect(keyOf('game-2761')).toBe('SE-R1-M2');
    expect(keyOf('game-2765')).toBe('SE-R2-M2');
    expect(keyOf('game-2766')).toBe('SE-R3-M1');
    expect(keyOf('game-2762')).toBe('PL5-R1-M1');
    expect(keyOf('game-2763')).toBe('PL5-R1-M2');
    expect(keyOf('game-2767')).toBe('placement-3');
    expect(keyOf('game-2768')).toBe('placement-5');
    expect(keyOf('game-2769')).toBe('placement-7');
    expect(cup.seats).toEqual([
      'olimpia-patin-club',
      'corazonistas-bogota',
      'atletico-union',
      'super-patin',
      'impsa',
      'ciudad-de-buenos-aires',
      'estudiantil-san-miguel',
      'recreativo-bochas-club',
    ]);
  });

  it('wires every later side to the game its entrant came from, as winner or loser', async () => {
    const cup = inferCupGraph(await games('copa-bronce'));
    const nodes = cup.nodes((seat) => ({
      kind: 'qualifier',
      promotionPlanId: 'plan',
      position: seat,
    }));
    const node = (key: string) => nodes.find((candidate) => candidate.nodeKey === key);
    expect(node('SE-R1-M2')?.sides).toEqual([
      { kind: 'qualifier', promotionPlanId: 'plan', position: 3 },
      { kind: 'qualifier', promotionPlanId: 'plan', position: 4 },
    ]);
    expect(node('SE-R2-M1')?.sides).toEqual([
      { kind: 'winner-of', matchId: 'SE-R1-M1' },
      { kind: 'winner-of', matchId: 'SE-R1-M2' },
    ]);
    expect(node('PL5-R1-M1')).toMatchObject({
      bracket: 'placement',
      branch: 'pl5',
      round: 1,
      sides: [
        { kind: 'loser-of', matchId: 'SE-R1-M1' },
        { kind: 'loser-of', matchId: 'SE-R1-M2' },
      ],
    });
    expect(node('placement-3')?.sides.map((side) => side.kind)).toEqual(['loser-of', 'loser-of']);
    expect(node('placement-5')).toMatchObject({ round: 2, branch: 'placement-5' });
    expect(node('placement-5')?.sides.map((side) => side.kind)).toEqual(['winner-of', 'winner-of']);
    expect(node('placement-7')?.sides.map((side) => side.kind)).toEqual(['loser-of', 'loser-of']);
    expect(nodes).toHaveLength(12);
  });

  it('reads the winner of a drawn game from who played on, and leaves a terminal draw open', async () => {
    const bronce = inferCupGraph(await games('copa-bronce'));
    // 5–5 in places 5–8: Ciudad de Buenos Aires played the fifth-place game.
    expect(bronce.drawWinners.get('game-2763')).toBe('ciudad-de-buenos-aires');
    // The 4–4 final fed nothing.
    expect(bronce.drawWinners.has('game-2766')).toBe(false);
    const oro = inferCupGraph(await games('copa-oro'));
    expect(oro.drawWinners.get('game-2736')).toBeDefined();
    const plata = inferCupGraph(await games('copa-plata'));
    expect(plata.drawWinners.get('game-2740')).toBeDefined();
  });

  it('refuses a side that came from no earlier game', async () => {
    const bronce = [...(await games('copa-bronce'))];
    const broken = bronce.map((game) =>
      game.key === 'game-2766' ? { ...game, homeTeamAlias: 'nobody' } : game,
    );
    expect(() => inferCupGraph(broken)).toThrow(CupGraphError);
  });

  it('refuses an edge the score contradicts', async () => {
    const bronce = [...(await games('copa-bronce'))];
    // Olimpia won its quarter-final 4–2; flipping the score makes its semi-final impossible.
    const broken = bronce.map((game) =>
      game.key === 'game-2758' ? { ...game, homeGoals: 1, awayGoals: 3 } : game,
    );
    expect(() => inferCupGraph(broken)).toThrow('the score says otherwise');
  });
});
