import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ClockAction } from '../../lib/match-console.js';
import { consoleProjection } from '../screen-story-fixtures.js';
import {
  AddSegmentField,
  ClockCommands,
  ClockCorrectionForm,
  NoSegmentsLine,
  ReopenSegmentConfirmation,
  RunningSegmentLine,
} from './MatchConsoleClockControls.js';

const labels: Readonly<Record<ClockAction, string>> = {
  'start-match': 'Start match',
  'start-segment': 'Start segment',
  resume: 'Resume',
  pause: 'Pause',
  'end-segment': 'End segment',
  'reopen-segment': 'Reopen segment',
};

const meta = {
  title: 'Admin/Screens/MatchConsoleClockControls',
  component: ClockCommands,
  args: {
    actions: [
      { action: 'pause', primary: true },
      { action: 'end-segment', primary: false },
    ],
    disabled: false,
    label: 'Clock commands',
    labels,
    onAction: () => undefined,
  },
} satisfies Meta<typeof ClockCommands>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Commands: Story = {};

export const NoSegments: StoryObj = {
  render: () => <NoSegmentsLine language="en" projection={consoleProjection} />,
};

export const RunningSegment: StoryObj = {
  render: () => (
    <RunningSegmentLine
      segment={consoleProjection.segments[0]}
      segmentText={(segment) => `Segment ${segment.number}`}
    />
  ),
};

export const ReopenConfirmation: StoryObj = {
  render: () => (
    <ReopenSegmentConfirmation
      labels={{
        cancel: 'Cancel',
        confirm: 'Reopen',
        dismiss: 'Dismiss',
        reason: 'Reason',
        question: (segment) => `Reopen ${segment}?`,
      }}
      onCancel={() => undefined}
      onConfirm={() => undefined}
      onReason={() => undefined}
      reason=""
      segment={consoleProjection.segments[0]}
      segmentText={(segment) => `Segment ${segment.number}`}
      visible
    />
  ),
};

export const ClockCorrection: StoryObj = {
  render: () => (
    <ClockCorrectionForm
      canCorrect
      disabled={false}
      labels={{ button: 'Correct', field: 'Clock time' }}
      onChange={() => undefined}
      onCorrect={() => undefined}
      value="12:30"
      visible
    />
  ),
};

export const AddSegment: StoryObj = {
  render: () => (
    <AddSegmentField
      disabled={false}
      labels={{ button: 'Add segment', field: 'Segment type', placeholder: 'Select' }}
      onAdd={() => undefined}
      options={[{ value: 'half', label: 'Half' }]}
      visible
    />
  ),
};
