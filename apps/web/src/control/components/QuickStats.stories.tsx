import type { Meta, StoryObj } from '@storybook/react-vite';
import { QuickStats } from './QuickStats.js';

const meta = {
  title: 'Admin/Screens/QuickStats',
  component: QuickStats,
  args: { stats: { activeTournaments: 3, pendingRegistrations: 12, matchesToday: 8 } },
} satisfies Meta<typeof QuickStats>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loaded: Story = {};
export const Empty: Story = {
  args: { stats: { activeTournaments: 0, pendingRegistrations: 0, matchesToday: 0 } },
};
