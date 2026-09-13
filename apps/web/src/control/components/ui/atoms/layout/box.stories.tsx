import type { Meta, StoryObj } from '@storybook/react-vite';
import { Box } from './box.js';
import { SPACING_STEPS } from './spacing.js';
import { StoryMatrix } from '../../story-matrix.js';

const meta = {
  title: 'Admin/Atoms/Layout/Box',
  component: Box,
  args: { children: null },
} satisfies Meta<typeof Box>;

export default meta;
type Story = StoryObj<typeof meta>;

function Content(): React.JSX.Element {
  return (
    <div
      style={{
        background: 'var(--cl-surface-chrome)',
        color: 'var(--cl-text-primary)',
        fontFamily: 'var(--cl-font-mono)',
        fontSize: 'var(--cl-font-size-xs)',
      }}
    >
      content
    </div>
  );
}

/** Every declared padding step. */
export const Steps: Story = {
  render: function Render() {
    return (
      <StoryMatrix
        minColumn="140px"
        cells={SPACING_STEPS.map((step) => ({
          label: `padding ${step}`,
          children: (
            <Box className="cl-chamfer cl-chamfer--control" padding={step}>
              <Content />
            </Box>
          ),
        }))}
      />
    );
  },
};

/**
 * The largest declared padding step at the narrowest declared width. Select
 * the "Zoom floor — 188px" viewport to confirm the padding does not push the
 * content out of the viewport.
 */
export const NarrowFloor: Story = {
  render: function Render() {
    return (
      <Box className="cl-chamfer cl-chamfer--control" padding="6">
        <Content />
      </Box>
    );
  },
};
