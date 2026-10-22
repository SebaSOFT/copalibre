import type { Meta, StoryObj } from '@storybook/react-vite';
import { AnalyticsTemplate } from '../screens/AnalyticsTemplate.js';
import { tournament } from '../screen-story-fixtures.js';

const meta = {
  title: 'Admin/Screens/AnalyticsTemplate',
  component: AnalyticsTemplate,
  args: {
    failed: false,
    loading: false,
    onRetry: () => undefined,
    organizationAlias: 'liga-san-juan',
    staleSince: undefined,
    storage: undefined,
    tournaments: [tournament],
    completionByTournament: {
      [tournament.alias]: {
        totalMatches: 8,
        resolvedMatches: 5,
        liveMatches: 1,
        scheduledMatches: 2,
        finalizedMatches: 5,
        forfeitedMatches: 0,
        stages: [],
      },
    },
  },
} satisfies Meta<typeof AnalyticsTemplate>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loaded: Story = {};
export const WithStorage: Story = {
  args: { storage: { totalBytes: 4_500_000, objectCount: 12 } },
};
export const Loading: Story = { args: { loading: true, tournaments: [] } };
export const Failed: Story = { args: { failed: true, tournaments: [] } };
export const Stale: Story = { args: { staleSince: Date.now() - 60_000 } };
