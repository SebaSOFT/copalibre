import { expectFirstReadFailure } from './resilient-read.test-support.js';
import { jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SeedingBuilderPage } from '../pages/SeedingBuilderPage.js';
import { withIntl } from '../../i18n/test-support.js';
import type { ControlApiClient, SeedingResponse } from '../../lib/api-client.js';
import { qualifierSeeds } from '../screen-story-fixtures.js';

function seeding(overrides: Partial<SeedingResponse> = {}): SeedingResponse {
  return {
    stageId: 'stage-1',
    format: 'round-robin',
    seeds: [],
    zones: [],
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

describe('SeedingBuilderPage', () => {
  it('keeps the skeleton and offers retry when the promotion-plan pre-fill lookup fails', async () => {
    render(
      withIntl(
        <SeedingBuilderPage
          client={stubClient({
            fetchPromotionPlansTargetingStage: () => Promise.reject(new Error('down')),
          })}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await expectFirstReadFailure();
    expect(screen.queryByText('This stage has no participants.')).toBeNull();
  });

  it('passes resolved entrant names from fetchSeeding to the template and renders them', async () => {
    render(
      withIntl(
        <SeedingBuilderPage
          client={stubClient({
            fetchSeeding: () =>
              Promise.resolve(
                seeding({
                  seeds: [{ seed: 1, entrantId: 'entrant-1' }],
                  names: { 'entrant-1': 'Club Atlético Huracán' },
                }),
              ),
          })}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await screen.findByText('Stage configuration');
    expect(await screen.findByText('Club Atlético Huracán')).toBeDefined();
  });
});

describe('SeedingBuilderPage — generate ahead', () => {
  const ahead = seeding({
    format: 'single-elimination',
    qualifiers: [{ format: 'single-elimination', seeds: qualifierSeeds }],
  });

  it('previews the bracket with qualifier labels and publishes only on an explicit action', async () => {
    const generated = seeding({
      format: 'single-elimination',
      qualifiers: ahead.qualifiers,
      zones: [
        {
          matches: [
            {
              matchId: 'SE-R1-M1',
              bracket: 'winners',
              round: 1,
              position: 1,
              status: 'scheduled',
              slots: [
                {
                  kind: 'qualifier',
                  source: {
                    kind: 'qualifier',
                    position: 1,
                    qualifierLabel: qualifierSeeds[0]?.qualifierLabel,
                  },
                },
                {
                  kind: 'qualifier',
                  source: {
                    kind: 'qualifier',
                    position: 4,
                    qualifierLabel: qualifierSeeds[3]?.qualifierLabel,
                  },
                },
              ],
            },
          ],
        },
      ],
    });
    const fetchSeeding = jest
      .fn<ControlApiClient['fetchSeeding']>()
      .mockResolvedValueOnce(ahead)
      .mockResolvedValueOnce(generated);
    const publishSeeding = jest.fn<ControlApiClient['publishSeeding']>(async () => ({
      mutationClass: 'safe',
      reason: 'No fixtures generated yet',
      invalidates: [],
      persisted: true,
    }));
    render(
      withIntl(
        <SeedingBuilderPage
          client={stubClient({ fetchSeeding, publishSeeding })}
          organizationAlias="liga-san-juan"
          stageNumber={2}
          tournamentAlias="copa-premier"
        />,
      ),
    );

    const panel = await screen.findByRole('region', { name: 'Generate ahead' });
    expect(panel.textContent).toContain('1st Grupo A');
    expect(panel.textContent).toContain('2nd Grupo B');
    expect(publishSeeding).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Generate ahead' }));
    await waitFor(() =>
      expect(publishSeeding).toHaveBeenCalledWith('liga-san-juan', 'copa-premier', 2, {
        ahead: true,
      }),
    );
    const link = await screen.findByRole('link', { name: 'Confirm qualification' });
    expect(link.getAttribute('href')).toBe(
      '/control/liga-san-juan/tournaments/copa-premier/stages/2/qualification',
    );
  });

  it('offers nothing to generate when no plan routes to the stage', async () => {
    render(
      withIntl(
        <SeedingBuilderPage
          client={stubClient()}
          organizationAlias="liga-san-juan"
          stageNumber={2}
          tournamentAlias="copa-premier"
        />,
      ),
    );
    await screen.findByText('Stage configuration');
    expect(screen.queryByRole('button', { name: 'Generate ahead' })).toBeNull();
  });
});

describe('SeedingBuilderPage — stage configuration', () => {
  it('loads and shows the current configuration override fields', async () => {
    render(
      withIntl(
        <SeedingBuilderPage
          client={stubClient({
            fetchStageConfiguration: () =>
              Promise.resolve({ overrides: { 'segments.overtimeEnabled': true } }),
          })}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await screen.findByText('Stage configuration');
    expect((screen.getByLabelText('segments.overtimeEnabled') as HTMLInputElement).value).toBe(
      'true',
    );
  });

  it('applies a changed configuration field', async () => {
    const updateStageConfiguration = jest.fn<
      NonNullable<ControlApiClient['updateStageConfiguration']>
    >(() => Promise.resolve({ overrides: { 'segments.overtimeEnabled': false } }));
    render(
      withIntl(
        <SeedingBuilderPage
          client={stubClient({
            fetchStageConfiguration: () =>
              Promise.resolve({ overrides: { 'segments.overtimeEnabled': true } }),
            updateStageConfiguration,
          })}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await screen.findByText('Stage configuration');
    fireEvent.change(screen.getByLabelText('segments.overtimeEnabled'), {
      target: { value: 'false' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() =>
      expect(updateStageConfiguration).toHaveBeenCalledWith('liga-mendocina', 'apertura-2026', 1, {
        overrides: { 'segments.overtimeEnabled': false },
      }),
    );
  });

  it('adds a new configuration field and ignores a duplicate or malformed one', async () => {
    const updateStageConfiguration = jest.fn<
      NonNullable<ControlApiClient['updateStageConfiguration']>
    >(() =>
      Promise.resolve({
        overrides: { 'segments.overtimeEnabled': true, 'segments.lobbySize': 24 },
      }),
    );
    render(
      withIntl(
        <SeedingBuilderPage
          client={stubClient({
            fetchStageConfiguration: () =>
              Promise.resolve({ overrides: { 'segments.overtimeEnabled': true } }),
            updateStageConfiguration,
          })}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await screen.findByText('Stage configuration');

    // Adding an empty field name is a no-op — the button stays disabled.
    expect((screen.getByRole('button', { name: 'Add field' }) as HTMLButtonElement).disabled).toBe(
      true,
    );

    // Adding the same field name that already has a draft row is also a no-op.
    fireEvent.change(screen.getByLabelText('Field (dot-path)'), {
      target: { value: 'segments.overtimeEnabled' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add field' }));
    expect(screen.getAllByLabelText('segments.overtimeEnabled')).toHaveLength(1);

    fireEvent.change(screen.getByLabelText('Field (dot-path)'), {
      target: { value: 'segments.lobbySize' },
    });
    fireEvent.change(screen.getByLabelText('Value (JSON)'), { target: { value: '24' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add field' }));

    // A malformed JSON value on the pre-existing field is skipped, not sent.
    fireEvent.change(screen.getByLabelText('segments.overtimeEnabled'), {
      target: { value: 'not-json' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() =>
      expect(updateStageConfiguration).toHaveBeenCalledWith('liga-mendocina', 'apertura-2026', 1, {
        overrides: { 'segments.lobbySize': 24 },
      }),
    );
  });

  it('does nothing when applying with no changed configuration fields', async () => {
    const updateStageConfiguration = jest.fn<
      NonNullable<ControlApiClient['updateStageConfiguration']>
    >(() => Promise.resolve({ overrides: {} }));
    render(
      withIntl(
        <SeedingBuilderPage
          client={stubClient({
            fetchStageConfiguration: () =>
              Promise.resolve({ overrides: { 'segments.overtimeEnabled': true } }),
            updateStageConfiguration,
          })}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await screen.findByText('Stage configuration');
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(updateStageConfiguration).not.toHaveBeenCalled();
  });

  it('reports an error when applying a configuration edit fails', async () => {
    render(
      withIntl(
        <SeedingBuilderPage
          client={stubClient({
            fetchStageConfiguration: () =>
              Promise.resolve({ overrides: { 'segments.overtimeEnabled': true } }),
            updateStageConfiguration: () => Promise.reject(new Error('configuration conflict')),
          })}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await screen.findByText('Stage configuration');
    fireEvent.change(screen.getByLabelText('segments.overtimeEnabled'), {
      target: { value: 'false' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(await screen.findByText('The request could not be completed. Try again.')).toBeDefined();
  });

  it('disables configuration editing once the stage is seeded, and names why', async () => {
    render(
      withIntl(
        <SeedingBuilderPage
          client={stubClient({
            fetchSeeding: () =>
              Promise.resolve(
                seeding({
                  zones: [
                    {
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
                    },
                  ],
                }),
              ),
            fetchStageConfiguration: () =>
              Promise.resolve({ overrides: { 'segments.overtimeEnabled': true } }),
          })}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await screen.findByText('Stage configuration');
    expect((screen.getByLabelText('segments.overtimeEnabled') as HTMLInputElement).disabled).toBe(
      true,
    );
    expect((screen.getByRole('button', { name: 'Apply' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(
      screen.getByText('This stage already has fixtures, so its configuration is locked.'),
    ).toBeDefined();
  });
});
