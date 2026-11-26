import type { Meta, StoryObj } from '@storybook/react-vite';
import { publicIntl, tvDashboardLabels } from '../../../../lib/i18n/public-intl.js';
import { TvStatusBadge } from './TvStatusBadge.js';

const labels = tvDashboardLabels(publicIntl('es'));

const meta = {
  title: 'TV/Kiosk & Full-Frame Widget/TvStatusBadge',
  component: TvStatusBadge,
  args: {
    tone: 'live',
    label: labels.resultState.live,
  },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof TvStatusBadge>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Live: Story = {};
export const InProgress: Story = { args: { tone: 'in-progress', label: labels.inProgress } };
export const Delayed: Story = { args: { tone: 'delayed', label: labels.delayed ?? '' } };
export const Final: Story = { args: { tone: 'final', label: labels.resultState.final } };
