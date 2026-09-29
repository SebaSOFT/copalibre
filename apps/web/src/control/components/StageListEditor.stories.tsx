import type { Meta, StoryObj } from '@storybook/react-vite';
import { StageListEditor } from './StageListEditor.js';

const meta = {
  title: 'Admin/Screens/StageListEditor',
  component: StageListEditor,
  args: {
    formats: ['round-robin', 'single-elimination'],
    stages: [
      { number: 1, name: 'Grupos', format: 'round-robin', allocation: { mode: 'automatic' } },
      { number: 2, name: 'Playoffs', format: 'single-elimination' },
    ],
    showSeries: true,
    showAllocation: true,
    onChange: () => undefined,
  },
} satisfies Meta<typeof StageListEditor>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Editable: Story = {};

export const ReadOnly: Story = { args: { readOnly: true } };
