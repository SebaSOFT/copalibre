import type { Meta, StoryObj } from '@storybook/react-vite';
import { ActivityLog } from './ActivityLog.js';
import { NOW, auditRecords } from './screen-story-fixtures.js';

const meta = {
  title: 'Admin/Screens/ActivityLog',
  component: ActivityLog,
  args: { entries: auditRecords, now: Date.parse(NOW) },
} satisfies Meta<typeof ActivityLog>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loaded: Story = {};
export const Empty: Story = { args: { entries: [] } };
