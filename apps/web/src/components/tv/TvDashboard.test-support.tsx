import { render } from '@testing-library/react';
import { TvDashboard } from './TvDashboard.js';
import type { LiveDashboard, LiveMatch } from '../../lib/live-state.js';
import type { StandingsRowView } from '../../lib/overview.js';
import { publicIntl, tvDashboardLabels, tvStatisticsLabels } from '../../lib/i18n/public-intl.js';

// Shared by the TV dashboard test files: the labels, the fixtures and the render helper that more than one area reads.

export const tvLabels = tvStatisticsLabels(publicIntl('en'));
export const dashboardLabels = tvDashboardLabels(publicIntl('en'));
export const FRENCH_RESULT_STATE_LABELS = [
  { state: 'live', label: 'En direct' },
  { state: 'upcoming', label: 'À venir' },
  { state: 'final', label: 'Final' },
  { state: 'disputed', label: 'En litige' },
  { state: 'winner', label: 'Gagné' },
  { state: 'loser', label: 'Perdu' },
  { state: 'tbd', label: 'À définir' },
  { state: 'cancelled', label: 'Annulé' },
] as const;

export const sampleInitial: LiveDashboard = {
  matches: [
    {
      matchId: 'm1',
      stageNumber: 1,
      matchNumber: 1,
      stageOrdinal: 1,
      state: 'final' as const,
      projectionVersion: 1,
      sides: [
        { entrantId: 'e1', name: 'Boca Juniors', score: 3, state: 'final' },
        { entrantId: 'e2', name: 'River Plate', score: 1, state: 'final' },
      ],
    },
    {
      matchId: 'm2',
      stageNumber: 1,
      matchNumber: 2,
      stageOrdinal: 2,
      state: 'final' as const,
      projectionVersion: 1,
      sides: [
        { entrantId: 'e3', name: 'Racing Club', score: 0, state: 'final' },
        { entrantId: 'e4', name: 'Independiente', score: 2, state: 'final' },
      ],
    },
  ],
  standingsVersion: 1,
  usingLastKnown: true,
};

export const sampleStandings: StandingsRowView[] = [
  {
    position: 1,
    name: 'Boca Juniors',
    abbreviation: 'BOC',
    clubId: 'club-boca',
    played: 2,
    points: 6,
  },
  { position: 2, name: 'Independiente', abbreviation: 'IND', played: 2, points: 6 },
  { position: 3, name: 'River Plate', abbreviation: 'RIV', played: 2, points: 0 },
  { position: 4, name: 'Racing Club', abbreviation: 'RAC', played: 2, points: 0 },
];

export const sampleClubs = [
  {
    clubId: 'club-boca',
    name: 'Boca Juniors',
    emblemUrl: '/api/organizations/o/clubs/boca/emblem',
  },
  { name: 'River Plate', emblemUrl: '/api/organizations/o/clubs/river/emblem' },
];

export const fixtureMatch = (
  matchId: string,
  state: 'live' | 'upcoming',
  homeScore?: number,
  awayScore?: number,
): LiveMatch => ({
  matchId,
  stageNumber: 1,
  matchNumber: 1,
  stageOrdinal: 1,
  state,
  projectionVersion: 1,
  ...(state === 'live' ? { clockSeconds: 420 } : {}),
  sides: [
    {
      entrantId: `${matchId}-home`,
      name: 'Club Atlético Independiente de San Juan',
      abbreviation: 'CAI',
      state,
      score: homeScore ?? 0,
    },
    {
      entrantId: `${matchId}-away`,
      name: 'Deportivo San Juan del Valle',
      abbreviation: 'DSJ',
      state,
      score: awayScore ?? 0,
    },
  ],
});

export const layoutMatches: LiveMatch[] = [
  fixtureMatch('live-1', 'live', 2, 1),
  fixtureMatch('live-2', 'live', 1, 1),
  ...Array.from({ length: 4 }, (_, index) => {
    const upcoming = fixtureMatch(`upcoming-${index + 1}`, 'upcoming');
    return {
      ...upcoming,
      matchNumber: index + 2,
      stageOrdinal: index + 2,
      scheduledAt: new Date(Date.UTC(2026, 10, 7, 18 + index, 0)).toISOString(),
    };
  }),
];

export const layoutStandings = [
  ...sampleStandings.map((row, index) => ({
    ...row,
    zoneName: index < 2 ? 'Zona A' : 'Zona B',
  })),
  ...Array.from({ length: 6 }, (_, index) => ({
    position: index + 5,
    name: `Club ${index + 5}`,
    played: 2,
    points: 4 - index,
  })),
];

export const initial: LiveDashboard = {
  matches: [
    {
      matchId: 'm1',
      stageNumber: 1,
      matchNumber: 1,
      stageOrdinal: 1,
      state: 'final' as const,
      projectionVersion: 1,
      sides: [
        { entrantId: 'e1', name: 'Boca Juniors', score: 3, state: 'final' },
        { entrantId: 'e2', name: 'River Plate', score: 1, state: 'final' },
      ],
    },
  ],
  standingsVersion: 1,
  usingLastKnown: true,
};
export const zonedStandings: StandingsRowView[] = [
  { position: 1, name: 'Boca Juniors', played: 2, points: 6, zoneName: 'Liga A' },
  { position: 1, name: 'Lanús', played: 2, points: 4, zoneName: 'Liga B' },
];
export const leagueZone = {
  zoneId: 'z-league',
  zoneName: 'Liga A',
  matches: [
    {
      matchId: 'lm1',
      matchNumber: 1,
      roundNumber: 1,
      branch: 'winners',
      state: 'final' as const,
      scores: [2, 1],
      slots: [
        { kind: 'entrant' as const, entrantId: 'e1', name: 'Boca Juniors' },
        { kind: 'entrant' as const, entrantId: 'e2', name: 'River Plate' },
      ],
    },
  ],
};
export const listEntry = {
  key: 'lm1',
  scope: 'Liga A · Round 1',
  state: 'final' as const,
  stateLabel: 'Final',
  home: { label: 'BOC', name: 'Boca Juniors', score: 2 },
  away: { label: 'RIV', name: 'River Plate', score: 1 },
};
export const knockoutZone = {
  zoneId: 'z-cup',
  zoneName: 'Copa',
  matches: [{ ...leagueZone.matches[0], matchId: 'km1' }],
};

export function renderDashboard(
  overrides: Partial<React.ComponentProps<typeof TvDashboard>> = {},
): ReturnType<typeof render> {
  return render(
    <TvDashboard
      dashboardLabels={dashboardLabels}
      initial={initial}
      labels={tvLabels}
      language="en"
      pollIntervalMs={0}
      standings={zonedStandings}
      streamPath="/events/tv/liga/tournaments/apertura"
      {...overrides}
    />,
  );
}
