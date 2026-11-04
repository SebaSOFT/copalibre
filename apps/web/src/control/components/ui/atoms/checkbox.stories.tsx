import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useIntl } from 'react-intl';
import { Checkbox } from './checkbox.js';
import { Label } from './label.js';
import { StoryMatrix } from '../story-matrix.js';
import { storyText } from '../story-text.js';

const meta = {
  title: 'Admin/Atoms/Checkbox',
  component: Checkbox,
  args: { checked: false, onCheckedChange: () => undefined },
  argTypes: { checked: { control: 'boolean' }, disabled: { control: 'boolean' } },
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Controlled by the atom's contract, so the story holds the state itself. */
export const Playground: Story = {
  args: { checked: true, disabled: false },
  render: function Render(args) {
    const [checked, setChecked] = useState(args.checked);
    const intl = useIntl();
    return (
      <span style={{ alignItems: 'center', display: 'inline-flex', gap: 'var(--cl-space-2)' }}>
        <Checkbox {...args} checked={checked} id="story-checkbox" onCheckedChange={setChecked} />
        <Label htmlFor="story-checkbox">{intl.formatMessage(storyText.tournaments)}</Label>
      </span>
    );
  },
};

/** The four states a checkbox has, which no single control view shows together. */
export const Matrix: Story = {
  args: { checked: false },
  render: function Render() {
    const noop = () => undefined;
    return (
      <StoryMatrix
        minColumn="140px"
        cells={[
          { label: 'unchecked', children: <Checkbox checked={false} onCheckedChange={noop} /> },
          { label: 'checked', children: <Checkbox checked onCheckedChange={noop} /> },
          {
            label: 'disabled',
            children: <Checkbox checked={false} disabled onCheckedChange={noop} />,
          },
          {
            label: 'disabled · checked',
            children: <Checkbox checked disabled onCheckedChange={noop} />,
          },
        ]}
      />
    );
  },
};

/** The ring follows the visible box, not the 44px target around it. */
export const Focused: Story = {
  args: { checked: false },
  render: function Render(args) {
    const intl = useIntl();
    return <Checkbox {...args} aria-label={intl.formatMessage(storyText.tournaments)} />;
  },
  play: ({ canvasElement }) => {
    canvasElement.querySelector<HTMLElement>('[role="checkbox"]')?.focus();
  },
};

/** Beside a label the box lines up with the column and the target overhangs it. */
export const BesideALabel: Story = {
  args: { checked: true },
  render: function Render(args) {
    const [checked, setChecked] = useState(args.checked);
    const intl = useIntl();
    return (
      <div style={{ borderInlineStart: '1px solid var(--cl-state-live)' }}>
        <Label className="cl-toggle" htmlFor="story-checkbox-row">
          <Checkbox
            {...args}
            checked={checked}
            id="story-checkbox-row"
            onCheckedChange={setChecked}
          />
          <span>{intl.formatMessage(storyText.tournaments)}</span>
        </Label>
      </div>
    );
  },
};
