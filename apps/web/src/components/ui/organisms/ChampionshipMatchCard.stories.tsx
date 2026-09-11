import type { Meta, StoryObj } from '@storybook/react-vite';
import { ChampionshipMatchCard } from './MatchCard.js';

const meta = {
  title: 'Public/ChampionshipMatchCard',
  component: ChampionshipMatchCard,
} satisfies Meta<typeof ChampionshipMatchCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const GrandFinalCompleted: Story = {
  args: {
    title: 'GRAN FINAL',
    status: 'FINAL',
    scheduledTime: '2026-09-08 21:00',
    homeParticipant: {
      name: 'Real Madrid CF',
      seed: 1,
      score: 3,
      winner: true,
    },
    awayParticipant: {
      name: 'FC Barcelona',
      seed: 2,
      score: 2,
      winner: false,
    },
  },
};

export const LiveFinal: Story = {
  args: {
    title: 'GRAND FINAL',
    status: 'LIVE',
    homeParticipant: {
      name: 'Sentinels',
      seed: 1,
      score: 12,
      winner: false,
    },
    awayParticipant: {
      name: 'Fnatic',
      seed: 3,
      score: 11,
      winner: false,
    },
  },
};
