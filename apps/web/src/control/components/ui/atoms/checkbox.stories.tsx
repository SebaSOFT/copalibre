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
