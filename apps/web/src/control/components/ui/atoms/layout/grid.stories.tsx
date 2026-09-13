import type { Meta, StoryObj } from '@storybook/react-vite';
import { Grid, GRID_COLUMNS } from './grid.js';
import { StoryMatrix } from '../../story-matrix.js';

const meta = {
  title: 'Admin/Atoms/Layout/Grid',
  component: Grid,
  args: { children: null },
} satisfies Meta<typeof Grid>;

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
        textAlign: 'center',
      }}
    >
      {label}
    </div>
  );
}

/** Every declared column count. */
export const Columns: Story = {
  render: function Render() {
    return (
      <StoryMatrix
        minColumn="220px"
        cells={GRID_COLUMNS.map((columns) => ({
          label: `${columns} column(s)`,
          children: (
            <Grid columns={columns} gap="2">
              {Array.from({ length: columns * 2 }, (_, i) => (
                <Swatch key={i} label={String(i + 1)} />
              ))}
            </Grid>
          ),
        }))}
      />
    );
  },
};

/**
 * A 4-column grid at the narrowest declared width. Select the "Zoom floor —
 * 188px" viewport to confirm `minmax(0, 1fr)` lets cells shrink rather than
 * overflowing the grid's own bounds.
 */
export const NarrowFloor: Story = {
  render: function Render() {
    return (
      <Grid columns={4} gap="2">
        {Array.from({ length: 8 }, (_, i) => (
          <Swatch key={i} label={String(i + 1)} />
        ))}
      </Grid>
    );
  },
};
