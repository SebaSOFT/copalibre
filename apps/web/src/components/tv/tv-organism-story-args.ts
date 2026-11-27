import { publicIntl, tvDashboardLabels, tvStatisticsLabels } from '../../lib/i18n/public-intl.js';
import { competitionContext } from '../../lib/competition-context.js';
import type { LiveMatch } from '../../lib/live-state.js';
import { presentState } from '../../lib/result-state.js';
import { tvMatchProgress } from '../../lib/tv-match-progress.js';
import { DASHBOARD, STANDINGS } from './tv-dashboard-story-fixtures.js';

const dashboardLabels = tvDashboardLabels(publicIntl('es'));
const labels = tvStatisticsLabels(publicIntl('es'));
const spotlightMatch: LiveMatch | undefined = DASHBOARD.matches[0];

/** The shared inputs the TV organisms' stories pass: one live match, Spanish labels, one zone. */
export const tvOrganismStoryArgs = {
  dashboardLabels,
  labels,
  language: 'es',
  timeZone: 'America/Argentina/Mendoza',
  effectiveNow: Date.parse('2026-11-18T20:00:00Z'),
  clubs: undefined,
  spotlightMatch,
  spotlightClock: undefined,
  clockLabels: {
    clockStopped: dashboardLabels.clockStopped,
    clockAriaLabel: dashboardLabels.clockAriaLabel,
  },
  progress: tvMatchProgress(spotlightMatch, undefined, 'es'),
  matchContextOf: () =>
    competitionContext(
      { stageNumber: 1, matchNumber: 7, zoneName: 'Zona A' },
      dashboardLabels.contextLabels,
    ),
  isMatchDelayed: () => false,
  matchBadgeFor: (match: LiveMatch) => presentState(match.state, dashboardLabels.resultState),
  venueOf: () => 'Cancha 1',
  eventsForMatch: () => [],
  eventIdsForMatch: () => [],
  standings: STANDINGS,
  standingsStageName: 'Grupos',
  scopeStandingsHeadings: false,
  upcomingMatches: [],
  venueNameByMatchId: undefined,
  visibleBracket: undefined,
  bracketFocus: undefined,
  matches: DASHBOARD.matches,
} as const;
