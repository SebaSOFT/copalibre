import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { StringListInput } from './string-list-input.js';

const meta = {
  title: 'Admin/Atoms/StringListInput',
  component: StringListInput,
  args: {
    items: [],
    onAdd: () => undefined,
    onRemove: () => undefined,
    addLabel: 'Add',
    removeLabel: 'Remove',
  },
} satisfies Meta<typeof StringListInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: function Render(args) {
    const [items, setItems] = useState<readonly string[]>(['goals-against']);
    return (
      <StringListInput
        {...args}
        items={items}
        onAdd={(item) => setItems((current) => [...current, item])}
        onRemove={(index) => setItems((current) => current.filter((_entry, i) => i !== index))}
      />
    );
  },
};

export const Empty: Story = { args: { items: [] } };
