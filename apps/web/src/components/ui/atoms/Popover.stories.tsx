import type { Meta, StoryObj } from '@storybook/react-vite';
import { Popover } from './Popover.js';

const meta = {
  title: 'Public/Popover',
  component: Popover,
  args: { triggerLabel: 'About GD', children: 'Goal difference' },
  argTypes: {
    triggerLabel: { control: 'text' },
    tone: { control: 'select', options: ['default', 'error'] },
    openOnHover: { control: 'boolean' },
    triggerText: { control: 'text' },
  },
} satisfies Meta<typeof Popover>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

/** A column hint: a mouse opens it on hover, and a click keeps it open. */
export const OpensOnHover: Story = {
  args: { openOnHover: true },
};

/** The whole text of an error that overflows its field's message line. */
export const ErrorTone: Story = {
  args: {
    tone: 'error',
    triggerLabel: 'About Capacity',
    children: 'Cannot be reduced to 1: 10 entrants are already accepted in this tournament.',
  },
};

/** A venue name that opens its public details, on hover or by keyboard and tap. */
export const TextTrigger: Story = {
  args: {
    openOnHover: true,
    triggerText: 'Aldo Cantoni',
    triggerLabel: 'Aldo Cantoni',
    children: 'Av. Central 100 · 2 courts',
  },
};
