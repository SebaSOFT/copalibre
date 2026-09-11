import { render, screen } from '@testing-library/react';
import { TiebreakerSequence } from './tiebreaker-sequence.js';

describe('the TiebreakerSequence molecule', () => {
  const rules = [
    { step: 1, label: 'Total Points', triggered: false },
    { step: 2, label: 'Goal Difference', triggered: true },
    { step: 3, label: 'Goals Scored', triggered: false },
  ];

  it('renders ordered chain of tiebreaker rules and title', () => {
    render(<TiebreakerSequence title="Tiebreaker Pipeline" rules={rules} />);

    expect(screen.getByText('Tiebreaker Pipeline')).not.toBeNull();
    expect(screen.getByText('Total Points')).not.toBeNull();
    expect(screen.getByText('Goal Difference')).not.toBeNull();
    expect(screen.getByText('Goals Scored')).not.toBeNull();
  });

  it('visually highlights the triggered rule with badge indicator', () => {
    const { container } = render(<TiebreakerSequence rules={rules} />);

    expect(screen.getByText('Triggered')).not.toBeNull();
    const triggeredRule = container.querySelector('.cl-tiebreaker-sequence__rule--triggered');
    expect(triggeredRule).not.toBeNull();
  });
});
