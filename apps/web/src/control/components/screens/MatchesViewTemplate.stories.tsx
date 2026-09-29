import type { Meta, StoryObj } from '@storybook/react-vite';
import type { TournamentCompletionResponse } from '@copalibre/contracts';
import { MatchesViewTemplate } from '../screens/MatchesViewTemplate.js';
import { matchCardLabelsFromControlIntl } from '../../lib/matches-view-labels.js';
import { storyIntl, liveMatch, ids } from '../screen-story-fixtures.js';

const labels = matchCardLabelsFromControlIntl(storyIntl('en'));

const partialCompletion: TournamentCompletionResponse = {
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

const meta = {
  title: 'Admin/Screens/MatchesViewTemplate',
  component: MatchesViewTemplate,
  args: {
    completion: partialCompletion,
    labels,
    matches: [liveMatch],
    onSelectState: () => undefined,
    state: 'all',
    status: 'ready',
  },
} satisfies Meta<typeof MatchesViewTemplate>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loaded: Story = {};
export const Empty: Story = {
  args: {
    completion: {
      totalMatches: 0,
      resolvedMatches: 0,
      liveMatches: 0,
      scheduledMatches: 0,
      finalizedMatches: 0,
      forfeitedMatches: 0,
      stages: [],
    },
    matches: [],
  },
};
export const FullyComplete: Story = {
  args: {
    completion: {
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
    },
  },
};
export const MultiStageBreakdown: Story = {
  args: {
    completion: {
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
    },
  },
};
export const Failed: Story = { args: { matches: [], status: 'error' } };
