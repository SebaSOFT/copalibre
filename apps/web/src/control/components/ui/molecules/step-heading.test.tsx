import { render, screen } from '@testing-library/react';
import { StepHeading } from './step-heading.js';

describe('the StepHeading composition', () => {
  it('keeps the number out of the heading name', () => {
    render(<StepHeading step={3} title="Configure the discipline" />);
    expect(screen.getByRole('heading', { name: 'Configure the discipline' })).not.toBeNull();
  });

  it('renders at the level its page asks for', () => {
    render(<StepHeading level={2} step={1} title="Create the tournament" />);
    expect(screen.getByRole('heading', { level: 2 })).not.toBeNull();
  });

  it('defaults to a third-level heading', () => {
    render(<StepHeading step={1} title="Create the tournament" />);
    expect(screen.getByRole('heading', { level: 3 })).not.toBeNull();
  });

  it('hides the marker from assistive technology, because the order is the list’s', () => {
    const { container } = render(<StepHeading step={4} title="Publish" />);
    const marker = container.querySelector('.cl-step-heading__marker');
    expect(marker?.getAttribute('aria-hidden')).toBe('true');
    expect(marker?.textContent).toBe('4');
  });

  it('renders whatever the step says beneath its title', () => {
    render(
      <StepHeading step={1} title="Create the tournament">
        <p>Pick a discipline and a format.</p>
      </StepHeading>,
    );
    expect(screen.getByText('Pick a discipline and a format.')).not.toBeNull();
  });
});
