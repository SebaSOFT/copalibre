import { ReadStoryScope, StaleReadStory } from '../screen-story-fixtures.js';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { useIntl } from 'react-intl';
import { DashboardPage } from '../pages/DashboardPage.js';
import type { ControlApiClient } from '../../lib/api-client.js';
import { writeStoredLanguagePreference } from '../../../lib/language-preference.js';
import { isSupportedLanguage } from '@copalibre/domain';
import {
  ORG,
  ids,
  tournament,
  registrations,
  auditRecords,
  storyClient,
  pending,
} from '../screen-story-fixtures.js';
function Screen({ mode }: { readonly mode: 'loaded' | 'empty' | 'loading' | 'failed' }) {
  const intl = useIntl();
  if (isSupportedLanguage(intl.locale)) writeStoredLanguagePreference(intl.locale);
  const client = useMemo(() => {
    return storyClient<ControlApiClient>({
      listMyOrganizations: async () => [
        {
          organizationId: ids.organization,
          organizationAlias: ORG,
          organizationName: 'Liga San Juan',
          timezone: 'America/Argentina/Buenos_Aires',
          role: 'admin',
        },
      ],
      listActiveTournaments: () =>
        mode === 'loading'
          ? pending()
          : mode === 'failed'
            ? Promise.reject(new Error('Fixture request failed'))
            : (() => {
                return Promise.resolve(mode === 'empty' ? [] : [tournament]);
              })(),
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
    });
  }, [mode]);
  return <DashboardPage key={intl.locale} organizationAlias={ORG} client={client} />;
}
const meta = {
  decorators: [
    (Story, context) => (
      <ReadStoryScope key={`${context.id}:${String(context.args.mode)}`}>
        <Story />
      </ReadStoryScope>
    ),
  ],
  title: 'Admin/Screens/DashboardPage',
  component: Screen,
  args: { mode: 'loaded' },
  argTypes: {
    mode: { control: 'select', options: ['loaded', 'empty', 'loading', 'failed'] },
  },
} satisfies Meta<typeof Screen>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loaded: Story = {};
export const Empty: Story = { args: { mode: 'empty' } };
export const Loading: Story = { args: { mode: 'loading' } };
export const Failed: Story = { args: { mode: 'failed' } };
export const Stale: Story = {
  render: () => (
    <StaleReadStory loaded={<Screen mode="loaded" />} failed={<Screen mode="failed" />} />
  ),
};
