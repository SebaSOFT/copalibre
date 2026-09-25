import type { Meta, StoryObj } from '@storybook/react-vite';
import { TvMatchIndicators } from './TvMatchIndicators.js';
import type { LiveMatch } from '../../../../lib/live-state.js';

const MATCH: LiveMatch = {
  matchId: 'm-1',
  stageNumber: 1,
  matchNumber: 7,
  state: 'live',
  projectionVersion: 1,
  sides: [
    { entrantId: 'e-1', name: 'Club Atlético Independiente', abbreviation: 'CAI', score: 2, state: 'live' },
    { entrantId: 'e-2', name: 'Deportivo San Juan', abbreviation: 'DSJ', score: 1, state: 'live' },
  ],
};

const meta = {
  title: 'TV/TvMatchIndicators',
  component: TvMatchIndicators,
  args: {
    possessionLabel: 'Posesión',
    penaltyLabel: 'Sanción',
  },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof TvMatchIndicators>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Possession: Story = {
  args: { match: { ...MATCH, possessionEntrantId: 'e-1' } },
};

export const TimedPenalty: Story = {
  args: {
    match: { ...MATCH, activePenalties: [{ timerId: 't-1', entrantId: 'e-2', remainingSeconds: 125 }] },
  },
};

export const PossessionAndPenalty: Story = {
  args: {
    match: {
      ...MATCH,
      possessionEntrantId: 'e-1',
      activePenalties: [{ timerId: 't-1', entrantId: 'e-2', remainingSeconds: 125 }],
    },
  },
};

/** No explicit projection fact: the surface renders nothing, not a guess. */
export const NoFacts: Story = { args: { match: MATCH } };
