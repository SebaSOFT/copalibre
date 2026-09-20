import type { Meta, StoryObj } from '@storybook/react-vite';
import { DisciplineSummary } from './discipline-summary.js';
import type { DisciplineSummaryData } from '../../../lib/discipline-summary.js';

/**
 * Sample data uses abstract, sport-neutral names — never a real discipline —
 * since the whole point of this component is that it renders identically for
 * any discipline, from declared data alone.
 */
const SAMPLE_DATA: DisciplineSummaryData = {
  segmentTypes: [
    { name: 'regulation', label: 'Regulation period', timed: true, defaultDurationSeconds: 2700 },
    { name: 'overtime', label: 'Overtime', timed: true, defaultDurationSeconds: 300 },
    { name: 'shootout', label: 'Tiebreak shootout', timed: false },
  ],
  eventDefinitions: [
    {
      code: 'scoring-play',
      label: 'Scoring play',
      description: 'A successful attempt that adds to the side’s score.',
      actorRequirement: 'side',
      effects: [{ kind: 'score', awardTo: 'actor', delta: 1 }],
    },
    {
      code: 'individual-highlight',
      label: 'Individual highlight',
      description: 'Recorded for the season statistics leaderboard.',
      actorRequirement: 'person',
      effects: [{ kind: 'statistic', statisticCode: 'highlights', delta: 1 }],
    },
    {
      code: 'timed-infraction',
      label: 'Timed infraction',
      description: 'Sends the offending player to the penalty area for the stated duration.',
      actorRequirement: 'person',
      effects: [{ kind: 'timed-penalty', durationSeconds: 120, affects: 'actor' }],
    },
    {
      code: 'staff-caution',
      label: 'Staff caution',
      actorRequirement: 'person-or-staff',
      effects: [{ kind: 'tag', tagCode: 'cautioned', action: 'applied' }],
    },
    {
      code: 'match-note',
      label: 'Match note',
      actorRequirement: 'none',
    },
  ],
  defaults: {
    scoring: { pointsPerWin: 3, pointsPerDraw: 1 },
    tiebreakers: ['points', 'score-difference'],
    venuePolicy: { neutralGround: false },
  },
  fieldPolicies: {
    'scoring.pointsPerWin': {
      permission: { kind: 'replaced' },
      mutationClass: 'blocked_after_results',
      label: 'Points per win',
      description: 'How many standings points a win is worth.',
    },
    'scoring.pointsPerDraw': {
      permission: { kind: 'replaced' },
      mutationClass: 'blocked_after_results',
    },
    tiebreakers: {
      permission: { kind: 'merged', strategy: 'union-list' },
      mutationClass: 'requires_rebuild',
      label: 'Tiebreakers',
    },
    'venuePolicy.neutralGround': {
      permission: { kind: 'forbidden' },
      mutationClass: 'safe',
      label: 'Neutral ground required',
    },
  },
};

const meta = {
  title: 'Admin/Organisms/DisciplineSummary',
  component: DisciplineSummary,
} satisfies Meta<typeof DisciplineSummary>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: { data: SAMPLE_DATA },
};

/**
 * Every branch the spec requires in one place: timed and untimed segments,
 * a labeled and an unlabeled rule field, a forbidden field and a
 * requires-rebuild field, an event that changes the result and one that
 * only carries disciplinary effects, and every `actorRequirement` value.
 */
export const Matrix: Story = {
  args: { data: SAMPLE_DATA },
  render: () => (
    <div className="cl-band" style={{ display: 'grid', gap: 'var(--cl-space-4)' }}>
      <DisciplineSummary data={SAMPLE_DATA} />
    </div>
  ),
};

export const EmptyDiscipline: Story = {
  args: {
    data: { segmentTypes: [], eventDefinitions: [], defaults: {}, fieldPolicies: {} },
  },
};
