import type { Meta, StoryObj } from '@storybook/react-vite';
import { MatchConsoleTemplate } from '../screens/MatchConsoleTemplate.js';
import type { MatchConsoleApiClient } from '../../lib/api-client.js';
import { ORG, TOURNAMENT, ids, consoleProjection, storyClient } from '../screen-story-fixtures.js';

const client = storyClient<MatchConsoleApiClient>({
  fetchRosterCandidates: async () => [{ personId: ids.person, name: 'V. Kael' }],
});

const meta = {
  title: 'Admin/Screens/MatchConsoleTemplate',
  component: MatchConsoleTemplate,
  args: {
    api: client,
    finalizing: false,
    lastSyncedAt: undefined,
    matchId: ids.match,
    onApplyClock: () => undefined,
    onCancelFinalize: () => undefined,
    onDismissMutation: () => undefined,
    onFinalize: async () => true,
    onIssueClockCommand: () => undefined,
    onRecordEvent: () => undefined,
    onResolveTimer: () => undefined,
    onRosterSaved: () => undefined,
    online: true,
    organizationAlias: ORG,
    pendingMutations: [],
    projection: consoleProjection,
    stale: false,
    status: { kind: 'ready' },
    tournamentAlias: TOURNAMENT,
  },
} satisfies Meta<typeof MatchConsoleTemplate>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loaded: Story = {};
export const Empty: Story = {
  args: {
    projection: {
      ...consoleProjection,
      status: 'scheduled',
      liveScores: [],
      segments: [],
      events: [],
      rosters: [],
    },
  },
};
