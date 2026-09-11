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
import { seriesScore, seriesSegments, type SegmentState, type SeriesInput } from '../series.js';
import { displayName, type OverviewModel } from '../overview.js';

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

/** The ticker's own vocabulary; the state badges reuse `resultStateLabels`. */
export function tickerLabels(intl: IntlShape) {
  const state = resultStateLabels(intl);
  return {
    live: state.live,
    upcoming: state.upcoming,
    final: state.final,
    leader: intl.formatMessage(messages.tickerLeader),
    versus: intl.formatMessage(messages.tickerVersus),
  };
}

/**
 * The ticker's own chrome: its controls and the conditions it has to state.
 *
 * Separate from `tickerLabels`, which names what an *entry* says. These are what
 * the rail says about itself — that it is paused, that its data is old, that
 * there is nothing to report — and a rail that cannot say those is a rail that
 * presents a stale score as a current one.
 */
export function tickerChromeLabels(intl: IntlShape) {
  return {
    pause: intl.formatMessage(messages.tickerPause),
    resume: intl.formatMessage(messages.tickerResume),
    stale: intl.formatMessage(messages.tickerStale),
    empty: intl.formatMessage(messages.tickerEmpty),
  };
}

/**
 * Every phrase `tv-statistics` puts on screen.
 *
 * Resolved here because this is the layer that knows the language; the
 * derivations themselves stay pure, and testable without an `IntlShape`.
 */
export function tvStatisticsLabels(intl: IntlShape) {
  return {
    homeSide: intl.formatMessage(messages.tvStatsHomeSide),
    awaySide: intl.formatMessage(messages.tvStatsAwaySide),
    points: intl.formatMessage(messages.tvStatsPoints),
    pointsShort: intl.formatMessage(messages.tvStatsPointsShort),
    /*
      Resolved to the reader's language but left as templates: the values are
      not known here, and these cross into a `client:load` island whose props
      Astro serializes as JSON — so a function to fill them later could not
      survive the trip. Formatting each placeholder to itself returns the
      translated string with its placeholders intact, for `fill` to complete.
    */
    unnamedActor: intl.formatMessage(messages.tvStatsUnnamedActor, {
      reference: '{reference}',
    }),
    scheduledMatches: intl.formatMessage(messages.tvStatsScheduledMatches),
    status: intl.formatMessage(messages.tvStatsStatus),
    inProgress: intl.formatMessage(messages.tvStatsInProgress),
    matchesPlayed: intl.formatMessage(messages.tvStatsMatchesPlayed),
    totalScored: intl.formatMessage(messages.tvStatsTotalScored),
    averagePerMatch: intl.formatMessage(messages.tvStatsAveragePerMatch),
    highestResult: intl.formatMessage(messages.tvStatsHighestResult),
    championTitle: intl.formatMessage(messages.tvStatsChampionTitle),
    tableLeaderTitle: intl.formatMessage(messages.tvStatsTableLeaderTitle),
    standingsRecord: intl.formatMessage(messages.tvStatsStandingsRecord, {
      points: '{points}',
      played: '{played}',
    }),
    grandFinalRecord: intl.formatMessage(messages.tvStatsGrandFinalRecord, {
      winner: '{winner}',
      loser: '{loser}',
    }),
  };
}

