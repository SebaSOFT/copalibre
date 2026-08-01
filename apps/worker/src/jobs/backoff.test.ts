import { DEFAULT_BACKOFF, backoffCurve, delayForAttempt, isExhausted } from './backoff.js';

const NO_JITTER = { ...DEFAULT_BACKOFF, jitter: 0 };

describe('the backoff curve', () => {
  it.each([
    [1, 5],
    [2, 15],
    [3, 45],
    [4, 135],
    [5, 405],
  ])('waits %ds worth after attempt %d', (attempt, expected) => {
    expect(delayForAttempt(attempt, NO_JITTER)).toBe(expected);
  });

  it('stops growing at the cap', () => {
    // Unbounded growth eventually schedules a retry past the point anyone is
    // still watching: not dead-lettered, so nothing alerts, and not retrying
    // either.
    expect(delayForAttempt(9, NO_JITTER)).toBe(NO_JITTER.maxDelaySeconds);
    expect(delayForAttempt(40, NO_JITTER)).toBe(NO_JITTER.maxDelaySeconds);
  });

  it('waits nothing before the first attempt', () => {
    expect(delayForAttempt(0, NO_JITTER)).toBe(0);
    expect(delayForAttempt(-3, NO_JITTER)).toBe(0);
  });

  it('never shrinks as attempts grow', () => {
    const curve = backoffCurve(NO_JITTER);

    expect(curve).toEqual([...curve].sort((left, right) => left - right));
  });
});

describe('jitter', () => {
  it('spreads two jobs failing at the same instant', () => {
    // A database hiccup fails a hundred jobs together; without jitter all
    // hundred retry together and reproduce the load that caused it.
    const first = delayForAttempt(3, DEFAULT_BACKOFF, 'event-a');
    const second = delayForAttempt(3, DEFAULT_BACKOFF, 'event-b');

    expect(first).not.toBe(second);
  });

  it('is deterministic in the job, so a replay computes the same schedule', () => {
    expect(delayForAttempt(3, DEFAULT_BACKOFF, 'event-a')).toBe(
      delayForAttempt(3, DEFAULT_BACKOFF, 'event-a'),
    );
  });

  it('stays within the declared share of the delay', () => {
    const base = delayForAttempt(4, NO_JITTER);
    const spread = base * DEFAULT_BACKOFF.jitter;

    for (const key of ['a', 'b', 'c', 'd', 'e', 'f']) {
      const delay = delayForAttempt(4, DEFAULT_BACKOFF, key);
      expect(delay).toBeGreaterThanOrEqual(base - spread / 2);
      expect(delay).toBeLessThanOrEqual(base + spread / 2);
    }
  });
});

describe('exhaustion', () => {
  it('is reached at the declared attempt count, not before', () => {
    expect(isExhausted(DEFAULT_BACKOFF.maxAttempts - 1)).toBe(false);
    expect(isExhausted(DEFAULT_BACKOFF.maxAttempts)).toBe(true);
    expect(isExhausted(DEFAULT_BACKOFF.maxAttempts + 4)).toBe(true);
  });

  it('gives the whole curve, so how long a job keeps trying is answerable', () => {
    const total = backoffCurve(NO_JITTER).reduce((sum, delay) => sum + delay, 0);

    expect(backoffCurve(NO_JITTER)).toHaveLength(DEFAULT_BACKOFF.maxAttempts);
    // Roughly ten minutes of retrying before an operator has to look at it.
    expect(total).toBeGreaterThan(600);
  });
});
