import type { Meta, StoryObj } from '@storybook/react-vite';
import { TournamentRulesetPage } from './TournamentRulesetPage.js';
import { ORG, TOURNAMENT } from './screen-story-fixtures.js';

const meta = {
  title: 'Admin/Screens/TournamentRulesetPage',
  component: TournamentRulesetPage,
  args: {
    organizationAlias: ORG,
    tournamentAlias: TOURNAMENT,
    overrides: { 'scoring.pointsPerWin': 3 },
    onPreview: async () => [],
    onSave: async () => undefined,
  },
} satisfies Meta<typeof TournamentRulesetPage>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loaded: Story = {};
export const Empty: Story = { args: { overrides: {} } };
