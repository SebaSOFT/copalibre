import { localToEpoch } from './zoned-time.js';

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
