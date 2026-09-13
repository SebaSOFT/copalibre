import { render, screen } from '@testing-library/react';
import { ChampionshipMatchCard } from './MatchCard.js';

describe('the ChampionshipMatchCard component', () => {
  const props = {
    title: 'GRAN FINAL',
    homeParticipant: { name: 'Real Madrid', seed: 1, score: 3, winner: true },
    awayParticipant: { name: 'Barcelona', seed: 2, score: 1 },
    status: 'FINAL',
    scheduledTime: '21:00',
  };

  it('renders grand final title, scheduled time and participants with scores', () => {
    render(<ChampionshipMatchCard {...props} />);

    expect(screen.getByText('GRAN FINAL')).not.toBeNull();
    expect(screen.getByText('21:00')).not.toBeNull();
    expect(screen.getByText('Real Madrid')).not.toBeNull();
    expect(screen.getByText('Barcelona')).not.toBeNull();
    expect(screen.getByText('3')).not.toBeNull();
    expect(screen.getByText('1')).not.toBeNull();
  });
});
