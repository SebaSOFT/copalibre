import { jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SeedingBuilderRoute } from './SeedingBuilderRoute.js';
import { withIntl } from '../i18n/test-support.js';
import type { ControlApiClient, SeedingResponse } from '../lib/api-client.js';

function seeding(overrides: Partial<SeedingResponse> = {}): SeedingResponse {
  return {
    stageId: 'stage-1',
    format: 'round-robin',
    seeds: [],
    matches: [],
    hasRecordedResults: false,
    ...overrides,
  };
}

function stubClient(overrides: Partial<ControlApiClient> = {}): ControlApiClient {
  return {
    fetchSeeding: () => Promise.resolve(seeding()),
    publishSeeding: () =>
      Promise.resolve({ mutationClass: 'safe', reason: '', invalidates: [], persisted: true }),
    ...overrides,
  } as unknown as ControlApiClient;
}

describe('SeedingBuilderRoute', () => {
  it('starts empty when the promotion-plan pre-fill lookup fails, rather than failing the whole screen', async () => {
    render(
      withIntl(
        <SeedingBuilderRoute
          client={stubClient({
            fetchPromotionPlansTargetingStage: () => Promise.reject(new Error('down')),
          })}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await screen.findByText('Stage settings');
    expect(screen.getByText('This stage has no participants.')).toBeDefined();
  });
});

describe('SeedingBuilderRoute — stage settings (task 2.3)', () => {
  it('renames a stage', async () => {
    const updateStage = jest.fn<NonNullable<ControlApiClient['updateStage']>>(() =>
      Promise.resolve({
        stageId: 'stage-1',
        seasonId: 'season-1',
        number: 1,
        name: 'Fase de grupos (corregida)',
        format: 'round-robin',
      }),
    );
    render(
      withIntl(
        <SeedingBuilderRoute
          client={stubClient({ updateStage })}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await screen.findByText('Stage settings');
    fireEvent.change(screen.getByLabelText('New stage name'), {
      target: { value: 'Fase de grupos (corregida)' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));

    await waitFor(() =>
      expect(updateStage).toHaveBeenCalledWith('liga-mendocina', 'apertura-2026', 1, {
        name: 'Fase de grupos (corregida)',
      }),
    );
  });

  it('changes a stage format when unseeded', async () => {
    const updateStage = jest.fn<NonNullable<ControlApiClient['updateStage']>>(() =>
      Promise.resolve({
        stageId: 'stage-1',
        seasonId: 'season-1',
        number: 1,
        name: 'Fase de grupos',
        format: 'single-elimination',
      }),
    );
    render(
      withIntl(
        <SeedingBuilderRoute
          client={stubClient({ updateStage })}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await screen.findByText('Stage settings');
    fireEvent.change(screen.getByLabelText('Format'), {
      target: { value: 'single-elimination' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Change format' }));

    await waitFor(() =>
      expect(updateStage).toHaveBeenCalledWith('liga-mendocina', 'apertura-2026', 1, {
        format: 'single-elimination',
      }),
    );
  });

  it('deletes an unseeded stage', async () => {
    const deleteStage = jest.fn<NonNullable<ControlApiClient['deleteStage']>>(() =>
      Promise.resolve({
        stageId: 'stage-1',
        seasonId: 'season-1',
        number: 1,
        name: 'Fase de grupos',
        format: 'round-robin',
      }),
    );
    render(
      withIntl(
        <SeedingBuilderRoute
          client={stubClient({ deleteStage })}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await screen.findByText('Stage settings');
    fireEvent.click(screen.getByRole('button', { name: 'Delete stage' }));

    await waitFor(() =>
      expect(deleteStage).toHaveBeenCalledWith('liga-mendocina', 'apertura-2026', 1),
    );
  });

  it('reports an error when a stage edit fails', async () => {
    render(
      withIntl(
        <SeedingBuilderRoute
          client={stubClient({
            updateStage: () => Promise.reject(new Error('stage conflict')),
          })}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await screen.findByText('Stage settings');
    fireEvent.change(screen.getByLabelText('New stage name'), { target: { value: 'X' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));

    expect(await screen.findByText('The request could not be completed. Try again.')).toBeDefined();
  });

  it('reports an error when a format change fails', async () => {
    render(
      withIntl(
        <SeedingBuilderRoute
          client={stubClient({
            updateStage: () => Promise.reject(new Error('format conflict')),
          })}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await screen.findByText('Stage settings');
    fireEvent.change(screen.getByLabelText('Format'), {
      target: { value: 'single-elimination' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Change format' }));

    expect(await screen.findByText('The request could not be completed. Try again.')).toBeDefined();
  });

  it('reports an error when deleting a stage fails', async () => {
    render(
      withIntl(
        <SeedingBuilderRoute
          client={stubClient({
            deleteStage: () => Promise.reject(new Error('stage delete conflict')),
          })}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await screen.findByText('Stage settings');
    fireEvent.click(screen.getByRole('button', { name: 'Delete stage' }));

    expect(await screen.findByText('The request could not be completed. Try again.')).toBeDefined();
  });

  it('disables format-change and delete once the stage is seeded, and names why', async () => {
    render(
      withIntl(
        <SeedingBuilderRoute
          client={stubClient({
            fetchSeeding: () =>
              Promise.resolve(
                seeding({
                  matches: [
                    {
                      matchId: 'm-1',
                      bracket: 'main',
                      round: 1,
                      position: 1,
                      status: 'scheduled',
                      slots: [],
                    },
                  ],
                }),
              ),
          })}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await screen.findByText('Stage settings');
    expect(
      (screen.getByRole('button', { name: 'Change format' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole('button', { name: 'Delete stage' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      screen.getByText('This stage already has fixtures, so its format and removal are locked.'),
    ).toBeDefined();
  });
});
