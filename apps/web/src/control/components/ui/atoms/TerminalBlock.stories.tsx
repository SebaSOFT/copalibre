import type { Meta, StoryObj } from '@storybook/react-vite';
import { TerminalBlock } from './TerminalBlock.js';

const meta = {
  title: 'Admin/Atoms/TerminalBlock',
  component: TerminalBlock,
  argTypes: {
    title: { control: 'text' },
    command: { control: 'text' },
    code: { control: 'text' },
  },
} satisfies Meta<typeof TerminalBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: {
    title: 'install.sh',
    command: 'copalibre module install football-11v11',
  },
};

export const MultiLineYaml: Story = {
  args: {
    title: 'discipline.yaml',
    code: `discipline: football-11v11
periods: 2
period_duration: 45m
points_for_win: 3
points_for_draw: 1`,
    language: 'yaml',
  },
};
