import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { PreferencesPage } from '../pages/PreferencesPage.js';
import type { ControlApiClient } from '../../lib/api-client.js';
import { storyClient, pending, ORG } from '../screen-story-fixtures.js';

function Screen({ mode }: { readonly mode: 'loaded' | 'loading' | 'failed' }) {
  const client = useMemo(() => {
    function read<T>(value: T): Promise<T> {
      if (mode === 'loading') return pending<T>();
      if (mode === 'failed') return Promise.reject(new Error('Failed to load preferences'));
      return Promise.resolve(value);
    }
    return storyClient<ControlApiClient>({
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
          organizationAlias: ORG,
          matches: 10,
          figures: 2,
        }),
    });
  }, [mode]);

  return <PreferencesPage organizationAlias={ORG} client={client} />;
}

const meta = {
  title: 'Admin/Screens/PreferencesPage',
  component: Screen,
  args: { mode: 'loaded' },
  argTypes: { mode: { control: 'select', options: ['loaded', 'loading', 'failed'] } },
} satisfies Meta<typeof Screen>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loaded: Story = {};
export const Loading: Story = { args: { mode: 'loading' } };
export const Failed: Story = { args: { mode: 'failed' } };
