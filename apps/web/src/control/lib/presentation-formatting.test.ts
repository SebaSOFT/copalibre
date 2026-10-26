import { createIntl, createIntlCache } from 'react-intl';
import { CATALOGS } from '../i18n/ControlIntl.js';
import { messages } from '../i18n/messages.en.js';
import { ACTIVITY_ACTION_CODES, formatActivityAction } from './activity-formatting.js';
import {
  formatDateTime,
  formatDateInputHint,
  formatDateTimeInputHint,
  formatEntrant,
  formatEnum,
  formatMatchRef,
} from './presentation-formatting.js';
import { STAGE_FORMAT_LABELS } from './stage-format-labels.js';

const LANGUAGES = ['en', 'es', 'pt', 'fr', 'it', 'de', 'ru', 'zh'] as const;

function controlIntl(locale: (typeof LANGUAGES)[number]) {
  const translations = CATALOGS[locale];
  return createIntl(
    {
      locale,
      defaultLocale: 'en',
      ...(translations === undefined ? {} : { messages: translations }),
    },
    createIntlCache(),
  );
}

describe('control presentation formatting', () => {
  it.each(LANGUAGES)('%s translates every known enum and hides unknown values', (locale) => {
    const intl = controlIntl(locale);
    const unknown = intl.formatMessage(messages.analyticsStatusUnknown);

    for (const value of Object.keys(STAGE_FORMAT_LABELS)) {
      const label = formatEnum(intl, 'format', value);
      expect(label).toBeTruthy();
      expect(label).not.toBe(value);
      expect(label).not.toBe(unknown);
    }

    const unknownAction = formatActivityAction('future.machine-action', locale);
    for (const value of ACTIVITY_ACTION_CODES) {
      const label = formatEnum(intl, 'activityAction', value);
      expect(label).toBeTruthy();
      expect(label).not.toBe(value);
      expect(label).not.toBe(unknownAction);
    }

    const unknownFormat = formatEnum(intl, 'format', 'future-machine-format');
    expect(unknownFormat).toBe(unknown);
    const bestOfFormat = formatEnum(intl, 'format', 'BO5');
    expect(bestOfFormat).not.toBe('BO5');
    expect(bestOfFormat).not.toBe(unknown);
    expect(formatEnum(intl, 'activityAction', 'future.machine-action')).toBe(unknownAction);
    expect(formatEnum(intl, 'actorKind', 'system:demo-dataset')).not.toBe('system:demo-dataset');
    expect(formatEntrant(intl, {}).fullName).toBe(
      intl.formatMessage(messages.matchConsoleUnnamedEntrant),
    );
    expect(formatMatchRef(intl, 'SE-R3-M1', 4)).not.toBe('SE-R3-M1');
  });

  it('formats schedule instants in the organization time zone', () => {
    const intl = controlIntl('en');
    const value = '2026-10-21T22:00:00.000Z';

    const buenosAires = formatDateTime(intl, value, 'America/Argentina/Buenos_Aires');
    const utc = formatDateTime(intl, value, 'UTC');

    expect(buenosAires).toContain('7:00 PM');
    expect(utc).toContain('10:00 PM');
    expect(buenosAires).not.toBe(utc);
    expect(formatDateTime(intl, 'not-a-date', 'UTC')).toBe(
      intl.formatMessage(messages.metricUnavailable),
    );
  });

  it.each(LANGUAGES)('%s gives date inputs a localized format example', (locale) => {
    const intl = controlIntl(locale);
    const expectedDateTime = new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone: 'UTC',
    }).format(new Date('2026-10-21T19:00:00.000Z'));
    const dateHint = formatDateInputHint(intl);
    const dateTimeHint = formatDateTimeInputHint(intl);

    expect(dateHint).toContain('2026');
    expect(dateTimeHint).toContain(expectedDateTime);
    expect(dateHint).not.toContain('mm/dd/yyyy');
    expect(dateTimeHint).not.toContain('mm/dd/yyyy');
  });
});
