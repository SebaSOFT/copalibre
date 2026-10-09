import type { Meta, StoryObj } from '@storybook/react-vite';
import { TvDashboard } from './TvDashboard.js';
import { publicIntl, tvDashboardLabels, tvStatisticsLabels } from '../../lib/i18n/public-intl.js';
import {
  DASHBOARD,
  PINNED,
  SERIES,
  dashboardWithSegments,
  renderDashboard,
} from './tv-dashboard-story-fixtures.js';

/**
 * OBS/vMix browser-source overlays — composited into a broadcast, never shown
 * on their own. `lower` is a compact score bug meant to sit over a live
 * camera feed; `full` is a self-contained scene for a stream with no camera
 * source. See "TV/Kiosk Monitor" for the venue's own standalone screen this
 * same component also renders.
 *
 * The TV background toolbar previews these against green chroma or local
 * sport scenes to simulate compositing; production `?chroma` routing remains
 * covered by `broadcast-tv.spec.ts` on the actual route.
 */
const meta = {
  title: 'TV/Stream Widgets/TvDashboard',
  component: TvDashboard,
  args: {
    initial: DASHBOARD,
    streamPath: '/stories/no-stream',
    labels: tvStatisticsLabels(publicIntl('en')),
    dashboardLabels: tvDashboardLabels(publicIntl('en')),
    language: 'en',
    presentation: 'lower',
  },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof TvDashboard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The compact score bug meant to sit over a camera feed. */
export const LowerThird: Story = { render: renderDashboard('lower') };

export const LowerThirdGreenChroma: Story = {
  render: renderDashboard('lower'),
  parameters: { tvBackdrop: 'chroma' },
};

export const LowerThirdFootballBackdrop: Story = {
  render: renderDashboard('lower'),
  parameters: { tvBackdrop: 'football' },
};

export const LowerThirdBasketballBackdrop: Story = {
  render: renderDashboard('lower'),
  parameters: { tvBackdrop: 'basketball' },
};

/** The self-contained broadcast scene, for a stream with no camera source. */
export const FullOverlay: Story = { render: renderDashboard('full') };

const TENNIS_SETS = dashboardWithSegments([
  { number: 1, type: 'set', label: 'Set', timed: false, state: 'completed', scores: [6, 4] },
  { number: 2, type: 'set', label: 'Set', timed: false, state: 'completed', scores: [3, 6] },
  { number: 3, type: 'set', label: 'Set', timed: false, state: 'active', scores: [2, 1] },
]);

/** A discipline run in laps, each a timed segment: only the lap in play is named, with no per-lap score. */
const TIMED_LAP = dashboardWithSegments([
  { number: 1, type: 'lap', label: 'Lap', timed: true, state: 'completed' },
  { number: 2, type: 'lap', label: 'Lap', timed: true, state: 'active' },
]);

/** Laps scored to a target instead of a clock list like sets: one chip per lap played, current marked. */
const SCORED_LAPS = dashboardWithSegments([
  { number: 1, type: 'lap', label: 'Lap', timed: false, state: 'completed', scores: [3, 1] },
  { number: 2, type: 'lap', label: 'Lap', timed: false, state: 'active', scores: [1, 1] },
]);

const SERIES_BY_MATCH = { 'm-1': SERIES };

/** The pinned match's series: pips and "Series 1–0 · Game 2 of 3" beside the score. */
export const LowerThirdSeries: Story = {
  render: renderDashboard('lower', { pinnedMatch: PINNED, seriesByMatchId: SERIES_BY_MATCH }),
};

/** Sets played so far and the one in play, scored home first. */
export const LowerThirdSets: Story = {
  render: renderDashboard('lower', { initial: TENNIS_SETS, pinnedMatch: PINNED }),
};

export const LowerThirdSetsGreenChroma: Story = {
  render: renderDashboard('lower', { initial: TENNIS_SETS, pinnedMatch: PINNED }),
  parameters: { tvBackdrop: 'chroma' },
};

export const LowerThirdSeriesAndSets: Story = {
  render: renderDashboard('lower', {
    initial: TENNIS_SETS,
    pinnedMatch: PINNED,
    seriesByMatchId: SERIES_BY_MATCH,
  }),
};

/** Laps run against a clock: the lap in play is named. */
export const LowerThirdLapInPlay: Story = {
  render: renderDashboard('lower', { initial: TIMED_LAP, pinnedMatch: PINNED }),
};

/** Laps scored to a target: one chip per lap, like sets. */
export const LowerThirdScoredLaps: Story = {
  render: renderDashboard('lower', { initial: SCORED_LAPS, pinnedMatch: PINNED }),
};

export const FullOverlaySeriesAndSets: Story = {
  render: renderDashboard('full', {
    initial: TENNIS_SETS,
    pinnedMatch: PINNED,
    seriesByMatchId: SERIES_BY_MATCH,
  }),
};

/** An overlay with no pinned match and no court shows no match: a guess would repeat on every overlay. */
export const LowerThirdNoMatch: Story = { render: renderDashboard('lower') };

/** A court is followed by its live match; with none live the overlay says so. */
export const LowerThirdCourtWithoutLiveMatch: Story = {
  render: renderDashboard('lower', {
    court: 'Cancha 2',
    venueNameByMatchId: { 'm-1': 'Cancha 1' },
  }),
};

export const LowerThirdCourtLiveMatch: Story = {
  render: renderDashboard('lower', {
    initial: TENNIS_SETS,
    court: 'Cancha 1',
    venueNameByMatchId: { 'm-1': 'Cancha 1' },
  }),
};
