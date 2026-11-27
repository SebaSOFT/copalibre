import type { Meta, StoryObj } from '@storybook/react-vite';
import { TournamentSetupWizard } from '../TournamentSetupWizard.js';
import { disciplineWithDoubleElimination } from './tournament-setup-story-fixtures.js';

const meta = {
  title: 'Admin/Screens/Tournament setup steps/Summary',
  component: TournamentSetupWizard,
  args: { disciplines: [disciplineWithDoubleElimination] },
} satisfies Meta<typeof TournamentSetupWizard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Summary: Story = { args: { initialState: { step: 'summary' } } };
