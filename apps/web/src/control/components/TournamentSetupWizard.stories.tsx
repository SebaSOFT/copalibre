import type { Meta, StoryObj } from '@storybook/react-vite';
import { TournamentSetupWizard } from './TournamentSetupWizard.js';
import { discipline } from './screen-story-fixtures.js';
const meta = {
  title: 'Admin/Screens/TournamentSetupWizard',
  component: TournamentSetupWizard,
  args: { disciplines: [discipline] },
} satisfies Meta<typeof TournamentSetupWizard>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loaded: Story = {};
export const Empty: Story = { args: { disciplines: [] } };
