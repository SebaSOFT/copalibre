import { defineMessages } from 'react-intl';

/**
 * Every public-web interface string, keyed by a stable ID (0055). English is
 * the catalog's default/source language — `defaultMessage` here is also what
 * `react-intl` falls back to for any locale missing a translation.
 *
 * Unlike the control panel's catalog, nothing here is consumed by
 * `useIntl()`/`<FormattedMessage>` — these pages are server-rendered static
 * HTML, not a `client:only` React app. `.astro` frontmatter formats these
 * descriptors at build time via `publicIntl()` (see `public-intl.ts`); the
 * one hydrated island, `LiveMatchHero.tsx`, receives its already-formatted
 * string as a plain prop instead of importing this catalog itself.
 */
export const messages = defineMessages({
  // Layout chrome (layouts/PublicLayout.astro)
  layoutSkipToContent: { id: 'publicWeb.layout.skipToContent', defaultMessage: 'Skip to content' },
  layoutNavAriaLabel: { id: 'publicWeb.layout.navAriaLabel', defaultMessage: 'Main' },
  layoutFooter: {
    id: 'publicWeb.layout.footer',
    defaultMessage: 'Published with CopaLibre — AGPL-3.0',
  },

  // Result-state labels (lib/result-state.ts)
  resultStateLive: { id: 'publicWeb.resultState.live', defaultMessage: 'LIVE' },
  resultStateUpcoming: { id: 'publicWeb.resultState.upcoming', defaultMessage: 'UPCOMING' },
  resultStateFinal: { id: 'publicWeb.resultState.final', defaultMessage: 'FINAL' },
  resultStateDisputed: { id: 'publicWeb.resultState.disputed', defaultMessage: 'DISPUTED' },
  resultStateWinner: { id: 'publicWeb.resultState.winner', defaultMessage: 'WON' },
  resultStateLoser: { id: 'publicWeb.resultState.loser', defaultMessage: 'LOST' },
  resultStateTbd: { id: 'publicWeb.resultState.tbd', defaultMessage: 'TBD' },
  resultStateCancelled: { id: 'publicWeb.resultState.cancelled', defaultMessage: 'CANCELLED' },

  // Result-reason badges (lib/bracket.ts, MatchNode.astro) — 0076. `played` renders nothing.
  resultReasonAdministrativeLoss: {
    id: 'publicWeb.resultReason.administrativeLoss',
    defaultMessage: 'ADMIN LOSS',
  },
  resultReasonWalkover: { id: 'publicWeb.resultReason.walkover', defaultMessage: 'W/O' },
  resultReasonForfeitAbandonment: {
    id: 'publicWeb.resultReason.forfeitAbandonment',
    defaultMessage: 'FORFEIT',
  },
  resultReasonDisqualified: {
    id: 'publicWeb.resultReason.disqualified',
    defaultMessage: 'DISQUALIFIED',
  },
  resultReasonDidNotFinish: { id: 'publicWeb.resultReason.didNotFinish', defaultMessage: 'DNF' },

  // ResultLegend.astro
  legendHeading: { id: 'publicWeb.legend.heading', defaultMessage: 'Legend' },

  // RulesetBriefing.astro
  rulesetHeading: { id: 'publicWeb.ruleset.heading', defaultMessage: 'Rules' },

  // StandingsPreview.astro
  standingsHeading: { id: 'publicWeb.standings.heading', defaultMessage: 'Standings' },
  standingsEmpty: {
    id: 'publicWeb.standings.empty',
    defaultMessage: 'Standings appear once the first match is played.',
  },
  standingsTeam: { id: 'publicWeb.standings.team', defaultMessage: 'Team' },
  standingsPlayed: { id: 'publicWeb.standings.played', defaultMessage: 'MP' },
  standingsPoints: { id: 'publicWeb.standings.points', defaultMessage: 'Pts' },

  // TournamentHero.astro
  heroLiveCount: { id: 'publicWeb.hero.liveCount', defaultMessage: '{count} LIVE' },
  heroNoLiveMatches: { id: 'publicWeb.hero.noLiveMatches', defaultMessage: 'NO LIVE MATCHES' },

  // BracketView.astro
  bracketRoundAriaLabel: {
    id: 'publicWeb.bracket.roundAriaLabel',
    defaultMessage: '{branch} — round {round}',
  },
  bracketRoundHeading: { id: 'publicWeb.bracket.roundHeading', defaultMessage: 'Round {round}' },

  // BroadcastStatusPanel.astro
  broadcastStatusNote: {
    id: 'publicWeb.broadcastStatus.note',
    defaultMessage:
      'Results update automatically when connected. Otherwise, this page already has everything.',
  },

  // ScoreTicker.astro
  tickerHeading: { id: 'publicWeb.ticker.heading', defaultMessage: 'Matches' },
  tickerEmpty: { id: 'publicWeb.ticker.empty', defaultMessage: 'No matches scheduled yet.' },

  // SeriesStateBar.astro
  seriesAriaLabel: {
    id: 'publicWeb.series.ariaLabel',
    defaultMessage: 'Best of {bestOf} series: {home} to {away}',
  },

  // LiveMatchHero.tsx (formatted at build time, passed down as a prop)
  liveUsingLastKnown: {
    id: 'publicWeb.live.usingLastKnown',
    defaultMessage: 'Showing the last known state.',
  },

  // pages/[organization]/tournaments/[tournament].astro
  tournamentPageDescription: {
    id: 'publicWeb.tournamentPage.description',
    defaultMessage: 'Results, standings and rules for {tournament}.',
  },

  // pages/[organization]/tournaments/[tournament]/live.astro
  livePageTitle: { id: 'publicWeb.livePage.title', defaultMessage: 'Live' },
  livePageSeriesHeading: { id: 'publicWeb.livePage.seriesHeading', defaultMessage: 'Series' },
  livePageUpcomingHeading: { id: 'publicWeb.livePage.upcomingHeading', defaultMessage: 'Upcoming' },
  livePageLeadersHeading: { id: 'publicWeb.livePage.leadersHeading', defaultMessage: 'Leaders' },

  // pages/[organization]/tournaments/[tournament]/stages/[stage].astro
  bracketPageTitle: { id: 'publicWeb.bracketPage.title', defaultMessage: 'Bracket' },
});
