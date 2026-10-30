import type { Meta, StoryObj } from '@storybook/react-vite';
import { useIntl } from 'react-intl';
import { KpiStrip } from './kpi-strip.js';
import { storyText } from '../story-text.js';

const meta = {
  title: 'Admin/Organisms/KpiStrip',
  component: KpiStrip,
} satisfies Meta<typeof KpiStrip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: { source: {}, metrics: [], ariaLabel: '' },
  render: function Render() {
    const intl = useIntl();
    const demonstration = intl.formatMessage(storyText.metricDemonstration);
    const source = {
      activeTournaments: 4,
      pendingRegistrations: 8,
      matchesToday: 12,
    };

    return (
      <KpiStrip
        ariaLabel={intl.formatMessage(storyText.dashboardSummary)}
        metrics={[
          {
            key: 'active-tournaments',
            label: intl.formatMessage(storyText.dashboardActiveTournaments),
            sourceField: 'activeTournaments',
            formatValue: (value) => Number(value),
            demonstrationLabel: demonstration,
          },
          {
            key: 'pending-registrations',
            label: intl.formatMessage(storyText.dashboardPendingRegistrations),
            sourceField: 'pendingRegistrations',
            formatValue: (value) => Number(value),
            demonstrationLabel: demonstration,
          },
          {
            key: 'matches-today',
            label: intl.formatMessage(storyText.dashboardMatchesToday),
            sourceField: 'matchesToday',
            formatValue: (value) => Number(value),
            demonstrationLabel: demonstration,
          },
        ]}
        source={source}
      />
    );
  },
};
