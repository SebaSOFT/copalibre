import type { Meta, StoryObj } from '@storybook/react-vite';
import { createIntl, createIntlCache } from 'react-intl';
import { messages } from '../../../i18n/messages.en.js';
import { AnalyticsStatusChart } from './analytics-status-chart.js';

const intl = createIntl({ locale: 'en' }, createIntlCache());

const meta = {
  title: 'Admin/Organisms/AnalyticsStatusChart',
  component: AnalyticsStatusChart,
  args: {
    title: intl.formatMessage(messages.analyticsStatusChart),
    legendLabel: intl.formatMessage(messages.chartLegend),
    chartLabel: intl.formatMessage(messages.chartShowAsChart),
    tableLabel: intl.formatMessage(messages.chartShowAsTable),
    valueLabel: intl.formatMessage(messages.analyticsTotalTournaments),
    emptyLabel: intl.formatMessage(messages.analyticsNoTournaments),
    otherLabel: intl.formatMessage(messages.chartOther),
    series: [
      { key: 'live', label: intl.formatMessage(messages.analyticsStatusLive), value: 3, slot: 0 },
      {
        key: 'upcoming',
        label: intl.formatMessage(messages.analyticsStatusUpcoming),
        value: 2,
        slot: 1,
      },
      {
        key: 'finished',
        label: intl.formatMessage(messages.analyticsStatusFinished),
        value: 1,
        slot: 2,
      },
    ],
  },
} satisfies Meta<typeof AnalyticsStatusChart>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Loaded: Story = {};
export const Table: Story = {
  play: async ({ canvas, userEvent }) =>
    userEvent.click(
      canvas.getByRole('button', { name: intl.formatMessage(messages.chartShowAsTable) }),
    ),
};
