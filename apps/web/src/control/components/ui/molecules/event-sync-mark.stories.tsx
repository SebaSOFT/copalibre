import type { Meta, StoryObj } from '@storybook/react-vite';
import { useIntl } from 'react-intl';
import { messages } from '../../../i18n/messages.en.js';
import { EventSyncMark } from './event-sync-mark.js';
import { storyText } from '../story-text.js';

const meta = {
  title: 'Admin/Molecules/EventSyncMark',
  component: EventSyncMark,
} satisfies Meta<typeof EventSyncMark>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ReferenceEventSync: Story = {
  args: {
    state: 'queued',
    acknowledged: false,
    labels: { queued: '', sent: '', confirmed: '', refused: '' },
  },
  render: function Render() {
    const intl = useIntl();
    const labels = {
      queued: intl.formatMessage(storyText.interactionQueued),
      sent: intl.formatMessage(storyText.interactionSent),
      confirmed: intl.formatMessage(storyText.interactionConfirmed),
      refused: intl.formatMessage(storyText.interactionRefused),
    };
    return (
      <div style={{ display: 'grid', gap: 'var(--cl-space-3)' }}>
        <EventSyncMark acknowledged={false} labels={labels} state="queued" />
        <EventSyncMark acknowledged={false} labels={labels} state="sent" />
        <EventSyncMark acknowledged={true} labels={labels} state="confirmed" />
        <EventSyncMark
          acknowledged={false}
          labels={labels}
          refusalReason={intl.formatMessage(messages.matchConsoleOperationRejected)}
          state="refused"
        />
      </div>
    );
  },
};
