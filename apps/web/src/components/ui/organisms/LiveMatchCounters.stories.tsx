import type { Meta, StoryObj } from '@storybook/react-vite';
import { LiveMatchCounters } from './LiveMatchCounters.js';

const TEXTS = {
  accessibleValue: '{label}: {value}',
  accessibleAllowance: '{label}: {value} of {allowance}',
  warning: 'warning',
};

/**
 * The public match page's counters island. Its live refresh needs a running stream and API, so the
 * story shows the server-rendered values it starts from, which is what a viewer sees before any event.
 */
const meta: Meta<typeof LiveMatchCounters> = {
  title: 'Public/Organisms/LiveMatchCounters',
  component: LiveMatchCounters,
  args: {
    matchId: 'm-1',
    organizationAlias: 'liga',
    tournamentAlias: 'apertura',
    initialCounters: [
      {
        code: 'team-fouls',
        label: { en: 'Team fouls' },
        shortLabel: 'F',
        scope: 'match',
        events: ['team-foul'],
        warnAt: 9,
        values: [
          { entrantId: 'home', value: 4 },
          { entrantId: 'away', value: 2 },
        ],
      },
    ],
    initialPenalties: [],
    sides: [
      { entrantId: 'home', name: 'Norte', place: 'home' },
      { entrantId: 'away', name: 'Sur', place: 'away' },
    ],
    language: 'en',
    texts: TEXTS,
    penaltyTemplate: '{side}: {time} suspension',
    live: false,
  },
};

export default meta;
type Story = StoryObj<typeof LiveMatchCounters>;

export const Finished: Story = {};

export const Live: Story = { args: { live: true } };
