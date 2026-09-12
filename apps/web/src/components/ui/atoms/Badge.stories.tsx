import type { Meta, StoryObj } from '@storybook/react-vite';
import { Badge } from './Badge.js';

const meta = {
  title: 'Public/Badge',
  component: Badge,
  args: { children: 'Live' },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const LiveVariant: Story = {
  args: { className: 'cl-badge--live', children: 'Live' },
};

export const FinalVariant: Story = {
  args: { className: 'cl-badge--final', children: 'Final' },
};

/** `TournamentHero.astro`'s live-count line renders as a `<p>`, not a `<span>`. */
export const AsParagraph: Story = {
  args: { as: 'p', children: '2 live now' },
};

/** `ResultLegend.astro`'s badges wrap an icon and a label together. */
export const WithIcon: Story = {
  render: () => (
    <Badge>
      <span aria-hidden="true">●</span>
      <span>Live</span>
    </Badge>
  ),
};
