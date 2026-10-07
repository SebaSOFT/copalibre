import { jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ZoneGroupPage } from '../pages/ZoneGroupPage.js';
import { withIntl } from '../../i18n/test-support.js';
import type { ControlApiClient } from '../../lib/api-client.js';

function stubClient(overrides: Partial<ControlApiClient> = {}): ControlApiClient {
  return {
    listZones: () =>
      Promise.resolve([
        {
          stageNumber: 1,
          number: 1,
          name: 'Zona Campeonato',
          planConfigured: false,
          groups: [],
        },
      ]),
    listRegistrations: () =>
      Promise.resolve([
        {
          registrationId: 'reg-1',
          tournamentId: 't-1',
          entrantId: 'entrant-1',
          displayName: 'Godoy Cruz',
          registeredAt: '2026-01-01T00:00:00Z',
          status: 'accepted',
        },
      ]),
    listGroups: () =>
      Promise.resolve([
        {
          stageNumber: 1,
          zoneNumber: 1,
          number: 1,
          name: 'Grupo A',
        },
      ]),
    fetchZoneEntrants: () => Promise.resolve(['entrant-1']),
    createZone: () => Promise.resolve({ stageNumber: 1, number: 2, name: 'Zona Plata' }),
    createGroup: () =>
      Promise.resolve({ stageNumber: 1, zoneNumber: 1, number: 2, name: 'Grupo B' }),
    ...overrides,
  } as unknown as ControlApiClient;
}

