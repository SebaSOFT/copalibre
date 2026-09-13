import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { useIntl } from 'react-intl';
import { TournamentSettingsPage } from '../pages/TournamentSettingsPage.js';
import type { ControlApiClient } from '../../lib/api-client.js';
import { messages } from '../../i18n/messages.en.js';
import { storyClient, pending, ORG, TOURNAMENT, TITLE } from '../screen-story-fixtures.js';

function Screen({ mode }: { readonly mode: 'loaded' | 'empty' | 'loading' | 'failed' }) {
  const intl = useIntl();
  const client = useMemo(() => {
    const empty = mode === 'empty';
    function read<T>(value: T): Promise<T> {
      if (mode === 'loading') return pending<T>();
      if (mode === 'failed')
        return Promise.reject(new Error(intl.formatMessage(messages.settingsLoadFailed)));
      return Promise.resolve(value);
    }
    return storyClient<ControlApiClient>({
      fetchTournamentSettings: () =>
        read({
          name: TITLE,
          featured: false,
          ...(empty ? {} : { region: 'San Juan', capacity: 16 }),
        }),
      previewTournamentSettings: async () => ({ fields: [] }),
      updateTournamentSettings: async () => ({ name: TITLE, featured: false }),
      uploadTournamentEmblem: undefined,
      deleteTournamentEmblem: undefined,
    });
  }, [mode, intl]);
  return (
    <TournamentSettingsPage organizationAlias={ORG} tournamentAlias={TOURNAMENT} client={client} />
  );
}
const meta = {
  title: 'Admin/Screens/TournamentSettingsPage',
  component: Screen,
  args: { mode: 'loaded' },
  argTypes: { mode: { control: 'select', options: ['loaded', 'empty', 'loading', 'failed'] } },
} satisfies Meta<typeof Screen>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loaded: Story = {};
export const Empty: Story = { args: { mode: 'empty' } };
export const Loading: Story = { args: { mode: 'loading' } };
export const Failed: Story = { args: { mode: 'failed' } };
