import { describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ControlApiError } from './lib/api-client.js';
import { PromotionPlanRoute } from './components/PromotionPlanRoute.js';
import type { ControlApiClient, PromotionPreviewResponse, ZoneResponse } from './lib/api-client.js';
import { withIntl } from './i18n/test-support.js';

const zone: ZoneResponse = { zoneId: 'zone-1', stageId: 'stage-1', number: 1, name: 'Zone 1' };

const preview: PromotionPreviewResponse = {
  combined: [
    { entrantId: 'entrant1', groupId: 'group-1', rank: 1 },
    { entrantId: 'entrant2', groupId: 'group-2', rank: 1 },
  ],
  trace: [],
};

describe('PromotionPlanRoute', () => {
  it('renders the computed candidate order once the preview resolves', async () => {
    const client = stubClient({
      listZones: () => Promise.resolve([zone]),
      fetchPromotionPreview: () => Promise.resolve(preview),
    });
    render(
      withIntl(
        <PromotionPlanRoute
          client={client}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura"
          zoneNumber={1}
        />,
      ),
    );

    await screen.findByText((_, element) => element?.textContent === '1. entrant1');
    expect(screen.getByText((_, element) => element?.textContent === '2. entrant2')).toBeTruthy();
  });

  it('reports a load it could not complete instead of an empty list', async () => {
    const client = stubClient({
      listZones: () => Promise.resolve([zone]),
      fetchPromotionPreview: () =>
        Promise.reject(new ControlApiError(400, 'No hay corte resuelto')),
    });
    render(
      withIntl(
        <PromotionPlanRoute
          client={client}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura"
          zoneNumber={1}
        />,
      ),
    );

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('No hay corte resuelto'),
    );
  });

  it('shows the no-plan-yet message when no preview exists', async () => {
    const client = stubClient({
      listZones: () => Promise.resolve([zone]),
      fetchPromotionPreview: () => Promise.reject(new Error('not found')),
    });
    render(
      withIntl(
        <PromotionPlanRoute
          client={client}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura"
          zoneNumber={1}
        />,
      ),
    );

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain(
        'No promotion plan saved for this zone yet.',
      ),
    );
  });

  it('saves a plan with a group-order combination and reloads the preview', async () => {
    const savePromotionPlan = jest.fn<NonNullable<ControlApiClient['savePromotionPlan']>>(
      async () => ({
        promotionPlanId: 'plan-1',
        zoneId: 'zone-1',
        nextStageId: 'stage-2',
        plan: {},
      }),
    );
    const fetchPromotionPreview = jest
      .fn<() => Promise<PromotionPreviewResponse>>()
      .mockRejectedValueOnce(new Error('not found'))
      .mockResolvedValueOnce(preview);
    const client = stubClient({
      listZones: () => Promise.resolve([zone]),
      fetchPromotionPreview,
      savePromotionPlan,
    });
    render(
      withIntl(
        <PromotionPlanRoute
          client={client}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura"
          zoneNumber={1}
        />,
      ),
    );

    await screen.findByText('No promotion plan saved for this zone yet.');
    fireEvent.change(screen.getByLabelText('Next stage number'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Entrants advancing per group'), {
      target: { value: '1' },
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Save promotion plan'));
    });

    expect(savePromotionPlan).toHaveBeenCalledWith('liga-mendocina', 'apertura', 1, 1, {
      nextStageNumber: 2,
      perGroupAdvance: 1,
      combination: { mode: 'group-order' },
    });
    await screen.findByText('Plan saved.');
    await screen.findByText((_, element) => element?.textContent === '1. entrant1');
  });

  it('adds and removes promotion bands', async () => {
    const savePromotionPlan = jest.fn<NonNullable<ControlApiClient['savePromotionPlan']>>(
      async () => ({
        promotionPlanId: 'plan-1',
        zoneId: 'zone-1',
        nextStageId: 'stage-2',
        plan: {},
      }),
    );
    const client = stubClient({
      listZones: () => Promise.resolve([zone]),
      fetchPromotionPreview: () => Promise.reject(new Error('not found')),
      savePromotionPlan,
    });
    render(
      withIntl(
        <PromotionPlanRoute
          client={client}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura"
          zoneNumber={1}
        />,
      ),
    );

    await screen.findByText('No promotion plan saved for this zone yet.');
    fireEvent.click(screen.getByText('Add band'));
    fireEvent.click(screen.getByText('Add band'));
    // Updating the first row only exercises `updateBand`'s "not this row"
    // branch for the second, untouched row.
    fireEvent.change(screen.getAllByLabelText('Destination zone name')[0], {
      target: { value: 'Zone 2' },
    });
    fireEvent.change(screen.getAllByLabelText('Count')[0], { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Next stage number'), { target: { value: '2' } });

    fireEvent.click(screen.getAllByText('Remove band')[1]);
    expect(screen.getAllByLabelText('Destination zone name')).toHaveLength(1);

    await act(async () => {
      fireEvent.click(screen.getByText('Save promotion plan'));
    });

    expect(savePromotionPlan).toHaveBeenCalledWith('liga-mendocina', 'apertura', 1, 1, {
      nextStageNumber: 2,
      perGroupAdvance: 1,
      combination: { mode: 'group-order' },
      bands: [{ zoneRef: 'Zone 2', count: 3 }],
    });

    fireEvent.click(screen.getByText('Remove band'));
    expect(screen.queryByLabelText('Destination zone name')).toBeNull();
  });

  it('does nothing when the client has no savePromotionPlan method', async () => {
    const client = stubClient({
      listZones: () => Promise.resolve([zone]),
      fetchPromotionPreview: () => Promise.reject(new Error('not found')),
    });
    render(
      withIntl(
        <PromotionPlanRoute
          client={client}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura"
          zoneNumber={1}
        />,
      ),
    );

    await screen.findByText('No promotion plan saved for this zone yet.');
    await act(async () => {
      fireEvent.click(screen.getByText('Save promotion plan'));
    });
    expect(screen.queryByText('Plan saved.')).toBeNull();
  });

  it('reports a ControlApiError from the imperative reload after saving', async () => {
    const savePromotionPlan = jest.fn<NonNullable<ControlApiClient['savePromotionPlan']>>(
      async () => ({
        promotionPlanId: 'plan-1',
        zoneId: 'zone-1',
        nextStageId: 'stage-2',
        plan: {},
      }),
    );
    const fetchPromotionPreview = jest
      .fn<() => Promise<PromotionPreviewResponse>>()
      .mockRejectedValueOnce(new Error('not found'))
      .mockRejectedValueOnce(new ControlApiError(400, 'Corte sin resolver'));
    const client = stubClient({
      listZones: () => Promise.resolve([zone]),
      fetchPromotionPreview,
      savePromotionPlan,
    });
    render(
      withIntl(
        <PromotionPlanRoute
          client={client}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura"
          zoneNumber={1}
        />,
      ),
    );

    await screen.findByText('No promotion plan saved for this zone yet.');
    fireEvent.change(screen.getByLabelText('Next stage number'), { target: { value: '2' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Save promotion plan'));
    });

    await screen.findByText('Corte sin resolver');
  });

  it('does not update state after unmounting mid-fetch', async () => {
    let resolvePreview: (() => void) | undefined;
    const client = stubClient({
      listZones: () => Promise.resolve([zone]),
      fetchPromotionPreview: () =>
        new Promise((resolve) => {
          resolvePreview = () => resolve(preview);
        }),
    });
    const { unmount } = render(
      withIntl(
        <PromotionPlanRoute
          client={client}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura"
          zoneNumber={1}
        />,
      ),
    );

    unmount();
    await act(async () => {
      resolvePreview?.();
      await Promise.resolve();
    });
  });

  it('does not update state after unmounting mid-fetch failure', async () => {
    let rejectPreview: (() => void) | undefined;
    const client = stubClient({
      listZones: () => Promise.resolve([zone]),
      fetchPromotionPreview: () =>
        new Promise((_resolve, reject) => {
          rejectPreview = () => reject(new Error('down'));
        }),
    });
    const { unmount } = render(
      withIntl(
        <PromotionPlanRoute
          client={client}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura"
          zoneNumber={1}
        />,
      ),
    );

    unmount();
    await act(async () => {
      rejectPreview?.();
      await Promise.resolve();
    });
  });

  it('reports a save failure with the server refusal message', async () => {
    const client = stubClient({
      listZones: () => Promise.resolve([zone]),
      fetchPromotionPreview: () => Promise.reject(new Error('not found')),
      savePromotionPlan: () => Promise.reject(new ControlApiError(409, 'Se rechazó el plan.')),
    });
    render(
      withIntl(
        <PromotionPlanRoute
          client={client}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura"
          zoneNumber={1}
        />,
      ),
    );

    await screen.findByText('No promotion plan saved for this zone yet.');
    fireEvent.change(screen.getByLabelText('Next stage number'), { target: { value: '2' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Save promotion plan'));
    });

    await screen.findByText('Se rechazó el plan.');
  });

  it('falls back to the generic save-failure message for a non-API error', async () => {
    const client = stubClient({
      listZones: () => Promise.resolve([zone]),
      fetchPromotionPreview: () => Promise.reject(new Error('not found')),
      savePromotionPlan: () => Promise.reject(new Error('network down')),
    });
    render(
      withIntl(
        <PromotionPlanRoute
          client={client}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura"
          zoneNumber={1}
        />,
      ),
    );

    await screen.findByText('No promotion plan saved for this zone yet.');
    fireEvent.change(screen.getByLabelText('Next stage number'), { target: { value: '2' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Save promotion plan'));
    });

    await screen.findByText('The plan was refused.');
  });

  it('falls back to the zone number in the breadcrumb when the zone list fails to load', async () => {
    const client = stubClient({
      listZones: () => Promise.reject(new Error('down')),
      fetchPromotionPreview: () => Promise.reject(new Error('not found')),
    });
    render(
      withIntl(
        <PromotionPlanRoute
          client={client}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura"
          zoneNumber={1}
        />,
      ),
    );

    await screen.findByText('apertura · 1');
  });

  it('does nothing when the client has no fetchPromotionPreview method', async () => {
    const client = stubClient({ listZones: () => Promise.resolve([zone]) });
    render(
      withIntl(
        <PromotionPlanRoute
          client={client}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura"
          zoneNumber={1}
        />,
      ),
    );

    await screen.findByText('apertura · Zone 1');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

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
    listZones: () => Promise.resolve([]),
    ...overrides,
  };
}
