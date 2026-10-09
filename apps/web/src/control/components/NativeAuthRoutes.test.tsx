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

  // `locale="en"`, not `"es"`: every
  // `auth.*` defaultMessage is restated in the source language. The public return link
  // is translated in each control catalog; remaining auth copy still uses
  // English source messages.

  it('renders LoginRoute and handles success', async () => {
    (globalThis.fetch as jest.Mock<typeof fetch>).mockResolvedValueOnce({
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
    expect(screen.getByRole('link', { name: 'Return to public site' }).getAttribute('href')).toBe(
      '/',
    );

    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: 'password' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign in/i }));

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    // A successful native login records which mechanism
    // established the session, so a later silent renewal knows which one to use.
    expect(readAuthMethod()).toBe('native');
  });

  it('shows an info toast when reached after a session-expired redirect', () => {
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
    (globalThis.fetch as jest.Mock<typeof fetch>).mockResolvedValueOnce({ ok: true } as any);

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

    (globalThis.fetch as jest.Mock<typeof fetch>).mockResolvedValueOnce({ ok: true } as any);

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
