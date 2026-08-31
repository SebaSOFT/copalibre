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

/**
 * Every string `MatchCard.tsx` needs, pre-formatted once — it is mounted as a
 * hydrated island on the public side (same `LiveMatchHero` constraint: no
 * `react-intl` formatting machinery in the client bundle) and natively,
 * without that constraint, on control-web, so both callers build this the
 * same way and the component itself stays free of any i18n import.
 */
export interface MatchCardLabels {
  readonly state: ResultStateLabels;
  readonly filters: {
    readonly all: string;
    readonly live: string;
    readonly upcoming: string;
    readonly final: string;
  };
  readonly empty: string;
  /**
   * Raw `{placeholder}` templates, not formatter functions — see
   * `applyTemplate` in `../matches-view.ts` for why: a `client:load` island's
   * props are JSON-serialized, and a function does not survive that.
   */
  readonly clockAriaLabel: string;
  readonly venueAriaLabel: string;
  readonly latestEventAriaLabel: string;
  readonly zoneGroupAriaLabel: string;
  readonly positionInGroup: string;
  readonly position: string;
  readonly decidedBy: string;
  readonly decidedByAriaLabel: string;
  readonly fullTraceHeading: string;
  readonly seriesAriaLabel: string;
  readonly seriesPending: string;
  readonly seriesDecided: string;
  readonly seriesAggregate: string;
}

export function matchCardLabels(intl: IntlShape): MatchCardLabels {
  // `{time}` etc. echoed back as the value for its own placeholder yields the
  // raw, still-unresolved template in the active locale — the normal
  // `formatMessage` path, just without supplying the real per-match value
  // yet. `MatchCard.tsx` fills it in later via `applyTemplate`.
  return {
    state: resultStateLabels(intl),
    filters: {
      all: intl.formatMessage(messages.matchesViewFilterAll),
      live: intl.formatMessage(messages.matchesViewFilterLive),
      upcoming: intl.formatMessage(messages.matchesViewFilterUpcoming),
      final: intl.formatMessage(messages.matchesViewFilterFinal),
    },
    empty: intl.formatMessage(messages.matchesViewEmpty),
    clockAriaLabel: intl.formatMessage(messages.matchesViewClockAriaLabel, { time: '{time}' }),
    venueAriaLabel: intl.formatMessage(messages.matchesViewVenueAriaLabel, { venue: '{venue}' }),
    latestEventAriaLabel: intl.formatMessage(messages.matchesViewLatestEventAriaLabel, {
      event: '{event}',
    }),
    zoneGroupAriaLabel: intl.formatMessage(messages.matchesViewZoneGroupAriaLabel, {
      scope: '{scope}',
    }),
    positionInGroup: intl.formatMessage(messages.matchesViewPositionInGroup, {
      group: '{group}',
      position: '{position}',
    }),
    position: intl.formatMessage(messages.matchesViewPosition, { position: '{position}' }),
    decidedBy: intl.formatMessage(messages.matchesViewDecidedBy, { factor: '{factor}' }),
    decidedByAriaLabel: intl.formatMessage(messages.matchesViewDecidedByAriaLabel),
    fullTraceHeading: intl.formatMessage(messages.matchesViewFullTraceHeading),
    seriesAriaLabel: intl.formatMessage(messages.seriesAriaLabel, {
      bestOf: '{bestOf}',
      home: '{home}',
      away: '{away}',
    }),
    seriesPending: intl.formatMessage(messages.seriesPending, {
      home: '{home}',
      away: '{away}',
    }),
    seriesDecided: intl.formatMessage(messages.seriesDecided, { winner: '{winner}' }),
    seriesAggregate: intl.formatMessage(messages.seriesAggregate, {
      home: '{home}',
      away: '{away}',
    }),
  };
}
