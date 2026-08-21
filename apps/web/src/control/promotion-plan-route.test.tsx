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
    fireEvent.change(screen.getByLabelText('Destination zone name'), {
      target: { value: 'Zone 2' },
    });
    fireEvent.change(screen.getByLabelText('Count'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Next stage number'), { target: { value: '2' } });

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
