import type { Meta, StoryObj } from '@storybook/react-vite';
import { useIntl } from 'react-intl';
import { TournamentCard } from './tournament-card.js';
import { storyText } from '../story-text.js';

const meta = {
  title: 'Admin/Organisms/TournamentCard',
  component: TournamentCard,
} satisfies Meta<typeof TournamentCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: {
    name: '',
    status: { label: '', color: 'state-live' },
    metadata: [],
    facts: [],
    action: { href: '#', label: '' },
  },
  render: function Render() {
    const intl = useIntl();
    return (
      <div>
        <p className="cl-metric-strip__demonstration">
          {intl.formatMessage(storyText.metricDemonstration)}
        </p>
        <TournamentCard
          action={{ href: '#matches', label: intl.formatMessage(storyText.openMatchConsole) }}
          facts={[
            {
              key: 'pending-registrations',
              label: intl.formatMessage(storyText.dashboardPendingRegistrations),
              value: 8,
              sourceField: 'pendingRegistrations',
            },
            {
              key: 'matches-today',
              label: intl.formatMessage(storyText.dashboardMatchesToday),
              value: 12,
              sourceField: 'matchesToday',
            },
          ]}
          metadata={[]}
          name="Copa Premier"
          status={{
            color: 'state-live',
            label: intl.formatMessage(storyText.lifecycleLive),
          }}
        />
      </div>
    );
  },
};
