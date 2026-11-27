import type { Meta, StoryObj } from '@storybook/react-vite';
import { messages } from '../../../i18n/messages.en.js';
import { ORG } from '../../screen-story-fixtures.js';
import { ContextRailHeader } from './context-rail-header.js';

const meta = {
  title: 'Admin/Organisms/ContextRailHeader',
  component: ContextRailHeader,
  args: {
    scope: 'organization',
    name: 'Liga San Juan',
    monogram: 'LS',
    primaryAction: {
      label: messages.dashboardCreateTournament,
      href: `/control/${ORG}/tournaments/new`,
    },
  },
} satisfies Meta<typeof ContextRailHeader>;
export default meta;
type Story = StoryObj<typeof meta>;

export const OrganizationAdmin: Story = {};

export const LiveTournamentOperator: Story = {
  args: {
    scope: 'tournament',
    name: 'Copa Premier',
    monogram: 'CP',
    status: { label: messages.lifecycleInProgress, color: 'state-live' },
    primaryAction: {
      label: messages.shellScopeActionOpenLiveConsole,
      href: `/control/${ORG}/live`,
    },
  },
};

export const TournamentReadOnly: Story = {
  args: {
    scope: 'tournament',
    name: 'Copa Premier',
    monogram: 'CP',
    status: { label: messages.lifecycleUpcoming, color: 'state-upcoming' },
    primaryAction: undefined,
  },
};
