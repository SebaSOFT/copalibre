import { expectFirstReadFailure } from './resilient-read.test-support.js';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from 'node:fs';
import { jest } from '@jest/globals';
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { PAT_PATH, PreferencesPage } from '../pages/PreferencesPage.js';
import { ControlIntl as BaseControlIntl } from '../../i18n/ControlIntl.js';
import { ControlApiError } from '../../lib/api-client.js';
import type { ControlApiClient, OrganizationResponse } from '../../lib/api-client.js';
import { ToastProvider } from '../ToastProvider.js';

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

describe('PreferencesPage', () => {
  const defaultFetch = globalThis.fetch;
  beforeEach(() => {
    globalThis.fetch = jest.fn((...args: Parameters<typeof defaultFetch>) => {
      const [input] = args;
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String((input as any)?.href ?? input);
      if (url.startsWith('blob:')) return defaultFetch(...args);
      if (url.endsWith('/api/auth/pat/scopes'))
        return Promise.resolve({
          ok: true,
          json: async () => ({ scopes: ['copalibre.control'] }),
        } as any);
      if (url.endsWith('/api/auth/pat') && args[1]?.method !== 'POST')
        return Promise.resolve({ ok: true, json: async () => [] } as any);
      return undefined as any;
    }) as any;
  });

  it('renders and lists PATs', async () => {
    (globalThis.fetch as jest.Mock<typeof fetch>).mockResolvedValueOnce({
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
        <PreferencesPage />
      </ControlIntl>,
    );

    expect(await screen.findByRole('heading', { name: 'Tokens de acceso personal' })).toBeDefined();
    expect(
      screen.getByText(
        'Generá tokens para acceder directamente a la API. Solo se muestran una vez.',
      ),
    ).toBeDefined();
    expect(screen.getByRole('form', { name: 'Tokens de acceso personal' })).toBeDefined();
    // The token's use is one click away: the API reference opens in a new tab.
    const reference = screen.getByRole('link', {
      name: 'Probá la API con un token en la referencia de la API',
    });
    expect(reference.getAttribute('href')).toBe('/help/api-reference/');
    expect(reference.getAttribute('target')).toBe('_blank');
    expect(reference.getAttribute('rel')).toBe('noopener noreferrer');
    await waitFor(() => {
      expect(screen.getByText(/Test PAT/i)).toBeDefined();
    });
    expect(
      within(screen.getByRole('region', { name: 'Tokens de acceso personal' })).getByText(
        'copalibre.control',
      ),
    ).toBeDefined();
  });

  it('asks for tokens on a path the API contract declares', () => {
    const contract = JSON.parse(
      readFileSync(
        new URL('../../../../../../packages/contracts/openapi/v1.json', import.meta.url),
        'utf8',
      ),
    ) as { paths: Record<string, unknown> };

    for (const path of [
      PAT_PATH,
      `${PAT_PATH}/scopes`,
      `${PAT_PATH}/{tokenId}`,
      `${PAT_PATH}/{tokenId}/restore`,
    ]) {
      expect(contract.paths[path]).toBeDefined();
    }
  });

  it('keeps organization settings usable when the token read fails', async () => {
    const client = {
      listMyOrganizations: jest.fn(async () => []),
      getOrganization: jest.fn(async () => ({
        organizationId: 'org-id',
        alias: 'liga',
        name: 'Liga Mendocina',
        primaryLanguage: 'es',
        timezone: 'UTC',
      })),
    } as unknown as ControlApiClient;
    const patFetch = jest.fn(async () => ({ ok: false, status: 404 }) as Response);

    render(
      <ControlIntl locale="es">
        <PreferencesPage
          isOrganizationPage
          client={client}
          organizationAlias="liga"
          patFetch={patFetch}
        />
      </ControlIntl>,
    );

    expect(await screen.findByDisplayValue('Liga Mendocina')).toBeDefined();
    expect(await screen.findByRole('heading', { name: 'Tokens de acceso personal' })).toBeDefined();
    expect(screen.queryByRole('form', { name: 'Tokens de acceso personal' })).toBeNull();
  });

  it('creates a new PAT', async () => {
    (globalThis.fetch as jest.Mock<typeof fetch>)
      .mockResolvedValueOnce({ ok: true, json: async () => [] } as any) // load PATs
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ scopes: ['copalibre.control'] }),
      } as any) // load available scopes
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tokenId: 'created-pat',
          label: 'New PAT',
          token: 'clpat_generated123',
          scopes: ['copalibre.control'],
          revoked: false,
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 60 * 86_400_000).toISOString(),
        }),
      } as any) // create PAT
      .mockResolvedValueOnce({ ok: true, json: async () => [] } as any); // reload PATs

    render(
      <ControlIntl locale="es">
        <PreferencesPage />
      </ControlIntl>,
    );

    fireEvent.change(await screen.findByLabelText('Etiqueta del token'), {
      target: { value: 'New PAT' },
    });
    fireEvent.change(screen.getByLabelText('Vence en (días)'), { target: { value: '60' } });
    fireEvent.click(await screen.findByRole('checkbox', { name: 'copalibre.control' }));
    fireEvent.click(screen.getByRole('button', { name: 'Generar token' }));

    await waitFor(() => {
      expect(screen.getByText('Token creado. Copialo ahora:')).toBeDefined();
      expect(screen.getByText(/clpat_generated123/i)).toBeDefined();
    });
  });

  it('requires selecting at least one PAT permission', async () => {
    (globalThis.fetch as jest.Mock<typeof fetch>).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as any);

    render(
      <ControlIntl locale="es">
        <PreferencesPage />
      </ControlIntl>,
    );

    await screen.findByRole('checkbox', { name: 'copalibre.control' });
    expect(
      (screen.getByRole('button', { name: 'Generar token' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByText('Elegí al menos un permiso para generar el token.')).toBeDefined();
    expect((globalThis.fetch as jest.Mock<typeof fetch>).mock.calls).toHaveLength(2);
  });

  it('revokes an unused PAT immediately and restores it from Undo', async () => {
    (globalThis.fetch as jest.Mock<typeof fetch>)
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
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ scopes: ['copalibre.control'] }),
      } as any) // load available scopes
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ reversible: true, tokens: 1 }),
      } as any) // preview PAT revoke
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ reversible: true, tokens: 1, dryRun: false }),
      } as any) // revoke PAT
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tokenId: 'test-pat-1',
          label: 'Test PAT',
          revoked: false,
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
          scopes: ['copalibre.control'],
        }),
      } as any); // restore PAT

    render(
      <ControlIntl locale="es">
        <PreferencesPage />
      </ControlIntl>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Test PAT/i)).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Revocar' }));

    await screen.findByText('Token revocado.');
    expect(screen.queryByText('Test PAT')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }));
    await screen.findByText('Token restaurado.');
    expect(await screen.findByText('Test PAT')).toBeDefined();
    expect(globalThis.fetch).toHaveBeenCalledTimes(5);
  });

  it('previews an in-use PAT revoke and confirms it in a consequence dialog', async () => {
    (globalThis.fetch as jest.Mock<typeof fetch>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            tokenId: 'test-pat-used',
            label: 'In-use PAT',
            revoked: false,
            createdAt: new Date().toISOString(),
            lastUsedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 3600000).toISOString(),
            scopes: ['copalibre.control'],
          },
        ],
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ scopes: ['copalibre.control'] }),
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ reversible: false, tokens: 1, lastUsedAt: new Date().toISOString() }),
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ reversible: false, tokens: 1, dryRun: false }),
      } as any);

    render(
      <ControlIntl locale="es">
        <PreferencesPage />
      </ControlIntl>,
    );

    await screen.findByText('In-use PAT');
    fireEvent.click(screen.getByRole('button', { name: 'Revocar' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Revocar In-use PAT' })).toBeDefined();
    expect(within(dialog).getByText('Tokens revocados')).toBeDefined();
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Revocar' }));
    await screen.findByText('Token revocado.');
    expect(screen.queryByText('In-use PAT')).toBeNull();
    expect(globalThis.fetch).toHaveBeenCalledTimes(4);
  });

  it('loads and edits the organization identity when an alias is given', async () => {
    (globalThis.fetch as jest.Mock<typeof fetch>).mockResolvedValueOnce({
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
        <PreferencesPage client={client} isOrganizationPage organizationAlias="liga-mendocina" />
      </ControlIntl>,
    );

    expect(await screen.findByRole('heading', { level: 1, name: 'Organization' })).toBeDefined();
    expect(
      screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent),
    ).toEqual([
      'Organization identity',
      'Storage usage',
      'Statistics rebuild',
      'Personal Access Tokens',
    ]);

    const nameInput = await screen.findByDisplayValue('Liga Mendocina');

    fireEvent.change(nameInput, { target: { value: 'Liga Renombrada' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save organization details' }));

    await waitFor(() =>
      expect(updateOrganizationSettings).toHaveBeenCalledWith('liga-mendocina', {
        name: 'Liga Renombrada',
      }),
    );
    await screen.findByText('Organization updated.');
  });

  it('offers save and reset only while the organization name has unsaved changes', async () => {
    (globalThis.fetch as jest.Mock<typeof fetch>).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as any);
    const client = stubClient({
      getOrganization: () => Promise.resolve(organization),
      updateOrganizationSettings: async () => organization,
    });

    render(
      <ControlIntl locale="en">
        <PreferencesPage client={client} isOrganizationPage organizationAlias="liga-mendocina" />
      </ControlIntl>,
    );

    const nameInput = await screen.findByDisplayValue('Liga Mendocina');
    expect(screen.queryByRole('status', { name: '1 unsaved change' })).toBeNull();

    fireEvent.change(nameInput, { target: { value: 'Liga Renombrada' } });
    expect(screen.getByRole('status', { name: '1 unsaved change' })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect((nameInput as HTMLInputElement).value).toBe('Liga Mendocina');
    expect(screen.queryByRole('status', { name: '1 unsaved change' })).toBeNull();
  });

  it('shows a placeholder with no emblem, and uploads one', async () => {
    (globalThis.fetch as jest.Mock<typeof fetch>).mockResolvedValueOnce({
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
        <PreferencesPage isOrganizationPage client={client} organizationAlias="liga-mendocina" />
      </ControlIntl>,
    );

    await screen.findByLabelText('Name');
    expect(screen.getByTitle('No emblem uploaded')).toBeTruthy();

    const file = new File(['fake-bytes'], 'emblem.png', { type: 'image/png' });
    const input = screen.getByLabelText('Upload emblem');
    fireEvent.change(input, { target: { files: [file] } });

    const dialog = await screen.findByRole('dialog');
    const img = await waitFor(() => {
      const element = dialog.querySelector('img');
      if (!element) throw new Error('cropper image not ready');
      return element;
    });
    fireEvent.load(img);
    await waitFor(() =>
      expect((screen.getByText('Apply') as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(screen.getByText('Apply'));

    await waitFor(() =>
      expect(uploadOrganizationEmblem).toHaveBeenCalledWith('liga-mendocina', {
        filename: 'emblem.png',
        contentType: 'image/png',
        contentBase64: expect.any(String),
      }),
    );
  });

  it('cancels the emblem crop modal and leaves the placeholder intact', async () => {
    (globalThis.fetch as jest.Mock<typeof fetch>).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as any);
    const client = stubClient({
      getOrganization: () => Promise.resolve(organization),
      uploadOrganizationEmblem: () => Promise.resolve({ objectId: 'obj-1' }),
    });

    render(
      <ControlIntl locale="en">
        <PreferencesPage isOrganizationPage client={client} organizationAlias="liga-mendocina" />
      </ControlIntl>,
    );

    await screen.findByLabelText('Name');
    const file = new File(['fake-bytes'], 'emblem.png', { type: 'image/png' });
    const input = screen.getByLabelText('Upload emblem');
    fireEvent.change(input, { target: { files: [file] } });

    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('does not update state after unmounting mid-fetch', async () => {
    (globalThis.fetch as jest.Mock<typeof fetch>).mockResolvedValueOnce({
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
        <PreferencesPage isOrganizationPage client={client} organizationAlias="liga-mendocina" />
      </ControlIntl>,
    );

    unmount();
    await act(async () => {
      resolveOrg?.();
      await Promise.resolve();
    });
  });

  it('reports a save failure with the server refusal message', async () => {
    (globalThis.fetch as jest.Mock<typeof fetch>).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as any);
    const client = stubClient({
      getOrganization: () => Promise.resolve(organization),
      updateOrganizationSettings: () => Promise.reject(new ControlApiError(409, 'Rechazado')),
    });

    render(
      <ControlIntl locale="en">
        <PreferencesPage isOrganizationPage client={client} organizationAlias="liga-mendocina" />
      </ControlIntl>,
    );

    fireEvent.change(await screen.findByDisplayValue('Liga Mendocina'), {
      target: { value: 'Liga Renombrada' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save organization details' }));

    await screen.findByText('Rechazado');
  });

  it('falls back to the generic save-failure message for a non-API error', async () => {
    (globalThis.fetch as jest.Mock<typeof fetch>).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as any);
    const client = stubClient({
      getOrganization: () => Promise.resolve(organization),
      updateOrganizationSettings: () => Promise.reject(new Error('network down')),
    });

    render(
      <ControlIntl locale="en">
        <PreferencesPage isOrganizationPage client={client} organizationAlias="liga-mendocina" />
      </ControlIntl>,
    );

    fireEvent.change(await screen.findByDisplayValue('Liga Mendocina'), {
      target: { value: 'Liga Renombrada' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save organization details' }));

    await screen.findByText('The request could not be completed. Try again.');
  });

  it('ignores a save click when the client has no updateOrganizationSettings method', async () => {
    (globalThis.fetch as jest.Mock<typeof fetch>).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as any);
    const client = stubClient({ getOrganization: () => Promise.resolve(organization) });

    render(
      <ControlIntl locale="en">
        <PreferencesPage isOrganizationPage client={client} organizationAlias="liga-mendocina" />
      </ControlIntl>,
    );

    fireEvent.change(await screen.findByDisplayValue('Liga Mendocina'), {
      target: { value: 'Liga Renombrada' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save organization details' }));

    expect(screen.queryByText('Organization updated.')).toBeNull();
  });

  it('reports an emblem-upload failure that is not a ControlApiError', async () => {
    (globalThis.fetch as jest.Mock<typeof fetch>).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as any);
    const client = stubClient({
      getOrganization: () => Promise.resolve(organization),
      uploadOrganizationEmblem: () => Promise.reject(new Error('network down')),
    });

    render(
      <ControlIntl locale="en">
        <PreferencesPage isOrganizationPage client={client} organizationAlias="liga-mendocina" />
      </ControlIntl>,
    );

    await screen.findByDisplayValue('Liga Mendocina');
    const file = new File(['fake-bytes'], 'emblem.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Upload emblem'), { target: { files: [file] } });

    const dialog = await screen.findByRole('dialog');
    const img = await waitFor(() => {
      const element = dialog.querySelector('img');
      if (!element) throw new Error('cropper image not ready');
      return element;
    });
    fireEvent.load(img);
    await waitFor(() =>
      expect((screen.getByText('Apply') as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(screen.getByText('Apply'));

    await screen.findByText('The request could not be completed. Try again.');
  });

  it('renders the emblem image for an organization that has one', async () => {
    (globalThis.fetch as jest.Mock<typeof fetch>).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as any);
    const client = stubClient({
      getOrganization: () => Promise.resolve({ ...organization, emblemObjectId: 'obj-1' }),
    });

    render(
      <ControlIntl locale="en">
        <PreferencesPage isOrganizationPage client={client} organizationAlias="liga-mendocina" />
      </ControlIntl>,
    );

    expect(await screen.findByAltText('Organization emblem')).toBeTruthy();
  });

  it('requires confirmation before running a statistics rebuild, and shows the result', async () => {
    (globalThis.fetch as jest.Mock<typeof fetch>).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as any);
    const rebuildStatistics = jest.fn<NonNullable<ControlApiClient['rebuildStatistics']>>(
      async (_organizationAlias, _tournamentAlias, dryRun) => ({
        dryRun: dryRun ?? false,
        organizationAlias: 'liga-mendocina',
        matches: 12,
        figures: 40,
      }),
    );
    const client = stubClient({
      getOrganization: () => Promise.resolve(organization),
      rebuildStatistics,
    });

    render(
      <ControlIntl locale="en">
        <PreferencesPage isOrganizationPage client={client} organizationAlias="liga-mendocina" />
      </ControlIntl>,
    );

    await screen.findByDisplayValue('Liga Mendocina');
    fireEvent.click(screen.getByRole('button', { name: 'Rebuild statistics' }));

    await screen.findByText(
      'Rebuilds statistics from recorded events. Matches: 12; statistic rows to write: 40.',
    );
    expect(rebuildStatistics).toHaveBeenCalledWith('liga-mendocina', undefined, true);

    fireEvent.click(screen.getByRole('button', { name: 'Rebuild statistics' }));

    await waitFor(() =>
      expect(rebuildStatistics).toHaveBeenLastCalledWith('liga-mendocina', undefined, false),
    );
    await screen.findByText('12 matches processed.');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    expect(screen.queryByText('12 matches processed.')).toBeNull();
  });

  it('cancels a rebuild without calling the API', async () => {
    (globalThis.fetch as jest.Mock<typeof fetch>).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as any);
    const rebuildStatistics = jest.fn<NonNullable<ControlApiClient['rebuildStatistics']>>(
      async (_organizationAlias, _tournamentAlias, dryRun) => ({
        dryRun: dryRun ?? false,
        organizationAlias: 'liga-mendocina',
        matches: 1,
        figures: 1,
      }),
    );
    const client = stubClient({
      getOrganization: () => Promise.resolve(organization),
      rebuildStatistics,
    });

    render(
      <ControlIntl locale="en">
        <PreferencesPage isOrganizationPage client={client} organizationAlias="liga-mendocina" />
      </ControlIntl>,
    );

    await screen.findByDisplayValue('Liga Mendocina');
    fireEvent.click(screen.getByRole('button', { name: 'Rebuild statistics' }));
    await screen.findByText(
      'Rebuilds statistics from recorded events. Matches: 1; statistic rows to write: 1.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByText(/Matches: 1; statistic rows to write: 1/)).toBeNull();
    expect(rebuildStatistics).toHaveBeenCalledTimes(1);
    expect(rebuildStatistics).toHaveBeenCalledWith('liga-mendocina', undefined, true);
  });

  it('scopes a confirmed rebuild to the entered tournament alias', async () => {
    (globalThis.fetch as jest.Mock<typeof fetch>).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as any);
    const rebuildStatistics = jest.fn<NonNullable<ControlApiClient['rebuildStatistics']>>(
      async (_organizationAlias, _tournamentAlias, dryRun) => ({
        dryRun: dryRun ?? false,
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
        <PreferencesPage isOrganizationPage client={client} organizationAlias="liga-mendocina" />
      </ControlIntl>,
    );

    await screen.findByDisplayValue('Liga Mendocina');
    fireEvent.change(screen.getByLabelText('Tournament (optional)'), {
      target: { value: 'apertura-2026' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Rebuild statistics' }));
    await screen.findByText(
      'Rebuilds statistics from recorded events. Matches: 1; statistic rows to write: 2.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Rebuild statistics' }));

    await waitFor(() =>
      expect(rebuildStatistics).toHaveBeenLastCalledWith('liga-mendocina', 'apertura-2026', false),
    );
    await screen.findByText('1 match processed.');
  });

  it('surfaces a rebuild refusal with the server message', async () => {
    (globalThis.fetch as jest.Mock<typeof fetch>).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as any);
    const client = stubClient({
      getOrganization: () => Promise.resolve(organization),
      rebuildStatistics: () => Promise.reject(new ControlApiError(403, 'Not an admin')),
    });

    render(
      <ControlIntl locale="en">
        <PreferencesPage isOrganizationPage client={client} organizationAlias="liga-mendocina" />
      </ControlIntl>,
    );

    await screen.findByDisplayValue('Liga Mendocina');
    fireEvent.click(screen.getByRole('button', { name: 'Rebuild statistics' }));
    await screen.findByText('Not an admin');
  });

  it('falls back to a generic rebuild-failure message for a non-API error', async () => {
    (globalThis.fetch as jest.Mock<typeof fetch>).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as any);
    const client = stubClient({
      getOrganization: () => Promise.resolve(organization),
      rebuildStatistics: () => Promise.reject(new Error('network down')),
    });

    render(
      <ControlIntl locale="en">
        <PreferencesPage isOrganizationPage client={client} organizationAlias="liga-mendocina" />
      </ControlIntl>,
    );

    await screen.findByDisplayValue('Liga Mendocina');
    fireEvent.click(screen.getByRole('button', { name: 'Rebuild statistics' }));
    await screen.findByText('The request could not be completed. Try again.');
  });

  it('disables the rebuild trigger when the client offers no rebuildStatistics method', async () => {
    (globalThis.fetch as jest.Mock<typeof fetch>).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as any);
    const client = stubClient({ getOrganization: () => Promise.resolve(organization) });

    render(
      <ControlIntl locale="en">
        <PreferencesPage isOrganizationPage client={client} organizationAlias="liga-mendocina" />
      </ControlIntl>,
    );

    await screen.findByDisplayValue('Liga Mendocina');
    expect(screen.getByRole('button', { name: 'Rebuild statistics' })).toHaveProperty(
      'disabled',
      true,
    );
  });

  it('reports an organization load it could not complete', async () => {
    (globalThis.fetch as jest.Mock<typeof fetch>).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as any);
    const client = stubClient({
      getOrganization: () => Promise.reject(new Error('down')),
    });

    render(
      <ControlIntl locale="en">
        <PreferencesPage isOrganizationPage client={client} organizationAlias="liga-mendocina" />
      </ControlIntl>,
    );

    await expectFirstReadFailure();
  });

  it('renders the formatted storage usage in MB and GB', async () => {
    (globalThis.fetch as jest.Mock<typeof fetch>).mockResolvedValueOnce({
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
        <PreferencesPage isOrganizationPage client={client} organizationAlias="liga-mendocina" />
      </ControlIntl>,
    );

    expect(await screen.findByText('Storage usage')).toBeDefined();
    expect(await screen.findByText('142 MB across 38 files')).toBeDefined();
  });

  it('renders storage usage formatted dynamically in GB when over 1024 MB', async () => {
    (globalThis.fetch as jest.Mock<typeof fetch>).mockResolvedValueOnce({
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
        <PreferencesPage isOrganizationPage client={client} organizationAlias="liga-mendocina" />
      </ControlIntl>,
    );

    expect(await screen.findByText('1.5 GB across 120 files')).toBeDefined();
  });

  it('lists an unreferenced object and deletes it, dropping the usage total by its size', async () => {
    (globalThis.fetch as jest.Mock<typeof fetch>).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as any);
    const deleteObject = jest.fn<NonNullable<ControlApiClient['deleteObject']>>(() =>
      Promise.resolve({
        objectId: 'object-1',
        contentType: 'image/png',
        sizeBytes: 2048,
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    );
    const client = stubClient({
      getOrganization: () => Promise.resolve(organization),
      getStorageUsage: () => Promise.resolve({ totalBytes: 10240, objectCount: 5 }),
      listUnreferencedObjects: () =>
        Promise.resolve([
          {
            objectId: 'object-1',
            contentType: 'image/png',
            sizeBytes: 2048,
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ]),
      deleteObject,
    });

    render(
      <ControlIntl locale="en">
        <PreferencesPage isOrganizationPage client={client} organizationAlias="liga-mendocina" />
      </ControlIntl>,
    );

    // The list has a visible title, and each row names the file's type, size and date.
    expect(await screen.findByRole('heading', { name: 'Unused uploads' })).toBeDefined();
    expect(await screen.findByText('image/png · 0 MB · 1/1/2026')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /^Delete image\/png file of/ }));

    // Nothing is deleted until the confirmation is accepted, and it names the file.
    const dialog = await screen.findByRole('dialog', { name: 'Delete this file?' });
    expect(
      within(dialog).getByText(/This image\/png file \(0 MB, uploaded 1\/1\/2026\)/),
    ).toBeDefined();
    expect(deleteObject).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(deleteObject).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /^Delete image\/png file of/ }));
    fireEvent.click(
      within(await screen.findByRole('dialog', { name: 'Delete this file?' })).getByRole('button', {
        name: 'Delete',
      }),
    );

    await waitFor(() => expect(deleteObject).toHaveBeenCalledWith('liga-mendocina', 'object-1'));
    await waitFor(() => expect(screen.queryByText(/image\/png · /)).toBeNull());
    expect(await screen.findByText('0.01 MB across 4 files')).toBeDefined();
  });

  it('reports an error when deleting an unreferenced object fails', async () => {
    (globalThis.fetch as jest.Mock<typeof fetch>).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as any);
    const client = stubClient({
      getOrganization: () => Promise.resolve(organization),
      getStorageUsage: () => Promise.resolve({ totalBytes: 10240, objectCount: 5 }),
      listUnreferencedObjects: () =>
        Promise.resolve([
          {
            objectId: 'object-1',
            contentType: 'image/png',
            sizeBytes: 2048,
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ]),
      deleteObject: () => Promise.reject(new Error('object still referenced')),
    });

    render(
      <ControlIntl locale="en">
        <PreferencesPage isOrganizationPage client={client} organizationAlias="liga-mendocina" />
      </ControlIntl>,
    );

    expect(await screen.findByText(/image\/png · /)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /^Delete image\/png file of/ }));
    fireEvent.click(
      within(await screen.findByRole('dialog', { name: 'Delete this file?' })).getByRole('button', {
        name: 'Delete',
      }),
    );

    expect(await screen.findByText('The request could not be completed. Try again.')).toBeDefined();
  });

  it('renders zero-state storage usage correctly', async () => {
    (globalThis.fetch as jest.Mock<typeof fetch>).mockResolvedValueOnce({
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
        <PreferencesPage isOrganizationPage client={client} organizationAlias="liga-mendocina" />
      </ControlIntl>,
    );

    expect(await screen.findByText('0 MB across 0 files')).toBeDefined();
  });

  it('surfaces an error when storage usage fails to load', async () => {
    (globalThis.fetch as jest.Mock<typeof fetch>).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as any);
    const client = stubClient({
      getOrganization: () => Promise.resolve(organization),
      getStorageUsage: () => Promise.reject(new Error('unauthorized or failed')),
    });

    render(
      <ControlIntl locale="en">
        <PreferencesPage isOrganizationPage client={client} organizationAlias="liga-mendocina" />
      </ControlIntl>,
    );

    await expectFirstReadFailure();
  });

  describe('the organization screen and the personal page', () => {
    const member = (role: 'admin' | 'referee') => [
      {
        organizationId: 'org-1',
        organizationAlias: 'liga-mendocina',
        organizationName: 'Liga Mendocina',
        timezone: 'America/Argentina/San_Juan',
        role,
      },
    ];

    it('saves the changed name, language and time zone together in one request', async () => {
      const updateOrganizationSettings = jest.fn<
        NonNullable<ControlApiClient['updateOrganizationSettings']>
      >(() =>
        Promise.resolve({
          ...organization,
          name: 'Liga Cuyana',
          primaryLanguage: 'pt',
          timezone: 'Europe/Paris',
        }),
      );
      const client = stubClient({
        listMyOrganizations: () => Promise.resolve(member('admin')),
        getOrganization: () => Promise.resolve(organization),
        getStorageUsage: () => Promise.resolve({ totalBytes: 0, objectCount: 0 }),
        listUnreferencedObjects: () => Promise.resolve([]),
        updateOrganizationSettings,
      });

      render(
        <ControlIntl locale="en">
          <PreferencesPage isOrganizationPage client={client} organizationAlias="liga-mendocina" />
        </ControlIntl>,
      );

      const name = await screen.findByDisplayValue('Liga Mendocina');
      expect(screen.queryByText(/unsaved change/)).toBeNull();
      fireEvent.change(name, { target: { value: 'Liga Cuyana' } });
      fireEvent.change(screen.getByRole('combobox', { name: 'Primary language' }), {
        target: { value: 'pt' },
      });
      fireEvent.change(screen.getByRole('combobox', { name: 'Time zone' }), {
        target: { value: 'Europe/Paris' },
      });

      // The unsaved-changes bar lists all three, and one save carries all three.
      expect(await screen.findByText('3 unsaved changes')).toBeDefined();
      const changed = within(screen.getByRole('list', { name: 'Changed fields' }));
      expect(changed.getByText('Name')).toBeDefined();
      expect(changed.getByText('Primary language')).toBeDefined();
      expect(changed.getByText('Time zone')).toBeDefined();
      fireEvent.click(screen.getByRole('button', { name: 'Save organization details' }));

      await waitFor(() => expect(updateOrganizationSettings).toHaveBeenCalledTimes(1));
      expect(updateOrganizationSettings).toHaveBeenCalledWith('liga-mendocina', {
        name: 'Liga Cuyana',
        primaryLanguage: 'pt',
        timezone: 'Europe/Paris',
      });
      await waitFor(() => expect(screen.queryByText(/unsaved change/)).toBeNull());
    });

    it('sends only what changed, and drops the edits on reset', async () => {
      const updateOrganizationSettings = jest.fn<
        NonNullable<ControlApiClient['updateOrganizationSettings']>
      >(() => Promise.resolve({ ...organization, timezone: 'Europe/Paris' }));
      const client = stubClient({
        listMyOrganizations: () => Promise.resolve(member('admin')),
        getOrganization: () => Promise.resolve(organization),
        getStorageUsage: () => Promise.resolve({ totalBytes: 0, objectCount: 0 }),
        listUnreferencedObjects: () => Promise.resolve([]),
        updateOrganizationSettings,
      });

      render(
        <ControlIntl locale="en">
          <PreferencesPage isOrganizationPage client={client} organizationAlias="liga-mendocina" />
        </ControlIntl>,
      );

      await screen.findByDisplayValue('Liga Mendocina');
      fireEvent.change(screen.getByRole('combobox', { name: 'Time zone' }), {
        target: { value: 'Europe/Paris' },
      });
      expect(await screen.findByText('1 unsaved change')).toBeDefined();
      fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
      await waitFor(() => expect(screen.queryByText(/unsaved change/)).toBeNull());

      fireEvent.change(screen.getByRole('combobox', { name: 'Time zone' }), {
        target: { value: 'Europe/Paris' },
      });
      fireEvent.click(await screen.findByRole('button', { name: 'Save organization details' }));
      await waitFor(() =>
        expect(updateOrganizationSettings).toHaveBeenCalledWith('liga-mendocina', {
          timezone: 'Europe/Paris',
        }),
      );
    });

    it('offers no editable form and reads no storage to a role without settings authority', async () => {
      const getStorageUsage = jest.fn(() => Promise.resolve({ totalBytes: 0, objectCount: 0 }));
      const listUnreferencedObjects = jest.fn(() => Promise.resolve([]));
      const client = stubClient({
        listMyOrganizations: () => Promise.resolve(member('referee')),
        getOrganization: () => Promise.resolve(organization),
        getStorageUsage,
        listUnreferencedObjects,
        updateOrganizationSettings: jest.fn(() => Promise.reject(new Error('not used'))),
        uploadOrganizationEmblem: jest.fn(() => Promise.reject(new Error('not used'))),
        rebuildStatistics: jest.fn(() => Promise.reject(new Error('not used'))),
      });

      const { container } = render(
        <ControlIntl locale="en">
          <PreferencesPage isOrganizationPage client={client} organizationAlias="liga-mendocina" />
        </ControlIntl>,
      );

      // The details are shown, not editable, and the screen names the role that can edit them.
      expect(await screen.findByText('Liga Mendocina')).toBeDefined();
      expect(screen.queryByRole('textbox', { name: 'Name' })).toBeNull();
      expect(screen.queryByRole('combobox', { name: 'Primary language' })).toBeNull();
      expect(container.querySelector('#org-emblem-upload')).toBeNull();
      expect(screen.getByText('Only the Admin role can edit these details.')).toBeDefined();
      // Storage and the rebuild are withheld the same way, and storage is never asked for.
      expect(screen.getAllByText('Only the Admin role can use this section.')).toHaveLength(2);
      expect(screen.queryByRole('button', { name: 'Rebuild statistics' })).toBeNull();
      expect(getStorageUsage).not.toHaveBeenCalled();
      expect(listUnreferencedObjects).not.toHaveBeenCalled();
    });

    it('offers every section when the role cannot be resolved, as the server still decides', async () => {
      const client = stubClient({
        listMyOrganizations: () => Promise.reject(new Error('membership unavailable')),
        getOrganization: () => Promise.resolve(organization),
        getStorageUsage: () => Promise.resolve({ totalBytes: 0, objectCount: 0 }),
        listUnreferencedObjects: () => Promise.resolve([]),
      });

      render(
        <ControlIntl locale="en">
          <PreferencesPage isOrganizationPage client={client} organizationAlias="liga-mendocina" />
        </ControlIntl>,
      );

      expect(await screen.findByDisplayValue('Liga Mendocina')).toBeDefined();
      expect(await screen.findByText('0 MB across 0 files')).toBeDefined();
      expect(screen.queryByText(/Only the .* can/)).toBeNull();
    });

    it('puts Identity first and offers no theme control on the organization screen', async () => {
      const client = stubClient({
        listMyOrganizations: () => Promise.resolve(member('admin')),
        getOrganization: () => Promise.resolve(organization),
        getStorageUsage: () => Promise.resolve({ totalBytes: 0, objectCount: 0 }),
        listUnreferencedObjects: () => Promise.resolve([]),
      });

      render(
        <ControlIntl locale="en">
          <PreferencesPage isOrganizationPage client={client} organizationAlias="liga-mendocina" />
        </ControlIntl>,
      );

      await screen.findByDisplayValue('Liga Mendocina');
      expect(
        screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent),
      ).toEqual([
        'Organization identity',
        'Storage usage',
        'Statistics rebuild',
        'Personal Access Tokens',
      ]);
      expect(screen.queryByRole('combobox', { name: 'Theme' })).toBeNull();
    });

    it('is a personal page of its own: theme and tokens, and no organization read', async () => {
      const listMyOrganizations = jest.fn(() => Promise.resolve(member('admin')));
      const getOrganization = jest.fn(() => Promise.resolve(organization));
      const getStorageUsage = jest.fn(() => Promise.resolve({ totalBytes: 0, objectCount: 0 }));
      const client = stubClient({ listMyOrganizations, getOrganization, getStorageUsage });

      render(
        <ControlIntl locale="en">
          <PreferencesPage client={client} organizationAlias="liga-mendocina" />
        </ControlIntl>,
      );

      expect(await screen.findByRole('heading', { name: 'Appearance' })).toBeDefined();
      expect(screen.getByRole('combobox', { name: 'Theme' })).toBeDefined();
      expect(screen.getByRole('heading', { name: 'Personal Access Tokens' })).toBeDefined();
      expect(screen.queryByRole('heading', { name: 'Organization identity' })).toBeNull();
      expect(screen.queryByRole('heading', { name: 'Storage usage' })).toBeNull();
      expect(screen.queryByRole('heading', { name: 'Statistics rebuild' })).toBeNull();
      expect(listMyOrganizations).not.toHaveBeenCalled();
      expect(getOrganization).not.toHaveBeenCalled();
      expect(getStorageUsage).not.toHaveBeenCalled();
    });

    it('leaves the empty token list without a second create button', async () => {
      render(
        <ControlIntl locale="en">
          <PreferencesPage client={stubClient({})} />
        </ControlIntl>,
      );

      expect(await screen.findByText('No active personal access tokens.')).toBeDefined();
      expect(screen.queryByRole('button', { name: 'Create token' })).toBeNull();
    });
  });
});