/** `TvDashboard.tsx`'s own chrome — separate from `tvStatisticsLabels`'s derived-stat labels. */
export function tvDashboardLabels(intl: IntlShape) {
  return {
    noMatchesScheduled: intl.formatMessage(messages.tvDashboardNoMatchesScheduled),
    standingsUnavailable: intl.formatMessage(messages.tvDashboardStandingsUnavailable),
    clubColumn: intl.formatMessage(messages.tvDashboardClubColumn),
    playedColumn: intl.formatMessage(messages.tvDashboardPlayedColumn),
    noTopPerformers: intl.formatMessage(messages.tvDashboardNoTopPerformers),
    focalPanelLabel: intl.formatMessage(messages.tvDashboardFocalPanelLabel),
    statsAndTablesLabel: intl.formatMessage(messages.tvDashboardStatsAndTablesLabel),
    sidebarSectionsLabel: intl.formatMessage(messages.tvDashboardSidebarSectionsLabel),
    standingsTab: intl.formatMessage(messages.tvDashboardStandingsTab),
    performersTab: intl.formatMessage(messages.tvDashboardPerformersTab),
    statisticsTab: intl.formatMessage(messages.tvDashboardStatisticsTab),
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

export interface SeriesStateBarSegment {
  readonly state: SegmentState;
  readonly mark: string;
  readonly label: string;
}

export interface SeriesStateBarProps {
  readonly homeScore: number;
  readonly awayScore: number;
  readonly segmentsAriaLabel: string;
  readonly segments: readonly SeriesStateBarSegment[];
  readonly winner?: 'home' | 'away';
  readonly outcomeText: string;
  readonly aggregateText?: string;
}

/*
  Every state carries a word and a mark, never a color. "This match may never happen" is not
  something a spectator can guess from a shade, and the mark keeps it legible where the words
  will not fit — the two together mean a monochrome screen loses nothing.
*/
const SERIES_SEGMENT_MARKS: Record<SegmentState, string> = {
  'won-home': '▲',
  'won-away': '▼',
  current: '●',
  upcoming: '·',
  'not-required': '×',
};

/**
 * `SeriesStateBar.astro`'s own chrome, resolved once here — a server-rendered
 * molecule, unlike `matchCardLabels`, so every value is the actual resolved
 * text rather than a `{placeholder}` template: no `client:load` boundary
 * strips the formatting machinery out from under it.
 */
export function seriesStateBarLabels(
  intl: IntlShape,
  series: SeriesInput,
  options: {
    /** The two sides, so the bar can name who advanced rather than say "home". */
    readonly homeName?: string;
    readonly awayName?: string;
    readonly winner?: 'home' | 'away';
    /** Present on an `aggregate` tie: the summed score, home first. */
    readonly aggregateScores?: readonly number[];
  },
): SeriesStateBarProps {
  const score = seriesScore(series);
  const labelByState: Record<SegmentState, (typeof messages)['seriesGameWonHome']> = {
    'won-home': messages.seriesGameWonHome,
    'won-away': messages.seriesGameWonAway,
    current: messages.seriesGameCurrent,
    upcoming: messages.seriesGameUpcoming,
    'not-required': messages.seriesGameNotRequired,
  };
  const segments = seriesSegments(series).map((state, index) => ({
    state,
    mark: SERIES_SEGMENT_MARKS[state],
    label: intl.formatMessage(labelByState[state], { number: index + 1 }),
  }));
  const winnerName =
    options.winner === 'home'
      ? options.homeName
      : options.winner === 'away'
        ? options.awayName
        : undefined;
  const outcomeText =
    options.winner === undefined
      ? intl.formatMessage(messages.seriesPending, { home: score.home, away: score.away })
      : intl.formatMessage(messages.seriesDecided, {
          winner: winnerName ?? (options.winner === 'home' ? '1' : '2'),
        });
  const aggregateText =
    options.aggregateScores === undefined
      ? undefined
      : intl.formatMessage(messages.seriesAggregate, {
          home: options.aggregateScores[0] ?? 0,
          away: options.aggregateScores[1] ?? 0,
        });

  return {
    homeScore: score.home,
    awayScore: score.away,
    segmentsAriaLabel: intl.formatMessage(messages.seriesAriaLabel, {
      bestOf: series.bestOf,
      home: score.home,
      away: score.away,
    }),
    segments,
    winner: options.winner,
    outcomeText,
    aggregateText,
  };
}

export interface TournamentHeroLabels {
  readonly emblemAlt: string;
  readonly emblemPlaceholderAlt: string;
  readonly liveCountText: string;
}

/** `TournamentHero.astro`'s own chrome, resolved once from the same `model` the component already receives. */
export function tournamentHeroLabels(intl: IntlShape, model: OverviewModel): TournamentHeroLabels {
  return {
    emblemAlt: intl.formatMessage(messages.heroTournamentEmblemAlt, {
      name: displayName(model),
    }),
    emblemPlaceholderAlt: intl.formatMessage(messages.heroTournamentEmblemPlaceholderAlt),
    liveCountText:
      model.liveCount > 0
        ? intl.formatMessage(messages.heroLiveCount, { count: model.liveCount })
        : intl.formatMessage(messages.heroNoLiveMatches),
  };
}
