import type { Meta, StoryObj } from '@storybook/react-vite';
import { LoadMatchDataTemplate } from '../screens/LoadMatchDataTemplate.js';
import { TOURNAMENT, ids, consoleProjection } from '../screen-story-fixtures.js';

const projection = {
  ...consoleProjection,
  status: 'scheduled' as const,
  liveScores: [],
  segments: [],
  events: [],
  rosters: [],
};

const meta = {
  title: 'Admin/Screens/LoadMatchDataTemplate',
  component: LoadMatchDataTemplate,
  args: {
    candidatesByEntrant: new Map([
      [ids.first, [{ personId: ids.person, name: 'V. Kael' }]],
      [ids.second, []],
    ]),
    matchId: ids.match,
    onSubmit: async () => true,
    projection,
    tournamentAlias: TOURNAMENT,
  },
} satisfies Meta<typeof LoadMatchDataTemplate>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
