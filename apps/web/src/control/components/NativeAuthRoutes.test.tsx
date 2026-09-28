/* eslint-disable @typescript-eslint/no-explicit-any */
import { jest } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LoginRoute, ForgotPasswordRoute, ResetPasswordRoute } from './NativeAuthRoutes.js';
import { ControlIntl as BaseControlIntl } from '../i18n/ControlIntl.js';
import { clearAuthMethod, controlTokenStore, readAuthMethod } from '../session/token-store.js';
import { ToastProvider } from './ToastProvider.js';

function ControlIntl(props: React.ComponentProps<typeof BaseControlIntl>): React.JSX.Element {
  const { children, ...intlProps } = props;
  return (
    <BaseControlIntl {...intlProps}>
      <ToastProvider>{children}</ToastProvider>
    </BaseControlIntl>
  );
}

describe('NativeAuthRoutes', () => {
  beforeEach(() => {
    controlTokenStore.clear();
    clearAuthMethod();
    window.history.pushState({}, '', '/control/login');
    globalThis.fetch = jest.fn() as any;
  });

  // `locale="en"`, not `"es"`: openspec 0225 task 2.6 restated every
  // `auth.*` defaultMessage in the source language. There is still no
  // real per-locale catalogue for this namespace (a separate concern), so
  // every locale — Spanish included — now falls back to English rather
  // than to the Spanish these tests used to see by coincidence.

  it('renders LoginRoute and handles success', async () => {
    (globalThis.fetch as jest.Mock<any>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ accessToken: 'foo', expiresIn: 3600 }),
    } as any);

    render(
      <ControlIntl locale="en">
        <LoginRoute />
      </ControlIntl>,
    );

    const forgotLink = screen.getByRole('link', { name: /Forgot your password\?/i });
    expect(forgotLink.className).toContain('cl-link');
    expect(forgotLink.className).toContain('cl-focusable');

    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: 'password' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign in/i }));

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    // openspec 0302: a successful native login records which mechanism
    // established the session, so a later silent renewal knows which one to use.
    expect(readAuthMethod()).toBe('native');
  });

  it('shows an info toast when reached after a session-expired redirect (openspec 0302)', () => {
    window.history.pushState(
      {},
      '',
      '/control/login?returnTo=%2Fcontrol%2Fliga&reason=session_expired',
    );

    render(
      <ControlIntl locale="en">
        <LoginRoute />
      </ControlIntl>,
    );

    expect(screen.getByText('Your session expired. Please sign in again.')).toBeTruthy();
  });

  it('shows no toast on an ordinary visit with no reason on the query string', () => {
    render(
      <ControlIntl locale="en">
        <LoginRoute />
      </ControlIntl>,
    );

    expect(screen.queryByText('Your session expired. Please sign in again.')).toBeNull();
  });

  it('renders ForgotPasswordRoute and handles success', async () => {
    (globalThis.fetch as jest.Mock<any>).mockResolvedValueOnce({ ok: true } as any);

    render(
      <ControlIntl locale="en">
        <ForgotPasswordRoute />
      </ControlIntl>,
    );

    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'test@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /Send link/i }));

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(await screen.findByText('If the email exists, a link has been sent.')).toBeTruthy();
  });

  it('renders ResetPasswordRoute and handles success', async () => {
    // mock URL with token
    window.history.pushState({}, '', '?token=123');

    (globalThis.fetch as jest.Mock<any>).mockResolvedValueOnce({ ok: true } as any);

    render(
      <ControlIntl locale="en">
        <ResetPasswordRoute />
      </ControlIntl>,
    );

    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: 'newpassword' } });
    fireEvent.click(screen.getByRole('button', { name: /Reset password/i }));

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(await screen.findByText('Password updated. You can now sign in.')).toBeTruthy();
  });
});
