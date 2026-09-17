import { bracketMatchId, entrantPath, type BracketMatch, type SlotSource } from './bracket.js';
import { canvasEntrantPath } from '../control/lib/bracket-canvas.js';
import { mapBracketResponse } from './public-api-client.js';

const entrant = (id: string): SlotSource => ({ kind: 'entrant', entrantId: id, name: id });
const winner = (matchId: string): SlotSource => ({ kind: 'winner-of', matchId });
const loser = (matchId: string): SlotSource => ({ kind: 'loser-of', matchId });
const match = (id: string, slots: readonly SlotSource[], scores?: number[]): BracketMatch => ({
  matchId: id,
  matchNumber: 1,
  roundNumber: 1,
  branch: 'winners',
  slots,
  state: scores ? 'final' : 'upcoming',
  scores,
});

describe('entrant journey', () => {
  const first = match('WB-R1-M1', [entrant('a'), entrant('b')], [2, 0]);
  const second = match('WB-R1-M2', [entrant('c'), entrant('d')]);
  const semi = match('WB-R2-M1', [winner(bracketMatchId(first)), winner(bracketMatchId(second))]);
  const lower = match('LB-R1-M1', [loser(bracketMatchId(first)), loser(bracketMatchId(second))]);
  const final = match('GF', [winner(bracketMatchId(semi)), winner(bracketMatchId(lower))]);
  const graph = [first, second, semi, lower, final];

  it('follows exact ids despite repeated round positions and traverses future rounds', () => {
    expect([...entrantPath(graph, 'a')]).toEqual(['WB-R1-M1', 'WB-R2-M1', 'GF']);
  });
  it('continues a first loss through the declared losers bracket', () => {
    expect([...entrantPath(graph, 'b')]).toEqual(['WB-R1-M1', 'LB-R1-M1', 'GF']);
  });
  it('stops at the eliminating loss and never highlights the winners route instead', () => {
    const ended = graph.map((m) =>
      m === lower ? match('LB-R1-M1', [entrant('b'), entrant('d')], [0, 2]) : m,
    );
    expect([...entrantPath(ended, 'b')]).toEqual(['WB-R1-M1', 'LB-R1-M1']);
  });
  it('includes all recorded participation for a champion', () => {
    const ended = [
      first,
      match('semi', [entrant('a'), entrant('c')], [2, 1]),
      match('final', [entrant('a'), entrant('d')], [3, 1]),
    ];
    expect([...entrantPath(ended, 'a')]).toEqual(['WB-R1-M1', 'semi', 'final']);
  });
  it('does not invent a participant in an already resolved downstream match or resolve a draw', () => {
    expect([...entrantPath([first, { ...semi, state: 'final' }], 'a')]).toEqual(['WB-R1-M1']);
    expect([...entrantPath([{ ...first, scores: [1, 1] }, semi], 'a')]).toEqual(['WB-R1-M1']);
  });
  it('uses a decided series winner instead of one leg score', () => {
    const series = {
      span: 3,
      games: [],
      homeGamesWon: 1,
      awayGamesWon: 2,
      status: 'decided' as const,
      winner: 'away' as const,
      explanation: '',
    };
    expect([...entrantPath([{ ...first, series }, lower, final], 'a')]).toEqual([
      'WB-R1-M1',
      'LB-R1-M1',
      'GF',
    ]);
    expect([
      ...entrantPath(
        [{ ...first, series: { ...series, status: 'undecided', winner: undefined } }, semi],
        'b',
      ),
    ]).toEqual(['WB-R1-M1', 'WB-R2-M1']);
  });
  it('returns no path for unknown entrants and handles cycles', () => {
    expect([...entrantPath(graph, 'absent')]).toEqual([]);
    expect([...entrantPath([], 'a')]).toEqual([]);
    expect([
      ...entrantPath(
        [match('one', [entrant('a'), winner('two')]), match('two', [winner('one')])],
        'a',
      ),
    ]).toEqual(['one', 'two']);
  });
  it('supports legacy numeric edges only where source numbers are unambiguous', () => {
    const legacy = { ...first, matchId: undefined };
    const future = {
      ...semi,
      matchId: undefined,
      matchNumber: 2,
      slots: [{ kind: 'winner-of' as const, matchNumber: 1 }],
    };
    expect(bracketMatchId(legacy)).toBe('1');
    expect([...entrantPath([legacy, future], 'a')]).toEqual(['1', '2']);
    expect([...entrantPath([first, second, future], 'a')]).toEqual(['WB-R1-M1']);
    expect([...entrantPath([first, { ...future, slots: [{ kind: 'winner-of' }] }], 'a')]).toEqual([
      'WB-R1-M1',
    ]);
  });
  it('keeps public and control paths identical for the same wire graph', () => {
    const wire = graph.map((m) => ({
      matchId: bracketMatchId(m),
      position: m.matchNumber,
      round: m.roundNumber,
      bracket: m.branch,
      status: m.state === 'final' ? 'finalized' : 'scheduled',
      slots: m.slots.map((s, i) => ({ ...s, score: m.scores?.[i] })),
    }));
    // This fixture has only entrant/winner/loser slots, all representable on both surfaces.
    const control = wire as Parameters<typeof canvasEntrantPath>[0];
    const mapped = mapBracketResponse({
      zones: [{ matches: wire }],
    } as unknown as Parameters<typeof mapBracketResponse>[0]).zones[0];
    if (mapped === undefined) throw new Error('expected a zone');
    const publicMatches = mapped.matches;
    expect(publicMatches[0]?.matchId).toBe('WB-R1-M1');
    expect(publicMatches[0]?.state).toBe('final');
    for (const id of ['a', 'b', 'c', 'd', 'unknown']) {
      expect([...canvasEntrantPath(control, id)]).toEqual([...entrantPath(publicMatches, id)]);
    }
  });
});
