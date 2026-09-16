import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { useIntl } from 'react-intl';
import type { TournamentCompletionResponse } from '@copalibre/contracts';
import { MatchesViewPage } from '../pages/MatchesViewPage.js';
import type { ControlApiClient } from '../../lib/api-client.js';
import { messages } from '../../i18n/messages.en.js';
import { storyClient, pending, ORG, TOURNAMENT, liveMatch, ids } from '../screen-story-fixtures.js';

function Screen({
  mode,
}: {
  readonly mode: 'loaded' | 'empty' | 'loading' | 'failed' | 'complete' | 'multiStage';
}) {
  const intl = useIntl();
  const client = useMemo(() => {
    const empty = mode === 'empty';
    function read<T>(value: T): Promise<T> {
      if (mode === 'loading') return pending<T>();
      if (mode === 'failed')
        return Promise.reject(new Error(intl.formatMessage(messages.matchesViewControlLoadFailed)));
      return Promise.resolve(value);
    }
    const completion: TournamentCompletionResponse =
      mode === 'empty'
        ? {
            totalMatches: 0,
            resolvedMatches: 0,
            liveMatches: 0,
            scheduledMatches: 0,
            finalizedMatches: 0,
            forfeitedMatches: 0,
            stages: [],
          }
        : mode === 'complete'
          ? {
              totalMatches: 32,
              resolvedMatches: 32,
              liveMatches: 0,
              scheduledMatches: 0,
              finalizedMatches: 32,
              forfeitedMatches: 0,
              stages: [
                {
                  stageId: ids.stage,
                  stageNumber: 1,
                  stageName: 'Group Stage',
                  totalMatches: 32,
                  resolvedMatches: 32,
                  liveMatches: 0,
                  scheduledMatches: 0,
                  finalizedMatches: 32,
                  forfeitedMatches: 0,
                },
              ],
            }
          : mode === 'multiStage'
            ? {
                totalMatches: 48,
                resolvedMatches: 36,
                liveMatches: 2,
                scheduledMatches: 10,
                finalizedMatches: 34,
                forfeitedMatches: 2,
                stages: [
                  {
                    stageId: ids.stage,
                    stageNumber: 1,
                    stageName: 'Group Stage A',
                    totalMatches: 24,
                    resolvedMatches: 24,
                    liveMatches: 0,
                    scheduledMatches: 0,
                    finalizedMatches: 24,
                    forfeitedMatches: 0,
                  },
                  {
                    stageId: '019927d0-0000-7000-8000-00000000000e',
                    stageNumber: 2,
                    stageName: 'Group Stage B',
                    totalMatches: 24,
                    resolvedMatches: 12,
                    liveMatches: 2,
                    scheduledMatches: 10,
                    finalizedMatches: 10,
                    forfeitedMatches: 2,
                  },
                ],
              }
            : {
                totalMatches: 32,
                resolvedMatches: 18,
                liveMatches: 2,
                scheduledMatches: 12,
                finalizedMatches: 16,
                forfeitedMatches: 2,
                stages: [
                  {
                    stageId: ids.stage,
                    stageNumber: 1,
                    stageName: 'Group Stage',
                    totalMatches: 32,
                    resolvedMatches: 18,
                    liveMatches: 2,
                    scheduledMatches: 12,
                    finalizedMatches: 16,
                    forfeitedMatches: 2,
                  },
                ],
              };

    return storyClient<ControlApiClient>({
      fetchMatchesView: () => read({ matches: empty ? [] : [liveMatch] }),
      fetchCompletion: () => read(completion),
    });
  }, [mode, intl]);
  return <MatchesViewPage organizationAlias={ORG} tournamentAlias={TOURNAMENT} client={client} />;
}
const meta = {
  title: 'Admin/Screens/MatchesViewPage',
  component: Screen,
  args: { mode: 'loaded' },
  argTypes: {
    mode: {
      control: 'select',
      options: ['loaded', 'empty', 'complete', 'multiStage', 'loading', 'failed'],
    },
  },
} satisfies Meta<typeof Screen>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loaded: Story = {};
export const Empty: Story = { args: { mode: 'empty' } };
export const FullyComplete: Story = { args: { mode: 'complete' } };
export const MultiStageBreakdown: Story = { args: { mode: 'multiStage' } };
export const Loading: Story = { args: { mode: 'loading' } };
export const Failed: Story = { args: { mode: 'failed' } };
