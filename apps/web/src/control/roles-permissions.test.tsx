import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import { RolesPermissionsPage } from './components/RolesPermissionsPage.js';
import { RolesPermissionsRoute } from './components/RolesPermissionsRoute.js';
import type { ControlApiClient } from './lib/api-client.js';

const rows = [
  {
    assignmentId: 'assignment-1',
    principalId: '01800000-0000-7000-8000-000000000001',
    email: 'referee@example.test',
    role: 'referee' as const,
    status: 'active' as const,
  },
];

describe('roles and permissions control', () => {
  it('changes role and active status through controlled row actions', async () => {
    const changes: unknown[] = [];
    render(
      <RolesPermissionsPage
        loading={false}
        onChange={async (assignmentId, role, status) =>
          void changes.push({ assignmentId, role, status })
        }
        onDelete={async () => undefined}
        onInvite={async () => undefined}
        organizationAlias="liga-mendocina"
        rows={rows}
      />,
    );

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Rol de referee@example.test'), {
        target: { value: 'broadcaster' },
      });
    });
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Estado de referee@example.test'));
    });

    expect(changes).toEqual([
      { assignmentId: 'assignment-1', role: 'broadcaster', status: 'active' },
      { assignmentId: 'assignment-1', role: 'referee', status: 'inactive' },
    ]);
  });

  it('submits email, role and initial status from the invite dialog', async () => {
    const invitations: unknown[] = [];
    render(
      <RolesPermissionsPage
        loading={false}
        onChange={async () => undefined}
        onDelete={async () => undefined}
        onInvite={async (email, role, status) => void invitations.push({ email, role, status })}
        organizationAlias="liga-mendocina"
        rows={rows}
      />,
    );

    fireEvent.click(screen.getByText('Añadir destinatario'));
    fireEvent.change(screen.getByLabelText('Correo electrónico'), {
      target: { value: 'viewer@example.test' },
    });
    fireEvent.change(screen.getByLabelText('Rol de invitación'), { target: { value: 'viewer' } });
    fireEvent.click(screen.getByLabelText('Activo al aceptar'));
    await act(async () => {
      fireEvent.click(screen.getByText('Enviar invitación'));
    });

    expect(invitations).toEqual([
      { email: 'viewer@example.test', role: 'viewer', status: 'inactive' },
    ]);
  });

  it('loads role rows through the route and reflects a mutation locally', async () => {
    const changeOrganizationRole = jest.fn(async () => ({ ...rows[0], role: 'viewer' as const }));
    const client = controlClient({
      listOrganizationRoles: async () => rows,
      changeOrganizationRole,
    });
    render(<RolesPermissionsRoute client={client} organizationAlias="liga-mendocina" />);

    await screen.findByText('referee@example.test');
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Rol de referee@example.test'), {
        target: { value: 'viewer' },
      });
    });
    expect(changeOrganizationRole).toHaveBeenCalledWith('liga-mendocina', 'assignment-1', {
      role: 'viewer',
      status: 'active',
    });
  });

  it('shows the route loading failure', async () => {
    const client = controlClient({
      listOrganizationRoles: async () => {
        throw new Error('Sin permisos');
      },
    });
    render(<RolesPermissionsRoute client={client} organizationAlias="liga-mendocina" />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Sin permisos'));
  });
});

function controlClient(overrides: Partial<ControlApiClient>): ControlApiClient {
  return {
    listDisciplines: async () => [],
    createTournament: async () => ({
      tournamentId: 'tournament',
      alias: 'tournament',
      name: 'Test',
    }),
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
    changeOrganizationRole: async () => rows[0],
    deleteOrganizationRole: async () => undefined,
    ...overrides,
  };
}
