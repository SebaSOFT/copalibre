import type { Meta, StoryObj } from '@storybook/react-vite';
import { MatchCounters } from './MatchCounters.js';
import { matchCounterView } from '../../../lib/match-counters.js';

const TEXTS = {
  accessibleValue: '{label}: {value}',
  accessibleAllowance: '{label}: {value} of {allowance}',
  warning: 'warning',
};

const VIEWS = matchCounterView(
  [
    {
      code: 'team-fouls',
      label: { en: 'Team fouls' },
      shortLabel: 'F',
      scope: 'match',
      events: ['team-foul'],
      warnAt: 9,
      values: [
        { entrantId: 'home', value: 4 },
        { entrantId: 'away', value: 9 },
      ],
    },
    {
      code: 'timeouts',
      label: { en: 'Timeouts' },
      shortLabel: 'TM',
      scope: 'segment',
      events: ['timeout'],
      allowance: 1,
      values: [
        { entrantId: 'home', value: 1 },
        { entrantId: 'away', value: 0 },
      ],
    },
  ],
  [{ entrantId: 'home' }, { entrantId: 'away' }],
  'en',
  TEXTS,
);

/**
 * The public match page's counters per side, and the timed penalties of a live match with their
 * remaining time. The page-language template fills the penalty line.
 */
const meta: Meta<typeof MatchCounters> = {
  title: 'Public/Molecules/MatchCounters',
  component: MatchCounters,
  args: {
    views: VIEWS,
    sides: [
      { entrantId: 'home', name: 'Club Andes' },
      { entrantId: 'away', name: 'Deportivo Sur' },
    ],
    penalties: [{ timerId: 't1', entrantId: 'away', remainingSeconds: 120, sideName: 'Sur' }],
    penaltyTemplate: '{side}: {time} suspension',
  },
};

export default meta;
type Story = StoryObj<typeof MatchCounters>;

export const Live: Story = {};

export const Finished: Story = { args: { penalties: [] } };

export const NoCounters: Story = { args: { views: [], penalties: [] } };
