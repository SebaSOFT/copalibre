import { stageMatchOrdinals, type StageMatchRecord } from './stage-read-model.js';

function record(matchId: string, round: number, position: number): StageMatchRecord {
  return {
    matchId,
    fixtureId: `fixture-${matchId}`,
    round,
    position,
    status: 'scheduled',
    games: [],
  };
}

describe('stageMatchOrdinals', () => {
  it('assigns a distinct 1..N ordinal to every match, even when they all share matches.number = 1', () => {
    // Every fixture here is a single, non-series game — `matches.number` would
    // be 1 for all of them (openspec 0249's root cause). The ordinal must not
    // collide the way that column does.
    const records = [
      record('m-1', 1, 1),
      record('m-2', 1, 2),
      record('m-3', 2, 1),
      record('m-4', 2, 2),
    ];

    const ordinals = stageMatchOrdinals(records);

    expect(ordinals.get('m-1')).toBe(1);
    expect(ordinals.get('m-2')).toBe(2);
    expect(ordinals.get('m-3')).toBe(3);
    expect(ordinals.get('m-4')).toBe(4);
    expect(new Set(ordinals.values()).size).toBe(records.length);
  });

  it('assigns the same ordinal to a match whether the caller passes the full list or looks it up from a subset built the same way', () => {
    // Simulates the group-filter case: a caller must derive its subset's
    // ordinals from the *unscoped* list, never by re-indexing the subset.
    const full = [record('m-1', 1, 1), record('m-2', 1, 2), record('m-3', 2, 1)];
    const ordinals = stageMatchOrdinals(full);

    const groupSubset = [full[1], full[2]] as readonly StageMatchRecord[];
    for (const match of groupSubset) {
      expect(ordinals.get(match.matchId)).toBe(full.indexOf(match) + 1);
    }
  });

  it('returns an empty map for an empty stage', () => {
    expect(stageMatchOrdinals([]).size).toBe(0);
  });
});
