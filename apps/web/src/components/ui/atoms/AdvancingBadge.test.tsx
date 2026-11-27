import { render, screen } from '@testing-library/react';
import { AdvancingBadge } from './AdvancingBadge.js';

describe('AdvancingBadge', () => {
  it('renders localized text and positive badge semantics with an icon', () => {
    const { container } = render(<AdvancingBadge label="Avanza" />);
    const badge = screen.getByText('Avanza').closest('.cl-badge');
    expect(badge?.classList.contains('cl-badge--positive')).toBe(true);
    expect(badge?.classList.contains('cl-advancing-badge')).toBe(true);
    expect(container.querySelector('.cl-icon')).not.toBeNull();
  });
});
