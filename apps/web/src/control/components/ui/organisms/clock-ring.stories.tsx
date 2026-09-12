import type { Meta, StoryObj } from '@storybook/react-vite';
import { ClockRing } from './clock-ring.js';
import { StoryMatrix } from '../story-matrix.js';

const meta = {
  title: 'Admin/Organisms/ClockRing',
  component: ClockRing,
  argTypes: {
    elapsedSeconds: { control: { type: 'number', min: 0 } },
    durationSeconds: { control: { type: 'number', min: 0 } },
  },
} satisfies Meta<typeof ClockRing>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: { elapsedSeconds: 1350, durationSeconds: 2700 },
};

/**
 * The gauge's whole range, plus the two cases its arithmetic guards: no
 * duration at all (an untimed discipline) and elapsed beyond duration, which
 * clamps at a full ring rather than overdrawing it.
 *
 * `ClockRing` calls `useIntl()` itself for its accessible name, so it follows
 * the language selector without the story passing anything.
 */
export const Matrix: Story = {
  args: { elapsedSeconds: 0, durationSeconds: 2700 },
  render: function Render() {
    return (
      <StoryMatrix
        minColumn="120px"
        cells={[
          {
            label: 'not started',
            children: <ClockRing durationSeconds={2700} elapsedSeconds={0} />,
          },
          { label: 'quarter', children: <ClockRing durationSeconds={2700} elapsedSeconds={675} /> },
          { label: 'half', children: <ClockRing durationSeconds={2700} elapsedSeconds={1350} /> },
          {
            label: 'complete',
            children: <ClockRing durationSeconds={2700} elapsedSeconds={2700} />,
          },
          {
            label: 'past duration',
            children: <ClockRing durationSeconds={2700} elapsedSeconds={3200} />,
          },
          {
            label: 'no duration',
            children: <ClockRing durationSeconds={undefined} elapsedSeconds={1350} />,
          },
          {
            label: 'zero duration',
            children: <ClockRing durationSeconds={0} elapsedSeconds={1350} />,
          },
        ]}
      />
    );
  },
};
