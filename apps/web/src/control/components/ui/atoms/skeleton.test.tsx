import { render, screen } from '@testing-library/react';
import { Skeleton } from './skeleton.js';

describe('Skeleton', () => {
  it.each(['block', 'line', 'table-row'] as const)('renders the %s shape as busy', (variant) => {
    const { container } = render(<Skeleton label="Loading tournaments" variant={variant} />);
    const skeleton = container.querySelector('.cl-skeleton');

    expect(skeleton?.getAttribute('aria-busy')).toBe('true');
    expect(skeleton?.classList.contains(`cl-skeleton--${variant}`)).toBe(true);
    expect(screen.getByText('Loading tournaments').classList.contains('cl-visually-hidden')).toBe(
      true,
    );
  });
});
