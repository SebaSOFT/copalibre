import type { Meta, StoryObj } from '@storybook/react-vite';
import { ClubPortalRosterTemplate } from './ClubPortalRosterTemplate.js';
import type { ControlApiClient } from '../../lib/api-client.js';
import { storyClient, ids, names } from '../screen-story-fixtures.js';

const client = storyClient<ControlApiClient>({
  createClubTeam: undefined,
});

const meta = {
  title: 'Admin/Screens/ClubPortalRosterTemplate',
  component: ClubPortalRosterTemplate,
  args: {
    api: client,
    members: [
      { personId: ids.first, displayName: names[ids.first] },
      { personId: ids.second, displayName: names[ids.second] },
    ],
    teams: [{ teamId: ids.third, name: names[ids.third] }],
    onCreateTeam: async () => undefined,
    onSubmit: async () => undefined,
  },
} satisfies Meta<typeof ClubPortalRosterTemplate>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const NoMembers: Story = { args: { members: [] } };
export const NoTeams: Story = { args: { teams: [] } };
