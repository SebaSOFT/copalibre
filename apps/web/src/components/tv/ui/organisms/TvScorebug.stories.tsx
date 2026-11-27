import type { Meta, StoryObj } from '@storybook/react-vite';
import { publicIntl, tvDashboardLabels } from '../../../../lib/i18n/public-intl.js';
import { TvScorebug } from './TvScorebug.js';
import { TvStatusBadge } from '../atoms/TvStatusBadge.js';

const labels = tvDashboardLabels(publicIntl('es'));

const meta = {
  title: 'TV/Kiosk & Full-Frame Widget/TvScorebug',
  component: TvScorebug,
  args: {
    tournamentName: 'Campeonato Panamericano Clubes Senior Varones',
    organizationName: 'Panamericano Demo',
  },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof TvScorebug>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Live: Story = {
  args: {
    children: (
      <>
        <TvStatusBadge label={labels.resultState.live} tone="live" />
        <span className="tv-scorebug__clock-label">{labels.clockLabel}</span>
      </>
    ),
  },
};

export const InProgress: Story = {
  args: {
    children: <TvStatusBadge label={labels.inProgress} tone="in-progress" />,
  },
};
