import type { Meta, StoryObj } from '@storybook/react-vite';
import { TournamentHubTemplate } from './TournamentHubTemplate.js';
import { ORG, TOURNAMENT, ids } from '../screen-story-fixtures.js';

const meta = {
  title: 'Admin/Screens/TournamentHubTemplate',
  component: TournamentHubTemplate,
  args: {
    organizationAlias: ORG,
    tournamentAlias: TOURNAMENT,
    stages: [
      {
        stageId: ids.stage,
        seasonId: ids.first,
        number: 1,
        name: 'Fase de grupos',
        format: 'round-robin',
        seeded: true,
      },
      {
        stageId: ids.match,
        seasonId: ids.first,
        number: 2,
        name: 'Playoffs',
        format: 'single-elimination',
        seeded: false,
      },
    ],
  },
} satisfies Meta<typeof TournamentHubTemplate>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loaded: Story = {};
export const Empty: Story = { args: { stages: [] } };
