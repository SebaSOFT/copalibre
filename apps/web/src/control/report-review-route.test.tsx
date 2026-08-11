import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import { ReportReviewRoute } from './components/ReportReviewRoute.js';
import type { ControlApiClient, ParticipantReportResponse } from './lib/api-client.js';
import { withIntl } from './i18n/test-support.js';

const pendingReport: ParticipantReportResponse = {
  reportId: 'report-1',
  matchId: 'match-1',
  kind: 'dispute',
  submittedByPersonId: 'person-1',
  submittedAt: '2026-08-01T12:00:00.000Z',
  reason: 'El resultado cargado no coincide con la planilla',
  status: 'pending',
  createdAt: '2026-08-01T12:00:00.000Z',
  evidence: [
    {
      evidenceId: 'evidence-1',
      filename: 'planilla.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 1024,
      uploadedBy: 'person-1',
      uploadedAt: '2026-08-01T12:00:00.000Z',
      validationStatus: 'passed',
    },
  ],
};

function client(overrides: Partial<ControlApiClient> = {}): ControlApiClient {
  return {
    listMyOrganizations: async () => [],
    listDisciplines: async () => [],
    createTournament: async () => ({ tournamentId: 't-1', alias: 't-1', name: 'Test' }),
    listRegistrations: async () => [],
    bulkReview: async () => ({ applied: [], refused: [] }),
    reviewRegistration: async () => ({
      entrantId: 'entrant',
      tournamentId: 'tournament',
      status: 'accepted',
    }),
    fetchStandings: async () => ({
      stageId: 'stage',
      projectionVersion: 0,
      fullyResolved: true,
      rows: [],
      trace: [],
    }),
    fetchTiebreakTrace: async () => ({ entrantId: 'entrant', lines: [] }),
    fetchSeeding: async () => ({
      stageId: 'stage',
      format: 'single-elimination',
      seeds: [],
      matches: [],
      hasRecordedResults: false,
    }),
    publishSeeding: async () => ({
      mutationClass: 'safe',
      reason: 'test',
      invalidates: [],
      persisted: true,
    }),
    listOrganizationRoles: async () => [],
    inviteOrganizationUser: async () => ({ invitationId: 'invite', expiresAt: '2099-01-01' }),
    changeOrganizationRole: async () => {
      throw new Error('not used in this test');
    },
    deleteOrganizationRole: async () => undefined,
    ...overrides,
  };
}

describe('the pending reports and disputes queue', () => {
  it('says so when there is nothing pending', async () => {
    render(
      withIntl(
        <ReportReviewRoute
          client={client({ listPendingReports: async () => [] })}
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await screen.findByText('There are no pending reports or disputes.');
  });

  it('lists a pending report with its evidence and kind label', async () => {
    render(
      withIntl(
        <ReportReviewRoute
          client={client({ listPendingReports: async () => [pendingReport] })}
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    expect(await screen.findByText('Dispute')).toBeDefined();
    expect(screen.getByText('El resultado cargado no coincide con la planilla')).toBeDefined();
    expect(screen.getByText(/planilla\.jpg/)).toBeDefined();
  });

  it('shows the loading failure when the queue cannot be fetched', async () => {
    render(
      withIntl(
        <ReportReviewRoute
          client={client({
            listPendingReports: async () => {
              throw new Error('offline');
            },
          })}
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await screen.findByText('Could not load the reports.');
  });

  it('dismisses a report and removes it from the queue', async () => {
    const reviewReport = jest.fn(async () => ({ ...pendingReport, status: 'dismissed' }));
    render(
      withIntl(
        <ReportReviewRoute
          client={client({ listPendingReports: async () => [pendingReport], reviewReport })}
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await screen.findByText('Dispute');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    });

    expect(reviewReport).toHaveBeenCalledWith('liga-mendocina', 'apertura-2026', 'report-1', {
      status: 'dismissed',
    });
    await waitFor(() => expect(screen.queryByText('Dispute')).toBeNull());
  });

  it('builds its own client when none is injected', async () => {
    const originalFetch = globalThis.fetch;
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: async () => new Response('[]', { headers: { 'content-type': 'application/json' } }),
    });

    try {
      render(
        withIntl(
          <ReportReviewRoute organizationAlias="liga-mendocina" tournamentAlias="apertura-2026" />,
        ),
      );
      await screen.findByText('There are no pending reports or disputes.');
    } finally {
      Object.defineProperty(globalThis, 'fetch', { configurable: true, value: originalFetch });
    }
  });
});
