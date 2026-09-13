import type { Meta, StoryObj } from '@storybook/react-vite';
import { DashboardTemplate } from '../screens/DashboardTemplate.js';
import { buildDashboard } from '../../lib/dashboard.js';
import { ORG, TOURNAMENT, TITLE, ids, auditRecords } from '../screen-story-fixtures.js';

const model = buildDashboard({
  organizationId: ids.organization,
  tournaments: [
    {
      tournamentId: ids.tournament,
      organizationId: ids.organization,
      alias: TOURNAMENT,
      name: TITLE,
      lifecycle: 'live',
      matchesToday: 8,
      pendingRegistrations: 12,
    },
  ],
  activity: auditRecords,
});

const meta = {
  title: 'Admin/Screens/DashboardTemplate',
  component: DashboardTemplate,
  args: {
    devices: [],
    model,
    now: Date.now(),
    onArchive: () => undefined,
    onExport: () => undefined,
    onExportConfiguration: () => undefined,
    organizationAlias: ORG,
  },
} satisfies Meta<typeof DashboardTemplate>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loaded: Story = {};
export const Empty: Story = {
  args: {
    model: buildDashboard({ organizationId: ids.organization, tournaments: [], activity: [] }),
  },
};
