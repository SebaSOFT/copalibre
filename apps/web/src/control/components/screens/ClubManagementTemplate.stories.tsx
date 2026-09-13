import type { Meta, StoryObj } from '@storybook/react-vite';
import { ClubManagementTemplate } from '../screens/ClubManagementTemplate.js';
import type { ControlApiClient } from '../../lib/api-client.js';
import { storyClient, ORG, ids, names } from '../screen-story-fixtures.js';

const client = storyClient<ControlApiClient>({
  createClub: undefined,
  updateClub: undefined,
  uploadClubEmblem: undefined,
});

const meta = {
  title: 'Admin/Screens/ClubManagementTemplate',
  component: ClubManagementTemplate,
  args: {
    api: client,
    clubs: [],
    onCreateClub: async () => true,
    onSaveClub: async () => undefined,
    onUploadClubEmblem: async () => undefined,
    organizationAlias: ORG,
  },
} satisfies Meta<typeof ClubManagementTemplate>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Empty: Story = {};
export const WithClubs: Story = {
  args: {
    clubs: [
      {
        clubId: ids.first,
        organizationId: ids.organization,
        name: names[ids.first],
        alias: 'meridian-seven',
      },
    ],
  },
};
