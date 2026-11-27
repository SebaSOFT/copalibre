import type { Meta, StoryObj } from '@storybook/react-vite';
import { RatioBar } from './ratio-bar.js';

const meta = {
  title: 'Admin/Atoms/RatioBar',
  component: RatioBar,
  args: { label: 'Matches resolved', value: 4, max: 10, valueLabel: '4 / 10 matches' },
} satisfies Meta<typeof RatioBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Partial: Story = {};
export const Empty: Story = { args: { value: 0, valueLabel: '0 / 10 matches' } };
export const Complete: Story = { args: { value: 10, valueLabel: '10 / 10 matches' } };
