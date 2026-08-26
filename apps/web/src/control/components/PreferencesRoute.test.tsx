/* eslint-disable @typescript-eslint/no-explicit-any */
import { jest } from '@jest/globals';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PreferencesRoute } from './PreferencesRoute.js';
import { ControlIntl as BaseControlIntl } from '../i18n/ControlIntl.js';
import { controlTokenStore } from '../session/token-store.js';
import { ControlApiError } from '../lib/api-client.js';
import type { ControlApiClient, OrganizationResponse } from '../lib/api-client.js';
import { ToastProvider } from './ToastProvider.js';

function ControlIntl(props: React.ComponentProps<typeof BaseControlIntl>): React.JSX.Element {
  const { children, ...intlProps } = props;
  return (
    <BaseControlIntl {...intlProps}>
      <ToastProvider>{children}</ToastProvider>
    </BaseControlIntl>
  );
}

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
    fireEvent.change(input, { target: { files: [file] } });

    const dialog = await screen.findByRole('dialog');
    // jsdom never fires a real `load` on `react-easy-crop`'s internal <img>
    // (it does not load image bytes); firing it manually is what lets the
    // library compute a crop area and enable Confirm, the same way a real
    // browser's image decode would.
    fireEvent.load(dialog.querySelector('img') as HTMLImageElement);
    await waitFor(() =>
      expect((screen.getByText('Use image') as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(screen.getByText('Use image'));

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

    await screen.findByText('The request could not be completed. Try again.');
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

    const dialog = await screen.findByRole('dialog');
    fireEvent.load(dialog.querySelector('img') as HTMLImageElement);
    await waitFor(() =>
      expect((screen.getByText('Use image') as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(screen.getByText('Use image'));

    await screen.findByText('The request could not be completed. Try again.');
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

  it('requires confirmation before running a statistics rebuild, and shows the result', async () => {
    (globalThis.fetch as jest.Mock<any>).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as any);
    const rebuildStatistics = jest.fn<NonNullable<ControlApiClient['rebuildStatistics']>>(
      async () => ({ organizationAlias: 'liga-mendocina', matches: 12, figures: 40 }),
    );
    const client = stubClient({
      getOrganization: () => Promise.resolve(organization),
      rebuildStatistics,
    });

    render(
      <ControlIntl locale="en">
        <PreferencesRoute client={client} organizationAlias="liga-mendocina" />
      </ControlIntl>,
    );

    await screen.findByDisplayValue('Liga Mendocina');
    fireEvent.click(screen.getByRole('button', { name: 'Rebuild statistics' }));

    // Nothing runs until confirmed (design.md).
    expect(rebuildStatistics).not.toHaveBeenCalled();
    await screen.findByText('This recomputes every stored figure in scope. Continue?');

    fireEvent.click(screen.getByRole('button', { name: 'Confirm rebuild' }));

    await waitFor(() =>
      expect(rebuildStatistics).toHaveBeenCalledWith('liga-mendocina', undefined),
    );
    await screen.findByText('12 matches processed.');
  });

  it('cancels a rebuild without calling the API', async () => {
    (globalThis.fetch as jest.Mock<any>).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as any);
    const rebuildStatistics = jest.fn<NonNullable<ControlApiClient['rebuildStatistics']>>(
      async () => ({ organizationAlias: 'liga-mendocina', matches: 1, figures: 1 }),
    );
    const client = stubClient({
      getOrganization: () => Promise.resolve(organization),
      rebuildStatistics,
    });

    render(
      <ControlIntl locale="en">
        <PreferencesRoute client={client} organizationAlias="liga-mendocina" />
      </ControlIntl>,
    );

    await screen.findByDisplayValue('Liga Mendocina');
    fireEvent.click(screen.getByRole('button', { name: 'Rebuild statistics' }));
    await screen.findByText('This recomputes every stored figure in scope. Continue?');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(
      screen.queryByText('This recomputes every stored figure in scope. Continue?'),
    ).toBeNull();
    expect(rebuildStatistics).not.toHaveBeenCalled();
  });

  it('scopes a confirmed rebuild to the entered tournament alias', async () => {
    (globalThis.fetch as jest.Mock<any>).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as any);
    const rebuildStatistics = jest.fn<NonNullable<ControlApiClient['rebuildStatistics']>>(
      async () => ({
        organizationAlias: 'liga-mendocina',
        tournamentAlias: 'apertura-2026',
        matches: 1,
        figures: 2,
      }),
    );
    const client = stubClient({
      getOrganization: () => Promise.resolve(organization),
      rebuildStatistics,
    });

    render(
      <ControlIntl locale="en">
        <PreferencesRoute client={client} organizationAlias="liga-mendocina" />
      </ControlIntl>,
    );

    await screen.findByDisplayValue('Liga Mendocina');
    fireEvent.change(screen.getByLabelText('Tournament (optional)'), {
      target: { value: 'apertura-2026' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Rebuild statistics' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm rebuild' }));

    await waitFor(() =>
      expect(rebuildStatistics).toHaveBeenCalledWith('liga-mendocina', 'apertura-2026'),
    );
    await screen.findByText('1 match processed.');
  });

  it('surfaces a rebuild refusal with the server message', async () => {
    (globalThis.fetch as jest.Mock<any>).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as any);
    const client = stubClient({
      getOrganization: () => Promise.resolve(organization),
      rebuildStatistics: () => Promise.reject(new ControlApiError(403, 'Not an admin')),
    });

    render(
      <ControlIntl locale="en">
        <PreferencesRoute client={client} organizationAlias="liga-mendocina" />
      </ControlIntl>,
    );

    await screen.findByDisplayValue('Liga Mendocina');
    fireEvent.click(screen.getByRole('button', { name: 'Rebuild statistics' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm rebuild' }));

    await screen.findByText('Not an admin');
  });

  it('falls back to a generic rebuild-failure message for a non-API error', async () => {
    (globalThis.fetch as jest.Mock<any>).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as any);
    const client = stubClient({
      getOrganization: () => Promise.resolve(organization),
      rebuildStatistics: () => Promise.reject(new Error('network down')),
    });

    render(
      <ControlIntl locale="en">
        <PreferencesRoute client={client} organizationAlias="liga-mendocina" />
      </ControlIntl>,
    );

    await screen.findByDisplayValue('Liga Mendocina');
    fireEvent.click(screen.getByRole('button', { name: 'Rebuild statistics' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm rebuild' }));

    await screen.findByText('The request could not be completed. Try again.');
  });

  it('disables the rebuild trigger when the client offers no rebuildStatistics method', async () => {
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
    expect(screen.getByRole('button', { name: 'Rebuild statistics' })).toHaveProperty(
      'disabled',
      true,
    );
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

  it('renders the formatted storage usage in MB and GB', async () => {
    (globalThis.fetch as jest.Mock<any>).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as any);
    const client = stubClient({
      getOrganization: () => Promise.resolve(organization),
      getStorageUsage: () =>
        Promise.resolve({
          totalBytes: 142 * 1024 * 1024,
          objectCount: 38,
        }),
    });

    render(
      <ControlIntl locale="en">
        <PreferencesRoute client={client} organizationAlias="liga-mendocina" />
      </ControlIntl>,
    );

    expect(await screen.findByText('Storage usage')).toBeDefined();
    expect(await screen.findByText('142 MB across 38 files')).toBeDefined();
  });

  it('renders storage usage formatted dynamically in GB when over 1024 MB', async () => {
    (globalThis.fetch as jest.Mock<any>).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as any);
    const client = stubClient({
      getOrganization: () => Promise.resolve(organization),
      getStorageUsage: () =>
        Promise.resolve({
          totalBytes: 1610612736, // 1.5 GB
          objectCount: 120,
        }),
    });

    render(
      <ControlIntl locale="en">
        <PreferencesRoute client={client} organizationAlias="liga-mendocina" />
      </ControlIntl>,
    );

    expect(await screen.findByText('1.5 GB across 120 files')).toBeDefined();
  });

  it('renders zero-state storage usage correctly', async () => {
    (globalThis.fetch as jest.Mock<any>).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as any);
    const client = stubClient({
      getOrganization: () => Promise.resolve(organization),
      getStorageUsage: () =>
        Promise.resolve({
          totalBytes: 0,
          objectCount: 0,
        }),
    });

    render(
      <ControlIntl locale="en">
        <PreferencesRoute client={client} organizationAlias="liga-mendocina" />
      </ControlIntl>,
    );

    expect(await screen.findByText('0 MB across 0 files')).toBeDefined();
  });

  it('surfaces an error when storage usage fails to load', async () => {
    (globalThis.fetch as jest.Mock<any>).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as any);
    const client = stubClient({
      getOrganization: () => Promise.resolve(organization),
      getStorageUsage: () => Promise.reject(new Error('unauthorized or failed')),
    });

    render(
      <ControlIntl locale="en">
        <PreferencesRoute client={client} organizationAlias="liga-mendocina" />
      </ControlIntl>,
    );

    expect(await screen.findByText('Could not load storage usage.')).toBeDefined();
  });
});
