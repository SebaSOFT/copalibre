import { createIntl, createIntlCache, type IntlShape } from 'react-intl';
import type { SupportedLanguage } from '@copalibre/domain';
import { messages as esMessages } from './public-messages.es.js';
import { messages as frMessages } from './public-messages.fr.js';
import { messages as ptMessages } from './public-messages.pt.js';
import { messages as itMessages } from './public-messages.it.js';
import { messages as deMessages } from './public-messages.de.js';
import { messages as ruMessages } from './public-messages.ru.js';
import { messages as zhMessages } from './public-messages.zh.js';
import { messages } from './public-messages.en.js';
import type { ResultReason } from '@copalibre/domain';
import type { ResultState, ResultStateLabels } from '../result-state.js';

/** Labels for every non-`played` `ResultReason` — `played` never renders one. */
export type ResultReasonLabels = Readonly<Record<Exclude<ResultReason, 'played'>, string>>;

/**
 * Build-time-only formatter for public-web's `.astro` frontmatter.
 *
 * Astro frontmatter runs in Node at build time and is stripped from the
 * client bundle for anything that isn't an explicit `client:*` island, so
 * `createIntl`/`createIntlCache` are safe to call here directly — unlike
 * the control panel, where the same API running inside a `client:only`
 * bundle pulled a Node-only dependency into the browser (see
 * `apps/web/src/control/lib/api-client.ts`'s comment on that regression).
 * Nothing in this module is imported by `LiveMatchHero.tsx`, the one real
 * client boundary on these pages — it receives its one string pre-formatted
 * as a plain prop instead.
 */

const CATALOGS: Partial<Record<SupportedLanguage, Record<string, string>>> = {
  es: esMessages,
  fr: frMessages,
  pt: ptMessages,
  it: itMessages,
  de: deMessages,
  ru: ruMessages,
  zh: zhMessages,
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

/** Resolves every non-`played` result-reason label once. */
export function resultReasonLabels(intl: IntlShape): ResultReasonLabels {
  return {
    'administrative-loss': intl.formatMessage(messages.resultReasonAdministrativeLoss),
    walkover: intl.formatMessage(messages.resultReasonWalkover),
    'forfeit-abandonment': intl.formatMessage(messages.resultReasonForfeitAbandonment),
    disqualified: intl.formatMessage(messages.resultReasonDisqualified),
    'did-not-finish': intl.formatMessage(messages.resultReasonDidNotFinish),
  };
}
