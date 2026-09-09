import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { useIntl } from 'react-intl';
import { VenueManagementRoute } from './VenueManagementRoute.js';
import type { ControlApiClient } from '../lib/api-client.js';
import { messages } from '../i18n/messages.en.js';
import { storyClient, pending, ORG, ids } from './screen-story-fixtures.js';

function Screen({ mode }: { readonly mode: 'loaded' | 'empty' | 'loading' | 'failed' }) {
  const intl = useIntl();
  const client = useMemo(() => {
    const empty = mode === 'empty';
    function read<T>(value: T): Promise<T> {
      if (mode === 'loading') return pending<T>();
      if (mode === 'failed')
        return Promise.reject(new Error(intl.formatMessage(messages.resourceManagementLoadFailed)));
      return Promise.resolve(value);
    }
    return storyClient<ControlApiClient>({
      listVenues: () =>
        read(
          empty
            ? []
            : [
                {
                  venueId: ids.first,
                  organizationId: ids.organization,
                  name: 'Cancha Central',
                  alias: 'cancha-central',
                  concurrentCapacity: 1,
                  pitches: [],
                },
              ],
        ),
      listOfficials: () =>
        read(
          empty
            ? []
            : [
                {
                  officialId: ids.person,
                  organizationId: ids.organization,
                  displayName: 'V. Kael',
                  roles: ['referee'],
                },
              ],
        ),
      listSchedules: () => read([]),
      createVenue: undefined,
      createOfficial: undefined,
      createSchedule: undefined,
    });
  }, [mode, intl]);
  return <VenueManagementRoute organizationAlias={ORG} client={client} />;
}
const meta = {
  title: 'Admin/Screens/VenueManagementRoute',
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
