import type { Meta, StoryObj } from '@storybook/react-vite';
import { TournamentSummary, type TournamentSummaryFacts } from './tournament-summary.js';
import type { DisciplineSummaryData } from '../../../lib/discipline-summary.js';

const DISCIPLINE: DisciplineSummaryData = {
  segmentTypes: [
    { name: 'regulation', label: 'Regulation period', timed: true, defaultDurationSeconds: 2700 },
  ],
  eventDefinitions: [
    {
      code: 'scoring-play',
      label: 'Scoring play',
      description: 'A successful attempt that adds to the side’s score.',
      actorRequirement: 'side',
      effects: [{ kind: 'score', awardTo: 'actor', delta: 1 }],
    },
  ],
  defaults: {
    scoring: { pointsPerWin: 3, pointsPerDraw: 1 },
    tiebreakers: ['points', 'score-difference'],
  },
  fieldPolicies: {
    'scoring.pointsPerWin': {
      permission: { kind: 'replaced' },
      mutationClass: 'blocked_after_results',
      label: 'Points per win',
    },
    tiebreakers: {
      permission: { kind: 'merged', strategy: 'union-list' },
      mutationClass: 'requires_rebuild',
      label: 'Tiebreakers',
    },
  },
};

const EVERY_FACT: TournamentSummaryFacts = {
  name: 'Copa Orbital',
  stages: [
    { name: 'Group stage', format: 'round-robin' },
    { name: 'Playoffs', format: 'single-elimination' },
  ],
  publicRegistration: true,
  requiresCheckIn: true,
  checkInClosesAt: '2026-10-01T18:00:00.000Z',
  region: 'South Sector',
  capacity: 16,
};

const meta = {
  title: 'Admin/Organisms/TournamentSummary',
  component: TournamentSummary,
} satisfies Meta<typeof TournamentSummary>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: { discipline: DISCIPLINE, facts: EVERY_FACT },
};

/** A single-stage tournament with only the fields the wizard's review step always has. */
export const OneStageRequiredFieldsOnly: Story = {
  args: {
    discipline: DISCIPLINE,
    facts: {
      name: 'Copa Orbital',
      stages: [{ name: 'Main stage', format: 'single-elimination' }],
      publicRegistration: false,
      requiresCheckIn: false,
    },
  },
};

/** Neither settings nor ruleset page fetches stage data yet — facts still render gracefully. */
export const NoStageData: Story = {
  args: {
    discipline: DISCIPLINE,
    facts: {
      name: 'Copa Orbital',
      publicRegistration: true,
      requiresCheckIn: false,
      region: 'South Sector',
      capacity: 32,
    },
  },
};
