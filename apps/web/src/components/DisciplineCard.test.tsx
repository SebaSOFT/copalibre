import { render, screen } from '@testing-library/react';
import { DisciplineCard } from './DisciplineCard.js';

describe('the DisciplineCard component', () => {
  it('renders title, available funds badge, format pills, and install command', () => {
    render(
      <DisciplineCard
        title="Fútbol 11v11"
        code="football-11v11"
        formatPills={['single-elimination', 'quarter']}
        installCommand="copalibre module install football-11v11"
      />,
    );

    expect(screen.getByText('Fútbol 11v11')).not.toBeNull();
    expect(screen.getByText('[FONDO DISPONIBLE]')).not.toBeNull();
    expect(screen.getByText('[DISCIPLINE]')).not.toBeNull();
    expect(screen.getByText('[single-elimination]')).not.toBeNull();
    expect(screen.getByText('[quarter]')).not.toBeNull();
    expect(screen.getByText('copalibre module install football-11v11')).not.toBeNull();
  });
});
