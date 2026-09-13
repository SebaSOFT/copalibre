import { render, screen } from '@testing-library/react';
import { MetricStrip } from './metric-strip.js';

describe('the MetricStrip composition', () => {
  it('renders an explicit unavailable state rather than a placeholder number', () => {
    render(
      <MetricStrip
        ariaLabel="Summary"
        metrics={[{ key: 'a', label: 'Matches today', unavailableLabel: 'Not available' }]}
      />,
    );
    expect(screen.getByText('Not available')).not.toBeNull();
    expect(screen.queryByText('0')).toBeNull();
    expect(screen.queryByText('—')).toBeNull();
  });

  it('renders a measured zero as a figure, not as an absence', () => {
    const { container } = render(
      <MetricStrip
        ariaLabel="Summary"
        metrics={[
          { key: 'a', label: 'Matches today', value: 0, unavailableLabel: 'Not available' },
        ]}
      />,
    );
    expect(container.querySelector('.cl-stat-tile__value')?.textContent).toBe('0');
    expect(screen.queryByText('Not available')).toBeNull();
  });

  it('composes the tile owner rather than restating its markup', () => {
    const { container } = render(
      <MetricStrip ariaLabel="Summary" metrics={[{ key: 'a', label: 'Matches', value: 3 }]} />,
    );
    expect(container.querySelectorAll('.cl-stat-tile')).toHaveLength(1);
  });

  it('names the group so the figures are heard with their subject', () => {
    render(
      <MetricStrip ariaLabel="Tournament summary" metrics={[{ key: 'a', label: 'X', value: 1 }]} />,
    );
    expect(screen.getByRole('group', { name: 'Tournament summary' })).not.toBeNull();
  });

  it('marks a demonstration figure as one, so it is not read as a measurement', () => {
    render(
      <MetricStrip
        ariaLabel="Summary"
        metrics={[
          { key: 'a', label: 'Matches', value: 9, demonstrationLabel: 'Demonstration figure' },
        ]}
      />,
    );
    expect(screen.getByText('Demonstration figure')).not.toBeNull();
  });

  it('leaves a production figure unmarked', () => {
    render(<MetricStrip ariaLabel="Summary" metrics={[{ key: 'a', label: 'M', value: 9 }]} />);
    expect(screen.queryByText('Demonstration figure')).toBeNull();
  });
});
