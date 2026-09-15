import type { Meta, StoryObj } from '@storybook/react-vite';
import { MatchConsoleTemplate } from '../screens/MatchConsoleTemplate.js';
import type { MatchConsoleApiClient } from '../../lib/api-client.js';
import {
  ORG,
  TOURNAMENT,
  ids,
  consoleProjection,
  focusableBracket,
  storyClient,
} from '../screen-story-fixtures.js';

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
/** The bracket-context panel, embedded and focused on the open match — `ids.match`. */
export const WithBracketContext: Story = {
  args: { bracketMatches: focusableBracket },
};
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
