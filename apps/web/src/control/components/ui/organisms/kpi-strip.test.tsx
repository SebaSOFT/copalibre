import { render, screen } from '@testing-library/react';
import { KpiStrip, type KpiStripMetric } from './kpi-strip.js';

interface DashboardCounts {
  readonly activeTournaments: number;
  readonly pendingRegistrations: number;
  readonly matchesToday?: number;
}

const metrics: readonly KpiStripMetric<DashboardCounts>[] = [
  {
    key: 'active-tournaments',
    label: 'Active tournaments',
    sourceField: 'activeTournaments',
    formatValue: String,
  },
  {
    key: 'pending-registrations',
    label: 'Pending registrations',
    sourceField: 'pendingRegistrations',
    formatValue: String,
  },
  {
    key: 'matches-today',
    label: 'Matches today',
    sourceField: 'matchesToday',
    formatValue: String,
  },
];

describe('KpiStrip', () => {
  it('binds visible tiles to named fields and omits unavailable fields', () => {
    const { container } = render(
      <KpiStrip
        ariaLabel="Organization dashboard metrics"
        metrics={metrics}
        source={{ activeTournaments: 1, pendingRegistrations: 0 }}
      />,
    );

    expect(screen.getByText('Active tournaments')).toBeDefined();
    expect(screen.queryByText('Matches today')).toBeNull();
    expect(container.querySelectorAll('.cl-stat-tile')).toHaveLength(2);
    expect(
      screen
        .getByText('Active tournaments')
        .closest('.cl-stat-tile')
        ?.getAttribute('data-source-field'),
    ).toBe('activeTournaments');
    expect(
      screen
        .getByText('Pending registrations')
        .closest('.cl-stat-tile')
        ?.getAttribute('data-source-field'),
    ).toBe('pendingRegistrations');
  });
});
