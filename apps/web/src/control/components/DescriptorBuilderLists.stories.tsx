import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  EventDefinitionList,
  ScoringInputList,
  SegmentTypeList,
  StatisticList,
} from './DescriptorBuilderLists.js';
import type {
  EventDefinitionDraft,
  ScoringInputDraft,
  SegmentTypeDraft,
  StatisticDraft,
} from '../lib/descriptor-authoring.js';

const segments: readonly SegmentTypeDraft[] = [
  { name: 'period', label: 'Period', timed: true, defaultDurationSeconds: 2700 },
  { name: 'shootout', label: 'Shootout', timed: false },
];

const statistics: readonly StatisticDraft[] = [
  { code: 'goals', label: 'Goals', aggregation: 'sum' },
  { code: 'cards', label: 'Cards', aggregation: 'count' },
];

const events: readonly EventDefinitionDraft[] = [
  {
    code: 'goal',
    label: 'Goal',
    category: 'positive',
    actorRequirement: 'person',
    permittedSegmentTypes: ['period'],
    awardsStatisticCode: 'goals',
    awardsDelta: 1,
  },
];

const scoringInputs: readonly ScoringInputDraft[] = [
  { code: 'goal-difference', label: 'Goal difference', source: 'event-derived' },
  { code: 'manual-bonus', label: 'Manual bonus', source: 'operator-entered' },
];

const noop = () => undefined;

const meta = {
  title: 'Admin/Screens/Descriptor builder lists',
  component: SegmentTypeList,
  args: { segments, onAdd: noop, onRemove: noop },
} satisfies Meta<typeof SegmentTypeList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SegmentTypes: Story = {};
export const SegmentTypesEmpty: Story = { args: { segments: [] } };

export const Statistics: Story = {
  render: () => <StatisticList statistics={statistics} onAdd={noop} onRemove={noop} />,
};
export const StatisticsEmpty: Story = {
  render: () => <StatisticList statistics={[]} onAdd={noop} onRemove={noop} />,
};

export const EventDefinitions: Story = {
  render: () => (
    <EventDefinitionList
      events={events}
      statistics={statistics}
      segmentTypes={segments}
      onAdd={noop}
      onRemove={noop}
    />
  ),
};
export const EventDefinitionsEmpty: Story = {
  render: () => (
    <EventDefinitionList
      events={[]}
      statistics={statistics}
      segmentTypes={segments}
      onAdd={noop}
      onRemove={noop}
    />
  ),
};

export const ScoringInputs: Story = {
  render: () => <ScoringInputList inputs={scoringInputs} onAdd={noop} onRemove={noop} />,
};
export const ScoringInputsEmpty: Story = {
  render: () => <ScoringInputList inputs={[]} onAdd={noop} onRemove={noop} />,
};
