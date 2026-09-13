import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { useIntl } from 'react-intl';
import { PromotionPlanPage } from '../pages/PromotionPlanPage.js';
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
        return Promise.reject(new Error(intl.formatMessage(messages.auditTrailLoadFailed)));
      return Promise.resolve(value);
    }
    return storyClient<ControlApiClient>({
      listZones: () =>
        read(
          empty
            ? []
            : [
                {
                  zoneId: ids.third,
                  stageId: ids.stage,
                  stageNumber: 1,
                  number: 1,
                  name: 'Copa Premier',
                  planConfigured: true,
                  groups: [],
                },
              ],
        ),
      fetchPromotionPreview: () =>
        read({
          zoneNumber: 1,
          combined: empty
            ? []
            : [
                { entrantId: ids.first, groupId: ids.match, rank: 1 },
                { entrantId: ids.second, groupId: ids.stage, rank: 1 },
              ],
          trace: [],
        }),
    });
  }, [mode, intl]);
  return (
    <PromotionPlanPage
      organizationAlias={ORG}
      tournamentAlias={TOURNAMENT}
      stageNumber={1}
      zoneNumber={1}
      client={client}
    />
  );
}
const meta = {
  title: 'Admin/Screens/PromotionPlanPage',
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
