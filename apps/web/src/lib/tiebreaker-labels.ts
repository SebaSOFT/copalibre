import type { IntlShape, MessageDescriptor } from 'react-intl';
import {
  isLocalizedLabel,
  resolveLabel,
  type LocalizedLabel,
  type SupportedLanguage,
} from '@copalibre/domain';
import { messages as publicMessages } from './i18n/public-messages.en.js';

/** The canonical tiebreaker comparator codes shared across Control and public catalogues. */
export const TIEBREAKER_CODES = [
  'points',
  'score-difference',
  'goal-average',
  'goals-for',
  'goals-against',
  'matches-won',
  'sets-won',
  'games-won',
  'head-to-head',
] as const;

export type TiebreakerCode = (typeof TIEBREAKER_CODES)[number];

/** Public-catalogue message descriptors keyed by tiebreaker code. */
export const PUBLIC_TIEBREAKER_LABELS: Readonly<Record<string, MessageDescriptor>> = {
  points: publicMessages.rulesetTiebreakerPoints,
  'score-difference': publicMessages.rulesetTiebreakerScoreDifference,
  'goal-average': publicMessages.rulesetTiebreakerGoalAverage,
  'goals-for': publicMessages.rulesetTiebreakerGoalsFor,
  'goals-against': publicMessages.rulesetTiebreakerGoalsAgainst,
  'matches-won': publicMessages.rulesetTiebreakerMatchesWon,
  'sets-won': publicMessages.rulesetTiebreakerSetsWon,
  'games-won': publicMessages.rulesetTiebreakerGamesWon,
  'head-to-head': publicMessages.rulesetTiebreakerHeadToHead,
};

/** `sets-won` -> `Sets won`: a machine code as sentence-case words, for a code with no catalogue name. */
export function humanizeCode(code: string): string {
  const words = code
    .replace(/[-_.]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Formats one tiebreaker code using a caller-supplied message descriptor map. */
export function formatTiebreakerCodeFromCatalog(
  intl: IntlShape,
  catalog: Readonly<Record<string, MessageDescriptor>>,
  code: string,
): string {
  const descriptor = catalog[code];
  return descriptor ? intl.formatMessage(descriptor) : humanizeCode(code);
}

/** The name of one tiebreaker code in the spectator's language. */
export function formatPublicTiebreakerCode(intl: IntlShape, code: string): string {
  return formatTiebreakerCodeFromCatalog(intl, PUBLIC_TIEBREAKER_LABELS, code);
}

/**
 * Resolves a message descriptor map into a plain JSON-serializable `code -> label` record so Astro
 * islands (such as `MatchCard`) receive pre-formatted strings across the serialization boundary.
 */
export function tiebreakerLabelsForCatalog(
  intl: IntlShape,
  catalog: Readonly<Record<string, MessageDescriptor>>,
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(catalog).map(([code, descriptor]) => [code, intl.formatMessage(descriptor)]),
  );
}

/**
 * Resolves a tiebreaker code for display: discipline-declared label first (if provided), else the
 * pre-formatted catalogue lookup for the code, else sentence-case words via `humanizeCode`.
 */
export function resolveTiebreakerLabel(
  code: string,
  labels?: Readonly<Record<string, string>>,
  declaredLabel?: string | LocalizedLabel,
  language: SupportedLanguage = 'en',
): string {
  if (declaredLabel !== undefined) {
    if (typeof declaredLabel === 'string') return declaredLabel;
    if (isLocalizedLabel(declaredLabel)) return resolveLabel(declaredLabel, language);
  }
  return labels?.[code] ?? humanizeCode(code);
}
