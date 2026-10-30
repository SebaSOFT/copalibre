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
      timezone: 'America/Argentina/Buenos_Aires',
      role: 'admin',
    },
  ],
  listDisplayTokens: async () => [],
  fetchTournamentSettings: async () => ({
    name: TITLE,
    featured: false,
    includesMinors: true,
    showYouthProfiles: false,
  }),
  publishTournament: async () => ({
    tournamentId: ids.tournament,
    organizationId: ids.organization,
    alias: TOURNAMENT,
    name: TITLE,
    status: 'published',
  }),
});
const model = buildDashboard({
  organizationId: ids.organization,
  tournaments: [
    {
      tournamentId: ids.tournament,
      organizationId: ids.organization,
      alias: TOURNAMENT,
      name: TITLE,
      lifecycle: 'in-progress',
      pendingRegistrations: 12,
    },
  ],
  activity: auditRecords,
});
const draftModel = buildDashboard({
  organizationId: ids.organization,
  tournaments: [
    {
      tournamentId: ids.tournament,
      organizationId: ids.organization,
      alias: TOURNAMENT,
      name: TITLE,
      lifecycle: 'draft',
      pendingRegistrations: 0,
    },
  ],
  activity: auditRecords,
});
const meta = {
  title: 'Admin/Screens/Dashboard',
  component: Dashboard,
  args: {
    canCreateTournament: true,
    canManageDisplayTokens: true,
    canManageTournamentLifecycle: true,
    failed: false,
    loading: false,
    model,
    onRetry: () => undefined,
    onPublishComplete: () => undefined,
    organizationAlias: ORG,
    staleSince: undefined,
    client,
  },
  render: function Render(args) {
    const intl = useIntl();
    if (isSupportedLanguage(intl.locale)) writeStoredLanguagePreference(intl.locale);
    return <Dashboard key={intl.locale} {...args} />;
  },
} satisfies Meta<typeof Dashboard>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loaded: Story = {};
export const DraftReadyToPublish: Story = { args: { model: draftModel } };
export const Empty: Story = {
  args: {
    model: buildDashboard({ organizationId: ids.organization, tournaments: [], activity: [] }),
  },
};
