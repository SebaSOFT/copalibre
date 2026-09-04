/* eslint-disable @typescript-eslint/no-explicit-any */
import { jest } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LoginRoute, ForgotPasswordRoute, ResetPasswordRoute } from './NativeAuthRoutes.js';
import { ControlIntl as BaseControlIntl } from '../i18n/ControlIntl.js';
import { controlTokenStore } from '../session/token-store.js';
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
    globalThis.fetch = jest.fn() as any;
  });

  it('renders LoginRoute and handles success', async () => {
    (globalThis.fetch as jest.Mock<any>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ accessToken: 'foo', expiresIn: 3600 }),
    } as any);

    render(
      <ControlIntl locale="es">
        <LoginRoute />
      </ControlIntl>,
    );

    const forgotLink = screen.getByRole('link', { name: /¿Olvidaste tu contraseña\?/i });
    expect(forgotLink.className).toContain('cl-link');
    expect(forgotLink.className).toContain('cl-focusable');

    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByLabelText(/Contraseña/i), { target: { value: 'password' } });
    fireEvent.click(screen.getByRole('button', { name: /Ingresar/i }));

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
  });

  it('renders ForgotPasswordRoute and handles success', async () => {
    (globalThis.fetch as jest.Mock<any>).mockResolvedValueOnce({ ok: true } as any);

    render(
      <ControlIntl locale="es">
        <ForgotPasswordRoute />
      </ControlIntl>,
    );

    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'test@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /Enviar enlace/i }));

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(await screen.findByText('Si el correo existe, se ha enviado un enlace.')).toBeTruthy();
  });

  it('renders ResetPasswordRoute and handles success', async () => {
    // mock URL with token
    window.history.pushState({}, '', '?token=123');

    (globalThis.fetch as jest.Mock<any>).mockResolvedValueOnce({ ok: true } as any);

    render(
      <ControlIntl locale="es">
        <ResetPasswordRoute />
      </ControlIntl>,
    );

    fireEvent.change(screen.getByLabelText(/Contraseña/i), { target: { value: 'newpassword' } });
    fireEvent.click(screen.getByRole('button', { name: /Restablecer/i }));

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(await screen.findByText('Contraseña actualizada. Ya puedes ingresar.')).toBeTruthy();
  });
});
