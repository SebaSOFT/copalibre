import { render, screen } from '@testing-library/react';
import { LiveMatchScorecard } from './MatchCard.js';

describe('the LiveMatchScorecard component', () => {
  const props = {
    location: 'CANCHA 2',
    operationsLabel: 'MATCH LIVE',
    clock: '65:30',
    homeTeam: { name: 'Boca Juniors', score: 2 },
    awayTeam: { name: 'River Plate', score: 1 },
    events: [
      { minute: 23, player: 'E. Cavani', team: 'home' as const, varConfirmed: true },
      { minute: 55, player: 'F. Colidio', team: 'away' as const },
    ],
    comparatorTrace: {
      step: 1,
      text: 'Boca Juniors leads Group B on total points.',
    },
  };

  it('renders tactical header, location and clock', () => {
    render(<LiveMatchScorecard {...props} />);

    expect(screen.getByText('CANCHA 2')).not.toBeNull();
    expect(screen.getByText('MATCH LIVE')).not.toBeNull();
    expect(screen.getByText('65:30')).not.toBeNull();
  });

  it('renders central monospace score box with tabular numbers', () => {
    render(<LiveMatchScorecard {...props} />);

    expect(screen.getByText('[ 2 : 1 ]')).not.toBeNull();
    expect(screen.getByText('Boca Juniors')).not.toBeNull();
    expect(screen.getByText('River Plate')).not.toBeNull();
  });

  it('renders goal events with VAR confirmation tag', () => {
    render(<LiveMatchScorecard {...props} />);

    expect(screen.getByText("23'")).not.toBeNull();
    expect(screen.getByText('E. Cavani')).not.toBeNull();
    expect(screen.getByText('VAR CONFIRMED')).not.toBeNull();
  });

  it('renders standings comparator trace callout', () => {
    render(<LiveMatchScorecard {...props} />);

    expect(screen.getByText('[Step 1]')).not.toBeNull();
    expect(screen.getByText('Boca Juniors leads Group B on total points.')).not.toBeNull();
  });
});
