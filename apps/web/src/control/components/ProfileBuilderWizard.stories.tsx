import type { Meta, StoryObj } from '@storybook/react-vite';
import { discipline } from './screen-story-fixtures.js';
import { ProfileBuilderWizard } from './ProfileBuilderWizard.js';

const meta = {
  title: 'Admin/Screens/ProfileBuilderWizard',
  component: ProfileBuilderWizard,
  args: { disciplines: [discipline], onSubmit: () => undefined },
} satisfies Meta<typeof ProfileBuilderWizard>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loaded: Story = {};
export const Busy: Story = { args: { busy: true } };
