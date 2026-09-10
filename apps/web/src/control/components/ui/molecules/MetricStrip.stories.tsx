import type { Meta, StoryObj } from '@storybook/react-vite';
import { useIntl } from 'react-intl';
import { MetricStrip } from './MetricStrip.js';
import { messages } from '../../../i18n/messages.en.js';

/**
 * A row of measurements over the tile owner.
 *
 * Every figure here is a demonstration and says so. That is not decoration: a
 * strip of plausible numbers on a review surface is exactly how an invented
 * benchmark ends up quoted back as a measurement.
 */
const meta = {
  title: 'Admin/Molecules/MetricStrip',
  component: MetricStrip,
} satisfies Meta<typeof MetricStrip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: { ariaLabel: 'Summary', metrics: [] },
  render: function Render() {
    const intl = useIntl();
    const demo = intl.formatMessage(messages.metricDemonstration);
    return (
      <MetricStrip
        ariaLabel={intl.formatMessage(messages.dashboardSummary)}
        metrics={[
          {
            key: 'tournaments',
            label: intl.formatMessage(messages.dashboardActiveTournaments),
            value: 12,
            demonstrationLabel: demo,
          },
          {
            key: 'registrations',
            label: intl.formatMessage(messages.dashboardPendingRegistrations),
            value: 7,
            demonstrationLabel: demo,
          },
          {
            key: 'matches',
            label: intl.formatMessage(messages.dashboardMatchesToday),
            value: 0,
            demonstrationLabel: demo,
          },
        ]}
      />
    );
  },
};

/**
 * The strip's states side by side, including the one it exists for: a metric
 * with nothing behind it renders a word, not a number that reads as zero.
 */
export const Matrix: Story = {
  args: { ariaLabel: 'Summary', metrics: [] },
  render: function Render() {
    const intl = useIntl();
    const unavailable = intl.formatMessage(messages.metricUnavailable);
    return (
      <MetricStrip
        ariaLabel={intl.formatMessage(messages.dashboardSummary)}
        metrics={[
          {
            key: 'measured',
            label: intl.formatMessage(messages.dashboardActiveTournaments),
            value: 12,
          },
          {
            key: 'zero',
            label: intl.formatMessage(messages.dashboardMatchesToday),
            value: 0,
          },
          {
            key: 'unavailable',
            label: intl.formatMessage(messages.dashboardPendingRegistrations),
            unavailableLabel: unavailable,
          },
        ]}
      />
    );
  },
};
