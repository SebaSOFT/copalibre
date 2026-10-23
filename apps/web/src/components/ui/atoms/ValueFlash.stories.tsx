import type { Meta, StoryObj } from '@storybook/react';
import { ValueFlash } from './ValueFlash.js';

const meta = {
  title: 'Public/Atoms/ValueFlash',
  component: ValueFlash,
  args: {
    className: 'cl-tabular-nums',
    value: 3,
  },
} satisfies Meta<typeof ValueFlash>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Score: Story = {};
