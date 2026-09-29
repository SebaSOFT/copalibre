import { fireEvent, render, screen } from '@testing-library/react';
import { ColumnHeaderTooltip } from './ColumnHeaderTooltip.js';

describe('ColumnHeaderTooltip', () => {
  it('renders a plain focusable trigger with no description wiring when none is given', () => {
    render(<ColumnHeaderTooltip label="Rank" />);
    const trigger = screen.getByRole('button', { name: 'Rank' });
    expect(trigger.getAttribute('aria-describedby')).toBeNull();
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('links the trigger to its description bubble via aria-describedby', () => {
    render(<ColumnHeaderTooltip description="Points" label="PTS" />);
    const trigger = screen.getByRole('button', { name: 'PTS' });
    const bubbleId = trigger.getAttribute('aria-describedby');
    expect(bubbleId).not.toBeNull();
    const bubble = screen.getByRole('tooltip');
    expect(bubble.id).toBe(bubbleId);
    expect(bubble.textContent).toBe('Points');
  });

  it('reaches the description on keyboard focus, not only pointer hover', () => {
    render(<ColumnHeaderTooltip description="Goal Difference" label="GD" />);
    const trigger = screen.getByRole('button', { name: 'GD' });
    trigger.focus();
    expect(document.activeElement).toBe(trigger);
    expect(screen.getByRole('tooltip').textContent).toBe('Goal Difference');
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
