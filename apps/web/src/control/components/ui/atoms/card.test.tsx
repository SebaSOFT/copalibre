import { render } from '@testing-library/react';
import { Card } from './card.js';

describe('Card', () => {
  it('sinks into its band by default', () => {
    const { container } = render(<Card />);
    expect(container.querySelector('.cl-card--inverse')).toBeNull();
  });

  it('lifts off its band in the inverse variant', () => {
    const { container } = render(<Card variant="inverse" />);
    expect(container.querySelector('.cl-card--inverse')).not.toBeNull();
  });

  it('keeps the chamfer it applies for a caller that supplies none', () => {
    const { container } = render(<Card variant="inverse" />);
    expect(container.querySelector('.cl-chamfer')).not.toBeNull();
  });

  it('leaves a caller’s own chamfer choice alone', () => {
    const { container } = render(<Card className="cl-chamfer" variant="inverse" />);
    expect(container.querySelector('.cl-chamfer--control')).toBeNull();
  });

  it('becomes a region once it is named', () => {
    const { container } = render(<Card aria-label="Release notes" variant="inverse" />);
    expect(container.querySelector('[role="region"]')).not.toBeNull();
  });
});
