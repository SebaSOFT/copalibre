import type { Meta, StoryObj } from '@storybook/react-vite';
import { Card, CardDescription, CardTitle } from './Card.js';

const meta = {
  title: 'Public/Card',
  component: Card,
  args: { children: 'Card content' },
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const AsArticle: Story = {
  args: { as: 'article', children: 'A listing entry composes this as its own root.' },
};

export const AsSection: Story = {
  args: { as: 'section', className: 'cl-card--live', children: "A page's own hero section." },
};

/** `AstroPreview.tsx`'s unavailable-preview state — the only caller needing the title/description pair. */
export const WithTitleAndDescription: Story = {
  render: () => (
    <Card role="status">
      <CardTitle>Preview unavailable</CardTitle>
      <CardDescription>Started the dev server, then reload.</CardDescription>
    </Card>
  ),
};
