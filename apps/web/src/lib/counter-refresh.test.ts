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

function gateWith(refresh: () => void) {
  const time = clock();
  const gate = createCounterRefreshGate(refresh, {
    now: time.now,
    setTimer: time.setTimer,
    clearTimer: time.clearTimer,
  });
  return { gate, time };
}

describe('createCounterRefreshGate', () => {
  it('refreshes at once for the first request', () => {
    const refresh = jest.fn();
    const { gate } = gateWith(refresh);
    gate.request();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('coalesces requests inside the interval into one trailing refresh', () => {
    const refresh = jest.fn();
    const { gate, time } = gateWith(refresh);
    gate.request();
    gate.request();
    gate.request();
    expect(refresh).toHaveBeenCalledTimes(1);
    time.advance(1000);
    expect(refresh).toHaveBeenCalledTimes(2);
    time.advance(5000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('allows at most one refresh per second for the whole client, whatever the match', () => {
    const refresh = jest.fn();
    const { gate, time } = gateWith(refresh);
    gate.request();
    time.advance(400);
    gate.request();
    gate.request();
    expect(refresh).toHaveBeenCalledTimes(1);
    time.advance(600);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('cancels a pending refresh on dispose', () => {
    const refresh = jest.fn();
    const { gate, time } = gateWith(refresh);
    gate.request();
    gate.request();
    gate.dispose();
    time.advance(2000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
