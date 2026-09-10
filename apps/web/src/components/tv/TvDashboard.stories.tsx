import type { Meta, StoryObj } from '@storybook/react-vite';
import { TvDashboard, type TvPresentation } from './TvDashboard.js';
import { publicIntl, tvStatisticsLabels } from '../../lib/i18n/public-intl.js';
import type { LiveDashboard } from '../../lib/live-state.js';
import type { StandingsRowView } from '../../lib/overview.js';
import type { TopPerformer } from '../../lib/tv-statistics.js';
import type { SupportedLanguage } from '../../lib/language-preference.js';

/**
 * The broadcast surface in each mode it ships.
 *
 * `streamPath` points at nothing here, so the overlay renders from `initial`
 * and never patches — which is exactly what a venue display does when the
 * stream drops, and otherwise reachable only by driving a live match.
 *
 * Review these at the desktop viewport: a broadcast overlay is composited at
 * 1920×1080, not on a phone. The narrow viewports are still worth one pass,
 * because `kiosk` is also what a venue's vertical screen shows.
 *
 * The TV background toolbar previews transparent overlays against green chroma
 * or local sport scenes. It changes only the surroundings; production `?chroma`
 * routing remains covered by `tv-broadcast.spec.ts` on the actual route.
 */
const DASHBOARD: LiveDashboard = {
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

const STANDINGS: readonly StandingsRowView[] = [
  { position: 1, name: 'Club Atlético Independiente', abbreviation: 'CAI', played: 8, points: 19 },
  { position: 2, name: 'Deportivo San Juan', abbreviation: 'DSJ', played: 8, points: 17 },
  { position: 3, name: 'Unión de Rivadavia', abbreviation: 'UNR', played: 8, points: 12 },
];

const PERFORMERS: readonly TopPerformer[] = [
  { rank: 1, name: 'A. Gutiérrez', clubName: 'CAI', statLabel: 'Goles', statValue: 9 },
  { rank: 2, name: 'M. Ferreyra', clubName: 'DSJ', statLabel: 'Goles', statValue: 7 },
];

function render(presentation: TvPresentation) {
  return function Render(_args: unknown, context: { globals: Record<string, unknown> }) {
    const language = (context.globals.locale ?? 'en') as SupportedLanguage;
    return (
      <TvDashboard
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

const meta = {
  title: 'TV/TvDashboard',
  component: TvDashboard,
  args: {
    initial: DASHBOARD,
    streamPath: '/stories/no-stream',
    labels: tvStatisticsLabels(publicIntl('en')),
    language: 'en' as SupportedLanguage,
  },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof TvDashboard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The venue display: the default, and the only mode with no camera behind it. */
export const Kiosk: Story = { render: render('kiosk') };

/** The compact score bug meant to sit over a camera feed. */
export const OverlayLower: Story = { render: render('lower') };

export const GreenChroma: Story = {
  render: render('lower'),
  parameters: { tvBackdrop: 'chroma' },
};

export const FootballBackdrop: Story = {
  render: render('lower'),
  parameters: { tvBackdrop: 'football' },
};

export const BasketballBackdrop: Story = {
  render: render('lower'),
  parameters: { tvBackdrop: 'basketball' },
};

/** The self-contained broadcast scene, for a stream with no camera source. */
export const OverlayFull: Story = { render: render('full') };

/**
 * Nothing live. Every mode has to survive an empty match list, which is what a
 * venue screen shows for most of a tournament day.
 */
export const NothingLive: Story = {
  render: (_args, context) => {
    const language = (context.globals.locale ?? 'en') as SupportedLanguage;
    return (
      <TvDashboard
        initial={{ matches: [], standingsVersion: 0, usingLastKnown: false }}
        labels={tvStatisticsLabels(publicIntl(language))}
        language={language}
        organizationName="Liga Sanjuanina"
        presentation="kiosk"
        standings={STANDINGS}
        streamPath="/stories/no-stream"
        tournamentName="Copa Primavera"
      />
    );
  },
};
