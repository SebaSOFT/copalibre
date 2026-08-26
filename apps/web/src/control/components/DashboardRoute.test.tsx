import { act, render, screen, waitFor } from '@testing-library/react';
import { DashboardRoute } from './DashboardRoute.js';
import type {
  ControlApiClient,
  RegistrationResponse,
  TournamentResponse,
} from '../lib/api-client.js';

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
    fetchTableLayouts: async () => [],
    fetchTableProjection: async () => {
      throw new Error('fetchTableProjection not stubbed in this test');
    },
    fetchSeeding: async () => ({
      stageId: 'stage',
      format: 'round-robin',
      seeds: [],
      matches: [],
      hasRecordedResults: false,
    }),
    publishSeeding: async () => ({
      mutationClass: 'safe' as const,
      reason: '',
      invalidates: [],
      persisted: true,
    }),
    listOrganizationRoles: async () => [],
    inviteOrganizationUser: async () => ({
      invitationId: 'invite-1',
      expiresAt: '2099-01-01T00:00:00.000Z',
    }),
    changeOrganizationRole: async () => ({
      assignmentId: 'assignment-1',
      principalId: 'principal-1',
      email: 'user@example.test',
      role: 'viewer',
      status: 'active',
    }),
    deleteOrganizationRole: async () => undefined,
    ...overrides,
  };
}

function tournament(overrides: Partial<TournamentResponse> = {}): TournamentResponse {
  return {
    tournamentId: 't-1',
    organizationId: 'org-1',
    alias: 'apertura-2026',
    name: 'Torneo Apertura 2026',
    status: 'started',
    ...overrides,
  };
}

describe('DashboardRoute', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    // Dashboard's own device-heartbeat panel (0031, 4.4) fetches display
    // tokens on mount through its own client instance, not the one this
    // route injects — a stub here keeps that fetch from crashing a test
    // that never mocks it itself (same as control.test.tsx's own).
    originalFetch = globalThis.fetch;
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: async () => new Response('[]', { headers: { 'content-type': 'application/json' } }),
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: originalFetch });
  });

  it("lists the organization's real tournaments, with real pending-registration counts", async () => {
    await act(async () => {
      render(
        <DashboardRoute
          client={client({
            listActiveTournaments: async () => [
              tournament(),
              tournament({
                tournamentId: 't-2',
                alias: 'clausura-2026',
                name: 'Clausura 2026',
                status: 'draft',
              }),
            ],
            listRegistrations: async (_organizationAlias, tournamentAlias, status) => {
              if (tournamentAlias === 'apertura-2026' && status === 'pending') {
                return [
                  { entrantId: 'e-1', tournamentId: 't-1', status: 'pending' },
                  { entrantId: 'e-2', tournamentId: 't-1', status: 'pending' },
                ] as readonly RegistrationResponse[];
              }
              return [];
            },
          })}
          organizationAlias="liga-mendocina"
        />,
      );
    });

    await waitFor(() => expect(screen.getByText('Torneo Apertura 2026')).toBeDefined());
    expect(screen.getByText('Clausura 2026')).toBeDefined();
    expect(screen.getByTestId('pendingRegistrations').textContent).toBe('2');
  });

  it('shows an explicit empty state for an organization with no tournaments, not sample data', async () => {
    await act(async () => {
      render(
        <DashboardRoute
          client={client({ listActiveTournaments: async () => [] })}
          organizationAlias="liga-mendocina"
        />,
      );
    });

    await waitFor(() => expect(screen.getByText(/no tiene torneos/)).toBeDefined());
    expect(screen.queryByText('Torneo Apertura 2026')).toBeNull();
    expect(screen.queryByText('Torneo Clausura 2026')).toBeNull();
  });

  it('renders an empty dashboard rather than throwing when the client offers no read', async () => {
    await act(async () => {
      render(<DashboardRoute client={client()} organizationAlias="liga-mendocina" />);
    });

    await waitFor(() => expect(screen.getByText(/no tiene torneos/)).toBeDefined());
  });

  it.each([
    // Rendered through Dashboard (not withIntl), which resolves Spanish —
    // same as every other test in this file and in control.test.tsx.
    ['published', 'PRÓXIMO'],
    ['finished', 'FINALIZADO'],
    ['archived', 'FINALIZADO'],
  ] as const)('maps a %s tournament to %s', async (status, label) => {
    await act(async () => {
      render(
        <DashboardRoute
          client={client({ listActiveTournaments: async () => [tournament({ status })] })}
          organizationAlias="liga-mendocina"
        />,
      );
    });

    await waitFor(() => expect(screen.getByTestId('lifecycle').textContent).toBe(label));
  });

  it('renders an empty dashboard rather than throwing when the tournament read fails', async () => {
    await act(async () => {
      render(
        <DashboardRoute
          client={client({
            listActiveTournaments: async () => {
              throw new Error('network down');
            },
          })}
          organizationAlias="liga-mendocina"
        />,
      );
    });

    await waitFor(() => expect(screen.getByText(/no tiene torneos/)).toBeDefined());
  });
});
