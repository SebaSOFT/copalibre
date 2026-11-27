import { groupMatchFacts } from './group-match-facts.js';

describe('groupMatchFacts', () => {
  it('counts each group of the named zone and lists each venue once, in match order', () => {
    const facts = groupMatchFacts(
      [
        { zoneName: 'Grupos', groupName: 'Grupo A', venueName: 'Aldo Cantoni' },
        { zoneName: 'Grupos', groupName: 'Grupo A', venueName: 'Estadio Norte' },
        { zoneName: 'Grupos', groupName: 'Grupo A', venueName: 'Aldo Cantoni' },
        { zoneName: 'Grupos', groupName: 'Grupo B' },
        { zoneName: 'Otra', groupName: 'Grupo A', venueName: 'Elsewhere' },
      ],
      'Grupos',
    );

    expect(facts.get('Grupo A')).toEqual({
      matchCount: 3,
      venues: ['Aldo Cantoni', 'Estadio Norte'],
    });
    expect(facts.get('Grupo B')).toEqual({ matchCount: 1, venues: [] });
  });

  it('skips a match that belongs to no group, and leaves a group with no matches out', () => {
    const facts = groupMatchFacts([{ zoneName: 'Grupos', venueName: 'Aldo Cantoni' }], 'Grupos');

    expect(facts.size).toBe(0);
  });
});
