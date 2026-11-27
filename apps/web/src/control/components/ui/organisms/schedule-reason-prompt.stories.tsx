import type { Meta, StoryObj } from '@storybook/react-vite';
import { ScheduleReasonPrompt } from './schedule-reason-prompt.js';

const ROWS = [
  {
    matchId: 'm1',
    label: 'Alfa vs Bravo',
    change: '2026-11-07T14:30 @ Cancha 1 → 2026-11-07T18:00 @ Cancha 2',
  },
  {
    matchId: 'm2',
    label: 'Charlie vs Delta',
    change: '2026-11-07T16:00 @ Cancha 1 → 2026-11-07T19:30 @ Cancha 2',
  },
  { matchId: 'm3', label: 'Echo vs Foxtrot', change: '2026-11-08T10:00 @ Cancha 1 → withdrawn' },
];

const meta = {
  title: 'Admin/Organisms/ScheduleReasonPrompt',
  component: ScheduleReasonPrompt,
  args: {
    open: true,
    onOpenChange: () => undefined,
    onPublish: () => undefined,
    rows: ROWS,
    presets: [
      { code: 'venue-unavailable', label: 'Venue unavailable' },
      { code: 'weather', label: 'Weather' },
      { code: 'other', label: 'Other' },
    ],
    recent: ['Cancha 1 sin luz', 'Pedido del club visitante'],
  },
} satisfies Meta<typeof ScheduleReasonPrompt>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Three moved published matches waiting for one batch reason. */
export const ThreeChanges: Story = {};

/** One published match: the smallest prompt a move produces. */
export const SingleChange: Story = { args: { rows: ROWS.slice(0, 1) } };

/** No recent reasons yet: only the presets are offered. */
export const PresetsOnly: Story = { args: { recent: [] } };

/** German compounds at the 188px zoom floor, where a row must wrap rather than overflow. */
export const GermanZoomFloor: Story = {
  globals: { locale: 'de', viewport: { value: 'zoomFloor', isRotated: false } },
};
