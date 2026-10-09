import type { Meta, StoryObj } from '@storybook/react-vite';
import { TvSeriesAndSets } from './TvSeriesAndSets.js';
import { publicIntl, tvDashboardLabels } from '../../../../lib/i18n/public-intl.js';

/**
 * Rendered inside the lower-third overlay bug (`.tv-lower-third__bug`, `TvDashboard.tsx`) — an
 * OBS/vMix browser-source composited over a live camera feed. See "TV/Kiosk & Full-Frame
 * Widget/TvSeriesAndSets" for the same component on a flat ground; the markup does not change, only
 * its host does.
 *
 * Wrapped in the `tv-root-container tv-lower-third` markup production renders, so the bug sits low
 * in frame over the backdrop the toolbar picks.
 */
function StreamWidgetLowerThird({
  children,
}: {
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="tv-root-container tv-lower-third">
      <div className="tv-lower-third__bug cl-chamfer">{children}</div>
    </div>
  );
}

const meta = {
  title: 'TV/Stream Widgets/TvSeriesAndSets',
  component: TvSeriesAndSets,
  args: { labels: tvDashboardLabels(publicIntl('es')) },
  decorators: [
    (Story) => (
      <StreamWidgetLowerThird>
        <Story />
      </StreamWidgetLowerThird>
    ),
  ],
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof TvSeriesAndSets>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Series: Story = {
  args: {
    progress: {
      segmentLabel: '2do Tiempo',
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
      segmentLabel: '3er Set',
    },
  },
};

/** Composited over a chroma-keyed camera feed — the widget's actual ground. */
export const SetsGreenChroma: Story = {
  args: Sets.args,
  parameters: { tvBackdrop: 'chroma' },
};

/** The segment in play, named by its place: "2do Tiempo", "2da Vuelta", "3er Set". */
export const LapInPlay: Story = { args: { progress: { sets: [], segmentLabel: '2da Vuelta' } } };

/** Laps scored to a target list like sets. */
export const ScoredLaps: Story = {
  args: {
    progress: {
      sets: [
        { number: 1, label: 'Vuelta', scores: [3, 1], current: false },
        { number: 2, label: 'Vuelta', scores: [1, 1], current: true },
      ],
      segmentLabel: '2da Vuelta',
    },
  },
};

/** Neither a series nor sets nor a segment: the widget renders nothing. */
export const PlainMatch: Story = { args: { progress: { sets: [] } } };
