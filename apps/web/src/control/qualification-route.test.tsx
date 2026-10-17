import { describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ControlApiError } from './lib/api-client.js';
import type {
  ConfirmQualificationResponse,
  ControlApiClient,
  QualificationPreviewResponse,
} from './lib/api-client.js';
import { QualificationPage } from './components/pages/QualificationPage.js';
import { qualificationPreview } from './components/screen-story-fixtures.js';
import { withIntl } from './i18n/test-support.js';

function mount(client: ControlApiClient) {
  render(
    withIntl(
      <QualificationPage
        client={client}
        organizationAlias="liga-san-juan"
        stageNumber={2}
        tournamentAlias="copa-premier"
      />,
    ),
  );
}

describe('QualificationPage', () => {
  it('lists each qualifier position with its entrant and confirms what was previewed', async () => {
    const preview = qualificationPreview('ready');
    const confirmQualification = jest.fn<NonNullable<ControlApiClient['confirmQualification']>>(
      async (): Promise<ConfirmQualificationResponse> => ({
        ...qualificationPreview('confirmed'),
        changedSides: 4,
      }),
    );
    mount(
      stubClient({
        previewQualification: () => Promise.resolve(preview),
        confirmQualification,
      }),
    );

    expect(await screen.findByText('1st Grupo A')).toBeTruthy();
    expect(screen.getByText('2nd Grupo B')).toBeTruthy();
    expect(screen.getByText('Club Atlético San Martín')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm qualification' }));
    });

    expect(confirmQualification).toHaveBeenCalledWith('liga-san-juan', 'copa-premier', 2, {
      expected: preview.positions.map(({ promotionPlanId, position, entrantId }) => ({
        promotionPlanId,
        position,
        entrantId: entrantId as string,
      })),
    });
    await screen.findByText('Qualification confirmed: 4 sides filled.');
    expect(screen.queryByRole('button', { name: 'Confirm qualification' })).toBeNull();
  });

  it('names the tied entrants and the disputed position, with no confirm action', async () => {
    mount(
      stubClient({ previewQualification: () => Promise.resolve(qualificationPreview('tied')) }),
    );

    const tie = await screen.findByText(/tied at the cut line/);
    expect(tie.textContent).toContain('Unión Rawson and Deportivo Cuyo');
    expect(tie.textContent).toContain('of Grupo B');
    expect(tie.textContent).toContain('2nd Grupo B');
    expect(screen.queryByRole('button', { name: /Confirm/ })).toBeNull();
  });

  it('counts the prior stage’s unresolved matches and offers no confirm action', async () => {
    mount(
      stubClient({
        previewQualification: () => Promise.resolve(qualificationPreview('incomplete')),
      }),
    );

    await screen.findByText(/2 matches of the prior stage are still unresolved/);
    expect(screen.queryByRole('button', { name: /Confirm/ })).toBeNull();
  });

  it('asks to re-confirm a stale confirmation and shows both entrants', async () => {
    mount(
      stubClient({ previewQualification: () => Promise.resolve(qualificationPreview('stale')) }),
    );

    await screen.findByText('A result changed after the confirmation. Re-confirm needed.');
    expect(screen.getByRole('columnheader', { name: 'Confirmed' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Re-confirm qualification' })).toBeTruthy();
  });

  it('reloads the preview when the standings moved since it was shown', async () => {
    const previewQualification = jest
      .fn<() => Promise<QualificationPreviewResponse>>()
      .mockResolvedValueOnce(qualificationPreview('ready'))
      .mockResolvedValueOnce(qualificationPreview('stale'));
    mount(
      stubClient({
        previewQualification,
        confirmQualification: () =>
          Promise.reject(
            new ControlApiError(409, 'The standings changed', 'qualification-preview-stale'),
          ),
      }),
    );

    await screen.findByText('1st Grupo A');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm qualification' }));
    });
    await screen.findByText(
      'The standings changed since this preview. Review it again before confirming.',
    );
    expect(previewQualification).toHaveBeenCalledTimes(2);
  });

  it('shows an empty state when no plan routes to the stage, and a failure otherwise', async () => {
    mount(
      stubClient({
        previewQualification: () =>
          Promise.reject(
            new ControlApiError(404, 'No promotion plan', 'qualification-plan-missing'),
          ),
      }),
    );
    await screen.findByText('No promotion plan routes qualifiers to this stage.');
  });

  it('reports a preview it could not load', async () => {
    mount(stubClient({ previewQualification: () => Promise.reject(new Error('offline')) }));
    await waitFor(() => expect(screen.getByText('Could not load the qualification.')).toBeTruthy());
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
