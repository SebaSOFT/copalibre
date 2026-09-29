import { render, screen } from '@testing-library/react';
import { withIntl } from '../../../i18n/test-support.js';
import { TournamentSummary, type TournamentSummaryFacts } from './tournament-summary.js';
import type { DisciplineSummaryData } from '../../../lib/discipline-summary.js';

const DISCIPLINE: DisciplineSummaryData = {
  defaults: { scoring: { pointsPerWin: 3 } },
  fieldPolicies: {
    'scoring.pointsPerWin': { permission: { kind: 'replaced' }, mutationClass: 'safe' },
  },
};

const FACTS: TournamentSummaryFacts = {
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

describe('TournamentSummary', () => {
  it('renders every stage and every registration fact when provided', () => {
    render(withIntl(<TournamentSummary discipline={DISCIPLINE} facts={FACTS} />));
    expect(screen.getByText('Group stage: round-robin')).not.toBeNull();
    expect(screen.getByText('Playoffs: single-elimination')).not.toBeNull();
    expect(screen.getByText('Public registration is open.')).not.toBeNull();
    expect(screen.getByText('Check-in is required.')).not.toBeNull();
    expect(screen.getByText('Check-in closes at 2026-10-01T18:00:00.000Z.')).not.toBeNull();
    expect(screen.getByText('Region: South Sector')).not.toBeNull();
    expect(screen.getByText('Capacity: 16 entrants')).not.toBeNull();
    // Composed DisciplineSummary rules section still renders underneath.
    expect(screen.getByText('Rules')).not.toBeNull();
  });

  it('omits a fact entirely rather than inventing a placeholder when it is absent', () => {
    render(
      withIntl(<TournamentSummary discipline={DISCIPLINE} facts={{ name: 'Copa Orbital' }} />),
    );
    expect(screen.queryByText(/Public registration/)).toBeNull();
    expect(screen.queryByText(/Check-in/)).toBeNull();
    expect(screen.queryByText(/Region:/)).toBeNull();
    expect(screen.queryByText(/Capacity:/)).toBeNull();
    expect(screen.queryByText('Stages')).toBeNull();
  });

  it('limits the discipline sections rendered when told to', () => {
    render(
      withIntl(<TournamentSummary discipline={DISCIPLINE} facts={FACTS} sections={['rules']} />),
    );
    expect(screen.getByText('Rules')).not.toBeNull();
    expect(screen.queryByText('Segments')).toBeNull();
    expect(screen.queryByText('Events')).toBeNull();
  });
});
