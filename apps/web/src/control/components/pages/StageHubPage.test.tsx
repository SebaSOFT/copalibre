import { jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StageHubPage } from './StageHubPage.js';
import { withIntl } from '../../i18n/test-support.js';
import type { ControlApiClient, StageResponse } from '../../lib/api-client.js';

function stage(overrides: Partial<StageResponse> = {}): StageResponse {
  return {
    stageId: 's-1',
    seasonId: 'season-1',
    number: 1,
    name: 'Fase de grupos',
    format: 'round-robin',
    seeded: false,
    ...overrides,
  };
}

function stubClient(overrides: Partial<ControlApiClient> = {}): ControlApiClient {
  return {
    listStages: () => Promise.resolve([stage()]),
    updateStage: () => Promise.resolve(stage({ name: 'Fase renombrada' })),
    deleteStage: () => Promise.resolve(stage()),
    ...overrides,
  } as unknown as ControlApiClient;
}

describe('StageHubPage', () => {
  it("pre-fills the rename field with the stage's current name, not blank", async () => {
    render(
      withIntl(
        <StageHubPage
          client={stubClient()}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await waitFor(() => screen.getByLabelText('New stage name'));
    expect((screen.getByLabelText('New stage name') as HTMLInputElement).value).toBe(
      'Fase de grupos',
    );
  });

  it('renames a stage — including one that already holds fixtures', async () => {
    const updateStage = jest.fn(() => Promise.resolve(stage({ name: 'Fase renombrada' })));
    render(
      withIntl(
        <StageHubPage
          client={stubClient({
            listStages: () => Promise.resolve([stage({ seeded: true })]),
            updateStage,
          })}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await waitFor(() => screen.getByLabelText('New stage name'));
    fireEvent.change(screen.getByLabelText('New stage name'), {
      target: { value: 'Fase renombrada' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));

    await waitFor(() =>
      expect(updateStage).toHaveBeenCalledWith('liga-mendocina', 'apertura-2026', 1, {
        name: 'Fase renombrada',
      }),
    );
    expect(await screen.findByText('Stage renamed.')).toBeTruthy();
  });

  it('changes a stage format when unseeded', async () => {
    const updateStage = jest.fn(() => Promise.resolve(stage({ format: 'single-elimination' })));
    render(
      withIntl(
        <StageHubPage
          client={stubClient({ updateStage })}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await waitFor(() => screen.getByLabelText('Format'));
    fireEvent.change(screen.getByLabelText('Format'), { target: { value: 'single-elimination' } });
    fireEvent.click(screen.getByRole('button', { name: 'Change format' }));

    await waitFor(() =>
      expect(updateStage).toHaveBeenCalledWith('liga-mendocina', 'apertura-2026', 1, {
        format: 'single-elimination',
      }),
    );
  });

  it('reports an error when a format change fails', async () => {
    render(
      withIntl(
        <StageHubPage
          client={stubClient({
            updateStage: () => Promise.reject(new Error('format conflict')),
          })}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await waitFor(() => screen.getByLabelText('Format'));
    fireEvent.change(screen.getByLabelText('Format'), { target: { value: 'single-elimination' } });
    fireEvent.click(screen.getByRole('button', { name: 'Change format' }));

    expect(await screen.findByText('The request could not be completed. Try again.')).toBeTruthy();
  });

  it('reports an error when deleting a stage fails', async () => {
    render(
      withIntl(
        <StageHubPage
          client={stubClient({
            deleteStage: () => Promise.reject(new Error('stage delete conflict')),
          })}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await waitFor(() => screen.getByLabelText('New stage name'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete stage' }));

    expect(await screen.findByText('The request could not be completed. Try again.')).toBeTruthy();
  });

  it('disables format-change and delete once the stage is seeded, surfacing why', async () => {
    render(
      withIntl(
        <StageHubPage
          client={stubClient({ listStages: () => Promise.resolve([stage({ seeded: true })]) })}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await waitFor(() => screen.getByLabelText('New stage name'));
    expect(
      (screen.getByRole('button', { name: 'Change format' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole('button', { name: 'Delete stage' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      screen.getByText('This stage already has fixtures, so its format and removal are locked.'),
    ).toBeTruthy();
  });

  it('deletes an unseeded stage', async () => {
    const deleteStage = jest.fn(() => Promise.resolve(stage()));
    render(
      withIntl(
        <StageHubPage
          client={stubClient({ deleteStage })}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await waitFor(() => screen.getByLabelText('New stage name'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete stage' }));

    await waitFor(() =>
      expect(deleteStage).toHaveBeenCalledWith('liga-mendocina', 'apertura-2026', 1),
    );
    expect(await screen.findByText('Stage deleted.')).toBeTruthy();
  });

  it('reports the refusal reason unchanged when a format change is rejected', async () => {
    render(
      withIntl(
        <StageHubPage
          client={stubClient({
            updateStage: () => Promise.reject(new Error('Stage already holds a fixture')),
          })}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await waitFor(() => screen.getByLabelText('New stage name'));
    fireEvent.change(screen.getByLabelText('New stage name'), { target: { value: 'X' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));

    expect(await screen.findByText('The request could not be completed. Try again.')).toBeTruthy();
  });

  it('links to seeding, zones and groups, standings and schedule', async () => {
    render(
      withIntl(
        <StageHubPage
          client={stubClient()}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await waitFor(() => screen.getByLabelText('New stage name'));
    expect(screen.getByRole('link', { name: 'Seeding' }).getAttribute('href')).toBe(
      '/control/liga-mendocina/tournaments/apertura-2026/stages/1/seeding',
    );
    expect(screen.getByRole('link', { name: 'Zones and groups' }).getAttribute('href')).toBe(
      '/control/liga-mendocina/tournaments/apertura-2026/stages/1/zones',
    );
    expect(screen.getByRole('link', { name: 'Standings' }).getAttribute('href')).toBe(
      '/control/liga-mendocina/tournaments/apertura-2026/stages/1/standings',
    );
    expect(screen.getByRole('link', { name: 'Schedule' }).getAttribute('href')).toBe(
      '/control/liga-mendocina/tournaments/apertura-2026/stages/1/schedule',
    );
  });
});
