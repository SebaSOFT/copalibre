import type { Meta, StoryObj } from '@storybook/react-vite';
import { TvSeriesAndSets } from './TvSeriesAndSets.js';
import { publicIntl, tvDashboardLabels } from '../../../../lib/i18n/public-intl.js';

/**
 * Rendered inside the corner bug (`.tv-overlay-bug`, `TvOverlayBug.tsx`) — an
 * OBS/vMix browser-source composited over a live camera feed. See "TV/Kiosk & Full-Frame
 * Widget/TvSeriesAndSets" for the same component on a flat ground; the markup does not change, only
 * its host does.
 *
 * Wrapped in the `tv-root-container tv-overlay-root tv-overlay-root--scorebug` markup production renders, so the bug sits low
 * in frame over the backdrop the toolbar picks.
 */
function StreamWidgetCornerBug({
  children,
}: {
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="tv-root-container tv-overlay-root tv-overlay-root--scorebug">
      <div className="tv-overlay-bug cl-chamfer">{children}</div>
    </div>
  );
}

const meta = {
  title: 'TV/Stream Widgets/TvSeriesAndSets',
  component: TvSeriesAndSets,
  args: { labels: tvDashboardLabels(publicIntl('es')) },
  decorators: [
    (Story) => (
      <StreamWidgetCornerBug>
        <Story />
      </StreamWidgetCornerBug>
    ),
  ],
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof TvSeriesAndSets>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Series: Story = {
  args: {
    progress: {
      segmentLabel: '2do tiempo',
      sets: [],
      series: { home: 1, away: 0, game: 2, span: 3, pips: ['won-home', 'current', 'upcoming'] },
    },
  },
};

export const Sets: Story = {
  args: {
    progress: {
      sets: [
        { number: 1, label: 'Set', scores: [6, 4], current: false },
        { number: 2, label: 'Set', scores: [3, 6], current: false },
        { number: 3, label: 'Set', scores: [2, 1], current: true },
      ],
      segmentLabel: '3er set',
    },
  },
};

/** Composited over a chroma-keyed camera feed — the widget's actual ground. */
export const SetsGreenChroma: Story = {
  args: Sets.args,
  parameters: { tvBackdrop: 'chroma' },
};

/** The segment in play, named by its place: "2do tiempo", "2da vuelta", "3er set". */
export const LapInPlay: Story = { args: { progress: { sets: [], segmentLabel: '2da vuelta' } } };

/** Laps scored to a target list like sets. */
export const ScoredLaps: Story = {
  args: {
    progress: {
      sets: [
        { number: 1, label: 'Vuelta', scores: [3, 1], current: false },
        { number: 2, label: 'Vuelta', scores: [1, 1], current: true },
      ],
      segmentLabel: '2da vuelta',
    },
  },
};

/** Neither a series nor sets nor a segment: the widget renders nothing. */
export const PlainMatch: Story = { args: { progress: { sets: [] } } };
