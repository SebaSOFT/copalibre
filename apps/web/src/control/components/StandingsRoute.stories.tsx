import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { useIntl } from 'react-intl';
import { StandingsRoute } from './StandingsRoute.js';
import type { ControlApiClient } from '../lib/api-client.js';
import { messages } from '../i18n/messages.en.js';
import { storyClient, pending, ORG, TOURNAMENT, projection } from './screen-story-fixtures.js';

function Screen({ mode }: { readonly mode: 'loaded' | 'empty' | 'loading' | 'failed' }) {
  const intl = useIntl();
  const client = useMemo(() => {
    const empty = mode === 'empty';
    function read<T>(value: T): Promise<T> {
      if (mode === 'loading') return pending<T>();
      if (mode === 'failed')
        return Promise.reject(new Error(intl.formatMessage(messages.auditTrailLoadFailed)));
      return Promise.resolve(value);
    }
    return storyClient<ControlApiClient>({
      listZones: undefined,
      listGroups: undefined,
      fetchTableLayouts: () =>
        read([
          {
            code: projection.layoutCode,
            target: projection.target,
            label: projection.label,
            entityGranularity: 'team',
          },
        ]),
      fetchTableProjection: () => read({ ...projection, rows: empty ? [] : projection.rows }),
      downloadTableProjectionCsv: undefined,
    });
  }, [mode, intl]);
  return (
    <StandingsRoute
      organizationAlias={ORG}
      tournamentAlias={TOURNAMENT}
      stageNumber={1}
      client={client}
    />
  );
}
const meta = {
  title: 'Admin/Screens/StandingsRoute',
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
