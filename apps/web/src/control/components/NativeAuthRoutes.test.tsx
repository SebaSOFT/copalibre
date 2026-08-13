/* eslint-disable @typescript-eslint/no-explicit-any */
import { jest } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LoginRoute, ForgotPasswordRoute, ResetPasswordRoute } from './NativeAuthRoutes.js';
import { ControlIntl } from '../i18n/ControlIntl.js';
import { controlTokenStore } from '../session/token-store.js';

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
      </ControlIntl>
    );

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
      </ControlIntl>
    );

    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'test@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /Enviar enlace/i }));

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
  });

  it('renders ResetPasswordRoute and handles success', async () => {
    // mock URL with token
    window.history.pushState({}, '', '?token=123');

    (globalThis.fetch as jest.Mock<any>).mockResolvedValueOnce({ ok: true } as any);

    render(
      <ControlIntl locale="es">
        <ResetPasswordRoute />
      </ControlIntl>
    );

    fireEvent.change(screen.getByLabelText(/Contraseña/i), { target: { value: 'newpassword' } });
    fireEvent.click(screen.getByRole('button', { name: /Restablecer/i }));

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
  });
});
