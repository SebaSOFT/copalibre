import type { Meta, StoryObj } from '@storybook/react-vite';
import { TvOverlayBug } from './TvOverlayBug.js';
import { publicIntl, tvDashboardLabels } from '../../../../lib/i18n/public-intl.js';
import type { LiveMatch } from '../../../../lib/live-state.js';
import { tvMatchProgress } from '../../../../lib/tv-match-progress.js';

const labels = tvDashboardLabels(publicIntl('es'));
const clockLabels = { clockStopped: labels.clockStopped, clockAriaLabel: labels.clockAriaLabel };

const live: LiveMatch = {
  matchId: 'm-live',
  stageNumber: 1,
  matchNumber: 3,
  stageOrdinal: 3,
  state: 'live',
  projectionVersion: 1,
  sides: [
    { entrantId: 'tal', name: 'Talleres', abbreviation: 'TAL', score: 1, state: 'live' },
    { entrantId: 'boc', name: 'Boca', abbreviation: 'BOC', score: 0, state: 'live' },
  ],
  clock: { segmentNumber: 1, elapsedSeconds: 1020, running: true, asOf: '2026-11-23T13:17:00Z' },
};

const meta = {
  title: 'TV/Stream Widgets/TvOverlayBug',
  component: TvOverlayBug,
  args: {
    match: live,
    statusTone: 'live',
    statusLabel: labels.resultState.live,
    labels,
    progress: tvMatchProgress(live, undefined, 'es'),
    clock: live.clock,
    clockLabels,
  },
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="tv-overlay-root tv-overlay-root--scorebug" style={{ height: '30vh' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TvOverlayBug>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The corner bug over footage: the state, both abbreviations, the score and the game clock. */
export const Live: Story = {};

/** A match not yet started: its score position shows the dash, not a zero. */
export const Upcoming: Story = {
  args: {
    match: {
      ...live,
      state: 'upcoming',
      clock: undefined,
      sides: live.sides.map((side) => ({ ...side, state: 'upcoming', score: 0 })),
    },
    statusTone: 'upcoming',
    statusLabel: labels.resultState.upcoming,
    clock: undefined,
    progress: { sets: [] },
  },
};
