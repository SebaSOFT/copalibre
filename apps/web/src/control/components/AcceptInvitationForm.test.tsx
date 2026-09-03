/* eslint-disable @typescript-eslint/no-explicit-any */
import { jest } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AcceptInvitationForm } from './AcceptInvitationForm.js';

describe('AcceptInvitationForm', () => {
  let navigateMock: jest.Mock<any>;

  beforeEach(() => {
    globalThis.fetch = jest.fn() as any;
    navigateMock = jest.fn();
    window.history.pushState({}, '', '/');
  });

  it('renders error when no token is present', () => {
    render(<AcceptInvitationForm navigate={navigateMock} />);
    expect(screen.getByText('No se encontró el token de invitación en el enlace.')).toBeTruthy();
  });

  it('initializes from window.location.search when initialToken is not passed', () => {
    window.history.pushState({}, '', '/?token=url-token');

    render(<AcceptInvitationForm navigate={navigateMock} />);
    expect(screen.queryByText('No se encontró el token de invitación en el enlace.')).toBeNull();
  });

  it('validates password minimum length of 8 characters', async () => {
    render(<AcceptInvitationForm initialToken="valid-token" navigate={navigateMock} />);

    fireEvent.change(screen.getByLabelText(/^Contraseña/i), {
      target: { value: 'short' },
    });
    fireEvent.change(screen.getByLabelText(/Confirmar contraseña/i), {
      target: { value: 'short' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Aceptar y Comenzar/i }));

    expect(await screen.findByText('La contraseña debe tener al menos 8 caracteres.')).toBeTruthy();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('validates passwords match', async () => {
    render(<AcceptInvitationForm initialToken="valid-token" navigate={navigateMock} />);

    fireEvent.change(screen.getByLabelText(/^Contraseña/i), {
      target: { value: 'Password123!' },
    });
    fireEvent.change(screen.getByLabelText(/Confirmar contraseña/i), {
      target: { value: 'Password456!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Aceptar y Comenzar/i }));

    expect(await screen.findByText('Las contraseñas no coinciden.')).toBeTruthy();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('handles successful invitation acceptance and redirect', async () => {
    (globalThis.fetch as jest.Mock<any>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ accessToken: 'sample-jwt-token' }),
    } as any);

    render(<AcceptInvitationForm initialToken="valid-token" navigate={navigateMock} />);

    fireEvent.change(screen.getByLabelText(/Nombre completo/i), {
      target: { value: '  Admin User  ' },
    });
    fireEvent.change(screen.getByLabelText(/^Contraseña/i), {
      target: { value: 'Password123!' },
    });
    fireEvent.change(screen.getByLabelText(/Confirmar contraseña/i), {
      target: { value: 'Password123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Aceptar y Comenzar/i }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/auth/accept-invitation',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            token: 'valid-token',
            password: 'Password123!',
            name: 'Admin User',
          }),
        }),
      );
    });

    expect(await screen.findByText('¡Cuenta configurada con éxito!')).toBeTruthy();

    await waitFor(
      () => {
        expect(navigateMock).toHaveBeenCalledWith('/control/app');
      },
      { timeout: 2500 },
    );
  });

  it('handles server error response', async () => {
    (globalThis.fetch as jest.Mock<any>).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ message: 'Token de invitación expirado' }),
    } as any);

    render(<AcceptInvitationForm initialToken="expired-token" navigate={navigateMock} />);

    fireEvent.change(screen.getByLabelText(/^Contraseña/i), {
      target: { value: 'Password123!' },
    });
    fireEvent.change(screen.getByLabelText(/Confirmar contraseña/i), {
      target: { value: 'Password123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Aceptar y Comenzar/i }));

    expect(await screen.findByText('Token de invitación expirado')).toBeTruthy();
  });

  it('handles server error response when json parsing fails', async () => {
    (globalThis.fetch as jest.Mock<any>).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('invalid json');
      },
    } as any);

    render(<AcceptInvitationForm initialToken="valid-token" navigate={navigateMock} />);

    fireEvent.change(screen.getByLabelText(/^Contraseña/i), {
      target: { value: 'Password123!' },
    });
    fireEvent.change(screen.getByLabelText(/Confirmar contraseña/i), {
      target: { value: 'Password123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Aceptar y Comenzar/i }));

    expect(await screen.findByText('Error al aceptar invitación (500)')).toBeTruthy();
  });

  it('handles unexpected network error', async () => {
    (globalThis.fetch as jest.Mock<any>).mockRejectedValueOnce(new Error('Network offline'));

    render(<AcceptInvitationForm initialToken="valid-token" navigate={navigateMock} />);

    fireEvent.change(screen.getByLabelText(/^Contraseña/i), {
      target: { value: 'Password123!' },
    });
    fireEvent.change(screen.getByLabelText(/Confirmar contraseña/i), {
      target: { value: 'Password123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Aceptar y Comenzar/i }));

    expect(await screen.findByText('Network offline')).toBeTruthy();
  });

  it('handles unexpected non-Error thrown', async () => {
    (globalThis.fetch as jest.Mock<any>).mockRejectedValueOnce('string rejection');

    render(<AcceptInvitationForm initialToken="valid-token" navigate={navigateMock} />);

    fireEvent.change(screen.getByLabelText(/^Contraseña/i), {
      target: { value: 'Password123!' },
    });
    fireEvent.change(screen.getByLabelText(/Confirmar contraseña/i), {
      target: { value: 'Password123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Aceptar y Comenzar/i }));

    expect(await screen.findByText('Error inesperado al aceptar la invitación')).toBeTruthy();
  });
});
