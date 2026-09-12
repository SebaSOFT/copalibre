import type { Meta, StoryObj } from '@storybook/react-vite';
import { Dashboard } from './Dashboard.js';
import { buildDashboard } from '../lib/dashboard.js';
import { writeStoredLanguagePreference } from '../../lib/language-preference.js';
import { isSupportedLanguage } from '@copalibre/domain';
import { useIntl } from 'react-intl';
import type { ControlApiClient } from '../lib/api-client.js';
import { ORG, TOURNAMENT, TITLE, ids, auditRecords, storyClient } from './screen-story-fixtures.js';
const client = storyClient<ControlApiClient>({
  listMyOrganizations: async () => [
    {
      organizationId: ids.organization,
      organizationAlias: ORG,
      organizationName: 'Liga San Juan',
      role: 'admin',
    },
  ],
  listDisplayTokens: async () => [],
});
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
  title: 'Admin/Screens/Dashboard',
  component: Dashboard,
  args: { model, organizationAlias: ORG, client },
  render: function Render(args) {
    const intl = useIntl();
    if (isSupportedLanguage(intl.locale)) writeStoredLanguagePreference(intl.locale);
    return <Dashboard key={intl.locale} {...args} />;
  },
} satisfies Meta<typeof Dashboard>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loaded: Story = {};
export const Empty: Story = {
  args: {
    model: buildDashboard({ organizationId: ids.organization, tournaments: [], activity: [] }),
  },
};
