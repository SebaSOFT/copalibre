import {
  DEFAULT_LEASE,
  mayEnqueue,
  renewIntervalMs,
  renewalDue,
  wasFenced,
  type LeaseState,
} from './lease-state.js';

const NOW = 1_770_000_000_000;

function held(overrides: Partial<Extract<LeaseState, { kind: 'held' }>> = {}): LeaseState {
  return {
    kind: 'held',
    expiresAt: NOW + DEFAULT_LEASE.ttlSeconds * 1000,
    fencingToken: 7,
    ...overrides,
  };
}

describe('renewing well inside the window', () => {
  it('renews at a third of the timeout, leaving room for two failed attempts', () => {
    // A replica that renews at 90% of the TTL gets one attempt: a single slow
    // query means its lease expires while it still believes it holds it, and
    // two schedulers both think they are the one.
    expect(renewIntervalMs()).toBe(10_000);
    expect(renewIntervalMs({ ttlSeconds: 60, renewAt: 1 / 3 })).toBe(20_000);
  });

  it('is due once a third of the window has passed', () => {
    expect(renewalDue(held(), NOW)).toBe(false);
    expect(renewalDue(held(), NOW + 21_000)).toBe(true);
  });

  it('is never due for a replica that holds nothing', () => {
    expect(renewalDue({ kind: 'idle' }, NOW)).toBe(false);
    expect(renewalDue({ kind: 'lost', since: NOW }, NOW)).toBe(false);
  });
});

describe('who may enqueue', () => {
  it('lets the holder act while the lease stands', () => {
    expect(mayEnqueue(held(), NOW)).toBe(true);
  });

  it('refuses a holder whose lease expired while it was paused', () => {
    // The clock decides at the moment of acting, not the field set before the
    // pause this replica may not know it took.
    expect(mayEnqueue(held(), NOW + 31_000)).toBe(false);
  });

  it.each([
    ['idle', { kind: 'idle' } as LeaseState],
    ['lost', { kind: 'lost', since: NOW } as LeaseState],
  ])('refuses a replica that is %s', (_label, state) => {
    expect(mayEnqueue(state, NOW)).toBe(false);
  });
});

describe('fencing', () => {
  it('detects a takeover that happened while this replica was away', () => {
    expect(wasFenced(held({ fencingToken: 7 }), 8)).toBe(true);
  });

  it("does not mistake its own lease for somebody else's", () => {
    expect(wasFenced(held({ fencingToken: 7 }), 7)).toBe(false);
  });

  it('has nothing to say about a replica holding nothing', () => {
    expect(wasFenced({ kind: 'idle' }, 99)).toBe(false);
  });
});
