import { render, screen, within } from '@testing-library/react';
import { StageSwitcher, type StageSwitcherItem } from './StageSwitcher.js';

const STAGES: readonly StageSwitcherItem[] = [
  { stageNumber: 1, label: 'Grupos', href: '/t/stages/1' },
  { stageNumber: 2, label: 'Copas', href: '/t/stages/2' },
];

describe('the StageSwitcher molecule', () => {
  it('lists every stage by its label inside a named navigation', () => {
    render(<StageSwitcher label="Fases del torneo" stages={STAGES} currentStageNumber={1} />);
    const nav = screen.getByRole('navigation', { name: 'Fases del torneo' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual(['Grupos', 'Copas']);
    expect(links[1]?.getAttribute('href')).toBe('/t/stages/2');
  });

  it('marks only the current stage as the current page', () => {
    render(<StageSwitcher label="Fases del torneo" stages={STAGES} currentStageNumber={2} />);
    const current = screen.getByRole('link', { current: 'page' });
    expect(current.textContent).toBe('Copas');
    expect(screen.getAllByRole('link', { current: false })).toHaveLength(1);
  });

  it('renders nothing when the tournament has one stage', () => {
    const { container } = render(
      <StageSwitcher label="Fases del torneo" stages={STAGES.slice(0, 1)} currentStageNumber={1} />,
    );
    expect(container.innerHTML).toBe('');
  });
});
