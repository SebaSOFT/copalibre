import type { Meta, StoryObj } from '@storybook/react-vite';
import { CompletionFigure } from './CompletionFigure.tsx';

/**
 * The public tournament completion summary.
 *
 * Covers partially complete, fully complete, and zero-match unmeasured states
 * as well as multi-stage breakdowns.
 */
const meta = {
  title: 'Public/Molecules/CompletionFigure',
  component: CompletionFigure,
} satisfies Meta<typeof CompletionFigure>;

export default meta;
type Story = StoryObj<typeof meta>;

const SAMPLE_STAGES = [
  {
    stageId: '01936f4a-0001-7000-8000-000000000001',
    stageNumber: 1,
    stageName: 'Group Stage',
    totalMatches: 24,
    resolvedMatches: 18,
  },
  {
    stageId: '01936f4a-0001-7000-8000-000000000002',
    stageNumber: 2,
    stageName: 'Championship Bracket',
    totalMatches: 8,
    resolvedMatches: 0,
  },
];

export const Playground: Story = {
  args: {
    totalMatches: 32,
    resolvedMatches: 18,
    stages: SAMPLE_STAGES,
    labels: {
      heading: 'Tournament Progress',
      summary: '18 of 32 matches played',
      stateLabel: 'In progress',
      stateGlyph: '◐',
      unmeasuredLabel: 'No matches scheduled',
    },
  },
};

export const PartiallyComplete: Story = {
  args: {
    totalMatches: 32,
    resolvedMatches: 18,
    stages: SAMPLE_STAGES,
    labels: {
      heading: 'Tournament Progress',
      summary: '18 of 32 matches played',
      stateLabel: 'In progress',
      stateGlyph: '◐',
      unmeasuredLabel: 'No matches scheduled',
    },
  },
};

export const FullyComplete: Story = {
  args: {
    totalMatches: 32,
    resolvedMatches: 32,
    stages: [
      {
        stageId: '01936f4a-0001-7000-8000-000000000001',
        stageNumber: 1,
        stageName: 'Group Stage',
        totalMatches: 24,
        resolvedMatches: 24,
      },
      {
        stageId: '01936f4a-0001-7000-8000-000000000002',
        stageNumber: 2,
        stageName: 'Championship Bracket',
        totalMatches: 8,
        resolvedMatches: 8,
      },
    ],
    labels: {
      heading: 'Tournament Progress',
      summary: '32 of 32 matches played',
      stateLabel: 'Complete',
      stateGlyph: '✓',
      unmeasuredLabel: 'No matches scheduled',
    },
  },
};

export const ZeroMatchUnmeasured: Story = {
  args: {
    totalMatches: 0,
    resolvedMatches: 0,
    stages: [],
    labels: {
      heading: 'Tournament Progress',
      summary: '0 of 0 matches played',
      stateLabel: 'No matches scheduled',
      stateGlyph: '—',
      unmeasuredLabel: 'No matches scheduled',
    },
  },
};

export const MultiStageBreakdown: Story = {
  args: {
    totalMatches: 48,
    resolvedMatches: 36,
    stages: [
      {
        stageId: '01936f4a-0001-7000-8000-000000000001',
        stageNumber: 1,
        stageName: 'Group Stage A',
        totalMatches: 20,
        resolvedMatches: 20,
      },
      {
        stageId: '01936f4a-0001-7000-8000-000000000002',
        stageNumber: 2,
        stageName: 'Group Stage B',
        totalMatches: 20,
        resolvedMatches: 16,
      },
      {
        stageId: '01936f4a-0001-7000-8000-000000000003',
        stageNumber: 3,
        stageName: 'Finals',
        totalMatches: 8,
        resolvedMatches: 0,
      },
    ],
    labels: {
      heading: 'Tournament Progress',
      summary: '36 of 48 matches played',
      stateLabel: 'In progress',
      stateGlyph: '◐',
      unmeasuredLabel: 'No matches scheduled',
    },
  },
};
