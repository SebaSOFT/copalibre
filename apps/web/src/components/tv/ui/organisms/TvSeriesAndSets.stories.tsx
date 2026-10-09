import type { Meta, StoryObj } from '@storybook/react-vite';
import { TvSeriesAndSets } from './TvSeriesAndSets.js';
import { publicIntl, tvDashboardLabels } from '../../../../lib/i18n/public-intl.js';

const meta = {
  title: 'TV/Kiosk & Full-Frame Widget/TvSeriesAndSets',
  component: TvSeriesAndSets,
  args: { labels: tvDashboardLabels(publicIntl('es')) },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof TvSeriesAndSets>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The second game of a best-of-three: one won, one in play, one to come. */
export const Series: Story = {
  args: {
    progress: {
      sets: [],
      series: { home: 1, away: 0, game: 2, span: 3, pips: ['won-home', 'current', 'upcoming'] },
    },
  },
};

/** Two sets played and the third in play, each scored home first; the current one is marked. */
export const Sets: Story = {
  args: {
    progress: {
      sets: [
        { number: 1, label: 'Set', scores: [6, 4], current: false },
        { number: 2, label: 'Set', scores: [3, 6], current: false },
        { number: 3, label: 'Set', scores: [2, 1], current: true },
      ],
    },
  },
};

/** A discipline played in timed segments names the one in play instead of listing sets. */
export const SegmentInPlay: Story = {
  args: { progress: { sets: [], segmentLabel: 'Segundo tiempo' } },
};

/** A plain match has neither a series nor sets: the component renders nothing. */
export const PlainMatch: Story = { args: { progress: { sets: [] } } };
