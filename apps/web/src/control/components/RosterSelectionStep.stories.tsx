import type { Meta, StoryObj } from '@storybook/react-vite';
import { RosterSelectionStep } from './RosterSelectionStep.js';
import type { MatchConsoleApiClient } from '../lib/api-client.js';
import {
  ORG,
  TOURNAMENT,
  ids,
  consoleProjection,
  storyClient,
  pending,
} from './screen-story-fixtures.js';
const api = storyClient<MatchConsoleApiClient>({
  fetchRosterCandidates: async () => [{ personId: ids.person, name: 'V. Kael' }],
  setMatchRoster: async () => consoleProjection,
});
const meta = {
  title: 'Admin/Screens/RosterSelectionStep',
  component: RosterSelectionStep,
  args: {
    entrants: consoleProjection.entrants,
    rosterRoles: [],
    existingRosters: consoleProjection.rosters,
    organizationAlias: ORG,
    tournamentAlias: TOURNAMENT,
    matchId: ids.match,
    api,
    onSaved: () => undefined,
  },
} satisfies Meta<typeof RosterSelectionStep>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loaded: Story = {};
export const Empty: Story = {
  args: { api: storyClient<MatchConsoleApiClient>({ fetchRosterCandidates: async () => [] }) },
};
export const Loading: Story = {
  args: { api: storyClient<MatchConsoleApiClient>({ fetchRosterCandidates: () => pending() }) },
};
export const Failed: Story = {
  args: {
    api: storyClient<MatchConsoleApiClient>({
      fetchRosterCandidates: async () => {
        throw new Error('Fixture request failed');
      },
    }),
  },
};
