import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { RadioGroup, RadioGroupItem } from './radio.js';
import { Label } from './label.js';
import { StoryMatrix } from '../story-matrix.js';

const meta = {
  title: 'Admin/Atoms/Radio',
  component: RadioGroup,
  args: {
    children: null,
  },
} satisfies Meta<typeof RadioGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: function Render() {
    const [value, setValue] = useState('first');
    return (
      <RadioGroup value={value} onValueChange={setValue}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--cl-space-2)' }}>
          <RadioGroupItem value="first" id="radio-opt-1" />
          <Label htmlFor="radio-opt-1">First option</Label>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--cl-space-2)' }}>
          <RadioGroupItem value="second" id="radio-opt-2" />
          <Label htmlFor="radio-opt-2">Second option</Label>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--cl-space-2)' }}>
          <RadioGroupItem value="third" id="radio-opt-3" disabled />
          <Label htmlFor="radio-opt-3">Disabled option</Label>
        </div>
      </RadioGroup>
    );
  },
};

export const Matrix: Story = {
  render: function Render() {
    return (
      <StoryMatrix
        minColumn="160px"
        cells={[
          {
            label: 'unselected',
            children: (
              <RadioGroup value="other">
                <RadioGroupItem value="target" id="matrix-1" />
              </RadioGroup>
            ),
          },
          {
            label: 'selected',
            children: (
              <RadioGroup value="target">
                <RadioGroupItem value="target" id="matrix-2" />
              </RadioGroup>
            ),
          },
          {
            label: 'disabled · unselected',
            children: (
              <RadioGroup value="other" disabled>
                <RadioGroupItem value="target" id="matrix-3" disabled />
              </RadioGroup>
            ),
          },
          {
            label: 'disabled · selected',
            children: (
              <RadioGroup value="target" disabled>
                <RadioGroupItem value="target" id="matrix-4" disabled />
              </RadioGroup>
            ),
          },
        ]}
      />
    );
  },
};
