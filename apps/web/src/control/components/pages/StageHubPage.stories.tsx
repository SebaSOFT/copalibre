import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { useIntl } from 'react-intl';
import { StageHubPage } from './StageHubPage.js';
import type { ControlApiClient } from '../../lib/api-client.js';
import { messages } from '../../i18n/messages.en.js';
import { ORG, TOURNAMENT, ids, pending, storyClient } from '../screen-story-fixtures.js';

function Screen({ mode }: { readonly mode: 'loaded' | 'not-found' | 'loading' | 'failed' }) {
  const intl = useIntl();
  const client = useMemo(() => {
    function read<T>(value: T): Promise<T> {
      if (mode === 'loading') return pending<T>();
      if (mode === 'failed')
        return Promise.reject(new Error(intl.formatMessage(messages.stageHubLoadFailed)));
      return Promise.resolve(value);
    }
    return storyClient<ControlApiClient>({
      listStages: () =>
        read(
          mode === 'not-found'
            ? []
            : [
                {
                  stageId: ids.stage,
                  seasonId: ids.first,
                  number: 1,
                  name: 'Fase de grupos',
                  format: 'round-robin',
                  seeded: false,
                },
              ],
        ),
      updateStage: undefined,
      deleteStage: undefined,
    });
  }, [mode, intl]);
  return (
    <StageHubPage
      organizationAlias={ORG}
      stageNumber={1}
      tournamentAlias={TOURNAMENT}
      client={client}
    />
  );
}
const meta = {
  title: 'Admin/Screens/StageHubPage',
  component: Screen,
  args: { mode: 'loaded' },
  argTypes: { mode: { control: 'select', options: ['loaded', 'not-found', 'loading', 'failed'] } },
} satisfies Meta<typeof Screen>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loaded: Story = {};
export const NotFound: Story = { args: { mode: 'not-found' } };
export const Loading: Story = { args: { mode: 'loading' } };
export const Failed: Story = { args: { mode: 'failed' } };