describe('ZoneGroupPage', () => {
  it('renders within ListScreenLayout structure and displays zones and groups', async () => {
    const { container } = render(
      withIntl(
        <ZoneGroupPage
          client={stubClient()}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await waitFor(() => screen.getByRole('heading', { level: 1, name: /zones and groups/i }));
    expect(container.querySelector('.cl-list-screen')).not.toBeNull();
    expect(container.querySelector('.cl-list-screen__header')).not.toBeNull();
    expect(container.querySelector('.cl-list-screen__listing')).not.toBeNull();
    expect(screen.getAllByText('Zona Campeonato').length).toBeGreaterThanOrEqual(1);
  });

  it('links its breadcrumb back to the stage hub', async () => {
    render(
      withIntl(
        <ZoneGroupPage
          client={stubClient()}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await waitFor(() => screen.getByRole('heading', { level: 1, name: /zones and groups/i }));
    expect(screen.getByRole('link', { name: 'Stage 1' }).getAttribute('href')).toBe(
      '/control/liga-mendocina/tournaments/apertura-2026/stages/1',
    );
  });

  it('reports an error when renaming a zone fails', async () => {
    render(
      withIntl(
        <ZoneGroupPage
          client={stubClient({
            renameZone: () => Promise.reject(new Error('zone rename conflict')),
          })}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await waitFor(() => screen.getAllByText('Zona Campeonato'));
    fireEvent.change(screen.getByLabelText('Rename zone Zona Campeonato'), {
      target: { value: 'Zona Renombrada' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));

    expect(await screen.findByText('The request could not be completed. Try again.')).toBeDefined();
  });

  it('reports an error when deleting a group fails', async () => {
    render(
      withIntl(
        <ZoneGroupPage
          client={stubClient({
            deleteGroup: () => Promise.reject(new Error('group delete conflict')),
          })}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await waitFor(() => screen.getAllByText('Grupo A'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText('The request could not be completed. Try again.')).toBeDefined();
  });

  it('renames a zone through the rename action', async () => {
    const renameZone = jest.fn<NonNullable<ControlApiClient['renameZone']>>(() =>
      Promise.resolve({
        zoneId: 'zone-1',
        stageId: 'stage-1',
        number: 1,
        name: 'Zona Campeonato (corregida)',
      }),
    );
    render(
      withIntl(
        <ZoneGroupPage
          client={stubClient({ renameZone })}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await waitFor(() => screen.getAllByText('Zona Campeonato'));
    const input = screen.getByLabelText('Rename zone Zona Campeonato') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Zona Campeonato (corregida)' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));

    await waitFor(() => expect(renameZone).toHaveBeenCalled());
    expect(renameZone).toHaveBeenCalledWith('liga-mendocina', 'apertura-2026', 1, 1, {
      name: 'Zona Campeonato (corregida)',
    });
  });

  it('deletes a zone through the delete action', async () => {
    const deleteZone = jest.fn<NonNullable<ControlApiClient['deleteZone']>>(() =>
      Promise.resolve({ zoneId: 'zone-1', stageId: 'stage-1', number: 1, name: 'Zona Campeonato' }),
    );
    render(
      withIntl(
        <ZoneGroupPage
          client={stubClient({ deleteZone })}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await waitFor(() => screen.getAllByText('Zona Campeonato'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() =>
      expect(deleteZone).toHaveBeenCalledWith('liga-mendocina', 'apertura-2026', 1, 1),
    );
  });

  it('renames a group through the rename action', async () => {
    const renameGroup = jest.fn<NonNullable<ControlApiClient['renameGroup']>>(() =>
      Promise.resolve({
        groupId: 'group-1',
        zoneId: 'zone-1',
        number: 1,
        name: 'Grupo A (corregido)',
      }),
    );
    render(
      withIntl(
        <ZoneGroupPage
          client={stubClient({ renameGroup })}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await waitFor(() => screen.getAllByText('Grupo A'));
    const input = screen.getByLabelText('Rename group Grupo A') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Grupo A (corregido)' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));

    await waitFor(() => expect(renameGroup).toHaveBeenCalled());
    expect(renameGroup).toHaveBeenCalledWith('liga-mendocina', 'apertura-2026', 1, 1, 1, {
      name: 'Grupo A (corregido)',
    });
  });

  it('deletes a group through the delete action', async () => {
    const deleteGroup = jest.fn<NonNullable<ControlApiClient['deleteGroup']>>(() =>
      Promise.resolve({ groupId: 'group-1', zoneId: 'zone-1', number: 1, name: 'Grupo A' }),
    );
    render(
      withIntl(
        <ZoneGroupPage
          client={stubClient({ deleteGroup })}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await waitFor(() => screen.getAllByText('Grupo A'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() =>
      expect(deleteGroup).toHaveBeenCalledWith('liga-mendocina', 'apertura-2026', 1, 1, 1),
    );
  });

  describe('zone format and series', () => {
    const stage = {
      stageId: 's-1',
      seasonId: 'se-1',
      number: 1,
      name: 'Fase 1',
      format: 'single-elimination',
      seeded: false,
      availableFormats: ['single-elimination', 'round-robin'],
    };
    const zone = (overrides: Record<string, unknown> = {}) => ({
      zoneId: 'z-1',
      stageId: 's-1',
      number: 1,
      name: 'Zona Campeonato',
      effectiveFormat: 'single-elimination',
      ...overrides,
    });
    const renderPage = (client: ControlApiClient) =>
      render(
        withIntl(
          <ZoneGroupPage
            client={client}
            organizationAlias="liga-mendocina"
            stageNumber={1}
            tournamentAlias="apertura-2026"
          />,
        ),
      );

    it('says a zone plays its stage’s format until it declares its own', async () => {
      renderPage(
        stubClient({
          listStages: () => Promise.resolve([stage]),
          listZones: () => Promise.resolve([zone()]),
          configureZone: () => Promise.resolve(zone()),
        } as Partial<ControlApiClient>),
      );

      await waitFor(() => screen.getByText(/plays single elimination \(the stage’s format\)/i));
      expect(screen.queryByText('Overridden')).toBeNull();
    });

    it('labels a zone that overrides its stage', async () => {
      renderPage(
        stubClient({
          listStages: () => Promise.resolve([stage]),
          listZones: () =>
            Promise.resolve([zone({ format: 'round-robin', effectiveFormat: 'round-robin' })]),
          configureZone: () => Promise.resolve(zone()),
        } as Partial<ControlApiClient>),
      );

      await waitFor(() => screen.getByText('Overridden'));
      expect(screen.getByText(/^Plays round robin$/i)).not.toBeNull();
    });

    it('sets the zone’s format from the formats the discipline offers', async () => {
      const configureZone = jest.fn(() => Promise.resolve(zone()));
      renderPage(
        stubClient({
          listStages: () => Promise.resolve([stage]),
          listZones: () => Promise.resolve([zone()]),
          configureZone,
        } as Partial<ControlApiClient>),
      );

      const trigger = await screen.findByRole('combobox', { name: 'Format of Zona Campeonato' });
      fireEvent.change(trigger, { target: { value: 'round-robin' } });

      await waitFor(() =>
        expect(configureZone).toHaveBeenCalledWith('liga-mendocina', 'apertura-2026', 1, 1, {
          format: 'round-robin',
        }),
      );
    });

    it('clears the override with null, back to inheriting', async () => {
      const configureZone = jest.fn(() => Promise.resolve(zone()));
      renderPage(
        stubClient({
          listStages: () => Promise.resolve([stage]),
          listZones: () =>
            Promise.resolve([zone({ format: 'round-robin', effectiveFormat: 'round-robin' })]),
          configureZone,
        } as Partial<ControlApiClient>),
      );

      const trigger = await screen.findByRole('combobox', { name: 'Format of Zona Campeonato' });
      fireEvent.change(trigger, { target: { value: '__inherit__' } });

      await waitFor(() =>
        expect(configureZone).toHaveBeenCalledWith('liga-mendocina', 'apertura-2026', 1, 1, {
          format: null,
        }),
      );
    });

    it('saves and clears a zone series', async () => {
      const configureZone = jest.fn(
        (
          _organization: string,
          _tournament: string,
          _stage: number,
          _zone: number,
          request: unknown,
        ) =>
          Promise.resolve(zone({ series: (request as { series?: unknown }).series ?? undefined })),
      );
      renderPage(
        stubClient({
          listStages: () => Promise.resolve([stage]),
          listZones: () =>
            Promise.resolve([zone({ series: { span: 3, resolutionClass: 'best-of' } })]),
          configureZone,
        } as Partial<ControlApiClient>),
      );

      await waitFor(() => screen.getByText(/Series of 3 matches/));
      fireEvent.change(screen.getByLabelText('Matches'), { target: { value: '5' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save series' }));
      await waitFor(() =>
        expect(configureZone).toHaveBeenCalledWith('liga-mendocina', 'apertura-2026', 1, 1, {
          series: { span: 5, resolutionClass: 'best-of' },
        }),
      );

      fireEvent.click(screen.getByRole('button', { name: 'Use the stage’s series' }));
      await waitFor(() =>
        expect(configureZone).toHaveBeenLastCalledWith('liga-mendocina', 'apertura-2026', 1, 1, {
          series: null,
        }),
      );
    });

    it('does not accept a series shorter than two matches', async () => {
      renderPage(
        stubClient({
          listStages: () => Promise.resolve([stage]),
          listZones: () => Promise.resolve([zone()]),
          configureZone: () => Promise.resolve(zone()),
        } as Partial<ControlApiClient>),
      );

      await screen.findByLabelText('Matches');
      fireEvent.change(screen.getByLabelText('Matches'), { target: { value: '1' } });
      expect(
        (screen.getByRole('button', { name: 'Save series' }) as HTMLButtonElement).disabled,
      ).toBe(true);
    });

    it('locks the controls once the stage holds fixtures', async () => {
      renderPage(
        stubClient({
          listStages: () => Promise.resolve([{ ...stage, seeded: true }]),
          listZones: () => Promise.resolve([zone()]),
          configureZone: () => Promise.resolve(zone()),
        } as Partial<ControlApiClient>),
      );

      await waitFor(() => screen.getByText(/already has fixtures/i));
      expect(
        (await screen.findByRole('combobox', { name: 'Format of Zona Campeonato' })).hasAttribute(
          'disabled',
        ),
      ).toBe(true);
      expect(
        (screen.getByRole('button', { name: 'Save series' }) as HTMLButtonElement).disabled,
      ).toBe(true);
    });

    it('reports a refused configuration', async () => {
      renderPage(
        stubClient({
          listStages: () => Promise.resolve([stage]),
          listZones: () => Promise.resolve([zone()]),
          configureZone: () => Promise.reject(new Error('Cannot change a seeded stage')),
        } as Partial<ControlApiClient>),
      );

      const trigger = await screen.findByRole('combobox', { name: 'Format of Zona Campeonato' });
      fireEvent.change(trigger, { target: { value: 'round-robin' } });

      expect(
        await screen.findByText('The request could not be completed. Try again.'),
      ).toBeDefined();
    });
  });
});
