import {
  daysBetween,
  isCalendarDate,
  localDateOf,
  localToEpoch,
  shiftLocalDate,
} from './zoned-time.js';

describe('localToEpoch', () => {
  it('reads Argentine wall-clock time as UTC-3 all year', () => {
    expect(
      new Date(localToEpoch('2025-11-02T11:15', 'America/Argentina/Buenos_Aires')).toISOString(),
    ).toBe('2025-11-02T14:15:00.000Z');
    expect(
      new Date(localToEpoch('2025-07-01T00:00:30', 'America/Argentina/Buenos_Aires')).toISOString(),
    ).toBe('2025-07-01T03:00:30.000Z');
  });

  it('follows daylight saving in a zone that has it', () => {
    expect(new Date(localToEpoch('2025-01-15T12:00', 'Europe/Madrid')).toISOString()).toBe(
      '2025-01-15T11:00:00.000Z',
    );
    expect(new Date(localToEpoch('2025-07-15T12:00', 'Europe/Madrid')).toISOString()).toBe(
      '2025-07-15T10:00:00.000Z',
    );
  });

  it('refuses something that is not a local time', () => {
    expect(() => localToEpoch('2025-11-02 11:15', 'UTC')).toThrow('unreadable local time');
  });
});

describe('calendar helpers', () => {
  it('moves a wall-clock kickoff by whole days across months and years', () => {
    expect(shiftLocalDate('2025-11-02T11:15', 349)).toBe('2026-10-17T11:15');
    expect(shiftLocalDate('2025-12-30T20:00', 3)).toBe('2026-01-02T20:00');
    expect(shiftLocalDate('2025-11-02T11:15', 0)).toBe('2025-11-02T11:15');
    expect(daysBetween('2025-11-02', '2026-10-17')).toBe(349);
  });

  it('keeps the local time across a daylight-saving change', () => {
    // Madrid moves from UTC+1 to UTC+2 on 2026-03-29: the kickoff stays at 12:00 local time.
    const shifted = shiftLocalDate('2026-03-22T12:00', 14);
    expect(new Date(localToEpoch(shifted, 'Europe/Madrid')).toISOString()).toBe(
      '2026-04-05T10:00:00.000Z',
    );
  });

  it('reads today in the organization zone, not in UTC', () => {
    // 01:30 UTC on 18 October is still 17 October in Mendoza.
    expect(localDateOf(Date.UTC(2026, 9, 18, 1, 30), 'America/Argentina/Mendoza')).toBe(
      '2026-10-17',
    );
  });

  it('knows a real calendar date', () => {
    expect(isCalendarDate('2028-02-29')).toBe(true);
    expect(isCalendarDate('2026-02-29')).toBe(false);
    expect(isCalendarDate('2026-10-17T00:00')).toBe(false);
  });
});
