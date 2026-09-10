import { render, screen } from '@testing-library/react';
import { Badge } from './badge.js';

describe('Badge', () => {
  it('renders the label as its own text, never a colour alone', () => {
    render(<Badge label="Live" />);
    expect(screen.getByText('Live')).not.toBeNull();
  });

  it('carries no variant class in its default state', () => {
    const { container } = render(<Badge label="Live" />);
    const badge = container.querySelector('.cl-badge');
    expect(badge?.className).toBe('cl-badge');
  });

  it.each([
    ['eyebrow', 'cl-badge--eyebrow'],
    ['section', 'cl-badge--section'],
  ] as const)('renders the %s tag as chrome', (variant, expected) => {
    const { container } = render(<Badge label="Standings" variant={variant} />);
    expect(container.querySelector(`.${expected}`)).not.toBeNull();
  });

  it('keeps a caller class alongside the variant class', () => {
    const { container } = render(<Badge className="cl-badge--rank" label="4" variant="eyebrow" />);
    const badge = container.querySelector('.cl-badge');
    expect(badge?.className).toContain('cl-badge--eyebrow');
    expect(badge?.className).toContain('cl-badge--rank');
  });

  it('omits the status dot unless a live condition asks for one', () => {
    render(<Badge label="Final" />);
    expect(screen.queryByTestId('badge-dot')).toBeNull();
  });

  it('hides the status dot from assistive technology, because the word carries it', () => {
    render(<Badge dot label="Live" variant="eyebrow" />);
    expect(screen.getByTestId('badge-dot').getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByText('Live')).not.toBeNull();
  });
});
