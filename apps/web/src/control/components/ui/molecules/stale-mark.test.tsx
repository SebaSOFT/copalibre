import { render, screen } from '@testing-library/react';
import { StaleMark } from './stale-mark.js';

describe('StaleMark', () => {
  it('pairs stale text with the age and a status announcement', () => {
    render(<StaleMark age="2 min" label="Stale" />);

    expect(screen.getByRole('status').textContent).toContain('Stale');
    expect(screen.getByText('2 min').textContent).toBe('2 min');
  });
});
