/* eslint-disable @typescript-eslint/no-explicit-any */
import { jest } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AcceptInvitationForm } from './AcceptInvitationForm.js';
import { withIntl } from '../i18n/test-support.js';

describe('AcceptInvitationForm', () => {
  let navigateMock: jest.Mock<any>;

  beforeEach(() => {
    globalThis.fetch = jest.fn() as any;
    navigateMock = jest.fn();
    window.history.pushState({}, '', '/');
  });

  it('renders error when no token is present', () => {
    render(withIntl(<AcceptInvitationForm navigate={navigateMock} />));
    expect(screen.getByText('The invitation token was not found in the link.')).toBeTruthy();
  });

  it('initializes from window.location.search when initialToken is not passed', () => {
    window.history.pushState({}, '', '/?token=url-token');

    render(withIntl(<AcceptInvitationForm navigate={navigateMock} />));
    expect(screen.queryByText('The invitation token was not found in the link.')).toBeNull();
  });

  it('validates password minimum length of 8 characters', async () => {
    render(withIntl(<AcceptInvitationForm initialToken="valid-token" navigate={navigateMock} />));

    fireEvent.change(screen.getByLabelText(/^Password/i), {
      target: { value: 'short' },
    });
    fireEvent.change(screen.getByLabelText(/Confirm password/i), {
      target: { value: 'short' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Accept and start/i }));

    expect(await screen.findByText('The password must be at least 8 characters.')).toBeTruthy();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('validates passwords match', async () => {
    render(withIntl(<AcceptInvitationForm initialToken="valid-token" navigate={navigateMock} />));

    fireEvent.change(screen.getByLabelText(/^Password/i), {
      target: { value: 'Password123!' },
    });
    fireEvent.change(screen.getByLabelText(/Confirm password/i), {
      target: { value: 'Password456!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Accept and start/i }));

    expect(await screen.findByText('Passwords do not match.')).toBeTruthy();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('handles successful invitation acceptance and redirect', async () => {
    (globalThis.fetch as jest.Mock<any>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ accessToken: 'sample-jwt-token' }),
    } as any);

    render(withIntl(<AcceptInvitationForm initialToken="valid-token" navigate={navigateMock} />));

    fireEvent.change(screen.getByLabelText(/Full name/i), {
      target: { value: '  Admin User  ' },
    });
    fireEvent.change(screen.getByLabelText(/^Password/i), {
      target: { value: 'Password123!' },
    });
    fireEvent.change(screen.getByLabelText(/Confirm password/i), {
      target: { value: 'Password123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Accept and start/i }));

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

    expect(await screen.findByText('Account set up!')).toBeTruthy();

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
      json: async () => ({ message: 'Invitation token expired' }),
    } as any);

    render(withIntl(<AcceptInvitationForm initialToken="expired-token" navigate={navigateMock} />));

    fireEvent.change(screen.getByLabelText(/^Password/i), {
      target: { value: 'Password123!' },
    });
    fireEvent.change(screen.getByLabelText(/Confirm password/i), {
      target: { value: 'Password123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Accept and start/i }));

    expect(await screen.findByText('Invitation token expired')).toBeTruthy();
  });

  it('handles server error response when json parsing fails', async () => {
    (globalThis.fetch as jest.Mock<any>).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('invalid json');
      },
    } as any);

    render(withIntl(<AcceptInvitationForm initialToken="valid-token" navigate={navigateMock} />));

    fireEvent.change(screen.getByLabelText(/^Password/i), {
      target: { value: 'Password123!' },
    });
    fireEvent.change(screen.getByLabelText(/Confirm password/i), {
      target: { value: 'Password123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Accept and start/i }));

    expect(await screen.findByText('Failed to accept the invitation (500).')).toBeTruthy();
  });

  it('handles unexpected network error', async () => {
    (globalThis.fetch as jest.Mock<any>).mockRejectedValueOnce(new Error('Network offline'));

    render(withIntl(<AcceptInvitationForm initialToken="valid-token" navigate={navigateMock} />));

    fireEvent.change(screen.getByLabelText(/^Password/i), {
      target: { value: 'Password123!' },
    });
    fireEvent.change(screen.getByLabelText(/Confirm password/i), {
      target: { value: 'Password123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Accept and start/i }));

    expect(await screen.findByText('Network offline')).toBeTruthy();
  });

  it('handles unexpected non-Error thrown', async () => {
    (globalThis.fetch as jest.Mock<any>).mockRejectedValueOnce('string rejection');

    render(withIntl(<AcceptInvitationForm initialToken="valid-token" navigate={navigateMock} />));

    fireEvent.change(screen.getByLabelText(/^Password/i), {
      target: { value: 'Password123!' },
    });
    fireEvent.change(screen.getByLabelText(/Confirm password/i), {
      target: { value: 'Password123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Accept and start/i }));

    expect(await screen.findByText('Unexpected error accepting the invitation.')).toBeTruthy();
  });
});
