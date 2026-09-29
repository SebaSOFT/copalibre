import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { useIntl } from 'react-intl';
import { TournamentHubPage } from './TournamentHubPage.js';
import type { ControlApiClient } from '../../lib/api-client.js';
import { messages } from '../../i18n/messages.en.js';
import { ORG, TOURNAMENT, ids, pending, storyClient } from '../screen-story-fixtures.js';

function Screen({ mode }: { readonly mode: 'loaded' | 'empty' | 'loading' | 'failed' }) {
  const intl = useIntl();
  const client = useMemo(() => {
    const empty = mode === 'empty';
    function read<T>(value: T): Promise<T> {
      if (mode === 'loading') return pending<T>();
      if (mode === 'failed')
        return Promise.reject(new Error(intl.formatMessage(messages.tournamentHubLoadFailed)));
      return Promise.resolve(value);
    }
    return storyClient<ControlApiClient>({
      listStages: () =>
        read(
          empty
            ? []
            : [
                {
                  stageId: ids.stage,
                  seasonId: ids.first,
                  number: 1,
                  name: 'Fase de grupos',
                  format: 'round-robin',
                  seeded: true,
                },
                {
                  stageId: ids.match,
                  seasonId: ids.first,
                  number: 2,
                  name: 'Playoffs',
                  format: 'single-elimination',
                  seeded: false,
                },
              ],
        ),
    });
  }, [mode, intl]);
  return <TournamentHubPage organizationAlias={ORG} tournamentAlias={TOURNAMENT} client={client} />;
}
const meta = {
  title: 'Admin/Screens/TournamentHubPage',
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
