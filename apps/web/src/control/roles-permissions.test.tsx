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

  it('shows a club picker, scoped to this organization, only for club-admin', async () => {
    const invitations: unknown[] = [];
    render(
      withIntl(
        <RolesPermissionsPage
          clubs={[
            { clubId: 'club-1', organizationId: 'org-1', name: 'Club Uno' },
            { clubId: 'club-2', organizationId: 'org-1', name: 'Club Dos' },
          ]}
          loading={false}
          onChange={async () => undefined}
          onDelete={async () => undefined}
          onInvite={async (email, role, status, scope) =>
            void invitations.push({ email, role, status, scope })
          }
          organizationAlias="liga-mendocina"
          rows={rows}
        />,
      ),
    );

    fireEvent.click(screen.getByText('Add recipient'));
    expect(screen.queryByLabelText('Club administered')).toBeNull();

    fireEvent.change(screen.getByLabelText('Invitation role'), {
      target: { value: 'club-admin' },
    });
    const clubPicker = screen.getByLabelText('Club administered');
    expect(
      Array.from(clubPicker.querySelectorAll('option'))
        .map((option) => option.textContent)
        .filter(Boolean),
    ).toEqual(['Club Uno', 'Club Dos']);

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'club@example.test' } });
    fireEvent.change(clubPicker, { target: { value: 'club-2' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Send invitation'));
    });

    expect(invitations).toEqual([
      {
        email: 'club@example.test',
        role: 'club-admin',
        status: 'active',
        scope: { clubId: 'club-2' },
      },
    ]);
  });

  it('shows a tournament picker, scoped to this organization, only for tournament-admin', async () => {
    const invitations: unknown[] = [];
    render(
      withIntl(
        <RolesPermissionsPage
          loading={false}
          onChange={async () => undefined}
          onDelete={async () => undefined}
          onInvite={async (email, role, status, scope) =>
            void invitations.push({ email, role, status, scope })
          }
          organizationAlias="liga-mendocina"
          rows={rows}
          tournaments={[
            { tournamentId: 'tournament-1', alias: 'apertura', name: 'Apertura' },
            { tournamentId: 'tournament-2', alias: 'clausura', name: 'Clausura' },
          ]}
        />,
      ),
    );

    fireEvent.click(screen.getByText('Add recipient'));
    expect(screen.queryByLabelText('Tournament administered')).toBeNull();

    fireEvent.change(screen.getByLabelText('Invitation role'), {
      target: { value: 'tournament-admin' },
    });
    const tournamentPicker = screen.getByLabelText('Tournament administered');
    expect(
      Array.from(tournamentPicker.querySelectorAll('option'))
        .map((option) => option.textContent)
        .filter(Boolean),
    ).toEqual(['Apertura', 'Clausura']);

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'tournament@example.test' },
    });
    fireEvent.change(tournamentPicker, { target: { value: 'tournament-1' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Send invitation'));
    });

    expect(invitations).toEqual([
      {
        email: 'tournament@example.test',
        role: 'tournament-admin',
        status: 'active',
        scope: { tournamentId: 'tournament-1' },
      },
    ]);
  });

  it('disables submit for a scoped role until a club or tournament is chosen', async () => {
    render(
      withIntl(
        <RolesPermissionsPage
          clubs={[{ clubId: 'club-1', organizationId: 'org-1', name: 'Club Uno' }]}
          loading={false}
          onChange={async () => undefined}
          onDelete={async () => undefined}
          onInvite={async () => undefined}
          organizationAlias="liga-mendocina"
          rows={rows}
        />,
      ),
    );

    fireEvent.click(screen.getByText('Add recipient'));
    fireEvent.change(screen.getByLabelText('Invitation role'), {
      target: { value: 'club-admin' },
    });
    expect(
      (screen.getByText('Send invitation').closest('button') as HTMLButtonElement).disabled,
    ).toBe(true);

    fireEvent.change(screen.getByLabelText('Club administered'), {
      target: { value: 'club-1' },
    });
    expect(
      (screen.getByText('Send invitation').closest('button') as HTMLButtonElement).disabled,
    ).toBe(false);
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

  it("loads the invite dialog's club and tournament pickers scoped to the requested organization", async () => {
    const listClubs = jest.fn(async (organizationAlias: string) => {
      expect(organizationAlias).toBe('liga-mendocina');
      return [{ clubId: 'club-1', organizationId: 'org-1', name: 'Club Uno' }];
    });
    const listActiveTournaments = jest.fn(async (organizationAlias: string) => {
      expect(organizationAlias).toBe('liga-mendocina');
      return [{ tournamentId: 'tournament-1', alias: 'apertura', name: 'Apertura' }];
    });
    const inviteOrganizationUser = jest.fn(async () => ({
      invitationId: 'invite-1',
      expiresAt: '2099-01-01T00:00:00.000Z',
    }));
    const client = controlClient({
      listOrganizationRoles: async () => rows,
      listClubs,
      listActiveTournaments,
      inviteOrganizationUser,
    });
    render(withIntl(<RolesPermissionsRoute client={client} organizationAlias="liga-mendocina" />));

    await screen.findByText('referee@example.test');
    await waitFor(() => expect(listClubs).toHaveBeenCalledWith('liga-mendocina'));
    await waitFor(() => expect(listActiveTournaments).toHaveBeenCalledWith('liga-mendocina'));

    fireEvent.click(screen.getByText('Add recipient'));
    fireEvent.change(screen.getByLabelText('Invitation role'), {
      target: { value: 'tournament-admin' },
    });
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'tournament@example.test' },
    });
    fireEvent.change(screen.getByLabelText('Tournament administered'), {
      target: { value: 'tournament-1' },
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Send invitation'));
    });

    expect(inviteOrganizationUser).toHaveBeenCalledWith('liga-mendocina', {
      email: 'tournament@example.test',
      role: 'tournament-admin',
      status: 'active',
      tournamentId: 'tournament-1',
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

  it('invites a user through the route with no pending-invitations endpoint available', async () => {
    const inviteOrganizationUser = jest.fn(async () => ({
      invitationId: 'invite-1',
      expiresAt: '2099-01-01',
    }));
    const client = controlClient({
      listOrganizationRoles: async () => rows,
      inviteOrganizationUser,
    });
    render(withIntl(<RolesPermissionsRoute client={client} organizationAlias="liga-mendocina" />));

    await screen.findByText('referee@example.test');
    fireEvent.click(screen.getByText('Add recipient'));
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'nuevo@example.test' },
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Send invitation'));
    });

    expect(inviteOrganizationUser).toHaveBeenCalled();
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
    const client = controlClient({
      listOrganizationRoles,
      inviteOrganizationUser,
      listPendingInvitations: async () => [],
    });
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

  it('offers club-admin as an assignable role', () => {
    render(
      withIntl(
        <RolesPermissionsPage
          loading={false}
          onChange={async () => undefined}
          onDelete={async () => undefined}
          onInvite={async () => undefined}
          organizationAlias="liga-mendocina"
          rows={rows}
        />,
      ),
    );
    expect(
      (screen.getByLabelText('Role of referee@example.test') as HTMLSelectElement).innerHTML,
    ).toContain('Club admin');
  });

  it('filters the role picker to the caller-supplied grantable roles', () => {
    render(
      withIntl(
        <RolesPermissionsPage
          grantableRoles={['admin', 'club-admin', 'referee']}
          loading={false}
          onChange={async () => undefined}
          onDelete={async () => undefined}
          onInvite={async () => undefined}
          organizationAlias="liga-mendocina"
          rows={rows}
        />,
      ),
    );
    const select = screen.getByLabelText('Role of referee@example.test') as HTMLSelectElement;
    const options = Array.from(select.options).map((option) => option.value);
    expect(options).toEqual(['admin', 'club-admin', 'referee']);
  });

  it('disables the last active admin row to protect the floor invariant', () => {
    const adminRow = { ...rows[0], role: 'admin' as const, email: 'admin@example.test' };
    render(
      withIntl(
        <RolesPermissionsPage
          loading={false}
          onChange={async () => undefined}
          onDelete={async () => undefined}
          onInvite={async () => undefined}
          organizationAlias="liga-mendocina"
          rows={[adminRow]}
        />,
      ),
    );
    expect(
      (screen.getByLabelText('Role of admin@example.test') as HTMLSelectElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByLabelText('Status of admin@example.test') as HTMLInputElement).disabled,
    ).toBe(true);
    expect((screen.getByLabelText('Delete admin@example.test') as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('fetches and applies grantable roles from the route through to the role picker', async () => {
    const listGrantableRoles = jest
      .fn<
        () => Promise<{
          roles: readonly (
            'super-admin' | 'admin' | 'club-admin' | 'referee' | 'broadcaster' | 'viewer'
          )[];
        }>
      >()
      .mockResolvedValue({ roles: ['super-admin', 'admin', 'club-admin', 'referee'] });
    const client = controlClient({
      listOrganizationRoles: async () => rows,
      listGrantableRoles,
    });
    render(withIntl(<RolesPermissionsRoute client={client} organizationAlias="liga-mendocina" />));

    await screen.findByText('referee@example.test');
    await waitFor(() => expect(listGrantableRoles).toHaveBeenCalledWith('liga-mendocina'));
    await waitFor(() => {
      const select = screen.getByLabelText('Role of referee@example.test') as HTMLSelectElement;
      expect(Array.from(select.options).map((option) => option.value)).toEqual([
        'admin',
        'club-admin',
        'referee',
      ]);
    });
  });

  it('falls back to showing every role when the grantable-roles fetch fails', async () => {
    const client = controlClient({
      listOrganizationRoles: async () => rows,
      listGrantableRoles: async () => {
        throw new Error('forbidden');
      },
    });
    render(withIntl(<RolesPermissionsRoute client={client} organizationAlias="liga-mendocina" />));

    await screen.findByText('referee@example.test');
    const select = screen.getByLabelText('Role of referee@example.test') as HTMLSelectElement;
    expect(select.options.length).toBeGreaterThan(3);
  });

  it('renders pending invitations and rescinds one (openspec 0170)', async () => {
    const rescinded: string[] = [];
    render(
      withIntl(
        <RolesPermissionsPage
          loading={false}
          onChange={async () => undefined}
          onDelete={async () => undefined}
          onInvite={async () => undefined}
          onRescindInvitation={async (invitationId) => void rescinded.push(invitationId)}
          organizationAlias="liga-mendocina"
          pendingInvitations={[
            {
              invitationId: 'invite-1',
              recipientEmail: 'nuevo@example.test',
              role: 'viewer',
              status: 'active',
              expiresAt: '2099-01-01T00:00:00.000Z',
            },
          ]}
          rows={rows}
        />,
      ),
    );

    expect(screen.getByText('nuevo@example.test')).toBeDefined();
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Rescind invitation for nuevo@example.test'));
    });
    expect(rescinded).toEqual(['invite-1']);
  });

  it('disables rescind when no handler is supplied, and does nothing on click', () => {
    render(
      withIntl(
        <RolesPermissionsPage
          loading={false}
          onChange={async () => undefined}
          onDelete={async () => undefined}
          onInvite={async () => undefined}
          organizationAlias="liga-mendocina"
          pendingInvitations={[
            {
              invitationId: 'invite-1',
              recipientEmail: 'nuevo@example.test',
              role: 'viewer',
              status: 'active',
              expiresAt: '2099-01-01T00:00:00.000Z',
            },
          ]}
          rows={rows}
        />,
      ),
    );
    const button = screen.getByLabelText(
      'Rescind invitation for nuevo@example.test',
    ) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(screen.getByText('nuevo@example.test')).toBeDefined();
  });

  it('shows an empty message when there are no pending invitations', () => {
    render(
      withIntl(
        <RolesPermissionsPage
          loading={false}
          onChange={async () => undefined}
          onDelete={async () => undefined}
          onInvite={async () => undefined}
          organizationAlias="liga-mendocina"
          pendingInvitations={[]}
          rows={rows}
        />,
      ),
    );
    expect(screen.getByText('No pending invitations.')).toBeDefined();
  });

  it('hides the pending-invitations section entirely until it has loaded', () => {
    render(
      withIntl(
        <RolesPermissionsPage
          loading={false}
          onChange={async () => undefined}
          onDelete={async () => undefined}
          onInvite={async () => undefined}
          organizationAlias="liga-mendocina"
          rows={rows}
        />,
      ),
    );
    expect(screen.queryByText('Pending invitations')).toBeNull();
  });

  it('loads and rescinds a pending invitation through the route', async () => {
    const rescindInvitation = jest.fn(async () => ({
      invitationId: 'invite-1',
      expiresAt: '2099-01-01T00:00:00.000Z',
    }));
    const client = controlClient({
      listOrganizationRoles: async () => rows,
      listPendingInvitations: async () => [
        {
          invitationId: 'invite-1',
          recipientEmail: 'nuevo@example.test',
          role: 'viewer',
          status: 'active',
          expiresAt: '2099-01-01T00:00:00.000Z',
        },
      ],
      rescindInvitation,
    });
    render(withIntl(<RolesPermissionsRoute client={client} organizationAlias="liga-mendocina" />));

    await screen.findByText('nuevo@example.test');
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Rescind invitation for nuevo@example.test'));
    });

    expect(rescindInvitation).toHaveBeenCalledWith('liga-mendocina', 'invite-1');
    await waitFor(() => expect(screen.queryByText('nuevo@example.test')).toBeNull());
  });

  it('does not disable an admin row when a second active admin exists', () => {
    const admin1 = { ...rows[0], role: 'admin' as const, email: 'admin1@example.test' };
    const admin2 = {
      ...rows[0],
      assignmentId: 'assignment-2',
      role: 'admin' as const,
      email: 'admin2@example.test',
    };
    render(
      withIntl(
        <RolesPermissionsPage
          loading={false}
          onChange={async () => undefined}
          onDelete={async () => undefined}
          onInvite={async () => undefined}
          organizationAlias="liga-mendocina"
          rows={[admin1, admin2]}
        />,
      ),
    );
    expect(
      (screen.getByLabelText('Delete admin1@example.test') as HTMLButtonElement).disabled,
    ).toBe(false);
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
