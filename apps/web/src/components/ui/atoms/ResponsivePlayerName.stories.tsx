import type { Meta, StoryObj } from '@storybook/react-vite';
import { ResponsivePlayerName } from './ResponsivePlayerName.js';

const meta = {
  title: 'Public/ResponsivePlayerName',
  component: ResponsivePlayerName,
  args: { fullName: 'Sebastian Dieguez', nationalityCode: 'AR' },
  argTypes: {
    fullName: { control: 'text' },
    nationalityCode: { control: 'text' },
  },
} satisfies Meta<typeof ResponsivePlayerName>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

/**
 * The component degrades across four tiers as its own box narrows, measured
 * with a `ResizeObserver` — the same mechanism `EntrantName` uses. Narrow the
 * viewport to see each row switch tier independently.
 */
export const WidthDriven: Story = {
  render: function Render() {
    const widths = [260, 180, 110, 60];
    return (
      <div style={{ display: 'grid', gap: 'var(--cl-space-3)' }}>
        {widths.map((width) => (
          <div
            key={width}
            style={{
              border: '1px solid var(--cl-border-muted)',
              padding: 'var(--cl-space-2)',
              width,
            }}
          >
            <ResponsivePlayerName fullName="Sebastian Dieguez" nationalityCode="AR" />
          </div>
        ))}
      </div>
    );
  },
};

export const NoNationality: Story = {
  args: { fullName: 'Sebastian Dieguez', nationalityCode: undefined },
};
