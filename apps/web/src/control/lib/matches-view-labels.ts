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
  };
}
