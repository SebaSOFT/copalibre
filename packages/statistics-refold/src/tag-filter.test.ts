import type { RecordedEvent, StatisticCollector, TagDeclaration, TagFact } from '@copalibre/domain';
import { buildRequiresTagFilter } from './tag-filter.js';

const DECLARATIONS: readonly TagDeclaration[] = [
  { code: 'captain', label: 'Captain', appliesTo: ['person'] },
];

function collector(overrides: Partial<StatisticCollector> = {}): StatisticCollector {
  return {
    code: 'goals',
    label: 'Goals',
    source: { kind: 'event', definitionCodes: ['goal'] },
    measure: { kind: 'count' },
    granularity: { actor: 'person', competition: 'match' },
    ...overrides,
  };
}

function event(overrides: Partial<RecordedEvent> & { occurredAt: string }): RecordedEvent {
  return {
    eventId: 'e-1',
    matchId: 'm-1',
    segmentId: 'seg-1',
    sequence: 1,
    definitionCode: 'goal',
    payload: {},
    ...overrides,
  };
}

function fact(overrides: Partial<TagFact> & { action: TagFact['action']; at: string }): TagFact {
  return {
    code: 'captain',
    actorGranularity: 'person',
    actorId: 'pe-1',
    competitionGranularity: 'match',
    competitionId: 'm-1',
    actor: 'user:seed',
    reason: 'seed',
    ...overrides,
  };
}

describe('a collector with no requiresTag', () => {
  it('always passes, regardless of facts', () => {
    const filter = buildRequiresTagFilter([], []);
    const passes = filter?.(event({ occurredAt: '2026-08-01T20:00:00.000Z' }), 'pe-1', collector());
    expect(passes).toBe(true);
  });
});

describe('a collector requiring a tag', () => {
  const requiresTag = collector({ requiresTag: { code: 'captain' } });

  it('counts a fact from an actor carrying the tag at the fact instant', () => {
    const filter = buildRequiresTagFilter(DECLARATIONS, [
      fact({ action: 'applied', at: '2026-08-01T19:00:00.000Z' }),
    ]);
    const passes = filter?.(event({ occurredAt: '2026-08-01T20:00:00.000Z' }), 'pe-1', requiresTag);
    expect(passes).toBe(true);
  });

  it('excludes a fact from an actor never carrying the tag', () => {
    const filter = buildRequiresTagFilter(DECLARATIONS, [
      fact({ action: 'applied', at: '2026-08-01T19:00:00.000Z' }),
    ]);
    const passes = filter?.(event({ occurredAt: '2026-08-01T20:00:00.000Z' }), 'pe-2', requiresTag);
    expect(passes).toBe(false);
  });

  it('excludes a fact recorded before the tag was ever applied', () => {
    const filter = buildRequiresTagFilter(DECLARATIONS, [
      fact({ action: 'applied', at: '2026-08-01T21:00:00.000Z' }),
    ]);
    const passes = filter?.(event({ occurredAt: '2026-08-01T20:00:00.000Z' }), 'pe-1', requiresTag);
    expect(passes).toBe(false);
  });

  it('still counts a fact after the tag is later lifted — tag state is checked at the fact instant, not at fold time', () => {
    const filter = buildRequiresTagFilter(DECLARATIONS, [
      fact({ action: 'applied', at: '2026-08-01T19:00:00.000Z' }),
      fact({ action: 'lifted', at: '2026-08-01T20:30:00.000Z' }),
    ]);
    const passes = filter?.(event({ occurredAt: '2026-08-01T20:00:00.000Z' }), 'pe-1', requiresTag);
    expect(passes).toBe(true);
  });

  it('excludes a fact recorded after the tag was already lifted', () => {
    const filter = buildRequiresTagFilter(DECLARATIONS, [
      fact({ action: 'applied', at: '2026-08-01T18:00:00.000Z' }),
      fact({ action: 'lifted', at: '2026-08-01T19:00:00.000Z' }),
    ]);
    const passes = filter?.(event({ occurredAt: '2026-08-01T20:00:00.000Z' }), 'pe-1', requiresTag);
    expect(passes).toBe(false);
  });

  it('respects a competition-scoped requiresTag', () => {
    const scoped = collector({ requiresTag: { code: 'captain', competition: 'stage' } });
    const filter = buildRequiresTagFilter(DECLARATIONS, [
      fact({
        action: 'applied',
        at: '2026-08-01T19:00:00.000Z',
        competitionGranularity: 'match',
        competitionId: 'm-1',
      }),
    ]);
    // The applied fact is scoped to "match", not "stage" as requiresTag asks.
    const passes = filter?.(event({ occurredAt: '2026-08-01T20:00:00.000Z' }), 'pe-1', scoped);
    expect(passes).toBe(false);
  });

  it('is defensive against a non-event fact reaching a requiresTag collector', () => {
    const filter = buildRequiresTagFilter(DECLARATIONS, []);
    const passes = filter?.({ personId: 'pe-1', role: 'player' }, 'pe-1', requiresTag);
    expect(passes).toBe(false);
  });
});
