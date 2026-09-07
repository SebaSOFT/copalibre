import { render, screen } from '@testing-library/react';
import { AcceptInvitationScreen } from './AcceptInvitationScreen.js';

describe('AcceptInvitationScreen', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/');
  });

  it('composes the shared auth template around the invitation card', () => {
    // The screen exists so the form is positioned by the page tier instead of
    // centring and margining itself, which is what left it flush to both
    // mobile edges.
    const { container } = render(<AcceptInvitationScreen initialToken="invitation-token" />);

    expect(container.querySelector('.cl-auth-screen')).not.toBeNull();
    expect(container.querySelector('.cl-auth-screen__panel')).not.toBeNull();
    expect(container.querySelector('.cl-card')).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'Aceptar invitación' })).toBeDefined();
  });

  it('hands its token to the form rather than making the form find one', () => {
    render(<AcceptInvitationScreen initialToken="invitation-token" />);

    expect(screen.queryByText('No se encontró el token de invitación en el enlace.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Aceptar y comenzar' })).toBeDefined();
  });

  it('renders with no props at all, letting the form read the URL itself', () => {
    // The Astro page always passes a token, but the screen is callable without
    // one — and then the form falls back to window.location.search, reporting
    // the missing-token state rather than rendering a form that cannot submit.
    render(<AcceptInvitationScreen />);

    expect(screen.getByText('No se encontró el token de invitación en el enlace.')).toBeDefined();
  });
});
