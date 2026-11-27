import {
  epochOfWallClock,
  epochOfWallClockOrNext,
  localToEpoch,
  wallClockOf,
} from './zoned-time.js';

const wall = (year: number, month: number, day: number, hour: number, minute = 0) =>
  Date.UTC(year, month - 1, day, hour, minute);

describe('zoned wall-clock time', () => {
  it('round-trips an ordinary local time', () => {
    const epoch = localToEpoch('2026-07-01T09:00', 'Europe/Madrid');
    expect(epoch).toBe(Date.UTC(2026, 6, 1, 7, 0));
    expect(wallClockOf(epoch, 'Europe/Madrid')).toBe(wall(2026, 7, 1, 9));
  });

  it('takes the next valid minute inside a spring-forward gap', () => {
    // Madrid skips 02:00–03:00 on 2026-03-29.
    expect(epochOfWallClock(wall(2026, 3, 29, 2, 30), 'Europe/Madrid')).toBeUndefined();
    expect(epochOfWallClockOrNext(wall(2026, 3, 29, 2, 30), 'Europe/Madrid')).toBe(
      Date.UTC(2026, 2, 29, 1, 0),
    );
  });

  it('takes the first occurrence of a fall-back repeat', () => {
    // Madrid repeats 02:00–03:00 on 2026-10-25; the first 02:30 is still summer time.
    expect(epochOfWallClock(wall(2026, 10, 25, 2, 30), 'Europe/Madrid')).toBe(
      Date.UTC(2026, 9, 25, 0, 30),
    );
  });

  it('is a fixed offset in a zone without daylight saving', () => {
    expect(localToEpoch('2026-03-29T02:30', 'America/Argentina/Buenos_Aires')).toBe(
      Date.UTC(2026, 2, 29, 5, 30),
    );
  });
});
