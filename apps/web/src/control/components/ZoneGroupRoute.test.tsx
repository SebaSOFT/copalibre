import { jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ZoneGroupRoute } from './ZoneGroupRoute.js';
import { withIntl } from '../i18n/test-support.js';
import type { ControlApiClient } from '../lib/api-client.js';

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

describe('ZoneGroupRoute', () => {
  it('renders within ListScreenTemplate structure and displays zones and groups', async () => {
    const { container } = render(
      withIntl(
        <ZoneGroupRoute
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

  it('reports an error when renaming a zone fails', async () => {
    render(
      withIntl(
        <ZoneGroupRoute
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
        <ZoneGroupRoute
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
        <ZoneGroupRoute
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
        <ZoneGroupRoute
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
        <ZoneGroupRoute
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
        <ZoneGroupRoute
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
});
