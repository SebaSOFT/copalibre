import type { Meta, StoryObj } from '@storybook/react-vite';
import { LiveMatchScorecard } from './LiveMatchScorecard.js';
import { referenceLiveDashboard } from '../../../lib/reference-fixtures.js';

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

/**
 * The canonical live match — 0223's reference scenario for this predecessor.
 *
 * Meridian Seven leading Ironclad Five 3:1, seventy-four minutes in, taken from
 * `referenceLiveDashboard()` rather than written out here. That is the point of
 * the fixture: the standings, the audit correction and the bracket beside it in
 * the workbench are describing the same competition, so a reviewer comparing
 * two compositions is comparing presentation and not wondering why the scores
 * disagree.
 *
 * No second scorecard was built for it. This is the predecessor organism,
 * rendering reference data.
 */
export const ReferenceLiveMatch: Story = {
  args: { homeTeam: { name: '', score: 0 }, awayTeam: { name: '', score: 0 } },
  render: function Render() {
    const dashboard = referenceLiveDashboard();
    const match = dashboard.matches[0];
    const [home, away] = match?.sides ?? [];
    const minutes = Math.floor((match?.clockSeconds ?? 0) / 60);
    const seconds = (match?.clockSeconds ?? 0) % 60;
    return (
      <LiveMatchScorecard
        awayTeam={{
          name: away?.name ?? '',
          score: away?.score ?? 0,
          color: 'var(--cl-accent-team)',
        }}
        clock={`${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`}
        homeTeam={{
          name: home?.name ?? '',
          score: home?.score ?? 0,
          color: 'var(--cl-color-cyan-400)',
        }}
      />
    );
  },
};

/**
 * The same match with the clock stopped and no events recorded yet — the state
 * a scorecard spends its first minutes in, and the one most likely to be
 * skipped in review because nothing has happened yet.
 */
export const ReferenceKickOff: Story = {
  args: { homeTeam: { name: '', score: 0 }, awayTeam: { name: '', score: 0 } },
  render: function Render() {
    const [home, away] = referenceLiveDashboard().matches[0]?.sides ?? [];
    return (
      <LiveMatchScorecard
        awayTeam={{ name: away?.name ?? '', score: 0 }}
        clock="00:00"
        homeTeam={{ name: home?.name ?? '', score: 0 }}
      />
    );
  },
};
