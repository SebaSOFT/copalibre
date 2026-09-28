import type { Meta, StoryObj } from '@storybook/react-vite';
import { ClubPortalMembersTemplate } from './ClubPortalMembersTemplate.js';
import type { ControlApiClient } from '../../lib/api-client.js';
import { storyClient, ids, names } from '../screen-story-fixtures.js';

const client = storyClient<ControlApiClient>({
  createClubMember: undefined,
  updateClubMember: undefined,
});

const meta = {
  title: 'Admin/Screens/ClubPortalMembersTemplate',
  component: ClubPortalMembersTemplate,
  args: {
    api: client,
    members: [],
    onCreateMember: async () => true,
    onSaveMember: async () => undefined,
  },
} satisfies Meta<typeof ClubPortalMembersTemplate>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Empty: Story = {};
export const WithMembers: Story = {
  args: {
    members: [
      { personId: ids.first, displayName: names[ids.first] },
      { personId: ids.second, displayName: names[ids.second] },
    ],
  },
};
