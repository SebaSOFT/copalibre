import { describe, expect, it } from '@jest/globals';
import { formatTimestamp } from './format-timestamp.js';

const ZONE = 'America/Argentina/San_Juan'; // UTC-3, no daylight saving

describe('formatTimestamp', () => {
  const reference = new Date('2026-09-04T12:00:00.000Z');

  it('reads the instant in the given zone, not the runtime’s', () => {
    expect(
      formatTimestamp('2026-09-04T22:30:00.000Z', {
        locale: 'en',
        format: 'time-only',
        timeZone: ZONE,
      }),
    ).toBe('19:30');
    expect(
      formatTimestamp('2026-09-04T22:30:00.000Z', {
        locale: 'en',
        format: 'time-only',
        timeZone: 'UTC',
      }),
    ).toBe('22:30');
  });

  it('decides "today" in the zone: 01:00 UTC is still the previous evening in San Juan', () => {
    const lateEvening = '2026-09-05T01:00:00.000Z'; // 22:00 on the 4th in San Juan
    expect(
      formatTimestamp(lateEvening, { locale: 'en', referenceDate: reference, timeZone: ZONE }),
    ).toBe('22:00');
    expect(
      formatTimestamp(lateEvening, { locale: 'en', referenceDate: reference, timeZone: 'UTC' }),
    ).toBe('5-Sep 01:00');
  });

  it('puts the day first for another day', () => {
    expect(
      formatTimestamp('2025-11-02T22:00:00.000Z', {
        locale: 'en',
        referenceDate: reference,
        timeZone: ZONE,
      }),
    ).toBe('2-Nov 19:00');
  });

  it('formats the date alone and the full form', () => {
    expect(
      formatTimestamp('2025-11-02T22:00:00.000Z', {
        locale: 'en',
        format: 'date-only',
        timeZone: ZONE,
      }),
    ).toBe('2-Nov');
    expect(
      formatTimestamp('2025-11-02T22:00:00.000Z', { locale: 'en', format: 'full', timeZone: ZONE }),
    ).toContain('November 2, 2025');
  });

  it('describes a relative instant', () => {
    expect(
      formatTimestamp('2026-09-04T11:55:00.000Z', {
        locale: 'en',
        format: 'relative',
        referenceDate: reference,
      }),
    ).toBe('5 minutes ago');
    expect(
      formatTimestamp('2026-09-04T11:59:50.000Z', {
        locale: 'es',
        format: 'relative',
        referenceDate: reference,
      }),
    ).toBe('hace un momento');
  });

  it('returns a malformed value as it came', () => {
    expect(formatTimestamp('not a date', { locale: 'en' })).toBe('not a date');
  });
});
