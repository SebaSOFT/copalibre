import { ReadStoryScope, StaleReadStory } from '../screen-story-fixtures.js';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { useIntl } from 'react-intl';
import { MatchConsolePage } from '../pages/MatchConsolePage.js';
import type { MatchConsoleApiClient } from '../../lib/api-client.js';
import { messages } from '../../i18n/messages.en.js';
import {
  ORG,
  TOURNAMENT,
  ids,
  consoleProjection,
  pending,
  storyClient,
} from '../screen-story-fixtures.js';

function Screen({ mode }: { readonly mode: 'loaded' | 'empty' | 'loading' | 'failed' }) {
  const intl = useIntl();
  const client = useMemo(() => {
    const empty = mode === 'empty';
    function read<T>(value: T): Promise<T> {
      if (mode === 'loading') return pending<T>();
      if (mode === 'failed')
        return Promise.reject(new Error(intl.formatMessage(messages.matchConsoleLoadFailed)));
      return Promise.resolve(value);
    }
    return storyClient<MatchConsoleApiClient>({
      fetchTournamentSettings: async () => ({ name: 'Apertura 2026', featured: false }),
      fetchMatchConsole: () =>
        read(
          empty
            ? {
                ...consoleProjection,
                status: 'scheduled',
                liveScores: [],
                segments: [],
                events: [],
                rosters: [],
              }
            : consoleProjection,
        ),
      matchConsoleStream: undefined,
      fetchSeeding: undefined,
      fetchRosterCandidates: async () => [{ personId: ids.person, name: 'V. Kael' }],
    });
  }, [mode, intl]);
  return (
    <MatchConsolePage
      organizationAlias={ORG}
      tournamentAlias={TOURNAMENT}
      matchId={ids.match}
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
  title: 'Admin/Screens/MatchConsolePage',
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
