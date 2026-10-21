import { fireEvent, render, screen, within } from '@testing-library/react';
import { AnalyticsStatusChart } from './analytics-status-chart.js';

const props = {
  title: 'Tournament status',
  legendLabel: 'Legend',
  chartLabel: 'Show as chart',
  tableLabel: 'Show as table',
  valueLabel: 'Tournaments',
  emptyLabel: 'No tournaments found.',
  otherLabel: 'Other',
  series: [
    { key: 'live', label: 'Live', value: 3, slot: 0 },
    { key: 'upcoming', label: 'Upcoming', value: 2, slot: 1 },
    { key: 'finished', label: 'Finished', value: 1, slot: 2 },
  ],
};

describe('AnalyticsStatusChart', () => {
  it('shows a labelled plot and matching table view', () => {
    render(<AnalyticsStatusChart {...props} />);

    expect(screen.getByRole('region', { name: 'Tournament status' })).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Legend' }).children).toHaveLength(3);
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Show as table' }));
    const tableRegion = screen.getByRole('region', {
      name: 'Tournament status: Show as table',
    });
    const table = within(tableRegion).getByRole('table');
    expect(within(table).getByRole('row', { name: 'Live 3' })).toBeTruthy();
    expect(within(table).getByRole('row', { name: 'Upcoming 2' })).toBeTruthy();
    expect(within(table).getByRole('row', { name: 'Finished 1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Show as table' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('groups every series after the fifth under the neutral Other label', () => {
    const series = Array.from({ length: 7 }, (_, slot) => ({
      key: `series-${slot}`,
      label: `Series ${slot + 1}`,
      value: slot + 1,
      slot,
    }));

    render(<AnalyticsStatusChart {...props} series={series} />);

    const legend = screen.getByRole('list', { name: 'Legend' });
    expect(within(legend).getAllByText('Other')).toHaveLength(1);
    expect(within(legend).queryByText('Series 6')).toBeNull();
    expect(screen.getByText('13')).toBeTruthy();
  });
});
