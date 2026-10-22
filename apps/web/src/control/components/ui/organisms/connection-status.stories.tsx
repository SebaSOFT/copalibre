import type { Meta, StoryObj } from '@storybook/react-vite';
import { useIntl } from 'react-intl';
import { ConnectionStatus } from './connection-status.js';
import { storyText } from '../story-text.js';

const meta = {
  title: 'Admin/Organisms/ConnectionStatus',
  component: ConnectionStatus,
} satisfies Meta<typeof ConnectionStatus>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ReferenceOfflineStatus: Story = {
  args: {
    online: false,
    queuedCount: 1,
    refusedCount: 0,
    lastSuccessfulSync: '',
    labels: {
      online: '',
      offline: '',
      queuedCount: () => '',
      refusedCount: () => '',
      lastSuccessfulSync: () => '',
      neverSynced: '',
    },
  },
  render: function Render() {
    const intl = useIntl();
    return (
      <ConnectionStatus
        labels={{
          online: intl.formatMessage(storyText.interactionOnline),
          offline: intl.formatMessage(storyText.interactionOffline),
          queuedCount: (count) => intl.formatMessage(storyText.interactionQueuedCount, { count }),
          refusedCount: (count) => intl.formatMessage(storyText.interactionRefusedCount, { count }),
          lastSuccessfulSync: (time) =>
            intl.formatMessage(storyText.interactionLastSynced, { time }),
          neverSynced: intl.formatMessage(storyText.interactionNeverSynced),
        }}
        lastSuccessfulSync="18:42"
        online={false}
        queuedCount={1}
        refusedCount={0}
      />
    );
  },
};
