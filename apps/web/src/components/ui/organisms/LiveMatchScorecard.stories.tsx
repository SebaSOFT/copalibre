import type { Meta, StoryObj } from '@storybook/react-vite';
import { LiveMatchScorecard } from './LiveMatchScorecard.js';

const meta = {
  title: 'Public/LiveMatchScorecard',
  component: LiveMatchScorecard,
} satisfies Meta<typeof LiveMatchScorecard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: {
    location: 'CANCHA 1',
    operationsLabel: 'OPERACIONES EN VIVO',
    clock: '78:48',
    homeTeam: {
      name: 'Atlético Huracán',
      score: 3,
      color: 'var(--cl-color-cyan-400)',
    },
    awayTeam: {
      name: 'Deportivo Central',
      score: 1,
      color: 'var(--cl-accent-team)',
    },
    events: [
      { minute: 14, player: 'G. Valenzuela', team: 'home' },
      { minute: 42, player: 'M. Benítez', team: 'away' },
      { minute: 61, player: 'J. Ramírez', team: 'home', varConfirmed: true },
      { minute: 75, player: 'G. Valenzuela', team: 'home' },
    ],
    comparatorTrace: {
      step: 2,
      text: 'Huracán advances to 1st place on Goal Difference (+8 vs +5).',
    },
  },
};

export const WithoutEvents: Story = {
  args: {
    location: 'ESTADIO CENTRAL',
    operationsLabel: 'FINAL EN CURSO',
    clock: '12:00',
    homeTeam: { name: 'Titan Gaming', score: 0 },
    awayTeam: { name: 'Vanguard Elite', score: 0 },
  },
};
