import {
  filterProjectionRowsByQuery,
  matchesPlayerQuery,
  normalizeSearchText,
} from './player-search.js';

describe('player-search', () => {
  it('normalizes accents, casing, and surrounding whitespace', () => {
    expect(normalizeSearchText('  León  ')).toBe('leon');
    expect(normalizeSearchText('ÁLVAREZ')).toBe('alvarez');
  });

  it('matches names case- and accent-insensitively', () => {
    expect(matchesPlayerQuery('Martín León', 'leon')).toBe(true);
    expect(matchesPlayerQuery('Mateo Moreno', 'MORENO')).toBe(true);
    expect(matchesPlayerQuery('Mateo Moreno', 'gomez')).toBe(false);
    expect(matchesPlayerQuery('Mateo Moreno', '   ')).toBe(true);
  });

  it('preserves each matching row and its tournament-wide rank', () => {
    const rows = [
      {
        actorId: 'p1',
        actorName: 'Mateo Moreno',
        rank: 1,
        cells: { rank: { formatted: '1', raw: 1 } },
      },
      {
        actorId: 'p2',
        actorName: 'Martín León',
        rank: 2,
        cells: { rank: { formatted: '2', raw: 2 } },
      },
      {
        actorId: 'p3',
        actorName: 'Lucas Díaz',
        rank: 5,
        cells: { rank: { formatted: '5', raw: 5 } },
      },
    ];

    const filtered = filterProjectionRowsByQuery(rows, 'leon');
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.actorId).toBe('p2');
    expect(filtered[0]?.rank).toBe(2);
    expect(filtered[0]?.cells.rank?.formatted).toBe('2');

    expect(filterProjectionRowsByQuery(rows, undefined)).toHaveLength(3);
    expect(filterProjectionRowsByQuery(rows, '')).toHaveLength(3);
  });
});
