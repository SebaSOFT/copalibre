import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { useIntl } from 'react-intl';
import { DashboardRoute } from './DashboardRoute.js';
import type { ControlApiClient } from '../lib/api-client.js';
import { writeStoredLanguagePreference } from '../../lib/language-preference.js';
import { isSupportedLanguage } from '@copalibre/domain';
import {
  ORG,
  ids,
  tournament,
  registrations,
  auditRecords,
  storyClient,
  pending,
} from './screen-story-fixtures.js';
function Screen({ mode }: { readonly mode: 'loaded' | 'empty' | 'loading' | 'failed' }) {
  const intl = useIntl();
  if (isSupportedLanguage(intl.locale)) writeStoredLanguagePreference(intl.locale);
  const client = useMemo(
    () =>
      storyClient<ControlApiClient>({
        listMyOrganizations: async () => [
          {
            organizationId: ids.organization,
            organizationAlias: ORG,
            organizationName: 'Liga San Juan',
            role: 'admin',
          },
        ],
        listActiveTournaments: () =>
          mode === 'loading'
            ? pending()
            : mode === 'failed'
              ? Promise.reject(new Error('Fixture request failed'))
              : Promise.resolve(mode === 'empty' ? [] : [tournament]),
        listRegistrations: async () => registrations.filter((row) => row.status === 'pending'),
        fetchAuditTrail: async () => ({
          records: mode === 'empty' ? [] : auditRecords,
          total: mode === 'empty' ? 0 : 1,
          limit: 10,
          offset: 0,
        }),
        listDisplayTokens: async () => [],
        controlStream: undefined,
        matchConsoleStream: undefined,
      }),
    [mode],
  );
  return <DashboardRoute key={intl.locale} organizationAlias={ORG} client={client} />;
}
const meta = {
  title: 'Admin/Screens/DashboardRoute',
  component: Screen,
  args: { mode: 'loaded' },
} satisfies Meta<typeof Screen>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loaded: Story = {};
export const Empty: Story = { args: { mode: 'empty' } };
export const Loading: Story = { args: { mode: 'loading' } };
export const Failed: Story = { args: { mode: 'failed' } };
