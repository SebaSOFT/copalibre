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
export const ManyTournaments: Story = {
  args: {
    tournaments: Array.from({ length: 12 }, (_, index) => ({
      ...tournament,
      tournamentId: `019927d0-0000-7000-8000-0000000001${String(index).padStart(2, '0')}`,
      alias: `${tournament.alias}-${index}`,
      name: `${tournament.name} ${index + 1}`,
    })),
  },
};
export const Loading: Story = { args: { loading: true, tournaments: [] } };
export const Failed: Story = { args: { failed: true, tournaments: [] } };
export const Stale: Story = { args: { staleSince: Date.now() - 60_000 } };
