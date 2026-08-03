import { act, fireEvent, render, screen } from '@testing-library/react';
import { TournamentAuthoringPage } from './components/TournamentAuthoringPage.js';
import { RegistrationReviewRoute } from './components/RegistrationReviewRoute.js';
import type { ControlApiClient } from './lib/api-client.js';

function client(overrides: Partial<ControlApiClient> = {}): ControlApiClient {
  return {
    listDisciplines: async () => [
      {
        descriptorId: 'd-football',
        version: '1.0.0',
        name: 'Fútbol',
        supportedFormats: ['round-robin'],
      },
    ],
    createTournament: async () => ({
      tournamentId: 't-1',
      alias: 'copa-verano',
      name: 'Copa Verano',
    }),
    listRegistrations: async () => [],
    fetchStandings: async () => ({
      stageId: 's-1',
      projectionVersion: 0,
      fullyResolved: true,
      rows: [],
      trace: [],
    }),
    fetchTiebreakTrace: async () => ({ entrantId: 'e-1', lines: [] }),
    fetchSeeding: async () => ({
      stageId: 's-1',
      format: 'round-robin',
      seeds: [],
      matches: [],
      hasRecordedResults: false,
    }),
    publishSeeding: async () => ({ mutationClass: 'safe' as const, reason: '', invalidates: [] }),
    bulkReview: async () => ({ applied: [], refused: [] }),
    reviewRegistration: async () => ({
      entrantId: 'e-1',
      tournamentId: 't-1',
      status: 'withdrawn',
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

describe('the tournament authoring route container', () => {
  it('loads disciplines from the API and posts the wizard request', async () => {
    const requests: unknown[] = [];

    await act(async () => {
      render(
        <TournamentAuthoringPage
          organizationAlias="liga-mendocina"
          client={client({
            createTournament: async (_organizationAlias, request) => {
              requests.push(request);
              return { tournamentId: 't-1', alias: request.alias, name: request.name };
            },
          })}
        />,
      );
    });

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Copa Verano' } });
    fireEvent.change(screen.getByLabelText('Alias'), { target: { value: 'copa-verano' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Crear torneo' }));
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ descriptorVersion: '1.0.0', format: 'round-robin' });
  });
});

describe('the registration review route container', () => {
  it('loads registrations and sends selected ids to the bulk endpoint', async () => {
    const reviewed: unknown[] = [];

    await act(async () => {
      render(
        <RegistrationReviewRoute
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
          client={client({
            listRegistrations: async () => [
              { entrantId: 'e-1', tournamentId: 't-1', status: 'pending', teamId: 'team-1' },
            ],
            bulkReview: async (_organizationAlias, _tournamentAlias, request) => {
              reviewed.push(request);
              return {
                applied: [
                  { entrantId: 'e-1', tournamentId: 't-1', status: 'accepted', teamId: 'team-1' },
                ],
                refused: [],
              };
            },
          })}
          now="2026-08-01T17:00:00.000Z"
        />,
      );
    });

    fireEvent.click(screen.getByLabelText('Seleccionar team-1'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Aprobar' }));
    });

    expect(reviewed).toEqual([{ entrantIds: ['e-1'], decision: 'accepted' }]);
    expect(screen.getByText('Aceptada')).toBeDefined();
  });

  it('revokes one expanded registration through the per-entrant endpoint', async () => {
    const reviewed: unknown[] = [];

    await act(async () => {
      render(
        <RegistrationReviewRoute
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
          client={client({
            listRegistrations: async () => [
              { entrantId: 'e-1', tournamentId: 't-1', status: 'pending', teamId: 'team-1' },
            ],
            reviewRegistration: async (
              _organizationAlias,
              _tournamentAlias,
              entrantId,
              request,
            ) => {
              reviewed.push({ entrantId, request });
              return {
                entrantId,
                tournamentId: 't-1',
                status: 'withdrawn',
                teamId: 'team-1',
              };
            },
          })}
          now="2026-08-01T17:00:00.000Z"
        />,
      );
    });

    const summary = screen.getByLabelText('Seleccionar team-1').closest('summary');
    expect(summary).not.toBeNull();
    fireEvent.click(summary as HTMLElement);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Revocar' }));
    });

    expect(reviewed).toEqual([
      {
        entrantId: 'e-1',
        request: {
          decision: 'withdrawn',
          reason: 'Revoked from registration review',
        },
      },
    ]);
    expect(screen.getByText('Retirada')).toBeDefined();
  });
});
