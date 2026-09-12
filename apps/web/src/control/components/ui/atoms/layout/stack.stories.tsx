import type { Meta, StoryObj } from '@storybook/react-vite';
import { Stack, type StackAlign } from './stack.js';
import { SPACING_STEPS } from './spacing.js';
import { StoryMatrix } from '../../story-matrix.js';

const meta = {
  title: 'Admin/Atoms/Layout/Stack',
  component: Stack,
  args: { children: null },
} satisfies Meta<typeof Stack>;

export default meta;
type Story = StoryObj<typeof meta>;

function Swatch({ label }: { readonly label: string }): React.JSX.Element {
  return (
    <div
      style={{
        background: 'var(--cl-surface-chrome)',
        border: '1px solid var(--cl-border-muted)',
        padding: 'var(--cl-space-2)',
        color: 'var(--cl-text-primary)',
        fontFamily: 'var(--cl-font-mono)',
        fontSize: 'var(--cl-font-size-xs)',
      }}
    >
      {label}
    </div>
  );
}

/** Every declared spacing step, side by side. */
export const Steps: Story = {
  render: function Render() {
    return (
      <StoryMatrix
        minColumn="140px"
        cells={SPACING_STEPS.map((step) => ({
          label: `gap ${step}`,
          children: (
            <Stack gap={step}>
              <Swatch label="A" />
              <Swatch label="B" />
              <Swatch label="C" />
            </Stack>
          ),
        }))}
      />
    );
  },
};

/** Every declared cross-axis alignment. */
export const Alignments: Story = {
  render: function Render() {
    const aligns: readonly StackAlign[] = ['start', 'center', 'end', 'stretch'];
    return (
      <StoryMatrix
        minColumn="140px"
        cells={aligns.map((align) => ({
          label: align,
          children: (
            <Stack align={align} gap="2">
              <Swatch label="A" />
              <Swatch label="BB" />
            </Stack>
          ),
        }))}
      />
    );
  },
};

/**
 * The narrowest declared width. Select the "Zoom floor — 188px" viewport to
 * confirm the gap and children stay readable rather than overflowing or
 * collapsing.
 */
export const NarrowFloor: Story = {
  render: function Render() {
    return (
      <Stack gap="4" padding="4">
        <Swatch label="One" />
        <Swatch label="Two" />
        <Swatch label="Three" />
      </Stack>
    );
  },
};
