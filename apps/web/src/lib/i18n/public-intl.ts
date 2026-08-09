import { createIntl, createIntlCache, type IntlShape } from 'react-intl';
import type { SupportedLanguage } from '@copalibre/domain';
import { messages as esMessages } from './public-messages.es.js';
import { messages } from './public-messages.en.js';
import type { ResultState, ResultStateLabels } from '../result-state.js';

/**
 * Build-time-only formatter for public-web's `.astro` frontmatter (0055).
 *
 * Astro frontmatter runs in Node at build time and is stripped from the
 * client bundle for anything that isn't an explicit `client:*` island, so
 * `createIntl`/`createIntlCache` are safe to call here directly — unlike
 * 0053's control panel, where the same API running inside a `client:only`
 * bundle pulled a Node-only dependency into the browser (see
 * `apps/web/src/control/lib/api-client.ts`'s comment on that regression).
 * Nothing in this module is imported by `LiveMatchHero.tsx`, the one real
 * client boundary on these pages — it receives its one string pre-formatted
 * as a plain prop instead.
 */

const CATALOGS: Partial<Record<SupportedLanguage, Record<string, string>>> = {
  es: esMessages,
};

const cache = createIntlCache();

export function publicIntl(locale: SupportedLanguage): IntlShape {
  return createIntl({ locale, defaultLocale: 'en', messages: CATALOGS[locale] }, cache);
}

const RESULT_STATE_MESSAGE_KEY = {
  live: messages.resultStateLive,
  upcoming: messages.resultStateUpcoming,
  final: messages.resultStateFinal,
  disputed: messages.resultStateDisputed,
  winner: messages.resultStateWinner,
  loser: messages.resultStateLoser,
  tbd: messages.resultStateTbd,
  cancelled: messages.resultStateCancelled,
} satisfies Readonly<Record<ResultState, (typeof messages)[keyof typeof messages]>>;

/** Resolves every result-state label once, for `result-state.ts`'s dictionary-taking functions. */
export function resultStateLabels(intl: IntlShape): ResultStateLabels {
  return {
    live: intl.formatMessage(RESULT_STATE_MESSAGE_KEY.live),
    upcoming: intl.formatMessage(RESULT_STATE_MESSAGE_KEY.upcoming),
    final: intl.formatMessage(RESULT_STATE_MESSAGE_KEY.final),
    disputed: intl.formatMessage(RESULT_STATE_MESSAGE_KEY.disputed),
    winner: intl.formatMessage(RESULT_STATE_MESSAGE_KEY.winner),
    loser: intl.formatMessage(RESULT_STATE_MESSAGE_KEY.loser),
    tbd: intl.formatMessage(RESULT_STATE_MESSAGE_KEY.tbd),
    cancelled: intl.formatMessage(RESULT_STATE_MESSAGE_KEY.cancelled),
  };
}
