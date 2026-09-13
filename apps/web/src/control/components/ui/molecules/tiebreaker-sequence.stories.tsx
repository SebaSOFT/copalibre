import type { Meta, StoryObj } from '@storybook/react-vite';
import { TiebreakerSequence } from './tiebreaker-sequence.js';

const SAMPLE_RULES = [
  { step: 1, label: 'Total Points', triggered: false },
  { step: 2, label: 'Head-to-Head Goal Diff', triggered: true },
  { step: 3, label: 'Goals For', triggered: false },
  { step: 4, label: 'Disciplinary Record', triggered: false },
];

const meta = {
  title: 'Admin/Molecules/TiebreakerSequence',
  component: TiebreakerSequence,
} satisfies Meta<typeof TiebreakerSequence>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: {
    title: 'Standings Tiebreaker Chain',
    rules: SAMPLE_RULES,
  },
};

export const FirstStepDecisive: Story = {
  args: {
    rules: [
      { step: 1, label: 'Total Points', triggered: true },
      { step: 2, label: 'Goal Difference', triggered: false },
      { step: 3, label: 'Total Wins', triggered: false },
    ],
  },
};
