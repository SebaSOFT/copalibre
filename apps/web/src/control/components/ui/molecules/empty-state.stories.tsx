import type { Meta, StoryObj } from '@storybook/react-vite';
import { useIntl } from 'react-intl';
import { messages } from '../../../i18n/messages.en.js';
import { EmptyState } from './empty-state.js';
import { storyText } from '../story-text.js';

const meta = {
  title: 'Admin/Molecules/EmptyState',
  component: EmptyState,
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ReferenceNoTournaments: Story = {
  args: {
    icon: 'trophy',
    heading: '',
    description: '',
    action: { label: '', onClick: () => undefined },
  },
  render: function Render() {
    const intl = useIntl();
    return (
      <EmptyState
        action={{
          label: intl.formatMessage(messages.dashboardCreateTournament),
          onClick: () => undefined,
        }}
        description={intl.formatMessage(storyText.interactionEmptyDescription)}
        heading={intl.formatMessage(storyText.interactionEmptyHeading)}
        icon="trophy"
      />
    );
  },
};

export const NoPermission: Story = {
  args: {
    reason: 'no-permission',
    whoCanAct: '',
    icon: 'trophy',
    heading: '',
    description: '',
  },
  render: function Render() {
    const intl = useIntl();
    return (
      <EmptyState
        description={intl.formatMessage(storyText.interactionEmptyDescription)}
        heading={intl.formatMessage(storyText.interactionEmptyHeading)}
        icon="trophy"
        reason="no-permission"
        whoCanAct={intl.formatMessage(storyText.interactionWhoCanAct)}
      />
    );
  },
};

export const Informational: Story = {
  args: {
    reason: 'informational',
    icon: 'offline',
    heading: '',
    description: '',
  },
  render: function Render() {
    const intl = useIntl();
    return (
      <EmptyState
        description={intl.formatMessage(messages.dashboardPairTvNeedsTournament)}
        heading={intl.formatMessage(messages.deviceHeartbeatEmpty)}
        icon="offline"
        reason="informational"
      />
    );
  },
};
