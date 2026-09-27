import type { Meta, StoryObj } from '@storybook/react-vite';
import { BroadcasterStudioPage } from './BroadcasterStudioPage.js';
import type { ControlApiClient } from '../../lib/api-client.js';
import { ORG, TOURNAMENT, storyClient, pending } from '../screen-story-fixtures.js';

const meta = {
  title: 'Admin/Screens/BroadcasterStudioPage',
  component: BroadcasterStudioPage,
  args: { organizationAlias: ORG, tournamentAlias: TOURNAMENT },
} satisfies Meta<typeof BroadcasterStudioPage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Loaded: Story = {
  args: {
    client: storyClient<ControlApiClient>({
      issueDisplayToken: async () => ({
        displayTokenId: 'dt-1',
        token: 'story-token',
        url: `https://example.test/tv/${ORG}/tournaments/${TOURNAMENT}?token=story-token`,
      }),
    }),
  },
};

export const Loading: Story = {
  args: {
    client: storyClient<ControlApiClient>({ issueDisplayToken: pending }),
  },
};

export const LoadFailed: Story = {
  args: {
    client: storyClient<ControlApiClient>({
      issueDisplayToken: async () => {
        throw new Error('Fixture request failed');
      },
    }),
  },
};
