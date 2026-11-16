import type { IntlShape } from 'react-intl';
import {
  isLocalizedLabel,
  isSupportedLanguage,
  resolveLabel,
  type SupportedLanguage,
} from '@copalibre/domain';
import { messages } from '../i18n/messages.en.js';

/**
 * The localized name of each tiebreaker a discipline can list by code. A code a later release adds
 * reads as its own words (`humanizeCode`), never as the key itself.
 */
export const TIEBREAKER_LABELS: Readonly<Record<string, typeof messages.tiebreakerPoints>> = {
  points: messages.tiebreakerPoints,
  'score-difference': messages.tiebreakerScoreDifference,
  'goal-average': messages.tiebreakerGoalAverage,
  'goals-for': messages.tiebreakerGoalsFor,
  'goals-against': messages.tiebreakerGoalsAgainst,
  'matches-won': messages.tiebreakerMatchesWon,
  'sets-won': messages.tiebreakerSetsWon,
  'games-won': messages.tiebreakerGamesWon,
  'head-to-head': messages.tiebreakerHeadToHead,
};

/** `sets-won` -> `Sets won`: a machine code as sentence-case words, for a code with no catalogue name. */
export function humanizeCode(code: string): string {
  const words = code
    .replace(/[-_.]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function languageOf(intl: IntlShape): SupportedLanguage {
  const short = intl.locale.split('-')[0] ?? 'en';
  return isSupportedLanguage(short) ? short : 'en';
}

/** The name of one tiebreaker code in the operator's language. */
export function formatTiebreakerCode(intl: IntlShape, code: string): string {
  const descriptor = TIEBREAKER_LABELS[code];
  return descriptor ? intl.formatMessage(descriptor) : humanizeCode(code);
}

/**
 * One entry of a `tiebreakers` list: a code, or a comparator the discipline declares itself. A
 * declared comparator carries its own localized `label`; one that only names a `statisticCode` reads
 * as that statistic. Anything else keeps the caller's generic rendering (`undefined`).
 */
export function formatTiebreakerEntry(intl: IntlShape, entry: unknown): string | undefined {
  if (typeof entry === 'string') return formatTiebreakerCode(intl, entry);
  if (typeof entry !== 'object' || entry === null) return undefined;
  const record = entry as Record<string, unknown>;
  if (typeof record.label === 'string') return record.label;
  if (isLocalizedLabel(record.label)) return resolveLabel(record.label, languageOf(intl));
  if (typeof record.statisticCode === 'string') {
    return formatTiebreakerCode(intl, record.statisticCode);
  }
  return undefined;
}
