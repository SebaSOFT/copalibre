import { fireEvent, render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import { EmptyState, type EmptyStateProps } from './empty-state.js';

describe('EmptyState', () => {
  it('renders navigation as a link and supports a nested heading', () => {
    const onClick = jest.fn();
    render(
      <EmptyState
        icon="trophy"
        heading="No tournaments"
        headingLevel={3}
        description="Create one to begin."
        action={{ label: 'Create tournament', href: '/control/league/tournaments/new', onClick }}
      />,
    );
    expect(screen.getByRole('heading', { level: 3 }).textContent).toBe('No tournaments');
    const link = screen.getByRole('link', { name: 'Create tournament' });
    expect(link.getAttribute('href')).toBe('/control/league/tournaments/new');
    fireEvent.click(link);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
  it('requires and invokes an action for an actionable empty result', () => {
    const onClick = jest.fn();
    render(
      <EmptyState
        action={{ label: 'Create tournament', onClick }}
        description="Create one to open registration."
        heading="No tournaments yet"
        icon="trophy"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Create tournament' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('names who can act when the viewer has no permission', () => {
    render(
      <EmptyState
        description="There are no tournaments."
        heading="No tournaments yet"
        icon="trophy"
        reason="no-permission"
        whoCanAct="An organization admin can create tournaments."
      />,
    );

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('An organization admin can create tournaments.').textContent).toBe(
      'An organization admin can create tournaments.',
    );
  });

  it('renders informational copy without an action or permission claim', () => {
    render(
      <EmptyState
        description="Create a tournament before pairing a TV screen."
        heading="No devices connected"
        icon="offline"
        reason="informational"
      />,
    );

    expect(screen.getByText('Create a tournament before pairing a TV screen.')).toBeDefined();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText(/can create/i)).toBeNull();
  });

  it('rejects a missing action unless an informational or permission reason is explicit', () => {
    const invalid = {
      icon: 'trophy',
      heading: 'No tournaments yet',
      description: 'Create one to open registration.',
    } as unknown as EmptyStateProps;

    expect(() => render(<EmptyState {...invalid} />)).toThrow(
      'EmptyState requires an action unless reason is informational or no-permission.',
    );
  });
});
