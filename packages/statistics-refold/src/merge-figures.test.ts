import type { CollectedFigure } from '@copalibre/tournament-engine';
import type { StoredFigure } from '@copalibre/persistence';
import { mergeFigures } from './merge-figures.js';

function stored(overrides: Partial<StoredFigure> = {}): StoredFigure {
  return {
    collectorCode: 'goals',
    actorGranularity: 'person',
    actorId: 'pe-1',
    competitionGranularity: 'match',
    competitionId: 'm-1',
    value: 1,
    samples: 1,
    ...overrides,
  };
}

function collected(overrides: Partial<CollectedFigure> = {}): CollectedFigure {
  return {
    collectorCode: 'goals',
    actorGranularity: 'person',
    actorId: 'pe-1',
    competitionGranularity: 'match',
    competitionId: 'm-1',
    value: 1,
    samples: 1,
    ...overrides,
  };
}

describe('merging a live fold’s marginal figures onto what a match already stored (0082)', () => {
  it('adds a second event’s marginal figure onto the first’s, at the same key', () => {
    const merged = mergeFigures(
      [stored({ value: 1, samples: 1 })],
      [collected({ value: 1, samples: 1 })],
    );

    expect(merged).toEqual([expect.objectContaining({ value: 2, samples: 2 })]);
  });

  it('adds a brand-new key untouched by what was already stored', () => {
    const merged = mergeFigures(
      [stored({ actorId: 'pe-1', value: 1, samples: 1 })],
      [collected({ actorId: 'pe-2', value: 1, samples: 1 })],
    );

    expect(merged).toHaveLength(2);
    expect(merged.find((f) => f.actorId === 'pe-1')?.value).toBe(1);
    expect(merged.find((f) => f.actorId === 'pe-2')?.value).toBe(1);
  });

  it('leaves an existing figure the marginal fold does not touch unchanged', () => {
    const merged = mergeFigures(
      [stored({ collectorCode: 'fouls', value: 3, samples: 3 })],
      [collected({ collectorCode: 'goals', value: 1, samples: 1 })],
    );

    expect(merged.find((f) => f.collectorCode === 'fouls')).toEqual(
      expect.objectContaining({ value: 3, samples: 3 }),
    );
  });

  it('starts from nothing when the match stored no rows yet', () => {
    const merged = mergeFigures([], [collected({ value: 5, samples: 5 })]);

    expect(merged).toEqual([expect.objectContaining({ value: 5, samples: 5 })]);
  });
});
