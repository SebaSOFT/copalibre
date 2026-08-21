/* eslint-disable @typescript-eslint/no-explicit-any */
import { jest } from '@jest/globals';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PreferencesRoute } from './PreferencesRoute.js';
import { ControlIntl } from '../i18n/ControlIntl.js';
import { controlTokenStore } from '../session/token-store.js';
import { ControlApiError } from '../lib/api-client.js';
import type { ControlApiClient, OrganizationResponse } from '../lib/api-client.js';

const organization: OrganizationResponse = {
  organizationId: 'org-1',
  alias: 'liga-mendocina',
  name: 'Liga Mendocina',
  primaryLanguage: 'es',
  timezone: 'America/Argentina/San_Juan',
};

function stubClient(overrides: Partial<ControlApiClient>): ControlApiClient {
  return {
    listMyOrganizations: () => Promise.resolve([]),
    listDisciplines: () => Promise.resolve([]),
    createTournament: () => Promise.reject(new Error('not used')),
    listRegistrations: () => Promise.resolve([]),
    bulkReview: () => Promise.reject(new Error('not used')),
    reviewRegistration: () => Promise.reject(new Error('not used')),
    fetchStandings: () => Promise.reject(new Error('not used')),
    fetchTiebreakTrace: () => Promise.reject(new Error('not used')),
    fetchTableLayouts: () => Promise.resolve([]),
    fetchTableProjection: () => Promise.reject(new Error('not used')),
    fetchSeeding: () => Promise.reject(new Error('not used')),
    publishSeeding: () => Promise.reject(new Error('not used')),
    listOrganizationRoles: () => Promise.resolve([]),
    inviteOrganizationUser: () => Promise.reject(new Error('not used')),
    changeOrganizationRole: () => Promise.reject(new Error('not used')),
    deleteOrganizationRole: () => Promise.reject(new Error('not used')),
    ...overrides,
  };
}

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
      </ControlIntl>,
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
      </ControlIntl>,
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
      </ControlIntl>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Test PAT/i)).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /Revoke/i }));

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2));
  });

  it('loads and edits the organization identity when an alias is given', async () => {
    (globalThis.fetch as jest.Mock<any>).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as any);
    const updateOrganizationSettings = jest.fn<
      NonNullable<ControlApiClient['updateOrganizationSettings']>
    >(async () => ({ ...organization, name: 'Liga Renombrada' }));
    const client = stubClient({
      getOrganization: () => Promise.resolve(organization),
      updateOrganizationSettings,
    });

    render(
      <ControlIntl locale="en">
        <PreferencesRoute client={client} organizationAlias="liga-mendocina" />
      </ControlIntl>,
    );

    const nameInput = await screen.findByDisplayValue('Liga Mendocina');

    fireEvent.change(nameInput, { target: { value: 'Liga Renombrada' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() =>
      expect(updateOrganizationSettings).toHaveBeenCalledWith('liga-mendocina', {
        name: 'Liga Renombrada',
      }),
    );
    await screen.findByText('Organization updated.');
  });

  it('shows a placeholder with no emblem, and uploads one', async () => {
    (globalThis.fetch as jest.Mock<any>).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as any);
    const uploadOrganizationEmblem = jest.fn<
      NonNullable<ControlApiClient['uploadOrganizationEmblem']>
    >(async () => ({ objectId: 'object-1' }));
    const client = stubClient({
      getOrganization: () => Promise.resolve(organization),
      uploadOrganizationEmblem,
    });

    render(
      <ControlIntl locale="en">
        <PreferencesRoute client={client} organizationAlias="liga-mendocina" />
      </ControlIntl>,
    );

    await screen.findByLabelText('Name');
    expect(screen.getByTitle('No emblem uploaded')).toBeTruthy();

    const file = new File(['fake-bytes'], 'emblem.png', { type: 'image/png' });
    const input = screen.getByLabelText('Upload emblem');
    await waitFor(() => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    await waitFor(() =>
      expect(uploadOrganizationEmblem).toHaveBeenCalledWith('liga-mendocina', {
        filename: 'emblem.png',
        contentType: 'image/png',
        contentBase64: expect.any(String),
      }),
    );
  });

  it('does not update state after unmounting mid-fetch', async () => {
    (globalThis.fetch as jest.Mock<any>).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as any);
    let resolveOrg: (() => void) | undefined;
    const client = stubClient({
      getOrganization: () =>
        new Promise((resolve) => {
          resolveOrg = () => resolve(organization);
        }),
    });
    const { unmount } = render(
      <ControlIntl locale="en">
        <PreferencesRoute client={client} organizationAlias="liga-mendocina" />
      </ControlIntl>,
    );

    unmount();
    await act(async () => {
      resolveOrg?.();
      await Promise.resolve();
    });
  });

  it('reports a save failure with the server refusal message', async () => {
    (globalThis.fetch as jest.Mock<any>).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as any);
    const client = stubClient({
      getOrganization: () => Promise.resolve(organization),
      updateOrganizationSettings: () => Promise.reject(new ControlApiError(409, 'Rechazado')),
    });

    render(
      <ControlIntl locale="en">
        <PreferencesRoute client={client} organizationAlias="liga-mendocina" />
      </ControlIntl>,
    );

    await screen.findByDisplayValue('Liga Mendocina');
    fireEvent.click(screen.getByText('Save'));

    await screen.findByText('Rechazado');
  });

  it('falls back to the generic save-failure message for a non-API error', async () => {
    (globalThis.fetch as jest.Mock<any>).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as any);
    const client = stubClient({
      getOrganization: () => Promise.resolve(organization),
      updateOrganizationSettings: () => Promise.reject(new Error('network down')),
    });

    render(
      <ControlIntl locale="en">
        <PreferencesRoute client={client} organizationAlias="liga-mendocina" />
      </ControlIntl>,
    );

    await screen.findByDisplayValue('Liga Mendocina');
    fireEvent.click(screen.getByText('Save'));

    await screen.findByText('The request was refused.');
  });

  it('ignores a save click when the client has no updateOrganizationSettings method', async () => {
    (globalThis.fetch as jest.Mock<any>).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as any);
    const client = stubClient({ getOrganization: () => Promise.resolve(organization) });

    render(
      <ControlIntl locale="en">
        <PreferencesRoute client={client} organizationAlias="liga-mendocina" />
      </ControlIntl>,
    );

    await screen.findByDisplayValue('Liga Mendocina');
    fireEvent.click(screen.getByText('Save'));

    expect(screen.queryByText('Organization updated.')).toBeNull();
  });

  it('reports an emblem-upload failure that is not a ControlApiError', async () => {
    (globalThis.fetch as jest.Mock<any>).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as any);
    const client = stubClient({
      getOrganization: () => Promise.resolve(organization),
      uploadOrganizationEmblem: () => Promise.reject(new Error('network down')),
    });

    render(
      <ControlIntl locale="en">
        <PreferencesRoute client={client} organizationAlias="liga-mendocina" />
      </ControlIntl>,
    );

    await screen.findByDisplayValue('Liga Mendocina');
    const file = new File(['fake-bytes'], 'emblem.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Upload emblem'), { target: { files: [file] } });

    await screen.findByText('The request was refused.');
  });

  it('renders the emblem image for an organization that has one', async () => {
    (globalThis.fetch as jest.Mock<any>).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as any);
    const client = stubClient({
      getOrganization: () => Promise.resolve({ ...organization, emblemObjectId: 'obj-1' }),
    });

    render(
      <ControlIntl locale="en">
        <PreferencesRoute client={client} organizationAlias="liga-mendocina" />
      </ControlIntl>,
    );

    expect(await screen.findByAltText('Organization emblem')).toBeTruthy();
  });

  it('reports an organization load it could not complete', async () => {
    (globalThis.fetch as jest.Mock<any>).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as any);
    const client = stubClient({
      getOrganization: () => Promise.reject(new Error('down')),
    });

    render(
      <ControlIntl locale="en">
        <PreferencesRoute client={client} organizationAlias="liga-mendocina" />
      </ControlIntl>,
    );

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain(
        'Could not load organization settings.',
      ),
    );
  });
});
