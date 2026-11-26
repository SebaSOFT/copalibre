import { jest } from '@jest/globals';
import { createCounterRefreshGate } from './counter-refresh.js';

interface Timer {
  readonly callback: () => void;
  readonly at: number;
}

function clock() {
  let now = 0;
  const timers: Timer[] = [];
  return {
    now: () => now,
    setTimer: (callback: () => void, ms: number) => {
      const timer = { callback, at: now + ms };
      timers.push(timer);
      return timer;
    },
    clearTimer: (handle: unknown) => {
      const index = timers.indexOf(handle as Timer);
      if (index >= 0) timers.splice(index, 1);
    },
    advance(ms: number) {
      now += ms;
      for (const timer of timers.filter((t) => t.at <= now)) {
        timers.splice(timers.indexOf(timer), 1);
        timer.callback();
      }
    },
  };
}

describe('createCounterRefreshGate', () => {
  it('refreshes at once for the first request of a match', () => {
    const time = clock();
    const refresh = jest.fn();
    const gate = createCounterRefreshGate(refresh, { ...time, now: time.now });
    gate.request('m1');
    expect(refresh).toHaveBeenCalledWith('m1');
  });

  it('coalesces requests inside the interval into one trailing refresh', () => {
    const time = clock();
    const refresh = jest.fn();
    const gate = createCounterRefreshGate(refresh, {
      now: time.now,
      setTimer: time.setTimer,
      clearTimer: time.clearTimer,
    });
    gate.request('m1');
    gate.request('m1');
    gate.request('m1');
    expect(refresh).toHaveBeenCalledTimes(1);
    time.advance(1000);
    expect(refresh).toHaveBeenCalledTimes(2);
    time.advance(5000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('keeps each match on its own interval', () => {
    const time = clock();
    const refresh = jest.fn();
    const gate = createCounterRefreshGate(refresh, {
      now: time.now,
      setTimer: time.setTimer,
      clearTimer: time.clearTimer,
    });
    gate.request('m1');
    gate.request('m2');
    expect(refresh.mock.calls).toEqual([['m1'], ['m2']]);
  });

  it('cancels a pending refresh on dispose', () => {
    const time = clock();
    const refresh = jest.fn();
    const gate = createCounterRefreshGate(refresh, {
      now: time.now,
      setTimer: time.setTimer,
      clearTimer: time.clearTimer,
    });
    gate.request('m1');
    gate.request('m1');
    gate.dispose();
    time.advance(2000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
