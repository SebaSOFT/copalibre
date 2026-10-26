import { ReadStoryScope, StaleReadStory } from '../screen-story-fixtures.js';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { useIntl } from 'react-intl';
import { SeedingBuilderPage } from '../pages/SeedingBuilderPage.js';
import type { ControlApiClient } from '../../lib/api-client.js';
import { messages } from '../../i18n/messages.en.js';
import {
  storyClient,
  pending,
  ORG,
  TOURNAMENT,
  TITLE,
  ids,
  bracket,
} from '../screen-story-fixtures.js';

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
      fetchTournamentSettings: () => Promise.resolve({ name: TITLE, featured: false }),
      fetchStageConfiguration: undefined,
      fetchPromotionPlansTargetingStage: undefined,
      fetchSeeding: () =>
        read({
          stageId: ids.stage,
          format: 'single-elimination',
          seeds: empty
            ? []
            : [
                { seed: 1, entrantId: ids.first, locked: true },
                { seed: 2, entrantId: ids.second, locked: false },
              ],
          zones: empty ? [] : [{ matches: bracket }],
          hasRecordedResults: false,
        }),
    });
  }, [mode, intl]);
  return (
    <SeedingBuilderPage
      organizationAlias={ORG}
      tournamentAlias={TOURNAMENT}
      stageNumber={1}
      client={client}
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
  title: 'Admin/Screens/SeedingBuilderPage',
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

export const Stale: Story = {
  render: () => (
    <StaleReadStory loaded={<Screen mode="loaded" />} failed={<Screen mode="failed" />} />
  ),
};
