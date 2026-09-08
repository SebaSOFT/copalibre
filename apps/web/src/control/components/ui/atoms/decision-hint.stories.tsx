import type { Meta, StoryObj } from '@storybook/react-vite';
import { useIntl } from 'react-intl';
import { DecisionHint } from './decision-hint.js';
import { Input } from './input.js';
import { Label } from './label.js';
import { storyText } from '../story-text.js';

const meta = {
  title: 'Admin/Atoms/DecisionHint',
  component: DecisionHint,
  argTypes: { id: { control: 'text' }, text: { control: 'text' } },
} satisfies Meta<typeof DecisionHint>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Wired the way the atom is meant to be used: the hint's `id` is the control's
 * `aria-describedby`, so the explanation reaches the accessible description
 * and not only the visible page.
 */
export const DescribingAControl: Story = {
  args: { id: 'story-hint' },
  render: function Render(args) {
    const intl = useIntl();
    return (
      <span style={{ display: 'grid', gap: 'var(--cl-space-2)', maxWidth: '360px' }}>
        <Label htmlFor="story-hint-input">{intl.formatMessage(storyText.settingsTitle)}</Label>
        <Input aria-describedby={args.id} id="story-hint-input" />
        <DecisionHint {...args} text={args.text ?? intl.formatMessage(storyText.saved)} />
      </span>
    );
  },
};

/**
 * With no text the atom renders `null`, so a field whose declaration carries no
 * description stays byte-identical to one authored before descriptions existed.
 * The empty frame below is the whole of the story: nothing is drawn.
 */
export const NoText: Story = {
  args: { id: 'story-hint-empty', text: undefined },
};

/** Whitespace counts as no text, which is easy to get wrong and easy to miss. */
export const WhitespaceOnly: Story = {
  args: { id: 'story-hint-blank', text: '   ' },
};
