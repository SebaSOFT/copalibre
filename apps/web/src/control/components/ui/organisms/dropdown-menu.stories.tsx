import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useIntl } from 'react-intl';
import { DropdownMenu } from './dropdown-menu.js';
import { Button } from '../atoms/button.js';
import { storyText } from '../story-text.js';

const meta = {
  title: 'Admin/Organisms/DropdownMenu',
  component: DropdownMenu,
  args: { trigger: null, items: [] },
  argTypes: { align: { control: 'inline-radio', options: ['start', 'end'] } },
  parameters: {
    // The menu portals to the body and needs room to open below its trigger.
    layout: 'padded',
  },
} satisfies Meta<typeof DropdownMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: { align: 'start' },
  render: function Render(args) {
    const intl = useIntl();
    return (
      <DropdownMenu
        {...args}
        items={[
          { id: 'save', label: intl.formatMessage(storyText.save), onSelect: () => undefined },
          {
            id: 'settings',
            label: intl.formatMessage(storyText.settingsTitle),
            onSelect: () => undefined,
          },
        ]}
        trigger={<Button variant="secondary">{intl.formatMessage(storyText.tournaments)}</Button>}
      />
    );
  },
};

/**
 * Held open through the controlled `open` prop, so the surface can be reviewed
 * without driving Radix through a pointer — the reason the prop exists.
 * Covers every item variant at once: default, destructive, and disabled.
 */
export const OpenWithEveryItemVariant: Story = {
  args: { align: 'start' },
  render: function Render(args) {
    const intl = useIntl();
    const [open, setOpen] = useState(true);
    return (
      <DropdownMenu
        {...args}
        items={[
          { id: 'save', label: intl.formatMessage(storyText.save), onSelect: () => undefined },
          {
            id: 'long',
            label: intl.formatMessage(storyText.savePromotionPlan),
            onSelect: () => undefined,
          },
          {
            id: 'disabled',
            label: intl.formatMessage(storyText.settingsTitle),
            onSelect: () => undefined,
            disabled: true,
          },
          {
            id: 'destructive',
            label: intl.formatMessage(storyText.cancel),
            onSelect: () => undefined,
            variant: 'destructive',
          },
        ]}
        onOpenChange={setOpen}
        open={open}
        trigger={<Button variant="secondary">{intl.formatMessage(storyText.tournaments)}</Button>}
      />
    );
  },
};

/** Right-aligned, which is how a card footer's action menu opens. */
export const AlignedToEnd: Story = {
  args: { align: 'end' },
  render: function Render(args) {
    const intl = useIntl();
    const [open, setOpen] = useState(true);
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <DropdownMenu
          {...args}
          items={[
            { id: 'save', label: intl.formatMessage(storyText.save), onSelect: () => undefined },
            {
              id: 'cancel',
              label: intl.formatMessage(storyText.cancel),
              onSelect: () => undefined,
            },
          ]}
          onOpenChange={setOpen}
          open={open}
          trigger={<Button variant="secondary">⋯</Button>}
        />
      </div>
    );
  },
};
