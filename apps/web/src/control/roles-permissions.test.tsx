import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import { RolesPermissionsPage } from './components/RolesPermissionsPage.js';
import { RolesPermissionsRoute } from './components/RolesPermissionsRoute.js';
import type { ControlApiClient, OrganizationRoleResponse } from './lib/api-client.js';
import { withIntl } from './i18n/test-support.js';

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
      withIntl(
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
      ),
    );

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Role of referee@example.test'), {
        target: { value: 'broadcaster' },
      });
    });
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Status of referee@example.test'));
    });

    expect(changes).toEqual([
      { assignmentId: 'assignment-1', role: 'broadcaster', status: 'active' },
      { assignmentId: 'assignment-1', role: 'referee', status: 'inactive' },
    ]);
  });

  it('submits email, role and initial status from the invite dialog', async () => {
    const invitations: unknown[] = [];
    render(
      withIntl(
        <RolesPermissionsPage
          loading={false}
          onChange={async () => undefined}
          onDelete={async () => undefined}
          onInvite={async (email, role, status) => void invitations.push({ email, role, status })}
          organizationAlias="liga-mendocina"
          rows={rows}
        />,
      ),
    );

    fireEvent.click(screen.getByText('Add recipient'));
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'viewer@example.test' },
    });
    fireEvent.change(screen.getByLabelText('Invitation role'), { target: { value: 'viewer' } });
    fireEvent.click(screen.getByLabelText('Active once accepted'));
    await act(async () => {
      fireEvent.click(screen.getByText('Send invitation'));
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
    render(withIntl(<RolesPermissionsRoute client={client} organizationAlias="liga-mendocina" />));

    await screen.findByText('referee@example.test');
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Role of referee@example.test'), {
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
    render(withIntl(<RolesPermissionsRoute client={client} organizationAlias="liga-mendocina" />));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Sin permisos'));
  });

  it('deletes a role assignment through the route', async () => {
    const deleteOrganizationRole = jest.fn(async () => undefined);
    const client = controlClient({
      listOrganizationRoles: async () => rows,
      deleteOrganizationRole,
    });
    render(withIntl(<RolesPermissionsRoute client={client} organizationAlias="liga-mendocina" />));

    await screen.findByText('referee@example.test');
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Delete referee@example.test'));
    });

    expect(deleteOrganizationRole).toHaveBeenCalledWith('liga-mendocina', 'assignment-1');
    await waitFor(() => expect(screen.queryByText('referee@example.test')).toBeNull());
  });

  it('invites a user through the route and reloads the row list', async () => {
    const inviteOrganizationUser = jest.fn(async () => ({
      invitationId: 'invite-1',
      expiresAt: '2099-01-01',
    }));
    const listOrganizationRoles = jest
      .fn<() => Promise<readonly OrganizationRoleResponse[]>>()
      .mockResolvedValueOnce(rows)
      .mockResolvedValueOnce([
        ...rows,
        { ...rows[0], assignmentId: 'assignment-2', email: 'viewer@example.test' },
      ]);
    const client = controlClient({ listOrganizationRoles, inviteOrganizationUser });
    render(withIntl(<RolesPermissionsRoute client={client} organizationAlias="liga-mendocina" />));

    await screen.findByText('referee@example.test');
    fireEvent.click(screen.getByText('Add recipient'));
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'viewer@example.test' },
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Send invitation'));
    });

    expect(inviteOrganizationUser).toHaveBeenCalledWith('liga-mendocina', {
      email: 'viewer@example.test',
      role: 'viewer',
      status: 'active',
    });
    await waitFor(() => expect(screen.getByText('viewer@example.test')).toBeDefined());
  });
});

function controlClient(overrides: Partial<ControlApiClient>): ControlApiClient {
  return {
    listMyOrganizations: async () => [],
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
    fetchTableLayouts: async () => [],
    fetchTableProjection: async () => {
      throw new Error('fetchTableProjection not stubbed in this test');
    },
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
