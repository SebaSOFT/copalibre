import { render, screen } from '@testing-library/react';
import { Input } from './input.js';
import { DecisionHint } from './decision-hint.js';

describe('DecisionHint', () => {
  it('renders the description text bound to the id its control uses as aria-describedby', () => {
    render(
      <>
        <Input aria-describedby="format-hint" aria-label="Format" value="" onChange={() => {}} />
        <DecisionHint id="format-hint" text="Decides how fixtures are generated." />
      </>,
    );

    const hint = screen.getByText('Decides how fixtures are generated.');
    expect(hint.id).toBe('format-hint');
    expect(screen.getByLabelText('Format').getAttribute('aria-describedby')).toBe('format-hint');
  });

  it('renders nothing when no description is declared, so the control is byte-identical to before', () => {
    const { container } = render(<DecisionHint id="format-hint" />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing for an empty or blank description', () => {
    const { container } = render(<DecisionHint id="format-hint" text="   " />);
    expect(container.innerHTML).toBe('');
  });
});
