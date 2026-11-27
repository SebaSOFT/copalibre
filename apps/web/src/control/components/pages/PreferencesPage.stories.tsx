import { ReadStoryScope, StaleReadStory } from '../screen-story-fixtures.js';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { PreferencesPage } from '../pages/PreferencesPage.js';
import type { ControlApiClient } from '../../lib/api-client.js';
import { storyClient, pending, ORG } from '../screen-story-fixtures.js';

function Screen({
  mode,
  personal = false,
}: {
  readonly mode: 'loaded' | 'empty' | 'loading' | 'failed';
  readonly personal?: boolean;
}) {
  const client = useMemo(() => {
    function read<T>(value: T): Promise<T> {
      if (mode === 'loading') return pending<T>();
      if (mode === 'failed') return Promise.reject(new Error('Failed to load preferences'));
      return Promise.resolve(value);
    }
    return storyClient<ControlApiClient>({
      listMyOrganizations: () =>
        read([
          {
            organizationId: 'org-1',
            organizationAlias: ORG,
            organizationName: 'Liga San Juan',
            timezone: 'America/Argentina/San_Juan',
            role: 'admin' as const,
          },
        ]),
      getOrganization: () =>
        read({
          organizationId: 'org-1',
          alias: ORG,
          name: 'Liga San Juan',
          primaryLanguage: 'es',
          timezone: 'America/Argentina/San_Juan',
          emblemObjectId: undefined,
        }),
      getStorageUsage: () =>
        read({
          totalBytes: 1024 * 1024 * 45,
          objectCount: 12,
        }),
      listUnreferencedObjects: () => read([]),
      updateOrganizationSettings: () =>
        Promise.resolve({
          organizationId: 'org-1',
          alias: ORG,
          name: 'Liga San Juan',
          primaryLanguage: 'es',
          timezone: 'America/Argentina/San_Juan',
        }),
      uploadOrganizationEmblem: () => Promise.resolve({ objectId: 'emblem-1' }),
      rebuildStatistics: () =>
        Promise.resolve({
          dryRun: false,
          organizationAlias: ORG,
          matches: 10,
          figures: 2,
        }),
    });
  }, [mode]);

  const patFetch = useMemo<typeof fetch>(
    () => async (input, init) => {
      if (init?.method && init.method !== 'GET')
        throw new Error('This story only declares personal access token reads');
      if (mode === 'loading') return pending<Response>();
      if (mode === 'failed') throw new Error('Fixture request failed');
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : '';
      return new Response(
        JSON.stringify(
          url.endsWith('/api/auth/pat/scopes')
            ? { scopes: ['copalibre.control', 'copalibre.participant'] }
            : mode === 'empty'
              ? []
              : [
                  {
                    tokenId: '019927d0-0000-7000-8000-00000000000c',
                    label: 'Broadcast integration',
                    revoked: false,
                    expiresAt: '2027-09-08T19:00:00.000Z',
                    createdAt: '2026-09-08T19:00:00.000Z',
                    scopes: [],
                  },
                ],
        ),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    },
    [mode],
  );
  return (
    <PreferencesPage
      client={client}
      isOrganizationPage={!personal}
      organizationAlias={ORG}
      patFetch={patFetch}
    />
  );
}

const meta = {
  decorators: [
    (Story, context) => (
      <ReadStoryScope key={`${context.id}:${String(context.args.mode)}`}>
        <Story />
      </ReadStoryScope>
    ),
  ],
  title: 'Admin/Screens/PreferencesPage',
  component: Screen,
  args: { mode: 'loaded' },
  argTypes: { mode: { control: 'select', options: ['loaded', 'empty', 'loading', 'failed'] } },
} satisfies Meta<typeof Screen>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loaded: Story = {};
export const Loading: Story = { args: { mode: 'loading' } };
export const Failed: Story = { args: { mode: 'failed' } };

export const Stale: Story = {
  render: () => (
    <StaleReadStory loaded={<Screen mode="loaded" />} failed={<Screen mode="failed" />} />
  ),
};

export const Empty: Story = { args: { mode: 'empty' } };

/** The personal page: theme and personal access tokens, with no organization read. */
export const Personal: Story = { args: { personal: true } };
