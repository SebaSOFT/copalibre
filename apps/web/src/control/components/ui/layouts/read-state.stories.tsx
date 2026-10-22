import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import { messages } from '../../../i18n/messages.en.js';
import { EmptyState } from '../molecules/empty-state.js';
import { ReadState } from './read-state.js';

const meta = {
  title: 'Admin/Templates/ReadState',
  component: ReadState,
  args: { title: '', retry: () => {} },
} satisfies Meta<typeof ReadState>;
export default meta;
type Story = StoryObj<typeof meta>;
function Screen({ status }: { readonly status: 'loading' | 'failed-empty' | 'stale' | 'empty' }) {
  const intl = useIntl();
  const [staleSince] = useState(() => Date.now() - 360_000);
  return (
    <ReadState
      status={status}
      title={intl.formatMessage(messages.navDashboard)}
      retry={() => {}}
      staleSince={staleSince}
    >
      <EmptyState
        icon="trophy"
        heading={intl.formatMessage(messages.interactionEmptyHeading)}
        description={intl.formatMessage(messages.interactionEmptyDescription)}
        action={{
          label: intl.formatMessage(messages.dashboardCreateTournament),
          onClick: () => {},
        }}
      />
    </ReadState>
  );
}
export const Loading: Story = {
  args: { status: 'loading' },
  render: () => <Screen status="loading" />,
};
export const Failed: Story = {
  args: { status: 'failed-empty' },
  render: () => <Screen status="failed-empty" />,
};
export const Stale: Story = { args: { status: 'stale' }, render: () => <Screen status="stale" /> };
export const Empty: Story = { args: { status: 'empty' }, render: () => <Screen status="empty" /> };
