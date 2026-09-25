import type { Meta, StoryObj } from '@storybook/react-vite';
import { TvDashboard } from './TvDashboard.js';
import { publicIntl, tvDashboardLabels, tvStatisticsLabels } from '../../lib/i18n/public-intl.js';
import { DASHBOARD, renderDashboard } from './tv-dashboard-story-fixtures.js';

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
