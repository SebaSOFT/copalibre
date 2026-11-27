import { describe, expect, it } from '@jest/globals';
import {
  calendarDayDiff,
  calendarDayKey,
  formatTimeZoneParts,
  formatTimestamp,
  relativeDayWord,
} from './format-timestamp.js';

const ZONE = 'America/Argentina/San_Juan'; // UTC-3, no daylight saving
const BUENOS_AIRES = 'America/Argentina/Buenos_Aires';
const BERLIN = 'Europe/Berlin';

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

  it('formats yesterday, today and tomorrow in es and en, and leaves caseless scripts unchanged', () => {
    const yesterday = '2026-09-03T20:00:00.000-03:00';
    const today = '2026-09-04T13:00:00.000-03:00';
    const tomorrow = '2026-09-05T08:30:00.000-03:00';

    expect(
      formatTimestamp(yesterday, { locale: 'es', referenceDate: reference, timeZone: ZONE }),
    ).toBe('Ayer 20:00');
    expect(formatTimestamp(today, { locale: 'es', referenceDate: reference, timeZone: ZONE })).toBe(
      'Hoy 13:00',
    );
    expect(
      formatTimestamp(tomorrow, { locale: 'es', referenceDate: reference, timeZone: ZONE }),
    ).toBe('Mañana 08:30');

    expect(
      formatTimestamp(yesterday, { locale: 'en', referenceDate: reference, timeZone: ZONE }),
    ).toBe('Yesterday 20:00');
    expect(formatTimestamp(today, { locale: 'en', referenceDate: reference, timeZone: ZONE })).toBe(
      'Today 13:00',
    );
    expect(
      formatTimestamp(tomorrow, { locale: 'en', referenceDate: reference, timeZone: ZONE }),
    ).toBe('Tomorrow 08:30');

    expect(formatTimestamp(today, { locale: 'zh', referenceDate: reference, timeZone: ZONE })).toBe(
      '今天 13:00',
    );
    expect(
      formatTimestamp(tomorrow, { locale: 'zh', referenceDate: reference, timeZone: ZONE }),
    ).toBe('明天 08:30');
  });

  it('decides the relative day in the organization zone: 01:30 UTC is still the previous evening in Buenos Aires', () => {
    const baRef = new Date('2026-11-18T15:00:00.000Z'); // 12:00 on Nov 18 in Buenos Aires
    const lateEveningUtc = '2026-11-19T01:30:00.000Z'; // 22:30 on Nov 18 in Buenos Aires

    expect(
      formatTimestamp(lateEveningUtc, {
        locale: 'es',
        referenceDate: baRef,
        timeZone: BUENOS_AIRES,
      }),
    ).toBe('Hoy 22:30');
    expect(
      formatTimestamp(lateEveningUtc, {
        locale: 'es',
        referenceDate: baRef,
        timeZone: 'UTC',
      }),
    ).toBe('Mañana 01:30');
  });

  it('handles DST transitions accurately when computing calendar day differences', () => {
    // Europe/Berlin springs forward on 2026-03-29 (02:00 CET -> 03:00 CEST, a 23-hour day).
    const beforeDst = new Date('2026-03-29T00:30:00.000Z'); // 01:30 CET on Mar 29
    const afterDst = new Date('2026-03-29T23:30:00.000Z'); // 01:30 CEST on Mar 30 (23h later)

    expect(calendarDayKey(beforeDst, BERLIN)).toBe('2026-03-29');
    expect(calendarDayKey(afterDst, BERLIN)).toBe('2026-03-30');
    expect(calendarDayDiff(afterDst, beforeDst, BERLIN)).toBe(1);
    expect(
      formatTimestamp(afterDst, { locale: 'en', referenceDate: beforeDst, timeZone: BERLIN }),
    ).toBe('Tomorrow 01:30');
  });

  it('puts the day first as d-MMM HH:mm for instants two or more days away', () => {
    expect(
      formatTimestamp('2026-09-06T22:00:00.000Z', {
        locale: 'en',
        referenceDate: reference,
        timeZone: ZONE,
      }),
    ).toBe('6-Sep 19:00');
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

describe('relativeDayWord', () => {
  const reference = new Date('2026-09-04T12:00:00.000Z');

  it('returns capitalized relative words within ±1 day and undefined beyond', () => {
    expect(relativeDayWord('2026-09-03T12:00:00.000Z', reference, 'es', ZONE)).toBe('Ayer');
    expect(relativeDayWord('2026-09-04T12:00:00.000Z', reference, 'es', ZONE)).toBe('Hoy');
    expect(relativeDayWord('2026-09-05T12:00:00.000Z', reference, 'es', ZONE)).toBe('Mañana');
    expect(relativeDayWord('2026-09-06T12:00:00.000Z', reference, 'es', ZONE)).toBeUndefined();
    expect(relativeDayWord('2026-09-02T12:00:00.000Z', reference, 'es', ZONE)).toBeUndefined();
    expect(relativeDayWord('invalid', reference, 'es', ZONE)).toBeUndefined();
  });
});

describe('formatTimeZoneParts', () => {
  it('resolves generic zone name and offset for Buenos Aires and Berlin', () => {
    const ba = formatTimeZoneParts('es', BUENOS_AIRES, new Date('2026-11-23T12:00:00.000Z'));
    expect(ba.isUtc).toBe(false);
    expect(ba.zoneName.toLowerCase()).toContain('argentina');
    expect(ba.offset).toBe('GMT-3');

    const berlinWinter = formatTimeZoneParts('en', BERLIN, new Date('2026-01-15T12:00:00.000Z'));
    const berlinSummer = formatTimeZoneParts('en', BERLIN, new Date('2026-07-15T12:00:00.000Z'));
    expect(berlinWinter.isUtc).toBe(false);
    expect(berlinWinter.offset).toBe('GMT+1');
    expect(berlinSummer.offset).toBe('GMT+2');
  });

  it('handles UTC and Etc/UTC explicitly', () => {
    expect(formatTimeZoneParts('es', 'UTC')).toEqual({
      zoneName: 'UTC',
      offset: 'UTC',
      isUtc: true,
    });
    expect(formatTimeZoneParts('en', 'Etc/UTC')).toEqual({
      zoneName: 'UTC',
      offset: 'UTC',
      isUtc: true,
    });
  });

  it('falls back to the IANA identifier when the time zone is invalid', () => {
    const invalid = formatTimeZoneParts('en', 'Invalid/Zone');
    expect(invalid).toEqual({
      zoneName: 'Invalid/Zone',
      offset: '',
      isUtc: false,
    });
  });
});
