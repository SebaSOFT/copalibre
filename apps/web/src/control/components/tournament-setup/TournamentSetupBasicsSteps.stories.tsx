import type { Meta, StoryObj } from '@storybook/react-vite';
import { TournamentSetupWizard } from '../TournamentSetupWizard.js';
import { disciplineWithDoubleElimination } from './tournament-setup-story-fixtures.js';

const meta = {
  title: 'Admin/Screens/Tournament setup steps/Basics',
  component: TournamentSetupWizard,
  args: { disciplines: [disciplineWithDoubleElimination] },
} satisfies Meta<typeof TournamentSetupWizard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Name: Story = { args: { initialState: { step: 'name' } } };
export const PrivacyMinorsUnanswered: Story = { args: { initialState: { step: 'privacy' } } };
export const PrivacyMinorsAnsweredNo: Story = {
  args: { initialState: { step: 'privacy', includesMinors: false } },
};
export const Discipline: Story = { args: { initialState: { step: 'discipline' } } };
