import type { Meta, StoryObj } from '@storybook/react-vite';
import { useIntl } from 'react-intl';
import { Label } from './label.js';
import { Input } from './input.js';
import { storyText } from '../story-text.js';

const meta = {
  title: 'Admin/Atoms/Label',
  component: Label,
} satisfies Meta<typeof Label>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * A label's whole job is pointing at a control, so it is shown bound to one:
 * clicking the text must focus the input, which is what `htmlFor` buys.
 */
export const BoundToAControl: Story = {
  render: function Render() {
    const intl = useIntl();
    return (
      <span style={{ display: 'grid', gap: 'var(--cl-space-2)', maxWidth: '320px' }}>
        <Label htmlFor="story-label-input">{intl.formatMessage(storyText.settingsTitle)}</Label>
        <Input id="story-label-input" />
      </span>
    );
  },
};

/** A long translated label is where a form's column width gets decided. */
export const LongLabel: Story = {
  render: function Render() {
    const intl = useIntl();
    return (
      <span style={{ display: 'grid', gap: 'var(--cl-space-2)', maxWidth: '320px' }}>
        <Label htmlFor="story-label-long">{intl.formatMessage(storyText.savePromotionPlan)}</Label>
        <Input id="story-label-long" />
      </span>
    );
  },
};
