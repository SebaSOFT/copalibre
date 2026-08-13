/* eslint-disable @typescript-eslint/no-explicit-any */
import { jest } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PreferencesRoute } from './PreferencesRoute.js';
import { ControlIntl } from '../i18n/ControlIntl.js';
import { controlTokenStore } from '../session/token-store.js';

describe('PreferencesRoute', () => {
  beforeEach(() => {
    controlTokenStore.write('test-token', Date.now() + 3600000);
    globalThis.fetch = jest.fn() as any;
  });

  it('renders and lists PATs', async () => {
    (globalThis.fetch as jest.Mock<any>).mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          tokenId: 'test-pat-1',
          label: 'Test PAT',
          revoked: false,
          createdAt: new Date().toISOString(),
          lastUsedAt: undefined,
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
          scopes: ['copalibre.control'],
        },
      ],
    } as any);

    render(
      <ControlIntl locale="es">
        <PreferencesRoute />
      </ControlIntl>
    );

    expect(screen.getByText(/Personal Access Tokens/i)).toBeDefined();
    await waitFor(() => {
      expect(screen.getByText(/Test PAT/i)).toBeDefined();
    });
  });

  it('creates a new PAT', async () => {
    (globalThis.fetch as jest.Mock<any>)
      .mockResolvedValueOnce({ ok: true, json: async () => [] } as any) // load PATs
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: 'clpat_generated123' }),
      } as any) // create PAT
      .mockResolvedValueOnce({ ok: true, json: async () => [] } as any); // reload PATs

    render(
      <ControlIntl locale="es">
        <PreferencesRoute />
      </ControlIntl>
    );

    fireEvent.change(screen.getByLabelText(/Token Label/i), { target: { value: 'New PAT' } });
    fireEvent.click(screen.getByRole('button', { name: /Generate Token/i }));

    await waitFor(() => {
      expect(screen.getByText(/clpat_generated123/i)).toBeDefined();
    });
  });

  it('revokes a PAT', async () => {
    (globalThis.fetch as jest.Mock<any>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            tokenId: 'test-pat-1',
            label: 'Test PAT',
            revoked: false,
            createdAt: new Date().toISOString(),
            lastUsedAt: undefined,
            expiresAt: new Date(Date.now() + 3600000).toISOString(),
            scopes: ['copalibre.control'],
          },
        ],
      } as any) // load PATs
      .mockResolvedValueOnce({ ok: true } as any) // revoke PAT
      .mockResolvedValueOnce({ ok: true, json: async () => [] } as any); // reload PATs

    render(
      <ControlIntl locale="es">
        <PreferencesRoute />
      </ControlIntl>
    );

    await waitFor(() => {
      expect(screen.getByText(/Test PAT/i)).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /Revoke/i }));

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2));
  });
});
