import { describe, expect, it } from '@jest/globals';
import { layoutPublicBracket, PUBLIC_GEOMETRY } from './public-bracket-layout.ts';
import type { BracketMatch } from './bracket.ts';

const entrant = (name: string, from?: { matchId: string; outcome: 'winner' | 'loser' }) =>
  ({ kind: 'entrant', name, ...(from ? { from } : {}) }) as const;

const match = (
  matchId: string,
  roundNumber: number,
  position: number,
  branch: string,
  slots: BracketMatch['slots'],
): BracketMatch => ({
  matchId,
  matchNumber: position,
  roundNumber,
  position,
  branch,
  slots,
  state: 'final',
});

// Four quarter-finals, two semi-finals, a final, and a third-place game fed by the semi-final losers.
const bracket: BracketMatch[] = [
  match('R1-M1', 1, 1, 'winners', [entrant('A'), entrant('B')]),
  match('R1-M2', 1, 2, 'winners', [entrant('C'), entrant('D')]),
  match('R1-M3', 1, 3, 'winners', [entrant('E'), entrant('F')]),
  match('R1-M4', 1, 4, 'winners', [entrant('G'), entrant('H')]),
  match('R2-M1', 2, 1, 'winners', [
    entrant('A', { matchId: 'R1-M1', outcome: 'winner' }),
    entrant('C', { matchId: 'R1-M2', outcome: 'winner' }),
  ]),
  match('R2-M2', 2, 2, 'winners', [
    { kind: 'winner-of', matchId: 'R1-M3' },
    { kind: 'winner-of', matchId: 'R1-M4' },
  ]),
  match('R3-M1', 3, 1, 'winners', [
    entrant('A', { matchId: 'R2-M1', outcome: 'winner' }),
    { kind: 'winner-of', matchId: 'R2-M2' },
  ]),
  {
    ...match('PL-R3-M1', 3, 1, 'placement', [
      entrant('C', { matchId: 'R2-M1', outcome: 'loser' }),
      { kind: 'loser-of', matchId: 'R2-M2' },
    ]),
    role: 'place-3',
  },
];

describe('layoutPublicBracket', () => {
  const layout = layoutPublicBracket(bracket);
  const at = (id: string) => {
    const node = layout.nodes.find((candidate) => candidate.match.matchId === id);
    if (node === undefined) throw new Error(`no node ${id}`);
    return node;
  };

  it('draws a column per round, left to right', () => {
    expect(at('R1-M1').x).toBeLessThan(at('R2-M1').x);
    expect(at('R2-M1').x).toBeLessThan(at('R3-M1').x);
  });

  it('centres a match between the two that feed it, even when they are played', () => {
    const top = at('R1-M1').y + at('R1-M1').height / 2;
    const second = at('R1-M2').y + at('R1-M2').height / 2;
    expect(
      Math.abs(at('R2-M1').y + at('R2-M1').height / 2 - (top + second) / 2),
    ).toBeLessThanOrEqual(PUBLIC_GEOMETRY.grid);
  });

  it('links played and unplayed matches alike', () => {
    const pairs = layout.connectors.map((c) => `${c.fromMatchId}>${c.toMatchId}:${c.kind}`);
    expect(pairs).toContain('R1-M1>R2-M1:winner-of');
    expect(pairs).toContain('R1-M3>R2-M2:winner-of');
  });

  it('leaves out the links that drop a loser from one side to the other', () => {
    const pairs = layout.connectors.map((c) => `${c.fromMatchId}>${c.toMatchId}`);
    expect(pairs).not.toContain('R2-M1>PL-R3-M1');
    expect(pairs).not.toContain('R2-M2>PL-R3-M1');
  });

  it('draws the winners’ bracket on the left and the placement bracket on the right', () => {
    expect(layout.bands.map((band) => band.branch)).toEqual(['winners', 'placement']);
    const winnersRight = Math.max(
      ...layout.nodes
        .filter((node) => node.match.branch === 'winners')
        .map((node) => node.x + node.width),
    );
    expect(at('PL-R3-M1').x).toBeGreaterThan(winnersRight);
    // Both start at the top, side by side rather than stacked.
    expect(layout.bands[1]?.y).toBe(layout.bands[0]?.y);
  });

  it('mirrors the right side, so its last round is the one next to the middle', () => {
    const placement = [
      match('P1', 2, 1, 'placement', [entrant('X'), entrant('Y')]),
      match('P2', 3, 1, 'placement', [
        entrant('X', { matchId: 'P1', outcome: 'winner' }),
        entrant('Z', { matchId: 'P1', outcome: 'loser' }),
      ]),
    ];
    const placed = layoutPublicBracket([...bracket, ...placement]);
    const x = (id: string) => placed.nodes.find((n) => n.match.matchId === id)?.x ?? Number.NaN;
    expect(x('P2')).toBeLessThan(x('P1'));
    const link = placed.connectors.find((c) => c.fromMatchId === 'P1' && c.toMatchId === 'P2');
    // It runs leftward: from the left edge of the first round to the right edge of the next.
    expect(link?.points[0]?.x ?? 0).toBeGreaterThan(link?.points.at(-1)?.x ?? 0);
  });

  it('never draws two matches on top of each other', () => {
    for (const a of layout.nodes) {
      for (const b of layout.nodes) {
        if (a === b || a.x !== b.x) continue;
        const overlap = a.y < b.y + b.height && b.y < a.y + a.height;
        expect(overlap).toBe(false);
      }
    }
  });

  it('draws every card taller when a series is present', () => {
    const withSeries = layoutPublicBracket([
      { ...(bracket[0] as BracketMatch), series: {} as never },
      ...bracket.slice(1),
    ]);
    expect(withSeries.nodes[0]?.height ?? 0).toBeGreaterThan(PUBLIC_GEOMETRY.nodeHeight);
  });

  it('keeps the two matches that feed one next to each other when the draw did not follow the graph', () => {
    // The semi-finals are fed by 1 and 4, and by 2 and 3: positions alone would cross every line.
    const drawn: BracketMatch[] = [
      match('A', 1, 1, 'winners', [entrant('A1'), entrant('A2')]),
      match('B', 1, 2, 'winners', [entrant('B1'), entrant('B2')]),
      match('C', 1, 3, 'winners', [entrant('C1'), entrant('C2')]),
      match('D', 1, 4, 'winners', [entrant('D1'), entrant('D2')]),
      match('S1', 2, 1, 'winners', [
        entrant('A1', { matchId: 'A', outcome: 'winner' }),
        entrant('D1', { matchId: 'D', outcome: 'winner' }),
      ]),
      match('S2', 2, 2, 'winners', [
        entrant('B1', { matchId: 'B', outcome: 'winner' }),
        entrant('C1', { matchId: 'C', outcome: 'winner' }),
      ]),
    ];
    const placed = layoutPublicBracket(drawn);
    const y = (id: string) => placed.nodes.find((n) => n.match.matchId === id)?.y ?? Number.NaN;
    expect(Math.abs(y('A') - y('D'))).toBeLessThan(
      2 * PUBLIC_GEOMETRY.nodeHeight + 3 * PUBLIC_GEOMETRY.rowGap,
    );
    expect(Math.abs(y('A') - y('D'))).toBeLessThan(
      Math.abs(y('A') - y('B')) + PUBLIC_GEOMETRY.nodeHeight,
    );
    const ys = ['A', 'D', 'B', 'C'].map(y);
    expect(ys).toEqual([...ys].sort((a, b) => a - b));
  });
});
