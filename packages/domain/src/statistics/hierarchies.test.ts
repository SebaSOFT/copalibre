import {
  actorOfEntrant,
  ACTOR_GRANULARITIES,
  COMPETITION_GRANULARITIES,
  isCoarser,
  granularitiesAbove,
  GRANULARITY_SOURCES,
  requireGranularities,
} from './hierarchies.js';

describe('the two axes', () => {
  it('runs from the finest fact to the widest scope', () => {
    expect(COMPETITION_GRANULARITIES).toEqual([
      'event',
      'segment',
      'match',
      'stage',
      'season',
      'tournament',
      'organization',
    ]);
  });

  it('runs from the human to the club that fields them', () => {
    expect(ACTOR_GRANULARITIES).toEqual(['person', 'player', 'team', 'club']);
  });

  it('does not carry the entrant, which bridges the axes rather than sitting on one', () => {
    expect([...ACTOR_GRANULARITIES, ...COMPETITION_GRANULARITIES]).not.toContain('entrant');
  });

  it('names where every granularity gets its identifiers, so none is declared over nothing', () => {
    for (const granularity of [...COMPETITION_GRANULARITIES, ...ACTOR_GRANULARITIES]) {
      expect(GRANULARITY_SOURCES[granularity]).toMatch(/^\d{4}$/);
    }
  });

  it('has nothing inert left: 0015 populated the last three', () => {
    // A collector declared at a granularity nobody populates would have to
    // report itself inert; answering with zero is a page of blanks.
    expect([
      GRANULARITY_SOURCES.season,
      GRANULARITY_SOURCES.person,
      GRANULARITY_SOURCES.player,
    ]).toEqual(['0015', '0015', '0015']);
  });
});

describe('one step coarser is a fact about the axis', () => {
  it('reports everything a match figure can be aggregated to', () => {
    expect(granularitiesAbove(COMPETITION_GRANULARITIES, 'match')).toEqual([
      'stage',
      'season',
      'tournament',
      'organization',
    ]);
  });

  it('reports nothing above the widest scope', () => {
    expect(granularitiesAbove(COMPETITION_GRANULARITIES, 'organization')).toEqual([]);
    expect(granularitiesAbove(ACTOR_GRANULARITIES, 'club')).toEqual([]);
  });

  it('carries a person up to the club that fields them', () => {
    expect(granularitiesAbove(ACTOR_GRANULARITIES, 'person')).toEqual(['player', 'team', 'club']);
  });

  it('answers whether one granularity is coarser than another, so two readers cannot disagree', () => {
    expect(isCoarser(COMPETITION_GRANULARITIES, 'season', 'stage')).toBe(true);
    expect(isCoarser(COMPETITION_GRANULARITIES, 'stage', 'season')).toBe(false);
    expect(isCoarser(COMPETITION_GRANULARITIES, 'match', 'match')).toBe(false);
  });
});

describe('an entrant resolves to the actor that entered', () => {
  it('resolves a team enrollment to the team', () => {
    expect(actorOfEntrant({ entrantRef: { kind: 'team', teamId: 'tm-1' } })).toEqual({
      granularity: 'team',
      actorId: 'tm-1',
    });
  });

  it('resolves an individual enrollment to the person', () => {
    expect(actorOfEntrant({ entrantRef: { kind: 'person', personId: 'pe-1' } })).toEqual({
      granularity: 'person',
      actorId: 'pe-1',
    });
  });
});

describe('requireGranularities', () => {
  it('accepts a granularity on each axis', () => {
    expect(requireGranularities({ actor: 'person', competition: 'match' }).ok).toBe(true);
  });

  it('refuses an actor granularity the axis does not publish, listing the ones it does', () => {
    const result = requireGranularities({ actor: 'referee', competition: 'match' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('HIERARCHY_GRANULARITY_INVALID');
    expect(result.error.message).toContain('person, player, team, club');
  });

  it('refuses a competition granularity the axis does not publish', () => {
    const result = requireGranularities({ actor: 'person', competition: 'fortnight' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('fortnight');
  });

  it('refuses the entrant as a granularity, which is the mistake the shape invites', () => {
    expect(requireGranularities({ actor: 'entrant', competition: 'match' }).ok).toBe(false);
  });
});
