import type { SideSourceMessages } from '../../lib/side-source.js';
import type { IntlShape } from 'react-intl';
import type { MatchCardLabels } from '../../lib/i18n/public-intl.js';
import { messages } from '../i18n/messages.en.js';

/**
 * Builds `MatchCard.tsx`'s label bundle from control-web's own message
 * catalog and `useIntl()` — the same shape `matchCardLabels()` builds for
 * the public site, from its own catalog, so the shared card component never
 * has to know which surface it's rendering on.
 */
export function matchCardLabelsFromControlIntl(intl: IntlShape): MatchCardLabels {
  return {
    matchHeading: intl.formatMessage(messages.matchesViewCardHeading, { match: '{match}' }),
    sideSource: sideSourceLabelsFromControlIntl(intl),
    state: {
      live: intl.formatMessage(messages.matchesViewResultStateLive),
      upcoming: intl.formatMessage(messages.matchesViewResultStateUpcoming),
      final: intl.formatMessage(messages.matchesViewResultStateFinal),
      disputed: intl.formatMessage(messages.matchesViewResultStateDisputed),
      winner: intl.formatMessage(messages.matchesViewResultStateWinner),
      loser: intl.formatMessage(messages.matchesViewResultStateLoser),
      tbd: intl.formatMessage(messages.matchesViewResultStateTbd),
      cancelled: intl.formatMessage(messages.matchesViewResultStateCancelled),
    },
    filters: {
      all: intl.formatMessage(messages.matchesViewFilterAll),
      live: intl.formatMessage(messages.matchesViewFilterLive),
      upcoming: intl.formatMessage(messages.matchesViewFilterUpcoming),
      final: intl.formatMessage(messages.matchesViewFilterFinal),
    },
    empty: intl.formatMessage(messages.matchesViewEmpty),
    // Raw `{placeholder}` templates, not formatter functions — `MatchCard`
    // is shared with the public site, where it mounts via `client:load` and
    // Astro JSON-serializes island props; a function does not survive that
    // trip, so both callers build this the same way even though
    // control-web itself has no such constraint. See `applyTemplate` in
    // `../../lib/matches-view.ts`.
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
    seriesAriaLabel: intl.formatMessage(messages.matchesViewSeriesAriaLabel, {
      bestOf: '{bestOf}',
      home: '{home}',
      away: '{away}',
    }),
    seriesPending: intl.formatMessage(messages.matchesViewSeriesPending, {
      home: '{home}',
      away: '{away}',
    }),
    seriesDecided: intl.formatMessage(messages.matchesViewSeriesDecided, { winner: '{winner}' }),
    seriesAggregate: intl.formatMessage(messages.matchesViewSeriesAggregate, {
      home: '{home}',
      away: '{away}',
    }),
    versus: intl.formatMessage(messages.matchesViewVersus),
  };
}

/** Plain templates shared by server-rendered and client-rendered side sources. */
export function sideSourceLabelsFromControlIntl(intl: IntlShape): SideSourceMessages {
  return {
    winner: intl.formatMessage(messages.sideSourceWinner, { match: '{match}' }),
    loser: intl.formatMessage(messages.sideSourceLoser, { match: '{match}' }),
    winnerShort: intl.formatMessage(messages.sideSourceWinnerShort, { match: '{match}' }),
    loserShort: intl.formatMessage(messages.sideSourceLoserShort, { match: '{match}' }),
    awaiting: intl.formatMessage(messages.sideSourceAwaiting, { source: '{source}' }),
    round: intl.formatMessage(messages.sideSourceRound, {
      round: '{round}',
      position: '{position}',
    }),
    roundShort: intl.formatMessage(messages.sideSourceRoundShort, {
      round: '{round}',
      position: '{position}',
    }),
    match: intl.formatMessage(messages.sideSourceMatch, { position: '{position}' }),
    matchShort: intl.formatMessage(messages.sideSourceMatchShort, { position: '{position}' }),
    final: intl.formatMessage(messages.sideSourceFinal),
    finalShort: intl.formatMessage(messages.sideSourceFinalShort),
    semiFinal: intl.formatMessage(messages.sideSourceSemiFinal, { position: '{position}' }),
    semiFinalShort: intl.formatMessage(messages.sideSourceSemiFinalShort, {
      position: '{position}',
    }),
    quarterFinal: intl.formatMessage(messages.sideSourceQuarterFinal, { position: '{position}' }),
    quarterFinalShort: intl.formatMessage(messages.sideSourceQuarterFinalShort, {
      position: '{position}',
    }),
    place: intl.formatMessage(messages.sideSourcePlace, { place: '{place}' }),
    places: intl.formatMessage(messages.sideSourcePlaces, { from: '{from}', to: '{to}' }),
    unknown: intl.formatMessage(messages.sideSourceUnknown),
    seed: intl.formatMessage(messages.sideSourceSeed, { seed: '{seed}' }),
    bye: intl.formatMessage(messages.sideSourceBye),
    qualifierGroup: intl.formatMessage(messages.sideSourceQualifierGroup, {
      rank: '{rank}',
      group: '{group}',
    }),
    qualifierGroupNumber: intl.formatMessage(messages.sideSourceQualifierGroupNumber, {
      number: '{number}',
    }),
    qualifierBest: intl.formatMessage(messages.sideSourceQualifierBest, { rank: '{rank}' }),
    qualifierNthBest: intl.formatMessage(messages.sideSourceQualifierNthBest, {
      order: '{order}',
      rank: '{rank}',
    }),
    qualifierRunnerUp: intl.formatMessage(messages.sideSourceQualifierRunnerUp),
    qualifier: intl.formatMessage(messages.sideSourceQualifier, { number: '{number}' }),
    qualifierShort: intl.formatMessage(messages.sideSourceQualifierShort, { number: '{number}' }),
    ordinal1: intl.formatMessage(messages.sideSourceOrdinal1),
    ordinal2: intl.formatMessage(messages.sideSourceOrdinal2),
    ordinal3: intl.formatMessage(messages.sideSourceOrdinal3),
    ordinalOther: intl.formatMessage(messages.sideSourceOrdinalOther, { n: '{n}' }),
  };
}
