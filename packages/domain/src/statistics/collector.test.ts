import {
  readableAt,
  validateCollectors,
  type CollectorVocabulary,
  type StatisticCollector,
} from './collector.js';

const vocabulary: CollectorVocabulary = {
  eventCodes: ['goal', 'yellow-card', 'green-card', 'save', 'foul'],
  statisticCodes: ['goals-for', 'possession'],
};

function collector(overrides: Partial<StatisticCollector> = {}): StatisticCollector {
  return {
    code: 'goals',
    label: 'Goles',
    source: { kind: 'event', definitionCodes: ['goal'] },
    measure: { kind: 'count' },
    granularity: { actor: 'person', competition: 'match' },
    ...overrides,
  };
}

function validate(collectors: readonly StatisticCollector[], vocab = vocabulary) {
  return validateCollectors(collectors, vocab);
}

describe('a statistic is declared, not implemented', () => {
  it('accepts a collector over an event the discipline defines', () => {
    expect(validate([collector()]).ok).toBe(true);
  });

  it('accepts the four kinds of source', () => {
    const sources: StatisticCollector['source'][] = [
      { kind: 'event', definitionCodes: ['goal'] },
      { kind: 'statistic', statisticCode: 'goals-for' },
      { kind: 'collector', code: 'goals' },
      { kind: 'participation' },
    ];

    for (const [index, source] of sources.entries()) {
      const declared = [collector(), collector({ code: `derived-${index}`, source })];
      expect(validate(declared).ok).toBe(true);
    }
  });

  it('counts appearances from the roster, because a player who touched nothing still played', () => {
    const played = collector({
      code: 'matches-played',
      source: { kind: 'participation', roles: ['player'] },
      granularity: { actor: 'person', competition: 'match' },
    });

    expect(validate([played]).ok).toBe(true);
  });
});

describe('what a declaration is refused for', () => {
  it('refuses an event code the discipline does not define', () => {
    const result = validate([
      collector({ source: { kind: 'event', definitionCodes: ['summon'] } }),
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('COLLECTOR_INVALID');
    expect(result.error.message).toContain('summon');
  });

  it('refuses a statistic the discipline does not declare', () => {
    expect(
      validate([collector({ source: { kind: 'statistic', statisticCode: 'vibes' } })]).ok,
    ).toBe(false);
  });

  it('refuses feeding off a collector nobody declared', () => {
    expect(validate([collector({ source: { kind: 'collector', code: 'ghost' } })]).ok).toBe(false);
  });

  it.each([
    ['actor', { actor: 'referee', competition: 'match' }],
    ['competition', { actor: 'person', competition: 'fortnight' }],
  ])('refuses an unpublished %s granularity, listing the published ones', (_axis, granularity) => {
    const result = validate([collector({ granularity: granularity as never })]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('Published:');
  });

  it('refuses two collectors sharing a code, which would make read order decide the answer', () => {
    expect(validate([collector(), collector({ label: 'Otra cosa' })]).ok).toBe(false);
  });
});

describe('a ceiling under the floor', () => {
  it('refuses a ceiling below the granularity it collects at', () => {
    const result = validate([
      collector({
        granularity: { actor: 'team', competition: 'match' },
        rollsUpTo: { actor: 'person' },
      }),
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('under the floor');
  });

  it('refuses a ceiling equal to its own granularity, which would forbid reading it anywhere', () => {
    expect(validate([collector({ rollsUpTo: { competition: 'match' } })]).ok).toBe(false);
  });

  it('accepts a ceiling above it', () => {
    expect(validate([collector({ rollsUpTo: { competition: 'season' } })]).ok).toBe(true);
  });
});

describe('a chain that feeds itself', () => {
  it('refuses a collector sourcing itself', () => {
    const result = validate([collector({ source: { kind: 'collector', code: 'goals' } })]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('feeds itself');
  });

  it('refuses a cycle through another collector', () => {
    const first = collector({ code: 'a', source: { kind: 'collector', code: 'b' } });
    const second = collector({ code: 'b', source: { kind: 'collector', code: 'a' } });

    expect(validate([first, second]).ok).toBe(false);
  });

  it('accepts a chain that ends in a real source', () => {
    const base = collector({ code: 'goals' });
    const derived = collector({
      code: 'goals-derived',
      source: { kind: 'collector', code: 'goals' },
    });

    expect(validate([base, derived]).ok).toBe(true);
  });
});

describe('a granularity nothing populates yet', () => {
  it('reports the collector as inert, naming what owes it', () => {
    const result = validate(
      [collector({ granularity: { actor: 'person', competition: 'season' } })],
      {
        ...vocabulary,
        unpopulatedGranularities: ['season'],
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Returning zero for a question nobody can populate is a page of blanks
    // with a feature's name on it.
    expect(result.value.inert).toEqual([{ code: 'goals', granularity: 'season', owedBy: '0015' }]);
  });

  it('reports nothing inert now that every granularity is populated', () => {
    const result = validate([
      collector({ granularity: { actor: 'player', competition: 'season' } }),
    ]);

    expect(result.ok && result.value.inert).toEqual([]);
  });
});

describe('readableAt', () => {
  const perPersonPerMatch = collector();

  it('reads at the granularity it collects', () => {
    expect(readableAt(perPersonPerMatch, { actor: 'person', competition: 'match' })).toBe(true);
  });

  it('reads at every coarser granularity when no ceiling is declared', () => {
    expect(readableAt(perPersonPerMatch, { actor: 'club', competition: 'organization' })).toBe(
      true,
    );
  });

  it('refuses a read finer than what it collects, which nothing supports', () => {
    expect(readableAt(perPersonPerMatch, { actor: 'person', competition: 'event' })).toBe(false);
  });

  it('refuses a read above a declared ceiling rather than answering it', () => {
    const capped = collector({ rollsUpTo: { competition: 'stage' } });

    expect(readableAt(capped, { actor: 'person', competition: 'stage' })).toBe(true);
    expect(readableAt(capped, { actor: 'person', competition: 'season' })).toBe(false);
  });
});
