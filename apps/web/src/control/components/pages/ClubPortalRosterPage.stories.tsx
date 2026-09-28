import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { useIntl } from 'react-intl';
import { ClubPortalRosterPage } from './ClubPortalRosterPage.js';
import type { ControlApiClient } from '../../lib/api-client.js';
import { messages } from '../../i18n/messages.en.js';
import { storyClient, pending, ORG, TOURNAMENT, ids, names } from '../screen-story-fixtures.js';

function Screen({ mode }: { readonly mode: 'loaded' | 'empty' | 'loading' | 'failed' }) {
  const intl = useIntl();
  const client = useMemo(() => {
    const empty = mode === 'empty';
    function read<T>(value: T): Promise<T> {
      if (mode === 'loading') return pending<T>();
      if (mode === 'failed')
        return Promise.reject(new Error(intl.formatMessage(messages.clubPortalRosterLoadFailed)));
      return Promise.resolve(value);
    }
    return storyClient<ControlApiClient>({
      listClubMembers: () =>
        read(empty ? [] : [{ personId: ids.first, displayName: names[ids.first] }]),
      listClubTeams: () => read(empty ? [] : [{ teamId: ids.third, name: names[ids.third] }]),
      createClubTeam: undefined,
      submitClubRegistration: undefined,
    });
  }, [mode, intl]);
  return (
    <ClubPortalRosterPage
      clubId={ids.first}
      client={client}
      organizationAlias={ORG}
      tournamentAlias={TOURNAMENT}
    />
  );
}
const meta = {
  title: 'Admin/Screens/ClubPortalRosterPage',
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
