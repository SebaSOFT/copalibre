import type { IntlShape } from 'react-intl';
import { formatMatchRef as formatSideMatchRef } from '../../lib/side-source.js';
import { messages } from '../i18n/messages.en.js';
import { formatActivityAction, formatActivityActor } from './activity-formatting.js';
import { sideSourceLabelsFromControlIntl } from './matches-view-labels.js';
import { STAGE_FORMAT_LABELS } from './stage-format-labels.js';

export interface EntrantPresentation {
  readonly fullName: string;
  readonly abbreviation?: string;
}

/** Resolve an entrant from display data and never fall back to an internal identifier. */
export function formatEntrant(
  intl: IntlShape,
  entrant: { readonly displayName?: string; readonly abbreviation?: string },
): EntrantPresentation {
  const displayName = entrant.displayName?.trim();
  const abbreviation = entrant.abbreviation?.trim();
  return {
    fullName:
      displayName === undefined || displayName === ''
        ? intl.formatMessage(messages.matchConsoleUnnamedEntrant)
        : displayName,
    ...(abbreviation === undefined || abbreviation === '' ? {} : { abbreviation }),
  };
}

export type ControlEnumKind = 'format' | 'activityAction' | 'actorKind';

/** Resolve a technical actor value to its translated role or known human label. */
export function formatActor(intl: IntlShape, actor: string): string {
  return formatActivityActor(actor, intl.locale);
}

/** Resolve a known control enum to a translated label; unknown values never expose their key. */
export function formatEnum(intl: IntlShape, kind: ControlEnumKind, value: string): string {
  if (kind === 'activityAction') return formatActivityAction(value, intl.locale);
  if (kind === 'actorKind') return formatActor(intl, value);
  const bestOf = /^BO([1-9]\d*)$/.exec(value);
  if (bestOf !== null) {
    return intl.formatMessage(messages.matchFormatBestOf, { games: Number(bestOf[1]) });
  }
  const descriptor = STAGE_FORMAT_LABELS[value];
  return descriptor
    ? intl.formatMessage(descriptor)
    : intl.formatMessage(messages.analyticsStatusUnknown);
}

/** Human-readable name for a generated bracket reference or placement match. */
export function formatMatchRef(intl: IntlShape, key: string, finalRound?: number): string {
  return formatSideMatchRef(key, sideSourceLabelsFromControlIntl(intl), { finalRound });
}

/** Locale and organization-zone aware date/time for operator-facing schedules. */
export function formatDateTime(
  intl: IntlShape,
  value: string | number | Date,
  timeZone?: string,
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return intl.formatMessage(messages.metricUnavailable);
  try {
    return new Intl.DateTimeFormat(intl.locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
      ...(timeZone === undefined ? {} : { timeZone }),
    }).format(date);
  } catch {
    return intl.formatMessage(messages.metricUnavailable);
  }
}

const DATE_INPUT_FORMAT_EXAMPLE = new Date('2026-10-21T19:00:00.000Z');

function formatDateInputExample(intl: IntlShape, includeTime: boolean): string {
  return new Intl.DateTimeFormat(intl.locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(includeTime ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' as const } : {}),
    timeZone: 'UTC',
  }).format(DATE_INPUT_FORMAT_EXAMPLE);
}

/** Give operators a locale-specific example when the browser's native picker ignores `lang`. */
export function formatDateInputHint(intl: IntlShape): string {
  return intl.formatMessage(messages.dateInputFormatHint, {
    example: formatDateInputExample(intl, false),
  });
}

/** Give operators a locale-specific example when the browser's native picker ignores `lang`. */
export function formatDateTimeInputHint(intl: IntlShape): string {
  return intl.formatMessage(messages.dateTimeInputFormatHint, {
    example: formatDateInputExample(intl, true),
  });
}
