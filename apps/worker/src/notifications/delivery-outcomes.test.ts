import { DELIVERY_OUTCOME_LABELS, DeliveryOutcomeCounters } from './delivery-outcomes.js';

describe('DeliveryOutcomeCounters', () => {
  it('starts every outcome at zero', () => {
    const counts = new DeliveryOutcomeCounters().snapshot();

    expect(Object.keys(counts).sort()).toEqual([...DELIVERY_OUTCOME_LABELS].sort());
    expect(Object.values(counts).every((count) => count === 0)).toBe(true);
  });

  it('counts each outcome on its own', () => {
    const counters = new DeliveryOutcomeCounters();
    counters.record('unknown');
    counters.record('unknown');
    counters.record('sent');

    expect(counters.snapshot()).toEqual({ sent: 1, 'already-sent': 0, unknown: 2, rejected: 0 });
  });

  it('hands out a copy, so a reader cannot change the tally', () => {
    const counters = new DeliveryOutcomeCounters();
    const snapshot = counters.snapshot() as Record<string, number>;
    snapshot.sent = 99;

    expect(counters.snapshot().sent).toBe(0);
  });
});
