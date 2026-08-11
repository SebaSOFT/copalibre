import { DEFAULT_RECONNECT, reconnectDelay } from './backoff.js';

const NO_JITTER = { ...DEFAULT_RECONNECT, jitter: 0 };

describe('reconnect delay', () => {
  it.each([
    [1, 1000],
    [2, 2000],
    [3, 4000],
    [4, 8000],
  ])('waits %dms worth on attempt %d', (attempt, expected) => {
    expect(reconnectDelay(attempt, NO_JITTER)).toBe(expected);
  });

  it('stops growing at the cap, so a spectator is never minutes behind', () => {
    expect(reconnectDelay(20, NO_JITTER)).toBe(NO_JITTER.maxMs);
  });

  it('waits nothing before the first attempt', () => {
    expect(reconnectDelay(0, NO_JITTER)).toBe(0);
  });

  it("honours the server's own retry hint as a floor", () => {
    // The server knows about the outage the client cannot see.
    expect(reconnectDelay(1, NO_JITTER, 15_000)).toBe(15_000);
    expect(reconnectDelay(1, NO_JITTER, 100)).toBe(1000);
  });

  it('spreads a thousand clients that all dropped together', () => {
    // Unlike the worker's, this jitter is genuinely random: a reproducible
    // schedule would bring every tablet in the stadium back at the same instant
    // and knock the server over a second time.
    const early = reconnectDelay(3, DEFAULT_RECONNECT, undefined, () => 0);
    const late = reconnectDelay(3, DEFAULT_RECONNECT, undefined, () => 1);

    expect(early).toBeLessThan(late);
    expect(late - early).toBeCloseTo(4000 * DEFAULT_RECONNECT.jitter, -1);
  });
});
