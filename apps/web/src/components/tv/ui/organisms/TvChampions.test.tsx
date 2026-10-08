import { render, screen, within } from '@testing-library/react';
import { TvChampions } from './TvChampions.js';

describe('TvChampions', () => {
  it('renders one block per zone, headed by the zone name', () => {
    render(
      <TvChampions
        zones={[
          { zoneName: 'Copa Oro', champions: [{ name: 'Andes Talleres', abbreviation: 'AND' }] },
          { zoneName: 'Copa Plata', champions: [{ name: 'Concepcion Patin Club' }] },
        ]}
      />,
    );

    const zones = screen.getAllByTestId('tv-champions-zone');
    expect(zones).toHaveLength(2);
    expect(
      within(zones[0] as HTMLElement).getByRole('heading', { name: 'Copa Oro' }),
    ).toBeDefined();
    expect(within(zones[0] as HTMLElement).getByText('Andes Talleres')).toBeDefined();
    expect(within(zones[1] as HTMLElement).queryByText('Andes Talleres')).toBeNull();
  });

  it('lists every co-champion of a shared title', () => {
    render(
      <TvChampions
        zones={[
          {
            zoneName: 'Copa Bronce',
            champions: [{ name: 'Atletico Union' }, { name: 'Estudiantil San Miguel' }],
          },
        ]}
      />,
    );
    expect(screen.getByText('Atletico Union')).toBeDefined();
    expect(screen.getByText('Estudiantil San Miguel')).toBeDefined();
  });

  it('falls back to the monogram when a champion has no emblem', () => {
    render(<TvChampions zones={[{ champions: [{ name: 'Huracan', abbreviation: 'HUR' }] }]} />);
    expect(screen.getAllByText('HUR').length).toBeGreaterThan(0);
    expect(screen.queryByRole('heading')).toBeNull();
  });
});
