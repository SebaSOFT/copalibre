import type { Meta, StoryObj } from '@storybook/react-vite';
import { ActivityLog } from './ActivityLog.js';
import type { ActivityEntry } from '../lib/dashboard.js';
import { NOW, auditRecords } from './screen-story-fixtures.js';

const groupedEntries: readonly ActivityEntry[] = [0, 1, 2].map((index) => ({
  auditId: `story-activity-${index}`,
  organizationId: 'story-organization',
  action: 'match.score.recorded',
  actor: 'table-referee',
  occurredAt: new Date(Date.parse(NOW) - index * 60_000).toISOString(),
}));

const meta = {
  title: 'Admin/Screens/ActivityLog',
  component: ActivityLog,
  args: { entries: auditRecords, now: Date.parse(NOW) },
} satisfies Meta<typeof ActivityLog>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loaded: Story = {};
export const Grouped: Story = { args: { entries: groupedEntries, now: Date.parse(NOW) } };
export const Empty: Story = { args: { entries: [] } };
