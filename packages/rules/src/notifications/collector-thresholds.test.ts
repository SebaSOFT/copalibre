import {
  ACTOR_GRANULARITIES,
  type RecordedEvent,
  type StatisticCollector,
} from '@copalibre/domain';
import {
  evaluateCollectorThreshold,
  thresholdReadable,
  type CollectorThresholdRule,
} from './collector-thresholds.js';

const collector: StatisticCollector = {
  code: 'yellow-cards',
  label: 'Tarjetas amarillas',
  source: { kind: 'event', definitionCodes: ['yellow-card'] },
  measure: { kind: 'count' },
  granularity: { actor: 'person', competition: 'match' },
};

function rule(overrides: Partial<CollectorThresholdRule> = {}): CollectorThresholdRule {
  return {
    id: 'fifth-yellow',
    version: 1,
    collectorCode: 'yellow-cards',
    actorGranularity: 'person',
    threshold: { comparator: '>=', value: 5 },
    action: {
      severity: 'warning',
      titleTemplate: 'Quinta amarilla',
      messageTemplate: '{{ scopeKey }} lleva {{ total }}',
      targetRole: 'operator',
    },
    ...overrides,
  };
}

function cards(count: number, personId = 'pe-1'): readonly RecordedEvent[] {
  return Array.from({ length: count }, (_value, index) => ({
    eventId: `e-${personId}-${index + 1}`,
    sequence: index + 1,
    matchId: 'm-1',
    segmentId: 'seg-1',
    definitionCode: 'yellow-card',
    occurredAt: '2026-08-01T20:00:00.000Z',
    payload: {},
    personId,
  }));
}

function evaluate(overrides: Partial<Parameters<typeof evaluateCollectorThreshold>[0]> = {}) {
  return evaluateCollectorThreshold({
    rule: rule(),
    collector,
    events: cards(1),
    actorOf: (event) => event.personId,
    ...overrides,
  });
}

describe('a threshold over a collector', () => {
  it('reads the running total instead of counting the match again', () => {
    // Four cards were carried in from earlier matches; the fifth arrives here,
    // and the rule sees one number rather than a per-rule counter of its own.
    const { instances } = evaluate({ carriedIn: { 'pe-1': 4 } });

    expect(instances).toHaveLength(1);
    expect(instances[0]?.message).toBe('pe-1 lleva 5');
  });

  it('does not fire below the threshold', () => {
    expect(evaluate({ events: cards(4) }).instances).toEqual([]);
  });

  it('fires on the crossing and not on every event past it', () => {
    const { instances } = evaluate({ events: cards(8) });

    expect(instances).toHaveLength(1);
    expect(instances[0]?.triggeredByEventId).toBe('e-pe-1-5');
  });

  it('keeps one identity per firing, so a replay dedupes rather than duplicates', () => {
    const first = evaluate({ events: cards(6) });
    const again = evaluate({ events: cards(6) });

    expect(first.instances[0]?.identityKey).toBe('fifth-yellow@v1|pe-1|firing:1');
    expect(again.instances[0]?.identityKey).toBe(first.instances[0]?.identityKey);
  });

  it('counts each actor separately', () => {
    const { instances } = evaluate({
      events: [...cards(5, 'pe-1'), ...cards(3, 'pe-2')],
    });

    expect(instances.map((instance) => instance.scopeKey)).toEqual(['pe-1']);
  });

  it('ignores an event the collector does not watch', () => {
    const other = cards(5).map((event) => ({ ...event, definitionCode: 'foul' }));

    expect(evaluate({ events: other }).instances).toEqual([]);
  });

  it('records why it fired, with the numbers that decided it', () => {
    const { record } = evaluate({ carriedIn: { 'pe-1': 4 } });

    expect(record.trace[0]).toMatchObject({ outcome: 'fired' });
    expect(record.output).toEqual(['fifth-yellow@v1|pe-1|firing:1']);
  });
});

