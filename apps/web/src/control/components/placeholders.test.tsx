import { render, screen } from '@testing-library/react';
import { ClubEmblemPlaceholder, PersonPhotoPlaceholder } from './placeholders.js';

describe('placeholders', () => {
  it('renders the person photo placeholder at its default size', () => {
    render(<PersonPhotoPlaceholder title="No photo uploaded" />);
    expect(screen.getByRole('img', { name: 'No photo uploaded' })).toBeDefined();
  });

  it('renders the club emblem placeholder at its default size', () => {
    render(<ClubEmblemPlaceholder title="No emblem" />);
    expect(screen.getByRole('img', { name: 'No emblem' })).toBeDefined();
  });

  it('renders the club emblem placeholder at an explicit size', () => {
    render(<ClubEmblemPlaceholder size={64} title="No emblem" />);
    expect(screen.getByRole('img', { name: 'No emblem' }).classList).toContain(
      'cl-placeholder-size-64',
    );
  });
});
