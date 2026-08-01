import {
  actorOfEntrant,
  ACTOR_LEVELS,
  COMPETITION_LEVELS,
  isAbove,
  levelsAbove,
  LEVEL_SOURCES,
  requireLevels,
} from './hierarchies.js';

describe('the two axes', () => {
  it('runs from the finest fact to the widest scope', () => {
    expect(COMPETITION_LEVELS).toEqual([
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
    expect(ACTOR_LEVELS).toEqual(['person', 'player', 'team', 'club']);
  });

  it('does not carry the entrant, which bridges the axes rather than sitting on one', () => {
    expect([...ACTOR_LEVELS, ...COMPETITION_LEVELS]).not.toContain('entrant');
  });

  it('names where every level gets its identifiers, so none is declared over nothing', () => {
    for (const level of [...COMPETITION_LEVELS, ...ACTOR_LEVELS]) {
      expect(LEVEL_SOURCES[level]).toMatch(/^\d{4}$/);
    }
  });

  it('has nothing inert left: 0015 populated the last three', () => {
    // A collector grained at a level nobody populates would have to report
    // itself inert; a product that answers with zero is a page of blanks.
    expect([LEVEL_SOURCES.season, LEVEL_SOURCES.person, LEVEL_SOURCES.player]).toEqual([
      '0015',
      '0015',
      '0015',
    ]);
  });
});

describe('one level up is a fact about the axis', () => {
  it('reports everything a match figure can be aggregated to', () => {
    expect(levelsAbove(COMPETITION_LEVELS, 'match')).toEqual([
      'stage',
      'season',
      'tournament',
      'organization',
    ]);
  });

  it('reports nothing above the widest scope', () => {
    expect(levelsAbove(COMPETITION_LEVELS, 'organization')).toEqual([]);
    expect(levelsAbove(ACTOR_LEVELS, 'club')).toEqual([]);
  });

  it('carries a person up to the club that fields them', () => {
    expect(levelsAbove(ACTOR_LEVELS, 'person')).toEqual(['player', 'team', 'club']);
  });

  it('answers whether one level sits above another, so two readers cannot disagree', () => {
    expect(isAbove(COMPETITION_LEVELS, 'season', 'stage')).toBe(true);
    expect(isAbove(COMPETITION_LEVELS, 'stage', 'season')).toBe(false);
    expect(isAbove(COMPETITION_LEVELS, 'match', 'match')).toBe(false);
  });
});

describe('an entrant resolves to the actor that entered', () => {
  it('resolves a team enrollment to the team', () => {
    expect(actorOfEntrant({ entrantRef: { kind: 'team', teamId: 'tm-1' } })).toEqual({
      level: 'team',
      actorId: 'tm-1',
    });
  });

  it('resolves an individual enrollment to the person', () => {
    expect(actorOfEntrant({ entrantRef: { kind: 'person', personId: 'pe-1' } })).toEqual({
      level: 'person',
      actorId: 'pe-1',
    });
  });
});

describe('requireLevels', () => {
  it('accepts a level of each axis', () => {
    expect(requireLevels({ actor: 'person', competition: 'match' }).ok).toBe(true);
  });

  it('refuses an actor level the axis does not publish, listing the ones it does', () => {
    const result = requireLevels({ actor: 'referee', competition: 'match' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('HIERARCHY_LEVEL_INVALID');
    expect(result.error.message).toContain('person, player, team, club');
  });

  it('refuses a competition level the axis does not publish', () => {
    const result = requireLevels({ actor: 'person', competition: 'fortnight' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('fortnight');
  });

  it('refuses the entrant as a level, which is the mistake the shape invites', () => {
    expect(requireLevels({ actor: 'entrant', competition: 'match' }).ok).toBe(false);
  });
});