describe('a window on the rule is not a reset of the collector', () => {
  const windowed = rule({ window: 'since-last-consequence' });

  it('starts counting again after a consequence, while the total keeps growing', () => {
    const { instances } = evaluateCollectorThreshold({
      rule: windowed,
      collector,
      events: cards(10),
      actorOf: (event) => event.personId,
    });

    // Five and ten: two sanctions, and the career total was never edited to
    // produce the second.
    expect(instances).toHaveLength(2);
    expect(instances[1]?.contextValues.total).toBe(10);
    expect(instances[1]?.contextValues.window).toBe(5);
  });

  it('respects consequences recorded before this match', () => {
    const { instances } = evaluateCollectorThreshold({
      rule: windowed,
      collector,
      events: cards(2),
      actorOf: (event) => event.personId,
      // Nine cards, five of them already answered: the tenth is the next
      // sanction, not the sixth.
      carriedIn: { 'pe-1': 8 },
      consumed: { 'pe-1': 5 },
    });

    expect(instances).toHaveLength(1);
    expect(instances[0]?.contextValues.total).toBe(10);
  });

  it('counts the career total when no window is declared', () => {
    const { instances } = evaluateCollectorThreshold({
      rule: rule(),
      collector,
      events: cards(10),
      actorOf: (event) => event.personId,
    });

    expect(instances).toHaveLength(1);
  });
});

describe('what a threshold may read', () => {
  it('reads a collector kept at its own granularity or finer', () => {
    expect(thresholdReadable(rule(), collector, ACTOR_GRANULARITIES)).toBe(true);
    expect(
      thresholdReadable(rule({ actorGranularity: 'team' }), collector, ACTOR_GRANULARITIES),
    ).toBe(true);
  });

  it('refuses a rule about a person over a collector kept per team', () => {
    // Answering it with the team's number would sanction the wrong human.
    const perTeam: StatisticCollector = {
      ...collector,
      granularity: { actor: 'team', competition: 'match' },
    };

    expect(thresholdReadable(rule(), perTeam, ACTOR_GRANULARITIES)).toBe(false);
  });

  it('refuses a rule naming another collector', () => {
    expect(
      thresholdReadable(rule({ collectorCode: 'red-cards' }), collector, ACTOR_GRANULARITIES),
    ).toBe(false);
  });
});

describe('summing rather than counting', () => {
  it('adds a measured field when that is what the collector measures', () => {
    const minutes: StatisticCollector = {
      ...collector,
      code: 'suspension-minutes',
      measure: { kind: 'sum', field: 'minutes' },
    };

    const { instances } = evaluateCollectorThreshold({
      rule: rule({
        collectorCode: 'suspension-minutes',
        threshold: { comparator: '>=', value: 4 },
      }),
      collector: minutes,
      events: cards(2).map((event) => ({ ...event, payload: { minutes: 2 } })),
      actorOf: (event) => event.personId,
    });

    expect(instances).toHaveLength(1);
  });

  it('contributes nothing from an event missing the measured field', () => {
    const minutes: StatisticCollector = {
      ...collector,
      measure: { kind: 'sum', field: 'minutes' },
    };

    const { instances } = evaluateCollectorThreshold({
      rule: rule({ threshold: { comparator: '>', value: 0 } }),
      collector: minutes,
      events: cards(3),
      actorOf: (event) => event.personId,
    });

    expect(instances).toEqual([]);
  });
});

describe('comparators', () => {
  it.each([
    ['>=', 5, 1],
    ['>', 5, 0],
    ['==', 5, 1],
  ] as const)('a %s threshold at %d fires %d time(s) on five cards', (comparator, value, fired) => {
    const { instances } = evaluateCollectorThreshold({
      rule: rule({ threshold: { comparator, value } }),
      collector,
      events: cards(5),
      actorOf: (event) => event.personId,
    });

    expect(instances).toHaveLength(fired);
  });
});
