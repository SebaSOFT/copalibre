import type { Meta, StoryObj } from '@storybook/react-vite';
import { Inline, type InlineJustify } from './inline.js';
import { SPACING_STEPS } from './spacing.js';
import { StoryMatrix } from '../../story-matrix.js';

const meta = {
  title: 'Admin/Atoms/Layout/Inline',
  component: Inline,
  args: { children: null },
} satisfies Meta<typeof Inline>;

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
        minColumn="160px"
        cells={SPACING_STEPS.map((step) => ({
          label: `gap ${step}`,
          children: (
            <Inline gap={step}>
              <Swatch label="A" />
              <Swatch label="B" />
              <Swatch label="C" />
            </Inline>
          ),
        }))}
      />
    );
  },
};

/** Every declared main-axis distribution. */
export const Distributions: Story = {
  render: function Render() {
    const justifications: readonly InlineJustify[] = [
      'start',
      'center',
      'end',
      'between',
      'around',
      'evenly',
    ];
    return (
      <StoryMatrix
        minColumn="200px"
        cells={justifications.map((justify) => ({
          label: justify,
          children: (
            <div style={{ width: '100%' }}>
              <Inline justify={justify}>
                <Swatch label="A" />
                <Swatch label="B" />
              </Inline>
            </div>
          ),
        }))}
      />
    );
  },
};

/**
 * The narrowest declared width, with wrap enabled — three children that
 * cannot all fit on one line at 188px. Select the "Zoom floor — 188px"
 * viewport to confirm they wrap onto a new line instead of overflowing.
 */
export const NarrowFloor: Story = {
  render: function Render() {
    return (
      <Inline gap="2" wrap>
        <Swatch label="One" />
        <Swatch label="Two" />
        <Swatch label="Three" />
      </Inline>
    );
  },
};
