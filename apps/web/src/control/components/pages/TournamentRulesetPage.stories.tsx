import { ReadStoryScope, StaleReadStory } from '../screen-story-fixtures.js';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { useIntl } from 'react-intl';
import { TournamentRulesetPage } from '../pages/TournamentRulesetPage.js';
import type { ControlApiClient } from '../../lib/api-client.js';
import { messages } from '../../i18n/messages.en.js';
import { storyClient, pending, ORG, TOURNAMENT } from '../screen-story-fixtures.js';

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
      fetchTournamentSettings: undefined,
      fetchRulesetOverrides: () =>
        read({
          overrides: empty ? {} : { 'scoring.pointsPerWin': 3 },
          fieldPolicies: {
            'scoring.pointsPerWin': {
              permission: { kind: 'replaced' },
              mutationClass: 'blocked_after_results',
              label: 'Points per win',
            },
            'scoring.pointsPerDraw': {
              permission: { kind: 'replaced' },
              mutationClass: 'blocked_after_results',
            },
          },
          disciplineDefaults: { scoring: { pointsPerWin: 2, pointsPerDraw: 1 } },
        }),
    });
  }, [mode, intl]);
  return (
    <TournamentRulesetPage organizationAlias={ORG} tournamentAlias={TOURNAMENT} client={client} />
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
  title: 'Admin/Screens/TournamentRulesetPage',
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
