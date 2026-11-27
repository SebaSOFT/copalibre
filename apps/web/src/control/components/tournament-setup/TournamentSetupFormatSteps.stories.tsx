import type { Meta, StoryObj } from '@storybook/react-vite';
import { TournamentSetupWizard } from '../TournamentSetupWizard.js';
import {
  disciplineWithDoubleElimination,
  disciplineWithRulesetFields,
} from './tournament-setup-story-fixtures.js';

const meta = {
  title: 'Admin/Screens/Tournament setup steps/Format',
  component: TournamentSetupWizard,
  args: { disciplines: [disciplineWithDoubleElimination] },
} satisfies Meta<typeof TournamentSetupWizard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Format: Story = {
  args: {
    initialState: {
      step: 'format',
      stages: [{ number: 1, name: 'Elimination Stage', format: 'single-elimination' }],
    },
  },
};

export const Ruleset: Story = {
  args: {
    disciplines: [disciplineWithRulesetFields],
    initialState: { step: 'ruleset' },
  },
};

export const Window: Story = { args: { initialState: { step: 'window' } } };
