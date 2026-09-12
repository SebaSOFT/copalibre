import type { Meta, StoryObj } from '@storybook/react-vite';
import { CalloutBanner } from './callout-banner.js';

const meta = {
  title: 'Admin/Molecules/CalloutBanner',
  component: CalloutBanner,
  argTypes: {
    title: { control: 'text' },
    description: { control: 'text' },
    actionLabel: { control: 'text' },
  },
} satisfies Meta<typeof CalloutBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: {
    title: 'Match Result Correction Window Active',
    description: 'Score protests and tiebreaker adjustments may be recorded until 23:59 UTC.',
    actionLabel: 'Review Results',
    onAction: () => console.log('Action triggered'),
  },
};

export const NavigationLink: Story = {
  args: {
    title: 'Discipline Catalogue Update',
    description:
      'A new version of the 3x3 Basketball ruleset descriptor is available for deployment.',
    actionLabel: 'Open Catalogue',
    actionHref: '#',
  },
};
