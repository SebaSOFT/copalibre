import { describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ControlApiError } from './lib/api-client.js';
import { PromotionPlanPage } from './components/pages/PromotionPlanPage.js';
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

describe('PromotionPlanPage', () => {
  it('renders the computed candidate order once the preview resolves', async () => {
    const client = stubClient({
      listZones: () => Promise.resolve([zone]),
      fetchPromotionPreview: () => Promise.resolve(preview),
    });
    render(
      withIntl(
        <PromotionPlanPage
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
        <PromotionPlanPage
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
        <PromotionPlanPage
          client={client}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura"
          zoneNumber={1}
        />,
      ),
    );

    // `role="status"` (openspec 0284): an unconfigured plan is an expected
    // state, not a destructive failure — see PromotionPlanPage's
    // classifyPreviewError and the Alert atom's tone-to-role mapping.
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain(
        'No promotion plan saved for this zone yet.',
      ),
    );
  });

  it('localizes the real server 404 the backend sends for an unconfigured plan (openspec 0284)', async () => {
    // The bug this change fixes: the backend really does throw a
    // `ControlApiError` for this case (`promotion-plan-not-found`,
    // apps/api/src/controllers/zones-groups.controller.ts) — every other test
    // here reaches the same UI copy only through the generic-Error fallback
    // branch, which was never the buggy path.
    const client = stubClient({
      listZones: () => Promise.resolve([zone]),
      fetchPromotionPreview: () =>
        Promise.reject(
          new ControlApiError(404, 'No promotion plan for zone 1', 'promotion-plan-not-found'),
        ),
    });
    render(
      withIntl(
        <PromotionPlanPage
          client={client}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura"
          zoneNumber={1}
        />,
      ),
    );

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain(
        'No promotion plan saved for this zone yet.',
      ),
    );
    expect(screen.getByRole('status').textContent).not.toContain('No promotion plan for zone 1');
  });

  it('treats a genuinely missing zone as a destructive error, not an unconfigured plan (openspec 0284)', async () => {
    // `zone-group-not-found` is the SAME error code the controller's stage/zone
    // lookups throw for this endpoint — a real 404 for a different reason must
    // not be swallowed into the benign "not configured yet" reading.
    const client = stubClient({
      listZones: () => Promise.resolve([zone]),
      fetchPromotionPreview: () =>
        Promise.reject(new ControlApiError(404, 'No zone 5', 'zone-group-not-found')),
    });
    render(
      withIntl(
        <PromotionPlanPage
          client={client}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura"
          zoneNumber={1}
        />,
      ),
    );

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('No zone 5');
  });

  it('renders resolved entrant display names instead of raw id tails (openspec 0284)', async () => {
    const client = stubClient({
      listZones: () => Promise.resolve([zone]),
      fetchPromotionPreview: () => Promise.resolve(preview),
      listRegistrations: () =>
        Promise.resolve([
          {
            entrantId: 'entrant1',
            tournamentId: 'tournament-1',
            status: 'accepted',
            displayName: 'Club Atlético',
          },
          {
            entrantId: 'entrant2',
            tournamentId: 'tournament-1',
            status: 'accepted',
            displayName: 'Deportivo Cuyo',
          },
        ]),
    });
    render(
      withIntl(
        <PromotionPlanPage
          client={client}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura"
          zoneNumber={1}
        />,
      ),
    );

    await screen.findByText((_, element) => element?.textContent === '1. Club Atlético');
    expect(
      screen.getByText((_, element) => element?.textContent === '2. Deportivo Cuyo'),
    ).toBeTruthy();
    expect(screen.queryByText(/entrant1/)).toBeNull();
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
        <PromotionPlanPage
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
        <PromotionPlanPage
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
        <PromotionPlanPage
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
        <PromotionPlanPage
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
        <PromotionPlanPage
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
        <PromotionPlanPage
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
        <PromotionPlanPage
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
        <PromotionPlanPage
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

    await screen.findByText('The request could not be completed. Try again.');
  });

  it('falls back to the zone number in the breadcrumb when the zone list fails to load', async () => {
    const client = stubClient({
      listZones: () => Promise.reject(new Error('down')),
      fetchPromotionPreview: () => Promise.reject(new Error('not found')),
    });
    render(
      withIntl(
        <PromotionPlanPage
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
        <PromotionPlanPage
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
