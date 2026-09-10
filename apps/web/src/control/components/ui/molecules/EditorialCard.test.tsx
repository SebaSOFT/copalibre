import { render, screen } from '@testing-library/react';
import { EditorialCard } from './EditorialCard.js';

describe('the EditorialCard composition', () => {
  it('composes the card owner rather than framing itself', () => {
    const { container } = render(<EditorialCard title="Module update" />);
    expect(container.querySelector('.cl-card')).not.toBeNull();
    expect(container.querySelectorAll('.cl-card')).toHaveLength(1);
  });

  it('renders its title as the card’s own title', () => {
    render(<EditorialCard title="football-11v11 1.2.0 → 1.3.0" />);
    expect(screen.getByText('football-11v11 1.2.0 → 1.3.0')).not.toBeNull();
  });

  it('omits the eyebrow, dateline and callout where the surface has none', () => {
    const { container } = render(<EditorialCard title="Module update" />);
    expect(container.querySelector('.cl-badge')).toBeNull();
    expect(container.querySelector('.cl-callout-banner')).toBeNull();
  });

  it('wears the eyebrow as a chrome tag rather than a state badge', () => {
    const { container } = render(<EditorialCard eyebrow="Module update" title="1.3.0" />);
    expect(container.querySelector('.cl-badge--eyebrow')).not.toBeNull();
  });

  it('renders the next step through the callout owner', () => {
    const { container } = render(
      <EditorialCard
        callout={{ title: 'Install this version', description: 'Enter the alias below.' }}
        title="1.3.0"
      />,
    );
    expect(container.querySelector('.cl-callout-banner')).not.toBeNull();
    expect(screen.getByText('Install this version')).not.toBeNull();
  });

  it('lifts off its band in the inverse variant', () => {
    const { container } = render(<EditorialCard title="1.3.0" variant="inverse" />);
    expect(container.querySelector('.cl-card--inverse')).not.toBeNull();
  });
});
