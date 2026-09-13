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
    expect(screen.getByRole('heading', { name: 'Accept invitation' })).toBeDefined();
  });

  it('hands its token to the form rather than making the form find one', () => {
    render(<AcceptInvitationScreen initialToken="invitation-token" />);

    expect(screen.queryByText('The invitation token was not found in the link.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Accept and start' })).toBeDefined();
  });

  it('renders with no props at all, letting the form read the URL itself', () => {
    // The Astro page always passes a token, but the screen is callable without
    // one — and then the form falls back to window.location.search, reporting
    // the missing-token state rather than rendering a form that cannot submit.
    render(<AcceptInvitationScreen />);

    expect(screen.getByText('The invitation token was not found in the link.')).toBeDefined();
  });

  it('provides its own IntlProvider, since accept.astro mounts it outside ControlShell/Dashboard.tsx', () => {
    // openspec 0225 task 8.3: this screen used to call useIntl() (via the
    // form it composes) with no ancestor IntlProvider at all, since it is a
    // third real route-mount point neither of ControlIntl's two documented
    // mount points reaches. This test exists so removing the self-wrap
    // fails loudly instead of only in production.
    expect(() => render(<AcceptInvitationScreen initialToken="invitation-token" />)).not.toThrow();
  });
});
