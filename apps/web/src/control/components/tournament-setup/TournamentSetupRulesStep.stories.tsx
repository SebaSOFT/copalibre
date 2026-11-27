import type { Meta, StoryObj } from '@storybook/react-vite';
import { TournamentSetupWizard } from '../TournamentSetupWizard.js';
import { disciplineWithRulesetFields } from './tournament-setup-story-fixtures.js';

const meta = {
  title: 'Admin/Screens/Tournament setup steps/Rules',
  component: TournamentSetupWizard,
  args: { disciplines: [disciplineWithRulesetFields] },
} satisfies Meta<typeof TournamentSetupWizard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Rules: Story = { args: { initialState: { step: 'rules' } } };
