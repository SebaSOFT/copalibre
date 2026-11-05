import { fireEvent, render, screen } from '@testing-library/react';
import { ColumnHeaderTooltip } from './ColumnHeaderTooltip.js';

describe('ColumnHeaderTooltip', () => {
  it('renders a plain focusable trigger with no description wiring when none is given', () => {
    render(<ColumnHeaderTooltip label="Rank" />);
    const trigger = screen.getByRole('button', { name: 'Rank' });
    expect(trigger.getAttribute('aria-describedby')).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('links the sort button to the description via aria-describedby', () => {
    render(<ColumnHeaderTooltip description="Points" infoLabel="About PTS" label="PTS" />);
    const trigger = screen.getByRole('button', { name: 'PTS' });
    const descriptionId = trigger.getAttribute('aria-describedby');
    expect(document.getElementById(descriptionId ?? '')?.textContent).toBe('Points');
  });

  it('opens the description from its icon without sorting', () => {
    let clicks = 0;
    render(
      <ColumnHeaderTooltip
        description="Goal Difference"
        infoLabel="About GD"
        label="GD"
        onClick={() => (clicks += 1)}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'About GD' }));
    expect(screen.getByRole('dialog').textContent).toBe('Goal Difference');
    expect(clicks).toBe(0);
  });

  it('keeps the two controls as siblings, never one inside the other', () => {
    const { container } = render(
      <ColumnHeaderTooltip description="Points" infoLabel="About PTS" label="PTS" />,
    );
    expect(container.querySelectorAll('button button')).toHaveLength(0);
    expect(container.querySelectorAll('button')).toHaveLength(2);
  });

  it('fires the caller-supplied handler on activation, for sort wiring', () => {
    let clicks = 0;
    render(<ColumnHeaderTooltip label="PTS" onClick={() => (clicks += 1)} />);
    fireEvent.click(screen.getByRole('button', { name: 'PTS' }));
    expect(clicks).toBe(1);
  });

  it('renders the sort indicator inside the same trigger, never a nested interactive element', () => {
    const { container } = render(
      <ColumnHeaderTooltip
        indicator={
          <span aria-hidden="true" className="cl-column-header__indicator">
            ▾
          </span>
        }
        label="PTS"
      />,
    );
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(screen.getByRole('button').textContent).toBe('PTS▾');
  });
});
