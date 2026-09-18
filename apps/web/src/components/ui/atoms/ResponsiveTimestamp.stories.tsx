import type { Meta, StoryObj } from '@storybook/react-vite';
import { ResponsiveTimestamp } from './ResponsiveTimestamp.js';

const REFERENCE = new Date('2026-09-04T12:00:00.000Z');

const meta = {
  title: 'Public/ResponsiveTimestamp',
  component: ResponsiveTimestamp,
  args: { timestamp: '2026-09-04T14:30:00.000Z', referenceDate: REFERENCE, locale: 'en' },
  argTypes: {
    timestamp: { control: 'text' },
    format: {
      control: 'select',
      options: ['dynamic', 'time-only', 'date-only', 'full', 'relative'],
    },
  },
} satisfies Meta<typeof ResponsiveTimestamp>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SameDay: Story = {
  args: { timestamp: '2026-09-04T14:30:00.000Z' },
};

export const DifferentDay: Story = {
  args: { timestamp: '2025-11-02T14:30:00.000Z' },
};

export const Relative: Story = {
  args: { timestamp: '2026-09-04T11:55:00.000Z', format: 'relative' },
};

/** Every format side by side, for the same instant. */
export const AllFormats: Story = {
  render: function Render() {
    const timestamp = '2025-11-02T14:30:00.000Z';
    return (
      <div style={{ display: 'grid', gap: 'var(--cl-space-2)' }}>
        {(['dynamic', 'time-only', 'date-only', 'full', 'relative'] as const).map((format) => (
          <div key={format}>
            <code>{format}</code>:{' '}
            <ResponsiveTimestamp format={format} locale="en" referenceDate={REFERENCE} timestamp={timestamp} />
          </div>
        ))}
      </div>
    );
  },
};
