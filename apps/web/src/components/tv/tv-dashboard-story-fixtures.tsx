import { TvDashboard, type TvPresentation } from './TvDashboard.js';
import { publicIntl, tvDashboardLabels, tvStatisticsLabels } from '../../lib/i18n/public-intl.js';
import type { LiveDashboard } from '../../lib/live-state.js';
import type { StandingsRowView } from '../../lib/overview.js';
import type { TopPerformer } from '../../lib/tv-statistics.js';
import type { SupportedLanguage } from '../../lib/language-preference.js';

/**
 * Shared fixtures for the kiosk-monitor and stream-widget story files
 * (openspec 0294) — split across two files so the Storybook sidebar can group
 * "TV/Kiosk Monitor" (the standalone venue screen, `presentation="kiosk"`)
 * separately from "TV/Stream Widgets" (the OBS/vMix browser-source overlays,
 * `presentation="lower"` — a compact bug over a live camera — and `"full"` —
 * a self-contained scene for a stream with no camera source).
 */
export const DASHBOARD: LiveDashboard = {
  standingsVersion: 12,
  usingLastKnown: false,
  matches: [
    {
      matchId: 'm-1',
      stageNumber: 1,
      matchNumber: 7,
      state: 'live',
      projectionVersion: 12,
      clockSeconds: 4726,
      sides: [
        {
          entrantId: 'e-1',
          name: 'Club Atlético Independiente',
          abbreviation: 'CAI',
          score: 2,
          state: 'live',
        },
        {
          entrantId: 'e-2',
          name: 'Deportivo San Juan',
          abbreviation: 'DSJ',
          score: 1,
          state: 'live',
        },
      ],
    },
  ],
};

export const STANDINGS: readonly StandingsRowView[] = [
  { position: 1, name: 'Club Atlético Independiente', abbreviation: 'CAI', played: 8, points: 19 },
  { position: 2, name: 'Deportivo San Juan', abbreviation: 'DSJ', played: 8, points: 17 },
  { position: 3, name: 'Unión de Rivadavia', abbreviation: 'UNR', played: 8, points: 12 },
];

export const PERFORMERS: readonly TopPerformer[] = [
  { rank: 1, name: 'A. Gutiérrez', clubName: 'CAI', statLabel: 'Goles', statValue: 9 },
  { rank: 2, name: 'M. Ferreyra', clubName: 'DSJ', statLabel: 'Goles', statValue: 7 },
];

export function renderDashboard(presentation: TvPresentation) {
  return function Render(_args: unknown, context: { globals: Record<string, unknown> }) {
    const language = (context.globals.locale ?? 'en') as SupportedLanguage;
    return (
      <TvDashboard
        dashboardLabels={tvDashboardLabels(publicIntl(language))}
        initial={DASHBOARD}
        labels={tvStatisticsLabels(publicIntl(language))}
        language={language}
        organizationName="Liga Sanjuanina"
        presentation={presentation}
        standings={STANDINGS}
        streamPath="/stories/no-stream"
        topPerformers={PERFORMERS}
        tournamentName="Copa Primavera"
      />
    );
  };
}
