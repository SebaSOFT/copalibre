import { jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TournamentSettingsRoute } from './TournamentSettingsRoute.js';
import { withIntl } from '../i18n/test-support.js';
import type { ControlApiClient } from '../lib/api-client.js';

function stubClient(overrides: Partial<ControlApiClient> = {}): ControlApiClient {
  return {
    fetchTournamentSettings: () =>
      Promise.resolve({ name: 'Copa Verano', region: 'South America', capacity: 16 }),
    ...overrides,
  } as unknown as ControlApiClient;
}

describe('TournamentSettingsRoute', () => {
  it('loads and shows the current settings', async () => {
    render(
      withIntl(
        <TournamentSettingsRoute
          client={stubClient()}
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    expect(await screen.findByDisplayValue('Copa Verano')).toBeDefined();
    expect(screen.getByDisplayValue('South America')).toBeDefined();
    expect(screen.getByDisplayValue('16')).toBeDefined();
  });

  it('shows a load-failure message when settings fail to load', async () => {
    render(
      withIntl(
        <TournamentSettingsRoute
          client={stubClient({
            fetchTournamentSettings: () => Promise.reject(new Error('network down')),
          })}
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    expect(await screen.findByText('Could not load the tournament settings.')).toBeDefined();
  });

  it('previews a proposed edit and reports its classification', async () => {
    const previewTournamentSettings = jest.fn<
      NonNullable<ControlApiClient['previewTournamentSettings']>
    >(() =>
      Promise.resolve({
        fields: [{ field: 'registration.region', mutationClass: 'safe' as const }],
      }),
    );
    render(
      withIntl(
        <TournamentSettingsRoute
          client={stubClient({ previewTournamentSettings })}
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await screen.findByDisplayValue('Copa Verano');
    fireEvent.change(screen.getByLabelText('Region'), { target: { value: 'Europe' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

    await waitFor(() =>
      expect(previewTournamentSettings).toHaveBeenCalledWith('liga-mendocina', 'apertura-2026', {
        region: 'Europe',
      }),
    );
    expect(await screen.findByText('region')).toBeDefined();
    expect(screen.getByText(/Safe/)).toBeDefined();
  });

  it('refuses to save once the preview reports a blocked field, and applies otherwise', async () => {
    const updateTournamentSettings = jest.fn<
      NonNullable<ControlApiClient['updateTournamentSettings']>
    >(() => Promise.resolve({ name: 'Copa Verano', region: 'South America', capacity: 8 }));
    render(
      withIntl(
        <TournamentSettingsRoute
          client={stubClient({
            previewTournamentSettings: () =>
              Promise.resolve({
                fields: [
                  {
                    field: 'registration.capacity',
                    blocked: true,
                    reason: 'Cannot be reduced: 10 entrant(s) are already accepted',
                  },
                ],
              }),
            updateTournamentSettings,
          })}
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await screen.findByDisplayValue('Copa Verano');
    fireEvent.change(screen.getByLabelText('Capacity'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

    await screen.findByText(/already accepted/);
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
    expect(updateTournamentSettings).not.toHaveBeenCalled();
  });

  it('changes capacity and check-in close time together and previews both', async () => {
    const previewTournamentSettings = jest.fn<
      NonNullable<ControlApiClient['previewTournamentSettings']>
    >(() =>
      Promise.resolve({
        fields: [
          { field: 'registration.capacity', mutationClass: 'requires_rebuild' as const },
          { field: 'registration.checkInClosesAt', mutationClass: 'requires_rebuild' as const },
        ],
      }),
    );
    render(
      withIntl(
        <TournamentSettingsRoute
          client={stubClient({ previewTournamentSettings })}
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await screen.findByDisplayValue('Copa Verano');
    fireEvent.change(screen.getByLabelText('Capacity'), { target: { value: '32' } });
    fireEvent.change(screen.getByLabelText('Check-in closes at'), {
      target: { value: '2026-09-01T10:00' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

    await waitFor(() =>
      expect(previewTournamentSettings).toHaveBeenCalledWith('liga-mendocina', 'apertura-2026', {
        capacity: 32,
        checkInClosesAt: '2026-09-01T10:00',
      }),
    );
  });

  it('reports an error when saving fails', async () => {
    render(
      withIntl(
        <TournamentSettingsRoute
          client={stubClient({
            updateTournamentSettings: () => Promise.reject(new Error('conflict')),
          })}
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await screen.findByDisplayValue('Copa Verano');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Copa Verano 2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('conflict')).toBeDefined();
  });

  it('reports an error when previewing fails', async () => {
    render(
      withIntl(
        <TournamentSettingsRoute
          client={stubClient({
            previewTournamentSettings: () => Promise.reject(new Error('preview down')),
          })}
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await screen.findByDisplayValue('Copa Verano');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Copa Verano 2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

    expect(await screen.findByText('preview down')).toBeDefined();
  });

  it('starts from a tournament with no region, capacity or check-in close time set', async () => {
    const updateTournamentSettings = jest.fn<
      NonNullable<ControlApiClient['updateTournamentSettings']>
    >(() => Promise.resolve({ name: 'Copa Verano', region: 'Europe', capacity: 8 }));
    render(
      withIntl(
        <TournamentSettingsRoute
          client={stubClient({
            fetchTournamentSettings: () => Promise.resolve({ name: 'Copa Verano' }),
            updateTournamentSettings,
          })}
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await screen.findByDisplayValue('Copa Verano');
    fireEvent.change(screen.getByLabelText('Region'), { target: { value: 'Europe' } });
    fireEvent.change(screen.getByLabelText('Capacity'), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(updateTournamentSettings).toHaveBeenCalledWith('liga-mendocina', 'apertura-2026', {
        region: 'Europe',
        capacity: 8,
      }),
    );
  });

  it('clearing capacity back to empty omits it from the saved request', async () => {
    const updateTournamentSettings = jest.fn<
      NonNullable<ControlApiClient['updateTournamentSettings']>
    >(() => Promise.resolve({ name: 'Copa Verano' }));
    render(
      withIntl(
        <TournamentSettingsRoute
          client={stubClient({
            fetchTournamentSettings: () => Promise.resolve({ name: 'Copa Verano', capacity: 16 }),
            updateTournamentSettings,
          })}
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await screen.findByDisplayValue('Copa Verano');
    fireEvent.change(screen.getByLabelText('Capacity'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Copa Verano 2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(updateTournamentSettings).toHaveBeenCalledWith('liga-mendocina', 'apertura-2026', {
        name: 'Copa Verano 2',
        capacity: undefined,
      }),
    );
  });

  it('saves a settings edit and reflects the applied result', async () => {
    const updateTournamentSettings = jest.fn<
      NonNullable<ControlApiClient['updateTournamentSettings']>
    >(() => Promise.resolve({ name: 'Copa Verano', region: 'Europe', capacity: 16 }));
    render(
      withIntl(
        <TournamentSettingsRoute
          client={stubClient({ updateTournamentSettings })}
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await screen.findByDisplayValue('Copa Verano');
    fireEvent.change(screen.getByLabelText('Region'), { target: { value: 'Europe' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(updateTournamentSettings).toHaveBeenCalledWith('liga-mendocina', 'apertura-2026', {
        region: 'Europe',
      }),
    );
    expect(await screen.findByText('Settings saved.')).toBeDefined();
  });
});
