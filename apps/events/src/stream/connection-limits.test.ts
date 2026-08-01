import { ConnectionLimiter, DEFAULT_LIMITS } from './connection-limits.js';

describe('who may hold a public connection', () => {
  it('admits up to the per-address cap, then refuses with a reason', () => {
    const limiter = new ConnectionLimiter({ perAddress: 2, perResource: 10, total: 10 });

    expect(limiter.admit('1.2.3.4', 'tournament-1').admitted).toBe(true);
    expect(limiter.admit('1.2.3.4', 'tournament-1').admitted).toBe(true);
    const refused = limiter.admit('1.2.3.4', 'tournament-1');

    expect(refused.admitted).toBe(false);
    if (refused.admitted) return;
    expect(refused.reason).toContain('this address');
  });

  it('frees the slot when a connection releases', () => {
    const limiter = new ConnectionLimiter({ perAddress: 1, perResource: 10, total: 10 });
    const first = limiter.admit('1.2.3.4', 'tournament-1');

    expect(limiter.admit('1.2.3.4', 'tournament-1').admitted).toBe(false);
    if (!first.admitted) return;
    first.release();
    expect(limiter.admit('1.2.3.4', 'tournament-1').admitted).toBe(true);
  });

  it('releases only once, however many times it is called', () => {
    // A connection can end twice — once by the client, once by the framework —
    // and a double decrement hands out slots that do not exist.
    const limiter = new ConnectionLimiter({ perAddress: 5, perResource: 5, total: 5 });
    const admission = limiter.admit('1.2.3.4', 'tournament-1');
    if (!admission.admitted) return;

    admission.release();
    admission.release();
    admission.release();

    expect(limiter.counts().open).toBe(0);
  });

  it('caps a single resource across addresses', () => {
    const limiter = new ConnectionLimiter({ perAddress: 10, perResource: 2, total: 100 });
    limiter.admit('1.1.1.1', 'final');
    limiter.admit('2.2.2.2', 'final');

    const refused = limiter.admit('3.3.3.3', 'final');
    expect(refused.admitted).toBe(false);
    if (refused.admitted) return;
    expect(refused.reason).toContain('this resource');
  });

  it('caps the node before anything else', () => {
    const limiter = new ConnectionLimiter({ perAddress: 10, perResource: 10, total: 1 });
    limiter.admit('1.1.1.1', 'a');

    const refused = limiter.admit('2.2.2.2', 'b');
    expect(refused.admitted).toBe(false);
    if (refused.admitted) return;
    expect(refused.reason).toContain('connection limit');
  });

  it('forgets an address once its last connection ends', () => {
    const limiter = new ConnectionLimiter();
    const admission = limiter.admit('1.2.3.4', 'x');
    if (!admission.admitted) return;
    admission.release();

    // An installation serving a season should not accumulate a map entry per
    // address it has ever seen.
    expect(limiter.counts().addresses).toBe(0);
  });

  it('is generous per address, because a venue is not an attacker', () => {
    // Four screens in one club arrive as four connections from one NAT.
    expect(DEFAULT_LIMITS.perAddress).toBeGreaterThanOrEqual(4);
  });
});
