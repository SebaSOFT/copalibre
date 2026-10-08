import type { Meta, StoryObj } from '@storybook/react-vite';
import { StageListEditor } from './StageListEditor.js';

const meta = {
  title: 'Admin/Screens/StageListEditor',
  component: StageListEditor,
  args: {
    formats: ['round-robin', 'single-elimination'],
    stages: [
      { number: 1, name: 'Grupos', format: 'round-robin', allocation: { mode: 'automatic' } },
      { number: 2, name: 'Playoffs', format: 'single-elimination' },
    ],
    showSeries: true,
    showAllocation: true,
    onChange: () => undefined,
  },
} satisfies Meta<typeof StageListEditor>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Editable: Story = {};

export const ReadOnly: Story = { args: { readOnly: true } };

export const DoubleEliminationPreview: Story = {
  args: {
    capacity: 8,
    formats: ['double-elimination'],
    showStructurePreview: true,
    stages: [{ number: 1, name: 'Playoffs', format: 'double-elimination' }],
  },
};

export const RoundRobinMatchdays: Story = {
  args: {
    capacity: 12,
    formats: ['round-robin'],
    showStructurePreview: true,
    stages: [{ number: 1, name: 'League', format: 'round-robin' }],
  },
};

export const BalancedGroupsPreview: Story = {
  args: {
    capacity: 18,
    formats: ['round-robin'],
    showStructurePreview: true,
    stages: [
      {
        number: 1,
        name: 'Groups',
        format: 'round-robin',
        groupConfiguration: { groupCount: 4, groupSize: 5, distribution: 'balanced' },
      },
    ],
  },
};

export const ExactSizeGroupsPreview: Story = {
  ...BalancedGroupsPreview,
  args: {
    ...BalancedGroupsPreview.args,
    stages: [
      {
        number: 1,
        name: 'Groups',
        format: 'round-robin',
        groupConfiguration: { groupCount: 4, groupSize: 5, distribution: 'exact-size' },
      },
    ],
  },
};

export const OverflowLastGroupPreview: Story = {
  ...BalancedGroupsPreview,
  args: {
    ...BalancedGroupsPreview.args,
    stages: [
      {
        number: 1,
        name: 'Groups',
        format: 'round-robin',
        groupConfiguration: { groupCount: 4, groupSize: 5, distribution: 'overflow-last' },
      },
    ],
  },
};

export const ManualGroupsPreview: Story = {
  ...BalancedGroupsPreview,
  args: {
    ...BalancedGroupsPreview.args,
    stages: [
      {
        number: 1,
        name: 'Groups',
        format: 'round-robin',
        groupConfiguration: {
          groupCount: 4,
          groupSize: 5,
          distribution: 'manual',
          manualGroupSizes: [4, 5, 5, 4],
        },
      },
    ],
  },
};

export const ZonePlan: Story = {
  args: {
    showZones: true,
    stages: [
      {
        number: 1,
        name: 'Copas',
        format: 'single-elimination',
        zones: [
          { name: 'Copa Oro' },
          { name: 'Copa Plata' },
          { name: 'Liga', format: 'round-robin' },
        ],
      },
    ],
  },
};
