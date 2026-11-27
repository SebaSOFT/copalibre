import { render, screen } from '@testing-library/react';
import { RatioBar } from './ratio-bar.js';

describe('RatioBar', () => {
  it('names the measurement and shows its figures', () => {
    render(<RatioBar label="Matches resolved" max={10} value={4} valueLabel="4 / 10 matches" />);

    const bar = screen.getByRole('progressbar', { name: 'Matches resolved' });
    expect(bar.getAttribute('max')).toBe('10');
    expect(bar.getAttribute('value')).toBe('4');
    expect(screen.getByText('4 / 10 matches')).toBeTruthy();
  });

  it('keeps an out-of-range value and an empty whole inside the bar', () => {
    const { rerender } = render(<RatioBar label="Done" max={10} value={14} valueLabel="14" />);
    expect(screen.getByRole('progressbar').getAttribute('value')).toBe('10');

    rerender(<RatioBar label="Done" max={0} value={3} valueLabel="0" />);
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('max')).toBe('1');
    expect(bar.getAttribute('value')).toBe('1');
  });
});
