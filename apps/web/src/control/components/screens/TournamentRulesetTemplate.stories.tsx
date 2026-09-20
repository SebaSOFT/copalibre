import type { Meta, StoryObj } from '@storybook/react-vite';
import { TournamentRulesetTemplate } from '../screens/TournamentRulesetTemplate.js';
import { ORG, TOURNAMENT } from '../screen-story-fixtures.js';

const meta = {
  title: 'Admin/Screens/TournamentRulesetTemplate',
  component: TournamentRulesetTemplate,
  args: {
    organizationAlias: ORG,
    tournamentAlias: TOURNAMENT,
    overrides: { 'scoring.pointsPerWin': 3 },
    fieldPolicies: {
      'scoring.pointsPerWin': {
        permission: { kind: 'replaced' },
        mutationClass: 'blocked_after_results',
        label: 'Points per win',
      },
      'scoring.pointsPerDraw': {
        permission: { kind: 'replaced' },
        mutationClass: 'blocked_after_results',
      },
    },
    disciplineDefaults: { scoring: { pointsPerWin: 2, pointsPerDraw: 1 } },
    onPreview: async () => [],
    onSave: async () => undefined,
  },
} satisfies Meta<typeof TournamentRulesetTemplate>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loaded: Story = {};
export const Empty: Story = { args: { overrides: {} } };
export const NoDisciplineContext: Story = {
  args: { fieldPolicies: undefined, disciplineDefaults: undefined },
};
