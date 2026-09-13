import type { Meta, StoryObj } from '@storybook/react-vite';
import { DescriptorBuilderWizard } from './DescriptorBuilderWizard.js';

const meta = {
  title: 'Admin/Screens/DescriptorBuilderWizard',
  component: DescriptorBuilderWizard,
  args: { onSubmit: () => undefined },
} satisfies Meta<typeof DescriptorBuilderWizard>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loaded: Story = {};
export const Busy: Story = { args: { busy: true } };
