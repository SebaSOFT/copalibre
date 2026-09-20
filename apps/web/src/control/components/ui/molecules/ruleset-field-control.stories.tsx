import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { RulesetFieldControl } from './ruleset-field-control.js';
import type { FieldPolicy } from '@copalibre/domain';

const REPLACED_BOOLEAN: FieldPolicy = {
  permission: { kind: 'replaced' },
  mutationClass: 'safe',
  label: 'Neutral ground required',
};
const REPLACED_NUMBER: FieldPolicy = {
  permission: { kind: 'replaced' },
  mutationClass: 'blocked_after_results',
  label: 'Points per win',
};
const REPLACED_FORMAT: FieldPolicy = { permission: { kind: 'replaced' }, mutationClass: 'safe' };
const UNION_LIST: FieldPolicy = {
  permission: { kind: 'merged', strategy: 'union-list' },
  mutationClass: 'requires_rebuild',
  label: 'Tiebreakers',
};
const SHALLOW_OBJECT: FieldPolicy = {
  permission: { kind: 'merged', strategy: 'shallow-object' },
  mutationClass: 'requires_rebuild',
  label: 'Segments',
};

const meta = {
  title: 'Admin/Molecules/RulesetFieldControl',
  component: RulesetFieldControl,
  args: {
    id: 'story-ruleset-field',
    dotPath: 'venuePolicy.neutralGround',
    label: 'Neutral ground required',
    policy: REPLACED_BOOLEAN,
    overrideValue: undefined,
    disciplineDefaultValue: false,
    availableFormats: ['single-elimination', 'round-robin'],
    onChange: () => undefined,
    addLabel: 'Add',
    removeLabel: 'Remove',
    inheritedHeading: 'Already includes:',
    unrecognizedText: 'Not governed by a known rule policy — edited as raw JSON.',
    unknownTypeText: "This field's value type is unknown — edited as raw JSON.",
  },
} satisfies Meta<typeof RulesetFieldControl>;

export default meta;
type Story = StoryObj<typeof meta>;

function Controlled(args: React.ComponentProps<typeof RulesetFieldControl>) {
  const [value, setValue] = useState(args.overrideValue);
  return <RulesetFieldControl {...args} onChange={setValue} overrideValue={value} />;
}

export const Boolean_: Story = {
  name: 'Boolean (checkbox)',
  render: (args) => <Controlled {...args} />,
};

export const Number_: Story = {
  name: 'Number',
  args: {
    dotPath: 'scoring.pointsPerWin',
    label: 'Points per win',
    policy: REPLACED_NUMBER,
    disciplineDefaultValue: 2,
    overrideValue: 3,
  },
  render: (args) => <Controlled {...args} />,
};

export const FormatSelect: Story = {
  name: 'Format select',
  args: {
    dotPath: 'format',
    label: 'Format',
    policy: REPLACED_FORMAT,
    disciplineDefaultValue: undefined,
    overrideValue: 'round-robin',
  },
  render: (args) => <Controlled {...args} />,
};

export const AddToList: Story = {
  name: 'Union-list (add to inherited)',
  args: {
    dotPath: 'tiebreakers',
    label: 'Tiebreakers',
    policy: UNION_LIST,
    disciplineDefaultValue: ['points', 'score-difference', 'goals-for'],
    overrideValue: ['goals-against'],
  },
  render: (args) => <Controlled {...args} />,
};

export const PatchObject: Story = {
  name: 'Shallow-object (per-subkey patch)',
  args: {
    dotPath: 'segments',
    label: 'Segments',
    policy: SHALLOW_OBJECT,
    disciplineDefaultValue: { regulationCount: 2, overtimeEnabled: false },
    overrideValue: { overtimeEnabled: true },
  },
  render: (args) => <Controlled {...args} />,
};

export const UnrecognizedField: Story = {
  name: 'Undeclared field (raw JSON)',
  args: {
    dotPath: 'legacyField',
    label: 'legacyField',
    policy: undefined,
    disciplineDefaultValue: undefined,
    overrideValue: { anything: 'goes' },
  },
  render: (args) => <Controlled {...args} />,
};
